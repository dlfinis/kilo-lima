# Design: POS — Caja Registradora

> **Change**: `pos` | **Phase**: `sdd-design`
> **Proposal**: `openspec/changes/pos/proposal.md` (10 locked decisions)
> **Spec**: `openspec/changes/pos/specs/pos/spec.md` (56 REQ-IDs, 91 scenarios)
> **Exploration**: `openspec/changes/pos/exploration.md`
> **Foundation**: `openspec/changes/archive/2026-06-16-foundation/design.md`
> **Catalog**: `openspec/changes/archive/2026-06-17-catalog/design.md`
> **Events**: `openspec/changes/archive/2026-06-18-events/design.md`
> **Delivery**: 5 chained PRs stacked-to-main, ~2,000 total lines. F2 splits pre-planned in PR2 and PR3.

---

## 1. Architecture Overview

POS is the first **transactional domain** in kilo-lima. It introduces 4 new stores (`productos`, `ventas`, `gastosImprevistos`, `cierresCaja`), 4 factory services, 4 composables, 8 business components, 3 views, 3 routes, and 5 Supabase tables. It consumes frozen contracts from foundation (`inject('supabase')`, `IStorageService`), catalog (`calcularCostoReceta`, `redondearCentavos`), and events (`transicionEstadoValida`, `estadoEsEditable`, `eventsStore.eventoEnCurso`). Zero new dependencies in `package.json`. The only cross-slice touch is a "Vender esta receta" button on `RecetaDetalleView.vue`.

```
View Layer                     Store Layer                 Service Layer              Backend
──────────                     ───────────                 ──────────────             ───────
PosView.vue ────────→ useVentas() ──→ ventas.store ──→ crearVentasService(supabase) ──→ Supabase
  ├─ ProductoGrid            ←── useProductos()  ←── productos.store
  ├─ CarritoPanel            ←── useVentas()
  └─ GastosImprevistos       ←── useGastosImprevistos() ←── gastosImprevistos.store
PosCierreView.vue ──→ useCierreCaja() ──→ cierres.store ──→ crearCierresService(supabase)
                       │                          │
                  calcularCierre()         events.store (read-only)
                  [pure function]          events.service.cambiarEstado
```

**Key invariant**: POS is strictly additive. It touches zero foundation/catalog/events source files except `routes.ts`, `database.types.ts`, `types/index.ts`, `dev_bypass_rls.sql`, and `RecetaDetalleView.vue` (1 button + 1 dialog). `ventas` and `venta_items` are append-only (no `updated_at`); `cierres_caja` is an immutable snapshot.

---

## 2. Service Layer (Factory Pattern, Never-Throw)

All 4 services follow the catalog/events factory pattern. Each accepts `SupabaseClient<Database>` via parameter (OCP/DIP), returns `{ data, error: ServiceError | null }` — never throws (LSP).

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Module singleton | Hard to mock per-test | Rejected |
| Class with DI | Verbose for 4-method services | Rejected |
| **Factory function** `crearXService(supabase)` | Test injects mock; OCP clean | **Chosen** |

### `src/services/productos.service.ts`
Factory `crearProductosService(supabase)`. Methods: `listar`, `obtener`, `crear`, `actualizar`, `eliminar`. `crear` returns DUPLICATE_RECETA error when UNIQUE(receta_id) is violated. DELETE blocked by RESTRICT FK on `venta_items`.

### `src/services/ventas.service.ts`
Factory `crearVentasService(supabase)`. Methods: `listarPorEvento`, `registrarVenta(input: VentaConItems)`. `registrarVenta` is the key method: inserts `venta` header, then batch-inserts `venta_items` via `Promise.all`. On any item failure, returns the first error. No transaction (v1 uses sequential inserts); the store handles revert. Also exposes `crear` and `crearItem` for granular testing.

### `src/services/gastosImprevistos.service.ts`
Factory `crearGastosImprevistosService(supabase)`. Methods: `listarPorEvento`, `crear`, `eliminar`. Simple CRUD — no update (imprevistos are append-and-delete only). Matches `gastosFijos.service` shape.

### `src/services/cierres.service.ts`
Factory `crearCierresService(supabase)`. Methods: `obtenerPorEvento`, `crear`. No `actualizar`, no `eliminar` — cierres are immutable. `crear` is gated by UNIQUE(evento_id) at DB level; service returns DUPLICATE_CIERRE on violation.

---

## 3. Pinia Stores

All 4 stores are setup-style (`defineStore(name, () => { ... })`). Each receives `SupabaseClient<Database>` via `inject('supabase')`, constructs its service at store creation, and exposes refs (`cargando`, `error`) + actions.

### `src/stores/ventas.store.ts`
The **only store with transient UI state**. State: `ventas: Ref<VentaConItems[]>`, `carrito: Ref<LineaCarrito[]>`, `cargando`, `error`. Actions: `cargarParaEvento(id)`, `agregarAlCarrito(productoId, precioSnapshot)`, `actualizarCantidad(productoId, cantidad)`, `quitarDelCarrito(productoId)`, `vaciarCarrito()`, `registrarVenta(metodoPago)`. Computed: `totalCarrito`, `cantidadItems`.

`registrarVenta` is the optimistic action: snapshots the cart, clears it immediately, calls `servicio.registrarVenta()`. On success: appends venta to `ventas`, shows green toast. On failure: restores cart from snapshot, shows red toast. Gated by `estadoEsEditable(eventoActual.estado)` and `carrito.length > 0`.

### `src/stores/productos.store.ts`
State: `productos: Ref<Producto[]>`. Actions: `cargarDisponibles` (WHERE `disponible = true` ORDER BY `orden`), `crear`, `actualizar`, `eliminar`. Gated on `estadoEsEditable` for the create-from-recipe flow.

### `src/stores/gastosImprevistos.store.ts`
State: `gastos: Ref<GastoImprevisto[]>`. Actions: `cargarParaEvento(id)`, `crear`, `eliminar`. Gated by `estadoEsEditable` — returns `EVENTO_CERRADO` if frozen.

### `src/stores/cierres.store.ts`
State: `cierre: Ref<CierreCaja | null>`. Actions: `cargarParaEvento(id)`, `registrarCierre(input)`. `registrarCierre` calls `transicionEstadoValida('en_curso', 'cerrado')` then inserts cierre + calls `eventsService.cambiarEstado`. On success: redirects to `/eventos/:id`. If evento already `cerrado` and no cierre exists, allows retroactive creation (read-only state — cierre is meta-data).

Cross-store READS inside `computed()` are allowed (events precedent: `useProyeccionCostos` reads 4 stores). Cross-store WRITES are FORBIDDEN.

---

## 4. Composables

Thin `storeToRefs` wrappers + pure-function exports.

| Composable | Wraps | Exposes |
|-----------|-------|---------|
| `useProductos()` | `productos.store` | `productos, cargando, error, cargarDisponibles, crear, actualizar, eliminar` |
| `useVentas()` | `ventas.store` | `ventas, carrito, totalCarrito, agregarAlCarrito, actualizarCantidad, quitarDelCarrito, vaciarCarrito, registrarVenta` |
| `useGastosImprevistos()` | `gastosImprevistos.store` | `gastos, cargando, error, cargarParaEvento, crear, eliminar` |
| `useCierreCaja()` | `cierres.store` + pure math | `cierre, resumen (computed), registrarCierre` |

---

## 5. Pure Logic

### `src/utils/cierre.ts`

```ts
export function calcularCierre(input: CierreInput): CierreResumen
export function formatearDiferencia(monto: number): string
```

`calcularCierre` accepts `ventas`, `gastosFijos`, `gastosImprevistos`, optional `efectivoEsperado`/`efectivoReal`. Returns totals with `redondearCentavos` rounding, `ventasPorMetodoPago` breakdown, `diferencia = efectivoReal − efectivoEsperado` (null if either is null). Pure — unit-testable with zero Vue/Pinia/Supabase deps.

`formatearDiferencia` returns `"Sobrante $X.XX"` / `"Faltante $X.XX"` / `"Cuadre exacto"`.

**Edge cases**: empty ventas (zero totals), mixed metodo_pago, diferencia positive/negative/zero/null, float-drift round-up. Mirrors `calcularProyeccion` test pattern from events.

### Reused from events: `transicionEstadoValida`, `estadoEsEditable`
`useCierreCaja.registrarCierre` calls `transicionEstadoValida('en_curso', 'cerrado')` BEFORE insert. Store guards for ventas/imprevistos call `estadoEsEditable(evento.estado)`. Single source of truth — no duplicated `estado === 'cerrado'` strings.

---

## 6. Component Tree

| Component | Props | Emits | Role |
|-----------|-------|-------|------|
| `ProductoCard.vue` | `producto: Producto`, `receta?: RecetaConIngredientes` | `agregar` | Clickable card: name, price, optional cost tooltip |
| `ProductoGrid.vue` | `productos: Producto[]`, `recetas: RecetaConIngredientes[]` | `agregar` | Responsive Vuetify grid (`cols="12 sm=6 md=4 lg=3"`) |
| `CarritoPanel.vue` | `carrito: LineaCarrito[]`, `total: number` | `registrar-venta`, `vaciar`, `update-cantidad`, `eliminar` | Sidebar/bottom-sheet cart + mini-list |
| `VentaItem.vue` | `linea: LineaCarrito` | `update-cantidad`, `eliminar` | Quantity controls + subtotal |
| `RegistrarVentaDialog.vue` | `modelValue: boolean`, `total: number` | `confirmar` (with `metodoPago`) | Confirmation + payment method selector |
| `GastoImprevistoForm.vue` | `valoresIniciales: GastoImprevistoInput` | `submit` | Form: monto (>0) + motivo (≤500) + categoria |
| `GastoImprevistoListItem.vue` | `gasto: GastoImprevisto` | `eliminar` | Row display |
| `CierreResumenCard.vue` | `cierre: CierreResumen` | — | 4-section read-only card + yellow `v-alert` on diferencia ≠ 0 |

Components mirror events patterns: `ProductoCard` ↔ `RecetaCostoDesglose`, `GastoImprevistoForm` ↔ `GastoFijoForm`, `CierreResumenCard` ↔ `ProyeccionCostosCard`. ISP: components accept only needed props, not full domain objects.

---

## 7. Views

| View | Route | Consumes | Key behavior |
|------|-------|----------|-------------|
| `PosView.vue` | `/pos` | `useProductos()`, `useVentas()`, `useGastosImprevistos()`, `useEvents()`, `useOnlineStatus()` | Checks `eventoEnCurso`. If null → "Activar evento" picker. If exists → grid + cart + collapsible imprevistos section + online-status chip. 4-state handling (loading/error/empty/data). |
| `PosCierreView.vue` | `/pos/cierre/:eventoId` | `useCierreCaja()`, `useEvents()` | Loads ventas + gastos. Shows `CierreResumenCard` + cash-count inputs + "Registrar cierre" with confirmation dialog. Retroactive cierre allowed if evento `cerrado` and no cierre exists. |
| `RecetaDetalleView.vue` *(modified, catalog)* | `/recetas/:id` | `useProductos()` | Adds "Vender esta receta" button (when no producto exists) + dialog for `precio_venta`. After creation: button → "Editar precio de venta". The only cross-slice touch (~30 lines + 2 tests). |

---

## 8. Database Schema

Single idempotent migration `supabase/migrations/20260619000000_pos_inicial.sql` (5 tables, all `create table if not exists`, `drop policy if exists`):

### `public.productos` — mutable (has `updated_at` trigger)
6 columns: `id` (uuid PK), `receta_id` (FK→recetas RESTRICT), `precio_venta` (numeric(10,2), CHECK > 0), `disponible` (boolean, default true), `orden` (int, default 0), `created_at`, `updated_at`. UNIQUE(receta_id). Indexes: `idx_productos_receta_id`, `idx_productos_disponible_orden`.

### `public.ventas` — append-only (no `updated_at`)
4 columns: `id` (uuid PK), `evento_id` (FK→eventos RESTRICT), `fecha` (timestamptz default now()), `total` (CHECK ≥ 0), `metodo_pago` (text, CHECK in 4-value enum), `created_at`. Indexes: `idx_ventas_evento_id`, `idx_ventas_fecha`, `idx_ventas_metodo_pago`.

### `public.venta_items` — append-only
5 columns: `id` (uuid PK), `venta_id` (FK→ventas CASCADE), `producto_id` (FK→productos RESTRICT), `cantidad` (numeric(10,4), CHECK > 0), `precio_unitario` (CHECK ≥ 0), `subtotal` (CHECK ≥ 0), `created_at`. Indexes: `idx_venta_items_venta_id`, `idx_venta_items_producto_id`.

### `public.gastos_imprevistos`
4 columns: `id` (uuid PK), `evento_id` (FK→eventos CASCADE), `monto` (CHECK > 0), `motivo` (text, CHECK length>0 AND ≤500), `categoria` (text, NULL, CHECK in 5-value enum), `created_at`. Index: `idx_gastos_imprevistos_evento_id`.

### `public.cierres_caja` — immutable snapshot
10 columns: `id` (uuid PK), `evento_id` (FK→eventos CASCADE, UNIQUE), `fecha_cierre` (timestamptz default now()), `total_ventas`, `total_gastos_fijos`, `total_gastos_imprevistos`, `utilidad_bruta`, `efectivo_esperado` (NULL), `efectivo_real` (NULL), `diferencia` (NULL), `notas` (NULL), `created_at`. UNIQUE(evento_id). Index: `idx_cierres_caja_evento_id` UNIQUE.

### RLS
10 policies (select + write for authenticated on all 5 tables). Anon not granted via RLS; `dev_bypass_rls.sql` extended with 5 new `grant` lines.

---

## 9. State Machine Integration

POS drives `en_curso → cerrado` for the first time via `useCierreCaja.registrarCierre`:
1. Calls `transicionEstadoValida('en_curso', 'cerrado')` — if invalid, returns `TRANSICION_INVALIDA`.
2. Inserts `cierres_caja` row — if UNIQUE violation (already has cierre), returns `DUPLICATE_CIERRE`.
3. Calls `eventsService.cambiarEstado(eventoId, 'en_curso', 'cerrado')`.
4. On success: redirects to `/eventos/:id`.
5. If cierre insert succeeds but estado change fails: cierre row stays; user sees error and retries.

Freeze guards: `ventas.store.registrarVenta` and `gastosImprevistos.store.crear/eliminar` call `estadoEsEditable(eventoActual.estado)` — return `EVENTO_CERRADO` if frozen. The POS view hides "Agregar" buttons when `estado === 'cerrado'`.

**Retroactive cierre**: if evento is `cerrado` and no cierre exists, `PosCierreView` allows cierre creation. Rationale: cierres are meta-data about the evento, not a mutation.

---

## 10. Optimistic UI Pattern

**Add to cart**: `agregarAlCarrito(productoId)` snapshots the current cart to a local variable, modifies `carrito` ref (instant re-render), no network call. If `disponible` flipped mid-session: line stays (snapshot pricing); warning shown on next add for that producto.

**Register sale**: `registrarVenta(metodoPago)` snapshots cart, clears it immediately, shows green toast "🎉 Venta registrada: $X.XX". Then calls Supabase. On success: appends venta to `ventas` list. On failure: restores cart from snapshot, shows red toast "❌ Error al registrar venta — revisá tu conexión". Cart empty → "Registrar venta" button disabled.

**Why optimistic in POS**: brief §3.1 mandates "feedback inmediato y emocional." Catalog/events are CRUD with explicit save; POS is the first slice where instant feedback matters.

---

## 11. Snapshot Pricing

`venta_items.precio_unitario` and `subtotal` are stored as column values at write time — NOT derived from `productos.precio_venta` on read. If `producto.precio_venta` changes later, historical `venta_items.precio_unitario` stays unchanged.

**Explicit inversion**: catalog DERIVES cost on read (`calcularCostoReceta` uses live ingredient prices) to stay fresh. POS SNAPSHOTS price at write to stay honest — cierres and analytics consume what actually happened, not the current menu price.

---

## 12. Types (`src/types/pos.types.ts`)

Spanish domain types matching SQL columns 1:1. `*Input` variants omit `id`, `created_at`, `updated_at`.

```ts
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
export type CategoriaImprevisto = 'insumos_extra' | 'transporte' | 'reparacion' | 'propina' | 'otro'

export interface Producto { id, receta_id, precio_venta, disponible, orden, created_at, updated_at }
export type ProductoInput = Omit<Producto, 'id' | 'created_at' | 'updated_at'>

export interface Venta { id, evento_id, fecha, total, metodo_pago, created_at }
export type VentaInput = Omit<Venta, 'id' | 'fecha' | 'created_at'>

export interface VentaItem { id, venta_id, producto_id, cantidad, precio_unitario, subtotal, created_at }
export type VentaItemInput = Omit<VentaItem, 'id' | 'venta_id' | 'created_at'>

export interface VentaConItems extends Venta { items: VentaItem[] }

export interface GastoImprevisto { id, evento_id, monto, motivo, categoria, created_at }
export type GastoImprevistoInput = Omit<GastoImprevisto, 'id' | 'created_at'>

export interface CierreCaja { id, evento_id, fecha_cierre, total_ventas, total_gastos_fijos,
  total_gastos_imprevistos, utilidad_bruta, efectivo_esperado, efectivo_real, diferencia, notas, created_at }
export type CierreCajaInput = Omit<CierreCaja, 'id' | 'fecha_cierre' | 'created_at'>

// Pure-function shapes (NOT SQL rows)
export interface LineaCarrito { producto_id, nombre, precio_unitario, cantidad, subtotal }
export interface ResumenCarrito { lineas, total, cantidadItems }
export interface CierreInput { ventas, gastosFijos, gastosImprevistos, efectivoEsperado, efectivoReal }
export interface CierreResumen { totalVentas, totalGastosFijos, totalGastosImprevistos, utilidadBruta,
  efectivoEsperado, efectivoReal, diferencia, ventasPorMetodoPago, cantidadVentas }
```

`ServiceError` reused from `catalog.types.ts`. `src/types/database.types.ts` extended with 5 table entries (each with `Row`, `Insert`, `Update`, `Relationships`). `src/types/index.ts` re-exports all.

---

## 13. Routing

2 lazy routes appended to `src/router/routes.ts` (before catch-all, additive):

```ts
{ path: '/pos', name: 'pos', component: () => import('@/views/PosView.vue') },
{ path: '/pos/cierre/:eventoId', name: 'pos-cierre', component: () => import('@/views/PosCierreView.vue'), props: true },
```

`/productos` CRUD MAY ship as a minimal view under `/catalog` or be deferred (primary create path is the cross-slice "Vender esta receta" button). `routes.spec.ts` gets 2 new `expect` assertions.

---

## 14. Supabase Mock Reuse

Zero changes to `tests/setup.ts`. The chainable Supabase mock is table-name agnostic. New POS spec files import `__resetSupabaseMock` and `__getSupabaseMockCalls` exactly like catalog and events tests. `beforeEach` calls `__resetSupabaseMock({ data: [...], error: null })` for test isolation.

---

## 15. Test Architecture (Strict TDD Order)

| Phase | Layer | Files | Tests | Est. |
|-------|-------|-------|-------|------|
| 1 | Pure logic | `cierre.spec.ts`, `useVentas.spec.ts` (cart math), `useCierreCaja.spec.ts` (pure export) | ~18 | Zero deps |
| 2 | Services | `productos.service.spec.ts`, `ventas.service.spec.ts`, `gastosImprevistos.service.spec.ts`, `cierres.service.spec.ts` | ~16 | Mock supabase only |
| 3 | Stores | `productos.store.spec.ts`, `ventas.store.spec.ts`, `gastosImprevistos.store.spec.ts`, `cierres.store.spec.ts` | ~16 | Real Pinia + mock services |
| 4 | Components | 7 spec files (ProductoCard, ProductoGrid, CarritoPanel, VentaItem, RegistrarVentaDialog, GastoImprevistoForm, CierreResumenCard) | ~20 | Mount + mock stores |
| 5 | Views | `PosView.spec.ts`, `PosCierreView.spec.ts` | ~10 | Full mount + router |
| 6 | Cross-slice + Router | `RecetaDetalleView.spec.ts` (delta), `routes.spec.ts` (delta) | ~4 | Modified existing specs |

**~80 new tests cumulative.** `pnpm test` target ≤ 12 s (catalog ~5 s + events ~7 s extended). Every spec committed BEFORE implementation (RED → GREEN → REFACTOR).

---

## 16. File → Requirement Traceability (56 REQ-IDs)

### PR1 — Schema + types + helpers + cierre (~430 lines)
| REQ-ID | Files |
|--------|-------|
| REQ-POS-30 | `src/utils/cierre.ts` (`calcularCierre` supports cierre totals) |
| REQ-POS-31 | `src/utils/cierre.ts` (`calcularCierre` tested for all edge cases) |
| REQ-POS-41 | `supabase/migrations/20260619000000_pos_inicial.sql` |
| REQ-POS-42 | `src/types/database.types.ts` |
| REQ-POS-43 | `supabase/dev_bypass_rls.sql` |
| REQ-POS-44 | `src/types/pos.types.ts`, `src/types/index.ts` |
| REQ-POS-48 | All new files (Spanish UI identifiers, English filenames) |
| REQ-POS-52 | Service interfaces (factory contracts define OCP) |
| REQ-POS-56 | All `.spec.ts` files (metadata — one-per-source check) |

### PR2 — Productos domain (~320 lines) **[F2a]**
| REQ-ID | Files |
|--------|-------|
| REQ-POS-1 | `src/services/productos.service.ts`, `src/stores/productos.store.ts`, `src/composables/useProductos.ts` |
| REQ-POS-2 | `src/services/productos.service.ts` (UNIQUE violation handling) |
| REQ-POS-3 | `src/services/productos.service.ts` (`actualizar` toggles `disponible`) |
| REQ-POS-4 | `src/services/productos.service.ts` (`precio_venta` editable) |
| REQ-POS-5 | `src/services/productos.service.ts` (RESTRICT FK detected in spec) |
| REQ-POS-6 | `src/stores/ventas.store.ts` (cart ref init — empty) |
| REQ-POS-7 | `src/stores/ventas.store.ts` (`agregarAlCarrito` merges duplicates) |
| REQ-POS-8 | `src/stores/ventas.store.ts` (`actualizarCantidad` sets qty directly) |
| REQ-POS-9 | `src/stores/ventas.store.ts` (`quitarDelCarrito`) |
| REQ-POS-10 | `src/stores/ventas.store.ts` (`vaciarCarrito`) |
| REQ-POS-11 | `src/stores/ventas.store.ts` (computed `total`) |
| REQ-POS-12 | `src/services/ventas.service.ts`, `src/stores/ventas.store.ts` (`registrarVenta`) |
| REQ-POS-18 | `src/types/pos.types.ts` (VentaItem fields), `supabase/migrations` (CHECK constraints) |
| REQ-POS-52 | `src/services/productos.service.ts`, `src/services/ventas.service.ts` |
| REQ-POS-53 | `src/services/productos.service.ts`, `src/services/ventas.service.ts` |
| REQ-POS-55 | `src/stores/productos.store.ts`, `src/stores/ventas.store.ts` (`inject('supabase')`) |

### PR3 — POS components + views (~480 lines) **[F2b from PR2]**
| REQ-ID | Files |
|--------|-------|
| REQ-POS-13 | `src/stores/ventas.store.ts` (snapshot pattern verified in spec) |
| REQ-POS-14 | `src/stores/ventas.store.ts` (optimistic clear + revert-on-failure) |
| REQ-POS-15 | `src/components/business/CarritoPanel.vue` (empty guard on button) |
| REQ-POS-16 | `src/stores/ventas.store.ts` (guard `SIN_EVENTO_ACTIVO`) |
| REQ-POS-17 | `src/services/ventas.service.ts` (≥1 item enforced) |
| REQ-POS-19 | `supabase/migrations` (CASCADE FK on venta_items.venta_id) |
| REQ-POS-20 | `src/components/business/ProductoGrid.vue`, `ProductoCard.vue` |
| REQ-POS-21 | `src/components/business/ProductoCard.vue` (≥48px tap targets) |
| REQ-POS-22 | `src/components/business/ProductoGrid.vue` (optional filter) |
| REQ-POS-23 | `src/components/business/ProductoGrid.vue` (search input) |
| REQ-POS-24 | `src/views/PosView.vue` (empty state + catalog link) |
| REQ-POS-25 | `src/components/business/CarritoPanel.vue` (sidebar/bottom-sheet) |
| REQ-POS-26 | `src/components/business/VentaItem.vue` (line display) |
| REQ-POS-27 | `src/components/business/CarritoPanel.vue` (total display) |
| REQ-POS-28 | `src/components/business/CarritoPanel.vue` (button disabled when empty) |
| REQ-POS-29 | `src/components/business/CarritoPanel.vue` (vaciar confirmation) |
| REQ-POS-46 | `/productos` route (or inline in `/catalog`) |
| REQ-POS-47 | `src/views/RecetaDetalleView.vue` (cross-slice button + dialog) |
| REQ-POS-48 | All component/views (Spanish UI text) |
| REQ-POS-49 | `src/views/PosView.vue` (4-state handling) |
| REQ-POS-50 | `GastoImprevistoForm.vue` (validation rules) |
| REQ-POS-51 | `src/stores/ventas.store.ts` (cross-store READ only) |
| REQ-POS-54 | All components (ISP — minimal props) |

### PR4 — Cierres + gastos + cierre view (~430 lines)
| REQ-ID | Files |
|--------|-------|
| REQ-POS-32 | `src/services/cierres.service.ts` (no `actualizar` method) |
| REQ-POS-33 | `src/composables/useCierreCaja.ts` (calls `transicionEstadoValida` + `cambiarEstado`) |
| REQ-POS-34 | `src/components/business/CierreResumenCard.vue` (4 sections + yellow alert) |
| REQ-POS-35 | `src/composables/useCierreCaja.ts` (zero-ventas warning + UNIQUE gate) |
| REQ-POS-36 | `src/composables/useCierreCaja.ts` (insert + transition + redirect) |
| REQ-POS-37 | `src/services/gastosImprevistos.service.ts`, `src/stores/gastosImprevistos.store.ts` |
| REQ-POS-38 | `src/services/gastosImprevistos.service.ts` (separate table — verified) |
| REQ-POS-39 | `src/stores/gastosImprevistos.store.ts` (gate `estadoEsEditable`) |
| REQ-POS-40 | `src/views/PosView.vue` (collapsible imprevistos section in cierre context) |
| REQ-POS-52 | `src/services/gastosImprevistos.service.ts`, `src/services/cierres.service.ts` |
| REQ-POS-53 | `src/services/gastosImprevistos.service.ts`, `src/services/cierres.service.ts` |
| REQ-POS-55 | `src/stores/gastosImprevistos.store.ts`, `src/stores/cierres.store.ts` |

### PR5 — Router + docs + final verify (~100 lines)
| REQ-ID | Files |
|--------|-------|
| REQ-POS-45 | `src/router/routes.ts`, `src/router/routes.spec.ts` |
| REQ-POS-46 | `src/router/routes.ts` (or `/catalog` route) |
| REQ-POS-48 | All docs (Spanish UI) |
| REQ-POS-56 | `pnpm test` gate (≥ 80 passing), final verify |

**56/56 REQ-IDs traced.** Every requirement maps to at least one file. No requirement is homeless.

---

## 17. File Changes Summary

| Action | Count | Files |
|--------|-------|-------|
| **Create** | 22 | 1 migration, 1 doc, 4 services, 4 stores, 4 composables, 1 util, 1 types, 8 components, 2 views |
| **Create (specs)** | 17 | `.spec.ts` for every source file (minus `useProductos`, `useGastosImprevistos`, `GastoImprevistoListItem`) |
| **Modify** | 6 | `database.types.ts`, `types/index.ts`, `dev_bypass_rls.sql`, `routes.ts`, `routes.spec.ts`, `RecetaDetalleView.vue` (cross-slice) |
| **Untouched** | ∞ | All foundation/catalog/events source files (proof of additive change) |

---

## 18. Risks & Mitigations

| # | Risk | Likelihood | Mitigation |
|---|------|------------|------------|
| 1 | **Cart lost on refresh** — carrito in Pinia memory | Medium | Documented in `docs/pos-setup.md`. Offline-sync slice will add WAL persistence. |
| 2 | **Partial `registrarVenta` failure** — venta inserted, items fail | Medium | Service returns first item error; store restores cart. User retries; duplicate venta tolerated in v1. |
| 3 | **400-line budget exceeded** — ~2,000 total lines | High | 5 chained PRs MANDATORY; F2 splits pre-planned in PR2 and PR3. |
| 4 | **Cross-slice `RecetaDetalleView` touch** — reviewer flags scope creep | Low | Documented in exploration + proposal + design. 1 button + 1 dialog + 2 tests. Alternative (Productos CRUD view) adds 1+ PR. |
| 5 | **No `user_id` on ventas** — anon key exposes all data in dev | High | auth-flow slice adds column + RLS. POS v1 documents this gap in proposal §4.2. |
| 6 | **Supabase RLS not enforced in dev** — `dev_bypass_rls.sql` grants anon full access | Locked out | catalog/events precedent; auth-flow removes the bypass. |

---

## Key Learnings

- **POS is the first transactional domain** — ventas append to a ledger with optimistic UI + revert-on-failure. Brief's "feedback inmediato y emocional" (§3.1) shows up here for the first time: click product → cart updates instantly → green toast on sale.
- **Snapshot pricing is the explicit inversion** of catalog's "compute on read" pattern. Where catalog DERIVES cost to stay fresh, POS SNAPSHOTS price to stay honest. `precio_unitario` and `subtotal` in `venta_items` are column values frozen at write time.
- **Cross-store READ is clean; WRITE is forbidden.** `ventas.store.registrarVenta` reads `eventsStore.eventoActual.estado` for the guard but never mutates it. The `useCierreCaja` composable orchestrates two separate calls (insert cierre + `eventsService.cambiarEstado`).
- **`calcularCierre` as pure function follows events' `calcularProyeccion` precedent.** Zero-dependency unit tests for the cierre math, 1:1 edge-case parity.
- **The cart lives in `ventas.store` (Pinia in-memory), NOT in `IStorageService`.** v1 is online-only per the explicit offline-sync deferral. The `// TODO(offline-sync):` marker in `ventas.store.registrarVenta` is the contract for the future slice.
- **`cierres_caja` is an immutable snapshot** — no `updated_at`, no `actualizar` method. One cierre per evento (UNIQUE constraint). This trades freshness for honesty: if ventas change later (shouldn't — evento is `cerrado`), the cierre stays accurate to its day.
