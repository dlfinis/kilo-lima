# Exploration: `pos` (Phase 4 — Caja Registradora)

> **Change**: `pos` | **Phase**: `sdd-explore`
> **Scope** (locked from `brief.md` §7 Phase 4, items 14–17):
>   14. Grid de productos para venta
>   15. Carrito y registro de ventas
>   16. Cierre de caja diario
>   17. Gastos imprevistos
> **Events status**: ARCHIVED — 46/46 REQ-IDs satisfied, 3 tables (`eventos`, `gastos_fijos`, `plan_produccion`), `evento.estado` state machine (`planificacion` → `en_curso` → `cerrado`), `calcularProyeccion` + `useProyeccionCostos` consumed verbatim.
> **Catalog status**: ARCHIVED — 46/46 REQ-IDs, 3 tables (`materias_primas`, `recetas`, `receta_ingredientes`), `calcularCostoReceta` pure function, hand-rolled `Database` interface, `dev_bypass_rls.sql` extended for 6 tables.
> **Foundation status**: ARCHIVED — 54/54 REQ-IDs, `strict_tdd: ENABLED`, `IStorageService` LSP, `LocalforageStorageService`, `useOnlineStatus()`, `usePwaUpdate()`, `vite-plugin-pwa` (`generateSW`), `useAuth()` stub (throws).
> **Stack baseline**: Vue 3.5 + Vite 5.4 + TS 5.6 + Vuetify 3.12 + Pinia 3.0 + Vue Router 4.6 + Supabase JS 2.108 + Vitest 2.1 + @vue/test-utils 2.4 (all frozen).
> **Delivery context**: stacked-to-main, 400-line review budget, `strict_tdd: ENABLED`, chained PRs MANDATORY (5 PRs with at least one F2 split — events precedent).
> **Auth note**: `useAuth()` is still a stub (throws on call). POS must be single-user; `user_id` columns are deferred to the `auth-flow` slice.

---

## Current State (events + catalog invariants the pos slice must respect)

The events slice locked the multi-table, state-machine-driven domain and proved that strict TDD at scale produces more tests than the forecast (228 vs ~60) and consistently exceeds the 400-line budget (5 PRs needed, with F2 split). POS inherits every pattern verbatim and adds the first **transactional** domain (ventas + venta_items are write-heavy, must feel instant), the first **derived business entity that bridges catalog + events** (`producto` = a recipe marked for sale at a price), the first **end-of-day snapshot** (cierre_caja), and the first **table for unplanned costs distinct from the planned ones** (`gastos_imprevistos` lives next to `gastos_fijos`, never on the same table).

**Inherited patterns (do not change)**:

- **DI entry point** (`src/plugins/services.ts`): `inject('supabase')` returns
  the typed `SupabaseClient<Database>` singleton. Every new service uses the
  same factory pattern (`crearVentasService(supabase)`).
- **Hand-rolled `Database` interface** (`src/types/database.types.ts`):
  catalog added 3 tables, events added 3 more. POS extends the `Tables` map
  with 5 more (`productos`, `ventas`, `venta_items`, `gastos_imprevistos`,
  `cierres_caja`) — additive, zero drift in catalog or events tables.
- **Service never-throw contract** (`{ data, error: ServiceError | null }`):
  inherited from REQ-CATALOG-44 / REQ-EVENTS-41. `ServiceError = { code,
  message }`. Services catch Supabase errors and return them; the view throws
  if needed.
- **Store pattern** (`src/stores/<domain>.store.ts`): setup-style Pinia, one
  store per domain, `inject('supabase')` → factory service, three refs
  (`<entities>`, `cargando`, `error`) + actions. Cross-store READS happen
  inside `computed()` (events precedent: `useProyeccionCostos` reads 4
  stores). **Cross-store WRITES are forbidden** (events lesson).
- **Composable layer**: thin `storeToRefs` wrapper (`useVentas()` etc.) plus
  pure-function utilities where the math matters (`calcularResumenCarrito`,
  `calcularCierre`).
- **State machine** (`src/utils/estado.ts`): already exports
  `transicionEstadoValida`, `estadoEsEditable`. POS consumes the FIRST
  helper for `cerrar caja` (`en_curso → cerrado`); POS reuses the SECOND
  helper to gate the `pos.store` actions on `cerrado` (a closed event has
  read-only POS history, no new ventas).
- **Form components** (`src/components/business/`): one per CRUD form, emits
  `submit` with the typed input. `<200` lines, `<30`-line functions.
- **Routes** (`src/router/routes.ts`): lazy-loaded `() => import(...)` per
  route. Catalog added 3, events added 3, POS adds 2 (`/pos`,
  `/pos/cierre/:eventoId`).
- **Supabase chainable mock** (`tests/setup.ts`): exports
  `__resetSupabaseMock`, `__pushSupabaseResponse`, `__getSupabaseMockCalls`.
  POS tests reuse this — no new helper needed.
- **`dev_bypass_rls.sql`** (`supabase/dev_bypass_rls.sql`): must be extended
  in the POS migration to grant the anon role access to the 5 new tables.
  The auth-flow slice will remove it.
- **PWA + offline primitives** (`vite-plugin-pwa` with `generateSW`,
  `LocalforageStorageService`, `useOnlineStatus`): available but POS v1
  ships ONLINE-ONLY. The offline WAL is the `offline-sync` slice's job
  (brief item 20, foundation's `docs/offline-sync.md`). POS v1 may write
  a `// TODO(offline-sync):` marker where the WAL will plug in.
- **Strict TDD order**: spec-first, every `.ts` has a `.spec.ts` committed
  in the same PR (RED → GREEN → REFACTOR). Events delivered 228 tests vs
  ~60 forecast; expect POS to follow the same multiplier.

### Lessons learned from events (apply directly)

| Lesson | POS application |
|--------|-----------------|
| Cross-store READ in `computed` is clean (events: `useProyeccionCostos`). | `useResumenCarrito` reads `productos` + `recetas` + cart ref inside `computed`. |
| Cross-store WRITE is forbidden. | `pos.store.registrarVenta` does NOT mutate `events.store`; the view orchestrates "registrar venta → cambiar estado" via two separate calls. |
| One pure function per math concern, exported alongside the composable. | `calcularCierre(ventas, gastosFijos, gastosImprevistos, efectivoEsperado)` lives in `useCierreCaja.ts` and is unit-testable. |
| F2 split mandatory for the components-and-views PR. | PR2a (services+stores) + PR2b (components+views) is the precedent. |
| `reemplazarTodos` (events plans) is destructive and fragile. | POS does NOT use it. Ventas are append-only; cart is in-memory, never persisted mid-flow. |
| The state machine has one source of truth (`src/utils/estado.ts`). | POS's "requiere evento en_curso" guard reads `transicionEstadoValida` + `estadoEsEditable`; no duplicates. |
| The chainable Supabase mock scales to 8+ services with zero test-setup changes. | POS adds 2 new services to the same mock; no `tests/setup.ts` changes. |

### No config drift

`openspec/config.yaml` already has `testing.strict_tdd: true`,
`apply.tdd: true`, `apply.test_command: "pnpm test"`, etc. (catalog PR1
flipped it; events confirmed it). POS reuses the existing config verbatim.

### Existing reusable assets

| Asset | Reused by pos as… |
|-------|-------------------|
| `calcularCostoReceta(lineas, rendimiento)` (catalog PR1) | Indirectly — `producto.precio_venta` is user-set; cost math stays in catalog. POS does NOT recalculate cost; it uses the entered `precio_venta` as the source of truth for sales math. |
| `useEvents()` + `events.store` (events) | The source of `eventoActual` for the active POS session. POS reads `eventsStore.eventoEnCurso` (a `computed` getter that returns the `en_curso` evento or null). |
| `useIngredients()` + `ingredients.store` (catalog) | Read-only dependency for the optional "show recipe cost" tooltip on each `ProductoCard`. |
| `useRecipes()` + `recipes.store` (catalog) | Read-only dependency for the same tooltip; `producto.receta_id` references a `receta`. |
| `transicionEstadoValida(desde, hacia)` (events) | POS's `cerrarCaja(eventoId)` action checks `transicionEstadoValida('en_curso', 'cerrado')` before calling `events.service.cambiarEstado`. |
| `estadoEsEditable(estado)` (events) | POS guards every `ventas` mutation: a `cerrado` evento cannot accept new ventas. |
| `EventDetalleView`'s tabs pattern (events) | Inspiration for the POS view's split: product grid (left) + cart panel (right) on tablet/desktop; tabs on mobile. |
| `ProyeccionCostosCard`'s `v-alert` for warnings (events) | The cierre view shows a yellow `v-alert` when `diferencia !== 0` ("Hay una diferencia de $X — revisá los gastos imprevistos"). |
| `IStorageService` LSP (foundation) | POS v1 does NOT use it (online-only). Documented as the integration point for `offline-sync`. |
| `useOnlineStatus()` (foundation) | POS view shows a small chip in the header — "En línea" / "Sin conexión" — but does NOT block sales in v1 (online-only). |
| `useAuth()` stub (foundation) | NOT consumed in POS v1 (single-user; throws if called). |
| `__resetSupabaseMock` (foundation) | New `*.spec.ts` files import and call it in `beforeEach`. |
| `redondearCentavos`, `formatearMoneda` (catalog) | Cart total + cierre totals + venta subtotals. |

---

## Affected Areas

### New files (pos slice creates)

| Path | Why it appears |
|------|----------------|
| `supabase/migrations/20260619000000_pos_inicial.sql` | Schema for `productos`, `ventas`, `venta_items`, `gastos_imprevistos`, `cierres_caja` + RLS + indexes. |
| `docs/pos-setup.md` | User-facing one-time setup (paste migration + extended `dev_bypass_rls.sql`). |
| `src/types/pos.types.ts` | Spanish domain types: `Producto`, `Venta`, `VentaItem`, `GastoImprevisto`, `CierreCaja`, `MetodoPago`, plus `*Input` variants and the cierre output shape. |
| `src/types/database.types.ts` *(modified)* | Add 5 new tables (`productos`, `ventas`, `venta_items`, `gastos_imprevistos`, `cierres_caja`) to the hand-rolled `Database`. |
| `src/types/index.ts` *(modified)* | Re-export pos types. |
| `src/services/productos.service.ts` | Supabase CRUD for `productos` (the "para venta" toggle lives here). Factory + never-throw. |
| `src/services/ventas.service.ts` | Supabase CRUD for `ventas` + `venta_items` (joined — same parent-table + child-table pattern as events' `events.service` + `gastos_fijos`). Single service keeps `registrarVenta(ventaConItems)` atomic at the API surface. |
| `src/services/gastosImprevistos.service.ts` | Supabase CRUD for `gastos_imprevistos` (per-evento, simple list). |
| `src/services/cierres.service.ts` | Supabase CRUD for `cierres_caja` (read + insert; immutable after creation). |
| `src/stores/productos.store.ts` | Pinia store for `productos` (per the catalog's one-store-per-domain rule). |
| `src/stores/ventas.store.ts` | Pinia store for `ventas` + `venta_items` + the in-memory `carrito` ref (transient UI state). |
| `src/stores/gastosImprevistos.store.ts` | Pinia store for `gastos_imprevistos` (the current evento's list). |
| `src/stores/cierres.store.ts` | Pinia store for `cierres_caja` (one cierre per evento — keyed by `eventoId`). |
| `src/composables/useProductos.ts` | Thin wrapper around `productos.store`. |
| `src/composables/useVentas.ts` | Wrapper around `ventas.store` + the in-memory cart helpers (`agregarAlCarrito`, `quitarDelCarrito`, `vaciarCarrito`, `calcularResumen`). |
| `src/composables/useGastosImprevistos.ts` | Wrapper around `gastosImprevistos.store`. |
| `src/composables/useCierreCaja.ts` | Wrapper around `cierres.store` + the pure function `calcularCierre(ventas, gastosFijos, gastosImprevistos)`. |
| `src/utils/cierre.ts` | Tiny pure helpers: `calcularCierre(...)` (snapshot math) and `formatearDiferencia(monto)` ("Sobrante $X" / "Faltante $X"). |
| `src/components/business/ProductoCard.vue` | The clickable card in the POS grid: nombre, precio, optional thumbnail, optional "show cost" tooltip. |
| `src/components/business/ProductoGrid.vue` | Visual grid container (Vuetify `v-row` + `v-col`); responsive 2/3/4 columns per brief §6.1. |
| `src/components/business/CarritoPanel.vue` | Sidebar/bottom-sheet panel showing cart items, quantities, total. |
| `src/components/business/VentaItem.vue` | One line in the cart: nombre × cantidad × precio_unitario = subtotal + quantity controls + remove button. |
| `src/components/business/RegistrarVentaDialog.vue` | Confirmation dialog before committing the sale; shows total + metodo_pago selector. |
| `src/components/business/GastoImprevistoForm.vue` | Form for adding an unexpected expense (monto + motivo + optional categoria). |
| `src/components/business/GastoImprevistoListItem.vue` | Row in the imprevistos list (monto + motivo + delete). |
| `src/components/business/CierreResumenCard.vue` | Read-only card: total ventas, total gastos (fijos + imprevistos), utilidad bruta, diferencia (if efectivo entered). |
| `src/views/PosView.vue` | The main POS view: event picker (if no en_curso) OR product grid + cart panel. |
| `src/views/PosCierreView.vue` | The cierre view: shows the resumen card + metodo_pago breakdown + "Registrar cierre" button. |
| `src/router/routes.ts` *(modified)* | Append 2 lazy routes: `/pos`, `/pos/cierre/:eventoId`. |
| `src/router/routes.spec.ts` *(modified)* | Add 2 new route entries. |
| `src/services/productos.service.spec.ts` | Service test (chainable Supabase mock). |
| `src/services/ventas.service.spec.ts` | Service test + `registrarVenta` (insert venta, then insert N venta_items in one call shape). |
| `src/services/gastosImprevistos.service.spec.ts` | Service test. |
| `src/services/cierres.service.spec.ts` | Service test (insert cierre is immutable — no update method). |
| `src/stores/productos.store.spec.ts` | Pinia store test. |
| `src/stores/ventas.store.spec.ts` | Pinia store test (carrito state machine + registrarVenta). |
| `src/stores/gastosImprevistos.store.spec.ts` | Pinia store test. |
| `src/stores/cierres.store.spec.ts` | Pinia store test. |
| `src/composables/useVentas.spec.ts` | Pure cart math (subtotal, total, line aggregation). |
| `src/composables/useCierreCaja.spec.ts` | Pure cierre math (totals + diferencia, edge cases). |
| `src/utils/cierre.spec.ts` | Pure helper tests. |
| `src/components/business/ProductoCard.spec.ts` | Card renders name + price; emits `agregar`. |
| `src/components/business/ProductoGrid.spec.ts` | Grid renders N cards; responsive cols. |
| `src/components/business/CarritoPanel.spec.ts` | Panel renders items + total; emits `registrar-venta`. |
| `src/components/business/VentaItem.spec.ts` | Line shows subtotal; quantity buttons emit `update`. |
| `src/components/business/RegistrarVentaDialog.spec.ts` | Dialog shows total; metodo_pago selector; emits `confirmar` with input. |
| `src/components/business/GastoImprevistoForm.spec.ts` | Form validates monto > 0 and motivo non-empty. |
| `src/components/business/GastoImprevistoListItem.spec.ts` | Row renders; emits `eliminar`. |
| `src/components/business/CierreResumenCard.spec.ts` | Card renders the 4 sections (ventas, gastos, utilidad, diferencia). |
| `src/views/PosView.spec.ts` | View test (event picker state vs grid state). |
| `src/views/PosCierreView.spec.ts` | View test. |

### Modified files

- `src/router/routes.ts` — append 2 lazy routes.
- `src/types/database.types.ts` — add 5 new tables to the hand-rolled interface.
- `src/types/index.ts` — re-export pos types.
- `supabase/dev_bypass_rls.sql` — extend with `grant select, insert, update, delete on productos, ventas, venta_items, gastos_imprevistos, cierres_caja to anon`.
- `tests/setup.ts` — no changes needed (chainable mock is generic, 2 new services just consume it).
- `openspec/config.yaml` — no changes needed (already aligned since catalog PR1).
- `src/router/routes.spec.ts` — add 2 new route entries.

### Untouched foundation + catalog + events files (proof of additive change)

`App.vue`, `main.ts`, `App.spec.ts`, `utils/env.ts`, `plugins/vuetify.ts`,
`plugins/services.ts`, `services/supabase.client.ts`, `localforage.client.ts`,
`storage.interface.ts`, `storage.service.ts`, `composables/useAuth.ts`,
`useOnlineStatus.ts`, `usePwaUpdate.ts`, `stores/app.store.ts`,
`views/HomeView.vue`, all of `src/services/{ingredients,recipes,events,plans,gastosFijos}.service.ts`,
all of `src/stores/{ingredients,recipes,events,plans,gastosFijos}.store.ts`,
all of `src/composables/{useCalculoReceta,useEvents,useGastosFijos,useIngredients,usePlans,useProyeccionCostos,useRecipes}.ts`,
all of `src/types/{catalog,events}.types.ts` (unchanged), all of
`src/utils/{moneda,format,estado}.ts` (unchanged), all catalog and events
migrations (unchanged).

---

## Data Model (5 new Supabase tables)

All five tables use the catalog + events convention:
`id uuid primary key default gen_random_uuid()`,
`created_at timestamptz not null default now()`.
Immutable tables (ventas, venta_items, cierres_caja) have NO `updated_at`
column — the append-only pattern is enforced at the SQL level.

### `public.productos`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `receta_id` | `uuid` | NOT NULL, FK → `recetas(id) ON DELETE RESTRICT` | RESTRICT: cannot delete a receta that has a producto for sale. |
| `precio_venta` | `numeric(10,2)` | NOT NULL, CHECK `precio_venta > 0` | USD, 2 decimals. The source of truth for sale price. |
| `disponible` | `boolean` | NOT NULL, default `true` | "Para venta" toggle — soft-hide without delete. |
| `orden` | `integer` | NOT NULL, default `0` | Display order in the grid (lowest first). |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | Trigger on UPDATE. |

**Foreign keys**:
- `productos_receta_id_fkey`: `receta_id` → `recetas.id` (RESTRICT on delete).

**Indexes**:
- `idx_productos_receta_id` on `(receta_id)` — reverse lookup "what productos use this receta?".
- `idx_productos_disponible_orden` on `(disponible, orden)` — hot path for the POS grid query (`WHERE disponible = true ORDER BY orden`).

**Unique constraint**:
- `uq_productos_receta` UNIQUE on `(receta_id)` — one producto per receta (clean separation: a recipe is either for-sale or not, never two parallel prices).

**Why a separate table (not a `precio_venta` column on `recetas`)**:
- The catalog spec locked `recetas` as "the cookable thing" — cost calculation, ingredient lines, rendimiento. Adding a sale price conflates "what it costs to make" with "what we sell it for". Margin analysis (future slice) needs both numbers, not one overwriting the other.
- A receta may not be for-sale (e.g., a test batch, a component used inside other recetas). The `disponible` flag makes the "para venta" concept explicit.
- The unique constraint enforces "one price per recipe" — if the user wants tiered pricing, a future slice can add `productos_variantes` (out of scope v1).

### `public.ventas`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE RESTRICT` | RESTRICT: cannot delete an evento with ventas. The brief is append-only by design (analytics consume history). |
| `fecha` | `timestamptz` | NOT NULL, `default now()` | When the sale happened (server timestamp; idempotent on retries). |
| `total` | `numeric(10,2)` | NOT NULL, CHECK `total >= 0` | USD, 2 decimals. Snapshot at sale time (denormalized for fast cierres). |
| `metodo_pago` | `text` | NOT NULL, CHECK `metodo_pago in ('efectivo','transferencia','tarjeta','mixto')` | Locked 4-value enum (KISS). |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**No `updated_at`**: ventas are immutable. If a sale is wrong, the convention is "register a corrective sale" (negative-quantity line, or a manual `cierre_caja` adjustment). This matches the brief's "append-only ledger" mental model.

**Foreign keys**:
- `ventas_evento_id_fkey`: `evento_id` → `eventos.id` (RESTRICT on delete).

**Indexes**:
- `idx_ventas_evento_id` on `(evento_id)` — hot path for cierres.
- `idx_ventas_fecha` on `(fecha desc)` — "sales today" queries.
- `idx_ventas_metodo_pago` on `(metodo_pago)` — payment breakdown in cierres.

### `public.venta_items`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `venta_id` | `uuid` | NOT NULL, FK → `ventas(id) ON DELETE CASCADE` | CASCADE: deleting a venta removes its items. |
| `producto_id` | `uuid` | NOT NULL, FK → `productos(id) ON DELETE RESTRICT` | RESTRICT: cannot delete a producto with sale history. |
| `cantidad` | `numeric(10,4)` | NOT NULL, CHECK `cantidad > 0` | Units sold. Decimal allows "0.5 kg of fudge" if needed. |
| `precio_unitario` | `numeric(10,2)` | NOT NULL, CHECK `precio_unitario >= 0` | USD. **Snapshot** at sale time — if `producto.precio_venta` changes later, historical sales keep their original price. |
| `subtotal` | `numeric(10,2)` | NOT NULL, CHECK `subtotal >= 0` | USD. **Computed** at insert time = `cantidad × precio_unitario` (rounded to 2 decimals via `redondearCentavos`). |

**Why snapshot `precio_unitario` and `subtotal`**: analytics + cierres must reflect what actually happened at the moment of sale, not the current menu price. This matches the catalog's "no denormalized `costo_total` on recetas" inversion: where catalogs **derive** on read to stay fresh, ventas **snapshot** at write to stay honest.

**Foreign keys**:
- `venta_items_venta_id_fkey`: `venta_id` → `ventas.id` (CASCADE on delete).
- `venta_items_producto_id_fkey`: `producto_id` → `productos.id` (RESTRICT on delete).

**Indexes**:
- `idx_venta_items_venta_id` on `(venta_id)` — load all items for a venta.
- `idx_venta_items_producto_id` on `(producto_id)` — reverse lookup "how many X were sold?" (analytics).

### `public.gastos_imprevistos`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE CASCADE` | CASCADE: deleting an evento removes its imprevistos. |
| `monto` | `numeric(10,2)` | NOT NULL, CHECK `monto > 0` | USD, 2 decimals. Strictly positive (unplanned costs, never refunds). |
| `motivo` | `text` | NOT NULL, CHECK `length(motivo) > 0 AND length(motivo) <= 500` | Free text — what was it? |
| `categoria` | `text` | NULL, CHECK `categoria in ('insumos_extra','transporte','reparacion','propina','otro')` | Optional 5-value enum (KISS — overlaps with `gastos_fijos` categories but allows free text). |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Foreign keys**:
- `gastos_imprevistos_evento_id_fkey`: `evento_id` → `eventos.id` (CASCADE on delete).

**Indexes**:
- `idx_gastos_imprevistos_evento_id` on `(evento_id)` — hot path for cierres.

**Why a separate table from `gastos_fijos`**:
- `gastos_fijos` are PLANNED (brief §3 item 11). They're entered during pre-evento for cost projection.
- `gastos_imprevistos` are UNPLANNED (brief §3 item 17). They're entered during the event when something unexpected happens ("we ran out of cups", "the generator broke").
- Mixing them would corrupt the `calcularProyeccion` math (events expects `gastos_fijos` to be a known input). Keeping them separate preserves the cost-projection projection invariant.

**Frozen on `cerrado`**: same pattern as `gastos_fijos`. The POS view disables the "Agregar gasto imprevisto" button when `estado === 'cerrado'`. The store action `crearGastoImprevisto` reads `eventsStore.eventoActual.estado` and returns `EVENTO_CERRADO` if frozen.

### `public.cierres_caja`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, UNIQUE, FK → `eventos(id) ON DELETE CASCADE` | UNIQUE: one cierre per evento. CASCADE: deleting an evento removes its cierre (defensive; the evento is usually `cerrado` before this happens). |
| `fecha_cierre` | `timestamptz` | NOT NULL, `default now()` | When the cierre was registered. |
| `total_ventas` | `numeric(10,2)` | NOT NULL, CHECK `total_ventas >= 0` | USD. **Snapshot** at cierre time = Σ(ventas.total WHERE evento_id = X). |
| `total_gastos_fijos` | `numeric(10,2)` | NOT NULL, CHECK `total_gastos_fijos >= 0` | USD. **Snapshot** = Σ(gastos_fijos.monto). |
| `total_gastos_imprevistos` | `numeric(10,2)` | NOT NULL, CHECK `total_gastos_imprevistos >= 0` | USD. **Snapshot** = Σ(gastos_imprevistos.monto). |
| `utilidad_bruta` | `numeric(10,2)` | NOT NULL | USD. **Snapshot** = `total_ventas - total_gastos_fijos - total_gastos_imprevistos`. |
| `efectivo_esperado` | `numeric(10,2)` | NULL | USD. User-entered expected cash (the "drawer count" before the event). |
| `efectivo_real` | `numeric(10,2)` | NULL | USD. User-entered actual cash on hand. |
| `diferencia` | `numeric(10,2)` | NULL | USD. **Snapshot** = `efectivo_real - efectivo_esperado`. NULL if user skipped the cash count. |
| `notas` | `text` | NULL | Optional free text — "el cliente X pagó con cheque". |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**No `updated_at`**: cierres are immutable. Once a day is closed, it's closed. Corrections live in a future "audit log" table (out of scope v1).

**Foreign keys**:
- `cierres_caja_evento_id_fkey`: `evento_id` → `eventos.id` (CASCADE on delete).

**Indexes**:
- `idx_cierres_caja_evento_id` UNIQUE on `(evento_id)` (the FK constraint enforces uniqueness; an explicit index speeds the lookup).

**Why `utilidad_bruta` is a snapshot, not a `computed`**: the brief's "Cierre de caja" is a frozen historical record. If a `venta` is added after the cierre (shouldn't happen — the evento is `cerrado`), the cierre stays accurate to its day. This is the explicit trade-off: cierres trade freshness for honesty.

**What happens if the user opens the cierre view but no ventas exist?** The view still renders; all totals = 0; utilidad_bruta = negative (sum of gastos). The view should warn: "No hay ventas registradas — ¿estás seguro de cerrar?" with a Cancelar/Confirmar dialog.

### RLS policies (same shape as catalog + events)

```sql
alter table public.productos          enable row level security;
alter table public.ventas             enable row level security;
alter table public.venta_items        enable row level security;
alter table public.gastos_imprevistos enable row level security;
alter table public.cierres_caja       enable row level security;

create policy "productos_select_authenticated"            on public.productos          for select to authenticated using (true);
create policy "productos_write_authenticated"             on public.productos          for all    to authenticated using (true) with check (true);
create policy "ventas_select_authenticated"               on public.ventas             for select to authenticated using (true);
create policy "ventas_write_authenticated"                on public.ventas             for all    to authenticated using (true) with check (true);
create policy "venta_items_select_authenticated"          on public.venta_items        for select to authenticated using (true);
create policy "venta_items_write_authenticated"           on public.venta_items        for all    to authenticated using (true) with check (true);
create policy "gastos_imprevistos_select_authenticated"   on public.gastos_imprevistos for select to authenticated using (true);
create policy "gastos_imprevistos_write_authenticated"    on public.gastos_imprevistos for all    to authenticated using (true) with check (true);
create policy "cierres_caja_select_authenticated"         on public.cierres_caja       for select to authenticated using (true);
create policy "cierres_caja_write_authenticated"          on public.cierres_caja       for all    to authenticated using (true) with check (true);
```

**Anon role is NOT granted access directly** — `dev_bypass_rls.sql` extends its existing grant block to include the 5 new tables. The auth-flow slice removes it.

### Migration ordering and atomicity

Single file `supabase/migrations/20260619000000_pos_inicial.sql` containing:
1. (a) `productos` table + indexes + RLS + updated_at trigger, (b) `ventas`
   table + indexes + RLS, (c) `venta_items` table + indexes + RLS,
   (d) `gastos_imprevistos` table + indexes + RLS, (e) `cierres_caja`
   table + indexes + RLS.

**No new migration for `dev_bypass_rls.sql`** — the file is patched in the
POS PR1 (a separate small SQL edit). The catalog dev bypass + events
extension + pos extension is the same artifact; the POS PR1 extends it.

**Why single migration file**: POS is one logical change. Splitting it
across migrations is premature; the `analytics` slice (Phase 5) can add a
new migration later if it needs to alter the schema (e.g., add a
`pronostico_ventas` table for forecasting).

---

## The Producto vs Receta Decision (locked)

### Why a separate `productos` table (not `recetas.precio_venta`)

The catalog spec explicitly designed `recetas` as the **production** entity:
- It owns the ingredient lines (`receta_ingredientes`).
- It owns the cost math (`calcularCostoReceta`).
- It owns `rendimiento_unidades` (yield).

Adding `precio_venta` to `recetas` would conflate three concerns:
1. **Cost** (what it takes to make).
2. **Sale price** (what we charge).
3. **Availability** (whether it's on the menu).

The brief asks for all three, but they belong to different mental models.
A recipe exists whether or not it's sold (e.g., a test batch, a sub-recipe).
A sale price is a *commercial* decision that can change without touching
the recipe. A menu toggle ("para venta") is a *publishing* decision.

### The `productos` table: the commercial layer

`productos` is the **commercial wrapper** around `recetas`:
- `receta_id` (FK) — references the underlying recipe.
- `precio_venta` (USD) — the user-facing price.
- `disponible` (bool) — the "para venta" toggle (soft-hide without delete).
- `orden` (int) — display order in the POS grid.
- UNIQUE on `(receta_id)` — one price per recipe.

### UX consequences

- **Catalog view**: shows `recetas` (production domain).
- **POS view**: shows `productos` WHERE `disponible = true` (sales domain).
- **Recipe detail view (catalog)**: shows a small "Este producto se vende a $X.XX" badge IF a `producto` row exists for that `receta_id` (cross-domain hint).
- **Creating a producto**: from a recipe detail page, a "Vender esta receta" button opens a dialog asking for `precio_venta` and sets `disponible = true`. (Implementation: a new `productos.service.crear` + a small "Vender esta receta" button in `RecetaDetalleView.vue` — a 1-line button + a dialog.)

### Future extension path (out of scope v1)

- **Variants** (small/medium/large at different prices): `productos_variantes (producto_id, nombre, precio_venta, ...)`. NOT v1.
- **Stock tracking** (`unidades_disponibles`, `unidades_vendidas` derived): a future slice adds the stock column to `productos` (or a separate `inventario_evento` table). NOT v1.

---

## Sale Flow (brief item 15)

### The happy path

```
User opens /pos
       │
       ▼
PosView checks eventsStore.eventoEnCurso
       │
       ├─── null (no evento in 'en_curso') ──► Show "Activar evento" picker
       │                                            │
       │                                            ├── select existing 'planificacion' evento
       │                                            └── cambiarEstado → 'en_curso'
       │                                            │
       │                                            ▼
       │                                       Show POS view
       │
       └─── Evento en_curso exists ──► Show POS view (grid + cart)
                                            │
                                            ▼
       User clicks ProductoCard → useVentas.agregarAlCarrito(productoId)
                                            │
                                            ▼
       CarritoPanel re-renders (computed total)
                                            │
                                            ▼
       User clicks "Registrar venta"
                                            │
                                            ▼
       RegistrarVentaDialog opens
       (shows total + metodo_pago selector)
                                            │
                                            ▼
       User confirms
                                            │
                                            ▼
       useVentas.registrarVenta(metodoPago)
       ├── ventas.service.crear({ evento_id, total, metodo_pago })
       └── for each cart item: venta_items.service.crear({ venta_id, producto_id, cantidad, precio_unitario, subtotal })
                                            │
                                            ▼
       Carrito cleared, success toast "🎉 Venta registrada: $X.XX"
       (and online-status chip if relevant)
```

### Atomicity concern (events lesson applied)

The events slice used `reemplazarTodos` (delete-then-insert) for the plan
grid and accepted the risk of partial failure. **POS does NOT use that
pattern.** Ventas are append-only, and a failed mid-transaction venta
would corrupt the cart state. The strategy:

1. `ventas.service.registrarVenta(ventaConItems)` is a single Supabase RPC
   call in a future slice (out of scope v1). For v1, the service does:
   ```ts
   async registrarVenta(input: VentaConItems): Promise<{ data, error }> {
     const { data: venta, error: ventaError } = await crearVenta(...)
     if (ventaError || !venta) return { data: null, error: ventaError }
     const items = await Promise.all(
       input.items.map((it) => crearVentaItem({ venta_id: venta.id, ...it }))
     )
     const firstError = items.find((r) => r.error)?.error
     if (firstError) return { data: null, error: firstError }
     return { data: { ...venta, items }, error: null }
   }
   ```
2. On failure: the store keeps the cart intact and shows the error toast.
   The user can retry without losing data.
3. The brief item 5% merma is NOT applied here — that's a catalog
   `redondearParaMermas` concern, not a sales concern. The sale records
   what was charged.

### Stock decrement (deferred)

The brief says "decrements stock?" — but stock is a known catalog gap
(REQ-CATALOG §Gaps #2, no `stock_actual` column on `materias_primas`).
POS v1 **does NOT decrement anything**. The venta is recorded; the user
trusts their own counts. Stock-aware validation is a future slice.

### What updates after a sale

- `events.store` — does NOT mutate (cross-store WRITE is forbidden). The
  `evento` row is unchanged.
- `ventas.store.ventas` — appends the new venta to the in-memory list
  (optimistic; Supabase confirmed it).
- `ventas.store.carrito` — cleared.
- The POS view re-renders (cart total = 0, the new venta appears in the
  optional "Ventas de hoy" mini-list at the bottom of the panel).

### The "Ventas de hoy" mini-list

POS shows a small "Ventas registradas hoy" section at the bottom of
`CarritoPanel` (collapsed by default on mobile, expanded on desktop).
This is read-only history within the current session — not a full
historical view (analytics slice owns that). The list is the in-memory
`ventas.store.ventas` filtered to `evento_id === eventoActual.id`,
sorted by `fecha desc`.

---

## Daily Close (brief item 16)

### When does the user close?

The brief's "cierre de caja diario" is ambiguous — is it end of day or
end of evento? The single-day v1 (events decision) collapses these into
the same moment: when the evento ends, the user closes the caja. The
`cierres_caja` row is the snapshot; the evento's `cambiarEstado('cerrado')`
follows it (or happens in the same flow).

### The close flow

```
User on /pos/cierre/:eventoId
       │
       ▼
useCierreCaja loads:
├── ventas del evento (from ventas.store)
├── gastos fijos del evento (from events.store)
├── gastos imprevistos del evento (from gastosImprevistos.store)
└── existing cierre (from cierres.store) — if exists, show read-only
       │
       ▼
useCierreCaja.calcularCierre() returns:
{
  totalVentas,
  totalGastosFijos,
  totalGastosImprevistos,
  utilidadBruta = totalVentas - totalGastosFijos - totalGastosImprevistos,
  efectivoEsperado,  // user-editable
  efectivoReal,      // user-editable
  diferencia,        // computed when both entered
}
       │
       ▼
CierreResumenCard shows 4 sections:
1. Ventas (count + total + per-metodo_pago breakdown)
2. Gastos (fijos + imprevistos)
3. Utilidad bruta
4. Diferencia (if user entered cash count; yellow v-alert if != 0)
       │
       ▼
User clicks "Registrar cierre"
       │
       ▼
useCierreCaja.registrarCierre(input)
├── cierres.service.crear({ evento_id, total_ventas, total_gastos_fijos, total_gastos_imprevistos, utilidad_bruta, efectivo_esperado, efectivo_real, diferencia, notas })
└── events.service.cambiarEstado(eventoId, 'en_curso', 'cerrado')
       │
       ▼
Success toast, redirect to /eventos/:id (read-only)
```

### Why `efectivo_esperado` + `efectivo_real` + `diferencia` are NULLABLE

Not every feriante counts the drawer. The diferencia is the **discipline**
field — "did we end the day with the cash we expected to have?". A NULL
diferencia means "I didn't count; trust the utilidad_bruta number".
The view makes the cash-count section optional with a clear checkbox:
"Conté la caja al final del día".

### `calcularCierre` pure function

Lives in `src/utils/cierre.ts`, exported alongside `useCierreCaja.ts`:

```ts
export interface CierreInput {
  ventas: Venta[]
  gastosFijos: GastoFijo[]
  gastosImprevistos: GastoImprevisto[]
  efectivoEsperado: number | null
  efectivoReal: number | null
}

export interface CierreResumen {
  totalVentas: number
  totalGastosFijos: number
  totalGastosImprevistos: number
  utilidadBruta: number
  efectivoEsperado: number | null
  efectivoReal: number | null
  diferencia: number | null
  ventasPorMetodoPago: Record<MetodoPago, number>
  cantidadVentas: number
}

export function calcularCierre(input: CierreInput): CierreResumen {
  const totalVentas = redondearCentavos(input.ventas.reduce((acc, v) => acc + v.total, 0))
  const totalGastosFijos = redondearCentavos(input.gastosFijos.reduce((acc, g) => acc + g.monto, 0))
  const totalGastosImprevistos = redondearCentavos(input.gastosImprevistos.reduce((acc, g) => acc + g.monto, 0))
  const utilidadBruta = redondearCentavos(totalVentas - totalGastosFijos - totalGastosImprevistos)
  const diferencia = (input.efectivoEsperado !== null && input.efectivoReal !== null)
    ? redondearCentavos(input.efectivoReal - input.efectivoEsperado)
    : null
  const ventasPorMetodoPago: Record<MetodoPago, number> = {
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    mixto: 0,
  }
  for (const v of input.ventas) {
    ventasPorMetodoPago[v.metodo_pago] = redondearCentavos(ventasPorMetodoPago[v.metodo_pago] + v.total)
  }
  return {
    totalVentas,
    totalGastosFijos,
    totalGastosImprevistos,
    utilidadBruta,
    efectivoEsperado: input.efectivoEsperado,
    efectivoReal: input.efectivoReal,
    diferencia,
    ventasPorMetodoPago,
    cantidadVentas: input.ventas.length,
  }
}
```

Unit tests cover: empty ventas, empty gastos, mixed metodo_pago, diferencia
positive/negative/zero, diferencia NULL when either input is NULL, and the
float-drift round-up case (mirrors events' `calcularProyeccion` tests).

### State machine integration

`useCierreCaja.registrarCierre` calls `transicionEstadoValida('en_curso',
'cerrado')` BEFORE inserting the cierre row. If the evento is already
`cerrado`, the action returns `EVENTO_YA_CERRADO`. The two operations
(insert cierre + cambiarEstado) are sequential, NOT transactional:
- If the cierre insert succeeds and the state change fails: the user sees
  the error and can retry the state change manually (the cierre row stays;
  `cierres_caja.evento_id` UNIQUE prevents a duplicate).
- If the cierre insert fails: nothing is mutated; the user retries.

The view shows a confirmation dialog: "Al cerrar la caja, el evento
queda en estado 'Cerrado' y no se pueden registrar más ventas."
("Cancelar" / "Cerrar caja y evento").

---

## Gastos Imprevistos (brief item 17)

### UX: an "Imprevistos" tab inside the POS view

The POS view has a small "Gastos imprevistos" collapsible section
(or a tab on mobile, per brief §6.1). The user can add an imprevisto at
any moment during the event without leaving the POS grid.

```
+---------------------------------------------------+
| [Gastos imprevistos de esta feria]            [+]  |
+---------------------------------------------------+
| $50 — "Compramos más vasos" — insumos_extra   [x]  |
| $20 — "Taxi al local" — transporte           [x]  |
|                                                   |
| Total: $70                                        |
+---------------------------------------------------+
```

### Validation rules

- `monto > 0` (no negative expenses; no zero).
- `motivo` non-empty, max 500 chars (DB CHECK).
- `categoria` optional; if set, must be in the 5-value enum.

### Form pattern

`GastoImprevistoForm.vue` mirrors `GastoFijoForm.vue` (events slice).
Same `valoresIniciales` prop, same `submit` emit. The only differences:
- The categoria enum is different (5 vs 6 values, with `propina` and
  `reparacion` as POS-only concepts).
- The form lives inside the POS view, not on `EventoDetalleView`.

### Frozen on `cerrado`

Same pattern as `gastos_fijos`. The store action
`gastosImprevistos.store.crear` reads `eventsStore.eventoActual.estado`
and returns `EVENTO_CERRADO` if frozen. The POS view hides the "Agregar"
button when `estado === 'cerrado'`.

---

## POS UX (brief items 14, 6.1, 3.1)

### The grid (brief item 14, §6.1)

A Vuetify `v-row` + `v-col` grid with `cols="12 sm="6" md="4" lg="3"`:

- **Mobile (xs)**: 2 columns. Brief §6.1 mandate. Cards stack vertically,
  large touch targets (≥ 64px tall).
- **Tablet (md)**: 3-4 columns. Split view: grid (left) + cart (right).
- **Desktop (lg/xl)**: 4-6 columns. Same split view, wider cart.

Each card is a `ProductoCard.vue`:
- Top: optional thumbnail (future: upload in catalog slice v2; v1 shows
  the first letter of the recipe name as a placeholder).
- Middle: recipe name (bold) + price (large, USD).
- Bottom: optional "Costo: $X.XX" tooltip on hover (desktop) / long-press (mobile).
- Whole card is clickable → emits `agregar(productoId)`.

The grid is sorted by `producto.orden ASC, producto.created_at ASC`.
Empty state: "No hay productos para la venta. Andá a Catálogo → Recetas
→ [receta] → 'Vender esta receta' para agregar uno." (cross-slice hint).

### The cart (brief item 15, §6.1)

`CarritoPanel.vue` is a sidebar (desktop) or bottom-sheet (mobile).
Contents:
- Top: "Carrito" title + "Vaciar" button.
- Middle: scrollable list of `VentaItem.vue` rows (each shows name ×
  quantity × price = subtotal, with `+`/`-` buttons and a delete button).
- Bottom: large total (`$X.XX`) + "Registrar venta" primary button.

Empty state: "El carrito está vacío. Tocá un producto para empezar."

### Optimistic UI (brief §3.1)

Every interaction is instant:
- Click `ProductoCard` → cart row appears (no network call).
- Click `+` on a cart row → quantity increments instantly.
- Click "Registrar venta" → cart clears immediately + green toast
  ("🎉 Venta registrada: $X.XX"), then Supabase call in background.
- If Supabase fails: red toast + cart re-populated with the unsaved items.

This is the **first slice where optimistic UI matters** (catalog + events
are CRUD with explicit save buttons). The cart lives in `ventas.store`;
the `registrarVenta` action does optimistic update → Supabase call →
revert-on-failure.

### Online indicator (foundation §6.1, offline-sync slice)

A small chip in the POS header: "En línea" (green) or "Sin conexión"
(yellow). In v1, the chip is **informational only** — sales are NOT
blocked when offline (the offline-sync slice will add the WAL + queue
drain). The chip exists so the user knows "your ventas will sync later".

This matches foundation's `useOnlineStatus()` integration point. The
component reads `useOnlineStatus().online` and renders.

### No login (auth stub)

`useAuth()` throws on call. POS v1 does NOT import or call it. The
single-user assumption holds: there's no `user_id` on ventas; the
`auth-flow` slice will add it later.

---

## State Machine Integration (locked)

POS is the slice that **drives** the state machine forward
(`en_curso → cerrado`) for the first time. Events locked the machine;
POS consumes it.

### Guards

| Action | Reads | Returns |
|--------|-------|---------|
| `ventas.store.registrarVenta` | `eventsStore.eventoActual.estado` | `EVENTO_CERRADO` if `cerrado` |
| `gastosImprevistos.store.crear` | `eventsStore.eventoActual.estado` | `EVENTO_CERRADO` if `cerrado` |
| `cierres.store.registrarCierre` | `transicionEstadoValida('en_curso', 'cerrado')` | `TRANSICION_INVALIDA` if evento not in `en_curso` |

All three guards use `estadoEsEditable` or `transicionEstadoValida` from
`src/utils/estado.ts` (the single source of truth, events precedent).

### Forward-only

A `cerrado` evento can NEVER accept new ventas. The POS view reads
`eventsStore.eventoActual.estado` and shows a friendly "Este evento
está cerrado. Las ventas están en modo lectura" message instead of the
grid.

### What happens when no evento is `en_curso`?

The user lands on `/pos`. The view checks
`eventsStore.eventoEnCurso` (a `computed` that returns the first evento
with `estado === 'en_curso'` or null). If null, the view shows:

```
+----------------------------------------------------+
| No hay un evento en curso                          |
| Empezá uno para usar la caja registradora:         |
|                                                    |
| [Seleccionar evento en planificación ▾] [Activar]  |
|                                                    |
| O creá un evento nuevo:                            |
| [+ Crear evento]                                   |
+----------------------------------------------------+
```

The "Activar" button calls `events.service.cambiarEstado(eventoId,
'planificacion', 'en_curso')` then re-renders the grid.

---

## Type Generation

### Decision: hand-rolled `Database` extension, same as catalog + events

`src/types/database.types.ts` gains 5 new entries under
`Database['public']['Tables']`:
- `productos` — `id`, `receta_id`, `precio_venta`, `disponible`, `orden`,
  `created_at`, `updated_at`
- `ventas` — `id`, `evento_id`, `fecha`, `total`, `metodo_pago`, `created_at`
- `venta_items` — `id`, `venta_id`, `producto_id`, `cantidad`,
  `precio_unitario`, `subtotal`, `created_at`
- `gastos_imprevistos` — `id`, `evento_id`, `monto`, `motivo`, `categoria`,
  `created_at`
- `cierres_caja` — `id`, `evento_id`, `fecha_cierre`, `total_ventas`,
  `total_gastos_fijos`, `total_gastos_imprevistos`, `utilidad_bruta`,
  `efectivo_esperado`, `efectivo_real`, `diferencia`, `notas`, `created_at`

Each table gets `Row`, `Insert`, `Update` (partial of Insert), and
`Relationships` (foreign keys). The hand-rolled pattern matches the
catalog's 3-table and events' 3-table shapes.

`pnpm typecheck` MUST pass. `pnpm test` covers at least one
`supabase.from('ventas')` integration test to catch column-name
mismatches at runtime.

### `src/types/pos.types.ts` (new)

Spanish domain types that mirror the SQL columns 1:1 (same convention as
`catalog.types.ts` and `events.types.ts`):

```ts
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
export type CategoriaImprevisto = 'insumos_extra' | 'transporte' | 'reparacion' | 'propina' | 'otro'

export interface Producto {
  id: string
  receta_id: string
  precio_venta: number
  disponible: boolean
  orden: number
  created_at: string
  updated_at: string
}
export type ProductoInput = Omit<Producto, 'id' | 'created_at' | 'updated_at'>

export interface Venta {
  id: string
  evento_id: string
  fecha: string                  // ISO timestamptz from postgres
  total: number
  metodo_pago: MetodoPago
  created_at: string
}
export type VentaInput = Omit<Venta, 'id' | 'fecha' | 'created_at'>

export interface VentaItem {
  id: string
  venta_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  created_at: string
}
export type VentaItemInput = Omit<VentaItem, 'id' | 'venta_id' | 'created_at'>

// Convenience: a venta with its items pre-loaded
export interface VentaConItems extends Venta {
  items: VentaItem[]
}

export interface GastoImprevisto {
  id: string
  evento_id: string
  monto: number
  motivo: string
  categoria: CategoriaImprevisto | null
  created_at: string
}
export type GastoImprevistoInput = Omit<GastoImprevisto, 'id' | 'created_at'>

export interface CierreCaja {
  id: string
  evento_id: string
  fecha_cierre: string
  total_ventas: number
  total_gastos_fijos: number
  total_gastos_imprevistos: number
  utilidad_bruta: number
  efectivo_esperado: number | null
  efectivo_real: number | null
  diferencia: number | null
  notas: string | null
  created_at: string
}
export type CierreCajaInput = Omit<CierreCaja, 'id' | 'fecha_cierre' | 'created_at'>

// Pure-function input/output (NOT a SQL row)
export interface LineaCarrito {
  producto_id: string
  nombre: string
  precio_unitario: number
  cantidad: number
  subtotal: number
}

export interface ResumenCarrito {
  lineas: LineaCarrito[]
  total: number
  cantidadItems: number
}

export interface CierreResumen {
  totalVentas: number
  totalGastosFijos: number
  totalGastosImprevistos: number
  utilidadBruta: number
  efectivoEsperado: number | null
  efectivoReal: number | null
  diferencia: number | null
  ventasPorMetodoPago: Record<MetodoPago, number>
  cantidadVentas: number
}
```

`ServiceError` is reused from `catalog.types.ts` (already exported via
`src/types/index.ts`).

---

## Routing (2 new lazy routes)

```ts
// src/router/routes.ts (additive)
{
  path: '/pos',
  name: 'pos',
  component: () => import('@/views/PosView.vue'),
},
{
  path: '/pos/cierre/:eventoId',
  name: 'pos-cierre',
  component: () => import('@/views/PosCierreView.vue'),
  props: true,
},
```

`src/router/routes.spec.ts` is extended with 2 new entries (one
`expect` per route) — same pattern as the catalog PR4 and events PR4
`routes.spec.ts`.

**Why no `/pos/carrito`**: the cart is a panel inside `/pos`, not a
separate route. Splitting it would force a route transition mid-flow
(bad UX) and lose the cart state (which lives in `ventas.store`,
survives routes). The brief item 15 is "carrito y registro de ventas" —
a single page with cart + register is the right decomposition.

---

## Component Structure (new files)

### Components (8)

| File | Role | Spec |
|------|------|------|
| `ProductoCard.vue` | Clickable card: name + price + optional cost tooltip. Props: `producto: Producto`, `receta?: RecetaConIngredientes` (for cost tooltip). Emits `agregar`. | yes |
| `ProductoGrid.vue` | Vuetify grid container. Props: `productos: Producto[]`, `recetas: RecetaConIngredientes[]`. Emits `agregar`. Responsive cols. | yes |
| `CarritoPanel.vue` | Sidebar/bottom-sheet. Props: `carrito: ResumenCarrito`. Emits `registrar-venta`, `vaciar`, `update-cantidad`, `eliminar-linea`. Shows "Ventas registradas hoy" mini-list. | yes |
| `VentaItem.vue` | One cart line. Props: `linea: LineaCarrito`. Emits `update-cantidad`, `eliminar`. Shows quantity controls + subtotal. | yes |
| `RegistrarVentaDialog.vue` | Confirmation dialog. Props: `total: number`, `modelValue: boolean`. Emits `update:modelValue`, `confirmar` with `metodoPago`. Shows metodo_pago select. | yes |
| `GastoImprevistoForm.vue` | Form for an imprevisto. Props: `valoresIniciales: GastoImprevistoInput`. Emits `submit`. | yes |
| `GastoImprevistoListItem.vue` | Row in the imprevistos list. Props: `gasto: GastoImprevisto`. Emits `eliminar`. | yes (with view spec) |
| `CierreResumenCard.vue` | Read-only card. Props: `cierre: CierreResumen`. Renders 4 sections + yellow `v-alert` for diferencia != 0. | yes |

### Views (2)

| File | Role | Spec |
|------|------|------|
| `PosView.vue` | Main POS page. Checks `eventsStore.eventoEnCurso`. If null → "Activar evento" picker. If exists → `ProductoGrid` + `CarritoPanel` + collapsible "Gastos imprevistos" section. | yes |
| `PosCierreView.vue` | Cierre page. Loads ventas + gastos + existing cierre. Shows `CierreResumenCard` + cash-count inputs + "Registrar cierre" button (with confirm dialog). | yes |

### Component patterns reused from catalog + events

- **`ProductoCard` mirrors `RecetaCostoDesglose`** (events): read-only display
  card with a yellow `v-alert` (here: low-stock warning, future).
- **`ProductoGrid` mirrors `PlanProduccionGrid`** (events): responsive grid
  container, click-driven, add-row equivalent (here: click on card).
- **`CarritoPanel` mirrors `CarritoPanel` is NEW** — no precedent for
  append-only in-cart state. Inline state in `ventas.store.carrito` ref.
- **`VentaItem` mirrors `PlanProduccionRow`** (events): one row with quantity
  controls and computed subtotal.
- **`RegistrarVentaDialog` mirrors `EliminarConfirmDialog`** (events
  delete confirmations): Vuetify `v-dialog` with cancel/confirm.
- **`GastoImprevistoForm` mirrors `GastoFijoForm`** (events): same shape,
  different enum.
- **`CierreResumenCard` mirrors `ProyeccionCostosCard`** (events): read-only
  breakdown card with yellow `v-alert` for warnings.

---

## File Structure (new + modified)

```
kilo-lima/
├── supabase/
│   ├── migrations/
│   │   └── 20260619000000_pos_inicial.sql              NEW
│   └── dev_bypass_rls.sql                              MOD (extend with 5 new tables)
├── docs/
│   └── pos-setup.md                                    NEW
├── openspec/
│   ├── changes/pos/
│   │   ├── exploration.md                              (this file)
│   │   ├── proposal.md                                 (sdd-propose writes)
│   │   ├── specs/                                      (sdd-spec writes)
│   │   ├── design.md                                   (sdd-design writes)
│   │   └── tasks.md                                    (sdd-tasks writes)
│   └── config.yaml                                     (no changes)
├── src/
│   ├── types/
│   │   ├── pos.types.ts                                NEW
│   │   ├── database.types.ts                           MOD (+5 tables)
│   │   └── index.ts                                    MOD (re-export)
│   ├── services/
│   │   ├── productos.service.ts                        NEW (+ .spec.ts)
│   │   ├── ventas.service.ts                           NEW (+ .spec.ts)
│   │   ├── gastosImprevistos.service.ts                NEW (+ .spec.ts)
│   │   └── cierres.service.ts                          NEW (+ .spec.ts)
│   ├── stores/
│   │   ├── productos.store.ts                          NEW (+ .spec.ts)
│   │   ├── ventas.store.ts                             NEW (+ .spec.ts)
│   │   ├── gastosImprevistos.store.ts                  NEW (+ .spec.ts)
│   │   └── cierres.store.ts                            NEW (+ .spec.ts)
│   ├── composables/
│   │   ├── useProductos.ts                             NEW
│   │   ├── useVentas.ts                                NEW (+ .spec.ts for cart math)
│   │   ├── useGastosImprevistos.ts                     NEW
│   │   └── useCierreCaja.ts                            NEW (+ .spec.ts for cierre math)
│   ├── utils/
│   │   └── cierre.ts                                   NEW (+ .spec.ts)
│   ├── components/business/
│   │   ├── ProductoCard.vue                            NEW (+ .spec.ts)
│   │   ├── ProductoGrid.vue                            NEW (+ .spec.ts)
│   │   ├── CarritoPanel.vue                            NEW (+ .spec.ts)
│   │   ├── VentaItem.vue                               NEW (+ .spec.ts)
│   │   ├── RegistrarVentaDialog.vue                    NEW (+ .spec.ts)
│   │   ├── GastoImprevistoForm.vue                     NEW (+ .spec.ts)
│   │   ├── GastoImprevistoListItem.vue                 NEW
│   │   └── CierreResumenCard.vue                       NEW (+ .spec.ts)
│   ├── views/
│   │   ├── PosView.vue                                 NEW (+ .spec.ts)
│   │   └── PosCierreView.vue                           NEW (+ .spec.ts)
│   └── router/
│       ├── routes.ts                                   MOD (+2 routes)
│       └── routes.spec.ts                              MOD (+2 assertions)
└── tests/
    └── setup.ts                                        (no changes)
```

**Counts**:
- New source files: ~22 (services: 4, stores: 4, composables: 4, utils: 1,
  components: 8, views: 2; minus the cross-slice "Vender esta receta"
  button which adds ~10 lines to `RecetaDetalleView.vue` and
  `RecetaDetalleView.spec.ts`).
- New spec files: ~17 (4 services + 4 stores + 2 composables + 1 util +
  7 components + 2 views; `RecetaDetalleView.spec.ts` modified for the
  cross-slice button).
- Modified files: 6 (`database.types.ts`, `types/index.ts`,
  `dev_bypass_rls.sql`, `routes.ts`, `routes.spec.ts`,
  `RecetaDetalleView.vue`).
- Total: ~45 files touched.

---

## Test Strategy (strict TDD = RED-GREEN-REFACTOR)

### Test layers (per foundation + catalog + events conventions)

**Unit tests** (no Vue / Pinia / Supabase):
- `useVentas.spec.ts` — `calcularResumenCarrito(lineas)` pure function:
  empty cart, single line, multiple lines with same producto (merge vs
  separate rows — decision: merge into one line, see below), subtotal
  rounding edge cases.
- `useCierreCaja.spec.ts` — `calcularCierre(...)` pure function: empty
  ventas, mixed metodo_pago aggregation, diferencia positive/negative/zero,
  diferencia NULL when either cash field is NULL, float-drift round-up.
- `cierre.spec.ts` — `formatearDiferencia(monto)` helper: positive = "Sobrante $X", negative = "Faltante $X", zero = "Cuadre exacto".
- `productos.service.spec.ts` — chainable Supabase mock: list, create
  (with duplicate-recta detection), update, delete (with referential
  protection).
- `ventas.service.spec.ts` — same shape + `registrarVenta` test (insert
  venta, then N items; verify rollback shape on item failure).
- `gastosImprevistos.service.spec.ts` — list, create, update, delete.
- `cierres.service.spec.ts` — list, create, get-by-evento (UNIQUE
  enforcement at service level via mock setup).

**Integration tests** (services + Pinia + mocked Supabase):
- `productos.store.spec.ts` — `cargarTodos()`, `crear()`, `actualizar()`,
  `eliminar()`; reactive state shape.
- `ventas.store.spec.ts` — carrito state machine: `agregarAlCarrito`,
  `quitarDelCarrito`, `vaciarCarrito`, `actualizarCantidad` (qty = 0
  removes the line). `registrarVenta` end-to-end: optimistic update,
  Supabase call, cart cleared on success, cart restored on failure.
- `gastosImprevistos.store.spec.ts` — `cargarParaEvento`, `crear`,
  `eliminar`; EVENTO_CERRADO guard.
- `cierres.store.spec.ts` — `cargarParaEvento`, `registrarCierre`
  (insert cierre + cambiarEstado sequence); UNIQUE violation handling.

**Component tests** (`mount` + real Pinia + real Vuetify + mocked service):
- 8 component specs (cards, grid, panel, dialog, form, list-item, card).
- 2 view specs (PosView, PosCierreView).
- 1 modified RecetaDetalleView spec (cross-slice "Vender esta receta"
  button).
- 1 modified route spec (routes.spec.ts).

### Cart state machine edge cases (each MUST have a unit test)

| # | Case | Expected |
|---|------|----------|
| 1 | Add same producto twice | ONE cart line with cantidad = 2 (not two rows). |
| 2 | Add producto A, then change mind, click `−` until qty = 0 | Line removed from cart. |
| 3 | Cart with 3 lines, click "Vaciar" | Cart = []. |
| 4 | `actualizarCantidad(linea, 0)` | Line removed (defensive). |
| 5 | `actualizarCantidad(linea, -1)` | Throws or rejects (UI disables negative buttons; service is defensive). |
| 6 | `actualizarCantidad(linea, 1.5)` | Accepts decimal (catalog uses `numeric`); recalculates subtotal. |
| 7 | Cart has 3 items totaling $15.75; user clicks "Registrar venta" → service fails | Toast in Spanish, cart restored, optimistic update reverted. |
| 8 | Cart with 1 item, producto's `disponible` flips to false mid-session | The cart line is still valid (it's a snapshot); the warning is shown on the next `agregarAlCarrito` for that producto. |

### POS view edge cases

| # | Case | Expected |
|---|------|----------|
| 1 | User opens `/pos`, no evento en_curso | Show event picker ("Activar evento" or "Crear evento"). |
| 2 | User opens `/pos`, evento `en_curso` exists | Show grid + cart + gastos imprevistos section. |
| 3 | User opens `/pos`, evento `cerrado` exists | Show "Este evento está cerrado" + read-only sales history. |
| 4 | User opens `/pos/cierre/:eventoId` for evento `en_curso` | Show cierre view with form. |
| 5 | User opens `/pos/cierre/:eventoId` for evento `planificacion` | Show "El evento aún no empezó" message. |
| 6 | User opens `/pos/cierre/:eventoId` for evento `cerrado` AND cierre exists | Show read-only cierre card. |
| 7 | User opens `/pos/cierre/:eventoId` for evento `cerrado` AND NO cierre exists | Show "No hay cierre registrado" + retro-active form (allow creating one — events decision: `cerrado` is frozen for mutations, but cierres_caja can be added retroactively IF none exists). |

### Supabase mock pattern (no changes to `tests/setup.ts`)

The chainable mock is already generic (it doesn't care about table
names). POS tests import `__resetSupabaseMock` and
`__pushSupabaseResponse` from `tests/setup.ts` exactly like the catalog
and events tests do.

### Test count forecast

- Unit: ~28 tests (services: 16 + pure functions: 12)
- Integration: ~16 tests (4 stores × 4 actions)
- Component: ~24 tests (8 components × ~3 assertions)
- View: ~10 tests (2 views × ~5 assertions)
- Route + RecetaDetalleView modifications: ~4 tests
- **Total: ~80 tests** (events 228 + pos ~80 = cumulative ~308).

`pnpm test` runtime target stays under 12 seconds (events is ~7s; +80
tests should fit in 5 more seconds with jsdom).

### TDD discipline (same as catalog + events)

- For every new file, the spec file is the **first commit of the PR**, the
  implementation is the second commit.
- PR reviewer's diff shows: (1) failing test, (2) passing implementation.
- `pnpm test` MUST be in the verify gate (already in
  `openspec/config.yaml` after catalog PR1).
- New test fixtures: a tiny `src/__fixtures__/pos.ts` (or co-located
  factory functions in each spec file) that builds `Producto`, `Venta`,
  `VentaItem`, `GastoImprevisto`, `CierreCaja` instances. The chainable
  Supabase mock receives the fixtures via `__pushSupabaseResponse`.

---

## Offline Strategy for pos

### Decision: ONLINE-ONLY v1, defer WAL to `offline-sync` slice

The brief's offline promise is Phase 5 (item 20); foundation's
`docs/offline-sync.md` defers the queue. POS inherits the same constraint
EXCEPT for one architectural accommodation:

- **Reads**: store fetches from Supabase on mount. If unreachable, `error.value` surfaces in Spanish.
- **Writes**: store calls Supabase directly. On failure, optimistic update is reverted and the cart is restored (the user sees the red toast and can retry).
- **No `IStorageService` calls** in POS v1 code (the `offline-sync` slice may need it, but POS is online-only).
- **Online status chip**: POS renders the `useOnlineStatus()` chip (foundation primitive) as informational only. It does NOT block sales.

### Where the offline-sync slice plugs in (the TODO marker)

The `ventas.store.registrarVenta` action will be the integration point.
When the offline-sync slice lands, the action will:

1. Append `{ id, op: 'CREATE_VENTA', payload, ts: Date.now() }` to the
   sync queue (foundation's `IStorageService`).
2. Try Supabase.
3. On failure, leave the queue entry; the SW replays it later.

The POS v1 implementation has a `// TODO(offline-sync): enqueue here`
marker at the right line, so the future slice knows where to insert.
The unit test for `registrarVenta` mocks `IStorageService.guardar` (it
already exists from foundation; events didn't use it) and asserts the
marker exists as a code comment (or skips this assertion entirely).

### Why online-only v1 is safe

- Single-user, single-device (the brief explicitly says "no
  multi-device simultáneo").
- Supabase is a paid SaaS with 99.9% SLA; flaky 4G at a fair is the
  realistic failure mode.
- The offline-sync slice is the FIRST slice that ships a custom service
  worker (`injectManifest` strategy, `sync` event handler). Doing that in
  POS would inflate the slice by 1+ PR.
- The cart-in-memory pattern means a hard refresh (or browser crash)
  loses unsaved ventas — same risk as events. Acceptable for a single
  feriante at a fair who isn't juggling multiple devices.

---

## Cross-Slice Touch: `RecetaDetalleView` "Vender esta receta" button

POS needs a way to create `productos` from recipes. The cleanest UX is
a "Vender esta receta" button on `RecetaDetalleView.vue` (catalog
domain). This is a 1-line button + a small dialog.

### What changes in `RecetaDetalleView.vue`

```vue
<!-- New button + dialog, only visible if no producto exists for this receta -->
<v-btn
  v-if="!productoExistente"
  prepend-icon="mdi-cash-register"
  @click="mostrarDialogoVenta = true"
>
  Vender esta receta
</v-btn>

<!-- Dialog: asks for precio_venta -->
<VDialog v-model="mostrarDialogoVenta">
  ...
</VDialog>
```

The view calls `useProductos().crear({ receta_id, precio_venta, disponible: true, orden: 0 })`.
After save, the button is replaced by an "Editar precio de venta" link
(opens the same dialog in edit mode, or navigates to a future productos
CRUD view — out of scope v1).

### Spec coverage

`RecetaDetalleView.spec.ts` gets 2 new tests:
- "Vender esta receta button is visible when no producto exists"
- "Clicking the button opens the dialog and creating a producto hides the button"

### Why this is a POS concern, not a catalog concern

Catalog owns the `recetas` domain (CRUD over recipes). POS owns the
`productos` domain (the commercial wrapper). The button is the **bridge**
— it lives on a catalog view but its action creates a POS-domain entity.
This is the FIRST cross-slice touch in kilo-lima. The change is
minimal (one button + dialog + 2 tests) but it must be documented in
both `pos/exploration.md` and `pos/proposal.md`.

A future "Configuración" or "Productos" view could centralize this, but
v1 ships the inline button (KISS, one place to learn the flow).

---

## Database Setup Workflow

### One-time manual steps (documented in `docs/pos-setup.md`)

1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste `supabase/migrations/20260619000000_pos_inicial.sql` → Run.
   Idempotent (`create table if not exists`, `drop policy if exists`).
3. **NEW STEP**: extend `supabase/dev_bypass_rls.sql` to grant the anon
   role access to the 5 new tables. The PR includes the extended file.
4. Restart `pnpm dev`. The Vite app now reads + writes through the anon
   key.

### `dev_bypass_rls.sql` lifecycle (unchanged from catalog + events)

Present in POS dev; auth-flow slice removes it. The POS PR extends the
file (or appends a new section). The auth-flow slice is the single
removal point.

---

## Estimated Code Lines

| Bucket | Lines (approx) |
|--------|----------------|
| SQL migration + `dev_bypass_rls.sql` extension | ~220 |
| Types (`pos.types.ts` + hand-rolled `Database` extension + index re-export) | ~220 |
| Services (4 files) | ~280 |
| Stores (4 files) | ~360 |
| Composables (4 files) | ~280 |
| Utils (1 new) | ~80 |
| Components (8 files) | ~520 |
| Views (2 files) | ~200 |
| Cross-slice `RecetaDetalleView` modification | ~30 |
| Router modification + spec | ~30 |
| Specs (17 files, ~15 lines each average) | ~700 |
| Docs (`docs/pos-setup.md`) | ~50 |
| **Total new + modified** | **~2,000** |

This is LARGER than catalog (~2,085) and events (~1,800) and significantly
exceeds the 400-line review budget. **Chained PRs are MANDATORY** — at
least 5 PRs, with F2 splits in PR2 and PR3 (the services+components PRs).

---

## Chained PRs Forecast

| PR | Scope | Approx lines | 400-line risk |
|----|-------|--------------|----------------|
| **PR1 — Schema + state machine guards + pure math** | SQL migration + `dev_bypass_rls.sql` extension + `docs/pos-setup.md` + `pos.types.ts` + hand-rolled `Database` extension + `src/utils/cierre.ts` + `src/composables/useCierreCaja.ts` (composable + pure function) + 3 specs (cierre, useCierreCaja, types snapshot). | ~450 | Medium (just over — recommend F2: PR1a schema+types ~220, PR1b utils+composable+specs ~230; or accept size:exception). |
| **PR2 — Productos + ventas services+stores (F2a)** | `productos.service.ts` + `productos.store.ts` + `useProductos.ts` + `ventas.service.ts` + `ventas.store.ts` + `useVentas.ts` + 6 specs (2 service + 2 store + 2 composable). | ~320 | Low (under budget). |
| **PR3 — POS components + views (F2b from PR2)** | `ProductoCard.vue` + `ProductoGrid.vue` + `CarritoPanel.vue` + `VentaItem.vue` + `RegistrarVentaDialog.vue` + `PosView.vue` + 7 specs (5 component + 2 view) + cross-slice `RecetaDetalleView` modification. | ~480 | Medium (just over — recommend F2 split if reviewer flags). |
| **PR4 — Gastos imprevistos + cierre services+stores+components+views** | `gastosImprevistos.service.ts` + `gastosImprevistos.store.ts` + `useGastosImprevistos.ts` + `cierres.service.ts` + `cierres.store.ts` + `GastoImprevistoForm.vue` + `GastoImprevistoListItem.vue` + `CierreResumenCard.vue` + `PosCierreView.vue` + 7 specs. | ~430 | Medium (just over — F2 split optional). |
| **PR5 — Router + docs + final verify** | Router modifications (2 lazy routes) + `routes.spec.ts` update + final `verify-report.md` + final docs polish. | ~100 | Low. |

**Recommendation for `sdd-tasks`**: PR1 MUST stay under 400 if possible
(F2 split: PR1a schema+types ~220 lines, PR1b utils+composable ~230).
PR3 is the largest component PR; if it exceeds 400, F2 split it
(PR3a: components, PR3b: view + RecetaDetalleView modification).
The foundation's F2 precedent (splitting Vuetify plugin from PR1 into
PR2) and the catalog's + events' F2 precedents are the templates.

`chain_strategy`: stacked-to-main (matches foundation + catalog + events).
`delivery_strategy`: ask-always (preflight default).

---

## Risks and Gaps

### Risks

| # | Risk | Likelihood | Mitigation |
|---|------|-----------|------------|
| 1 | **Cart state survives browser refresh?** No — the carrito lives in `ventas.store` (in-memory). A refresh loses unsaved ventas. | Medium | v1 documents this gap in `docs/pos-setup.md` ("Las ventas sin registrar se pierden al refrescar"). The offline-sync slice will add WAL persistence (foundation's `LocalforageStorageService` + `IStorageService`). |
| 2 | **`registrarVenta` partial failure (venta inserted, item fails)** | Medium | Service returns the first item error; store reverts optimistic update and restores cart. UI shows red toast with the item that failed. User retries — the duplicate venta is a known issue (documented; v1 tolerates it). |
| 3 | **No `user_id` on ventas** — anyone with the anon key could see/modify all ventas in dev. | High | Documented as a dev-only issue; auth-flow slice adds the column + RLS policies. v1 does NOT add the column (would break the snapshot pattern). |
| 4 | **400-line budget consistently exceeded** — events had 3/5 PRs with `size:exception`; POS forecasts the same. | High | F2 splits in PR1, PR3, PR4 are pre-planned. `delivery_strategy: ask-always` lets the user override. |
| 5 | **`producto.precio_venta` snapshot in `venta_items.precio_unitario` vs current price** — historical sales don't update if the menu price changes. | Locked (intentional) | Snapshot is the source of truth for cierres + analytics. The product's `precio_venta` only affects FUTURE sales. |
| 6 | **`cierres_caja` retroactive creation** — if a user navigates to `/pos/cierre/:eventoId` for a `cerrado` evento with no cierre, the form is shown. This violates the "frozen on cerrado" pattern from events. | Low | Documented in §6.3 of the closure flow. Rationale: `cierres_caja` is meta-data about the evento, not a mutation of the evento itself. The evento is unchanged; we just add a snapshot row. The events precedent (delete is CASCADE) means adding a cierre post-cerrado is safe. |
| 7 | **`diferencia` cash-count fields optional** — the user might forget to count. | Low | UI clearly labels the cash section as optional ("Solo si contaste la caja"). The utilidad_bruta is always shown (the meaningful business metric). |
| 8 | **Cross-slice `RecetaDetalleView` modification** — the catalog view gains a POS-domain button. Reviewer might flag "scope creep". | Low | Documented in both this exploration and the proposal. The button is 1 line + 1 dialog + 2 tests; the alternative (a separate Productos CRUD view) would be 1+ extra PR. |
| 9 | **`productos.disponible = false` mid-cart** — user adds a producto, then toggles it off (somewhere else in the app? no, v1 has no Productos CRUD view). | Locked out | v1 has no Productos CRUD view; `disponible` is set at creation time. A future Productos CRUD view (out of scope v1) can toggle this. The cart state-machine test #8 covers the defensive case. |
| 10 | **Service `registrarVenta` is NOT a Supabase RPC** — it's a chain of two inserts in the service. A future "atomic venta" RPC would be a 1-line change. | Low | The service interface stays the same (`registrarVenta` returns `{ data, error }`); the implementation swaps to RPC. v1 ships the simple chain; RPC is a v2 enhancement. |

### Gaps from brief (locked decisions)

| # | Gap | Decision |
|---|-----|----------|
| 1 | Brief says "decrements stock?" — but no stock column on `materias_primas`. | **v1: no stock decrement.** The user trusts their own counts. Stock-aware validation is a future slice. |
| 2 | Brief's Phase 5 (offline sync, item 20) — do we implement WAL here? | **No.** POS v1 is online-only. The `offline-sync` slice owns the WAL + queue + custom SW. POS ships a `// TODO(offline-sync):` marker. |
| 3 | Brief says "cierre de caja diario" — is it end of day or end of evento? | **End of evento** (single-day v1, events decision). One cierre per evento. |
| 4 | Brief says `metodo_pago` — which methods? | **4 values: efectivo, transferencia, tarjeta, mixto.** Locked enum. |
| 5 | Brief doesn't say "with 5% merma" for sales. | **No merma on sales.** Merma is a production/cost concern (catalog `redondearParaMermas`), not a sales concern. Sales record the charged price. |
| 6 | Brief doesn't define "propina" or "imprevistos categorias". | **5-value enum**: insumos_extra, transporte, reparacion, propina, otro. The `motivo` text field is the source of truth for what happened. |
| 7 | Brief doesn't say "if evento is cerrado, can you still create a cierre?" | **Yes** (if no cierre exists). The cierre is a snapshot, not a mutation. The events `cerrado` freeze applies to gastos_fijos + plan_produccion + ventas (not cierres_caja). |
| 8 | Brief says "register a sale" — what about refunds/corrections? | **v1: no refunds.** A wrong sale is handled by registering a corrective venta (the analytics slice can compute net = Σ ventas). Negative-quantity venta_items are blocked by the `cantidad > 0` CHECK. A future "Reembolso" slice adds the refund flow. |

### Conflicts with foundation + catalog + events

**None.** POS consumes the foundation API surface (`inject('supabase')`,
`IStorageService`, `useOnlineStatus`), the catalog's `calcularCostoReceta`
(read-only tooltip), the events's `events.store`, `transicionEstadoValida`,
`estadoEsEditable`, and the events domain types. The only file modified
outside `src/{views,stores,services,composables,components,types,utils}`
is `src/router/routes.ts` (additive), `supabase/dev_bypass_rls.sql`
(additive), `RecetaDetalleView.vue` (1 button + 1 dialog), and the new
migration SQL.

---

## Ready for Proposal

**Yes.** The proposal phase has everything it needs:

- Data model with full column lists, FKs, indexes, RLS for 5 new tables.
- The Producto vs Receta decision: separate `productos` table, locked.
- Service / store / composable / view mapping to the events + catalog
  existing pattern (one-store-per-domain, factory services, never-throw
  contract, cross-store READ in `computed` only).
- Sale flow with optimistic UI + revert-on-failure.
- Daily close flow with the `calcularCierre` pure function + 8 edge cases.
- Gastos imprevistos as a separate table from `gastos_fijos`.
- State machine integration: POS drives `en_curso → cerrado`; respects
  the frozen-on-`cerrado` guard for ventas + imprevistos.
- Database setup method (additive SQL migration, `dev_bypass_rls.sql`
  extension, manual Dashboard run).
- Type-generation decision (hand-rolled `Database` extension, deferred CLI).
- Routes, components, file inventory (~45 files touched).
- Test strategy (unit / integration / component breakdown with ~80 tests
  forecast, strict TDD order).
- Chained-PR forecast (5 PRs, ~2,000 total lines, stacked-to-main, with
  F2 splits pre-planned for PR1 + PR3).
- Cross-slice touch: 1 button + 1 dialog in `RecetaDetalleView.vue` for
  the "Vender esta receta" flow.
- Offline strategy: online-only v1, TODO marker for `offline-sync`.
- Risks and gaps documented (10 risks, 8 gaps, all with locked decisions).

The proposal phase MUST also:
1. Document the `dev_bypass_rls.sql` extension (with the explicit
   "removed in the auth-flow slice" marker — same as catalog + events).
2. Lock the `metodo_pago` 4-value enum and the `categoria_imprevisto`
   5-value enum (no "future-proofing" with extra values).
3. Decide on the cross-slice `RecetaDetalleView` modification: explicit
   "POS owns this bridge; catalog owns the recipes; the button is the
   only place the two domains touch in v1".
4. Decide on the `// TODO(offline-sync):` marker placement in
   `ventas.store.registrarVenta`: pin it to the exact line so the
   `offline-sync` slice's first task is mechanical.

---

## Key Learnings

- **POS is the first transactional domain in kilo-lima.** Catalog is CRUD
  with explicit save buttons; events is planning with read-only calc.
  POS appends ventas to a ledger and clears an in-memory cart, with
  optimistic UI + revert-on-failure. This is the first slice where the
  brief's "feedback inmediato y emocional" (§2.1) shows up in the UI.
- **The Producto vs Receta decision is the single most important
  architectural call.** Adding `precio_venta` to `recetas` would
  conflate "cost" with "sale price" with "availability". A separate
  `productos` table is the clean separation: catalog owns the recipe
  (cookable thing), POS owns the producto (commercial wrapper). The
  cross-slice "Vender esta receta" button is the bridge.
- **Cart state lives in Pinia, not `IStorageService`.** v1 is online-only
  (the brief's Phase 5 offline promise is its own slice). The cart is
  in-memory; a browser refresh loses unsaved ventas. The TODO marker
  in `ventas.store.registrarVenta` is the integration point for
  `offline-sync`.
- **`ventas` and `venta_items` snapshot price at write time.** This is
  the explicit inversion of the catalog "compute on read" pattern: where
  catalogs DERIVE (cost = f(current ingredient prices)) to stay fresh,
  ventas SNAPSHOT (precio_unitario = value at sale time) to stay honest.
  Analytics consume the snapshot.
- **`cierres_caja` is a snapshot, NOT a computed view.** Once a day is
  closed, it's closed. The utilidad_bruta is frozen at cierre time; if
  ventas are added later (shouldn't happen — the evento is `cerrado`),
  the cierre stays accurate. This trades freshness for honesty.
- **POS drives the state machine forward for the first time.** Events
  locked the machine; POS is the consumer that triggers
  `en_curso → cerrado` (via `useCierreCaja.registrarCierre`). The same
  `transicionEstadoValida` + `estadoEsEditable` helpers from events are
  the single source of truth for the guards.
- **Gastos imprevistos is a separate table from gastos fijos.** Mixing
  them would corrupt `calcularProyeccion`'s math (events expects
  `gastos_fijos` to be a known input). The separation preserves the
  cost-projection projection invariant.
- **The cross-slice `RecetaDetalleView` button is the FIRST multi-domain
  touch in kilo-lima.** It deserves explicit documentation in the
  proposal. The alternative (a Productos CRUD view) would inflate the
  slice by 1+ PR; the inline button is KISS.
- **The 2,000-line forecast still exceeds the 400-line review budget.**
  5 PRs with F2 splits pre-planned for PR1 + PR3 (events precedent:
  PR2a/PR2b F2 split absorbed cleanly; PR3a/PR3b will follow the same
  pattern). The 400-line budget is consistently exceeded in
  multi-domain slices; consider a 500-line budget for state-machine +
  transactional domains in future slices.
- **The `// TODO(offline-sync):` marker is a contract with future slices.**
  POS v1 explicitly defers the WAL; the `offline-sync` slice's first
  task is "find the marker and insert the queue.guardar call". This is
  the same pattern foundation used for `docs/offline-sync.md` — document
  intent now, implement later.
- **Single-user + no auth = no `user_id` columns.** `useAuth()` is still
  a stub. POS does NOT add `user_id` to ventas (would break the snapshot
  pattern + introduce migration debt for the auth-flow slice). When
  auth-flow lands, it adds the column + RLS in one PR.
