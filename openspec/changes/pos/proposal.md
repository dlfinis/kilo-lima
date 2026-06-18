# Proposal: `pos` — Caja Registradora (Product Grid, Cart, Sales Ledger, Daily Close, Unexpected Expenses)

> **Change**: `pos` | **Phase**: `sdd-propose` → feeds `sdd-spec` and `sdd-design`
> **Source PRD**: `brief.md` §7 Phase 4, items 14–17 (locked scope).
> **Source analysis**: `openspec/changes/pos/exploration.md` (READ FIRST — every decision below is sourced from it; the 10 locked decisions live in §3).
> **Artifact store mode**: `both` (filesystem + Engram).
> **Delivery**: chained PRs (5 slices, with pre-planned F2 splits in PR2 and PR3), stacked-to-main, ~2,000 total lines — exceeds 400-line review budget, chained PRs are MANDATORY.

---

## 1. Title and Executive Summary

**Title**: `pos` — Product grid (`productos` commercial wrapper around `recetas`) + cart + sales ledger (`ventas` + `venta_items`) + daily close (`cierres_caja`) + unexpected expenses (`gastos_imprevistos`, kept separate from `gastos_fijos`).

**Executive summary**: The `pos` slice delivers brief Phase 4 items 14–17 in one cohesive change: a clickable product grid sourced from a new `productos` table (the commercial wrapper around catalog's `recetas`), an in-memory cart with optimistic UI and revert-on-failure, an append-only sales ledger (`ventas` + `venta_items`) that **snapshots prices at write time** (the explicit inversion of catalog's "compute on read" pattern), an unplanned-expenses surface (`gastos_imprevistos`) kept on a **separate table** from `gastos_fijos` to preserve the cost-projection invariant, and a `cierres_caja` snapshot that drives the events state machine forward (`en_curso → cerrado`) for the first time. POS is **strictly additive** to the foundation + catalog + events API surfaces (`inject('supabase')`, factory services, never-throw contract, hand-rolled `Database` interface, chainable Supabase mock, `transicionEstadoValida`, `estadoEsEditable`, `eventsStore.eventoEnCurso`) and **introduces zero new dependencies** to `package.json`. It is the **first transactional domain** in kilo-lima (catalog is CRUD-with-save, events is planning with read-only calc; POS appends rows to a ledger and clears an in-memory cart with optimistic UI). It unblocks `analytics` (which will read `ventas` + `cierres_caja` for profit-per-evento dashboards), `reports` (which will export cierres), `offline-sync` (which will plug a WAL into the `// TODO(offline-sync):` marker placed in `ventas.store.registrarVenta`), and `auth-flow` (which will add `user_id` to ventas + remove `dev_bypass_rls.sql`). Strict TDD applies — ~80 new tests land before the implementation in 5 chained PRs (with F2 splits in PR2 and PR3 pre-planned).

---

## 2. Context and Motivation

- **PRD scope** (`brief.md` §7 Phase 4, items 14–17): product grid → cart + sales register → daily close → unexpected expenses. Locked; no extensions.
- **Foundation is ARCHIVED** (54/54 REQ-IDs, `strict_tdd: ENABLED`, `IStorageService` LSP, `LocalforageStorageService`, `useOnlineStatus()`, `usePwaUpdate()`, `vite-plugin-pwa` with `generateSW`, `useAuth()` stub that throws).
- **Catalog is ARCHIVED** (46/46 REQ-IDs, 3 tables, `calcularCostoReceta` pure function, hand-rolled `Database` interface, chainable Supabase mock, `dev_bypass_rls.sql` extended for 6 tables).
- **Events is ARCHIVED** (46/46 REQ-IDs, 3 tables, `evento.estado` state machine, `calcularProyeccion` + `useProyeccionCostos` consumed verbatim, `transicionEstadoValida` + `estadoEsEditable` as the single source of truth for the state machine, `eventsStore.eventoEnCurso` getter).
- **Why now**: `analytics` cannot compute profit without `ventas` totals per evento; `reports` cannot export cierres; `offline-sync` cannot wire the WAL without a write path; `auth-flow` cannot add `user_id` to sales without `ventas` existing. POS is the keystone of Phase 4 — every subsequent slice depends on it.
- **Why a separate slice** (not absorbed into events): events is the planning domain (pre-evento math); POS is the transactional domain (during-evento ledger). Mixing them would have conflated the **snapshot pattern** (ventas: write-time price freeze) with the **compute pattern** (events: read-time cost projection) and broken the `calcularProyeccion` invariant that `gastos_fijos` is the known input.
- **Business framing**: brief §3.1 mandates "feedback inmediato y emocional" for sales. POS is the first slice where this feedback shows up — click a product card, see it in the cart instantly, click "Registrar venta", see a green toast, cart clears. The offline-sync slice will preserve this feel when Supabase is unreachable.

---

## 3. Decisions (LOCKED — 10 decisions, sourced from exploration)

| # | Decision | One-line rationale | Source |
|---|---|---|---|
| 1 | **Data model = 5 Supabase tables**: `productos`, `ventas`, `venta_items`, `gastos_imprevistos`, `cierres_caja`. No derived tables. | Normalized 3NF; FK + UNIQUE enforce business invariants (one `producto` per `receta`; one `cierre_caja` per `evento`); append-only on `ventas`/`venta_items`/`cierres_caja` enforced by absence of `updated_at`. | exploration §Data Model |
| 2 | **`productos` is a separate table from `recetas`** — the commercial wrapper. Not a `precio_venta` column on `recetas`. | Confining cost vs price vs availability to separate mental models: catalog owns the cookable thing; POS owns the for-sale thing. The cross-slice "Vender esta receta" button is the bridge. | exploration §The Producto vs Receta Decision |
| 3 | **`ventas` + `venta_items` snapshot prices at write time**. `precio_unitario` and `subtotal` are columns, not derived. | Explicit inversion of catalog's "compute on read" pattern. Where catalogs DERIVE to stay fresh, ventas SNAPSHOT to stay honest — cierres and analytics consume what actually happened. | exploration §Data Model, §Sale Flow |
| 4 | **`gastos_imprevistos` is a separate table from `gastos_fijos`** — never co-located. | Mixing them would corrupt `calcularProyeccion`'s math (events expects `gastos_fijos` to be the planned-cost input). Separation preserves the projection invariant. | exploration §Gastos Imprevistos |
| 5 | **`cierres_caja` is a snapshot row, not a computed view**. `total_ventas`, `total_gastos_fijos`, `total_gastos_imprevistos`, `utilidad_bruta`, `diferencia` are columns frozen at cierre time. | The brief's "cierre de caja diario" is a frozen historical record. If a `venta` is added after the cierre (shouldn't happen — the evento is `cerrado`), the cierre stays accurate to its day. Trades freshness for honesty. | exploration §Data Model, §Daily Close |
| 6 | **POS drives the state machine forward for the first time** (`en_curso → cerrado`). Consumes `transicionEstadoValida` + `estadoEsEditable` from `src/utils/estado.ts`. | Single source of truth for guards and transitions (events precedent). A `cerrado` evento cannot accept new ventas or new imprevistos. The retroactive cierre case (cerrado evento with no cierre row) is allowed — cierres is meta-data, not an evento mutation. | exploration §State Machine Integration |
| 7 | **`metodo_pago` enum = 4 values**: `efectivo`, `transferencia`, `tarjeta`, `mixto`. `categoria_imprevisto` enum = 5 values: `insumos_extra`, `transporte`, `reparacion`, `propina`, `otro`. | KISS — both enums are LOCKED in the SQL CHECK constraint and the TS type. No future-proofing with extra values. | exploration §Data Model |
| 8 | **Cart lives in `ventas.store` (Pinia in-memory), NOT in `IStorageService`**. v1 is online-only. `// TODO(offline-sync):` marker placed at the `registrarVenta` line for the offline-sync slice. | Brief Phase 5 item 20 owns offline. POS does NOT introduce a custom service worker or WAL. The marker is the contract for the future slice. | exploration §Offline Strategy |
| 9 | **No `user_id` column on ventas / venta_items / cierres_caja in v1**. Single-user. The `auth-flow` slice adds the column + RLS in one PR. | Adding `user_id` now would break the snapshot pattern (snapshot who?) and introduce migration debt that auth-flow must pay. The anon key grants access via the extended `dev_bypass_rls.sql`. | exploration §Data Model, §Auth note |
| 10 | **Delivery = 5 chained PRs stacked-to-main**: PR1 (schema + state-machine guards + cierre pure math), PR2 (productos+ventas services+stores, F2a), PR3 (POS components + views, F2b from PR2), PR4 (imprevistos + cierre services+stores+components+views), PR5 (router + docs + final verify). | ~2,000 lines (larger than catalog's ~2,085 and events's ~1,800). F2 splits pre-planned for PR2 and PR3 (events precedent: PR2a/PR2b absorbed cleanly; PR3a/PR3b will follow the same pattern). | exploration §Chained PRs Forecast |

---

## 4. Scope

### 4.1 In-scope (concrete deliverables with SRP justification)

| Deliverable | Single Responsibility (SRP) |
|---|---|
| `supabase/migrations/20260619000000_pos_inicial.sql` | Owns the schema, indexes, RLS policies, and `updated_at` trigger for `productos` (only `productos` mutates; `ventas`/`venta_items`/`cierres_caja` are append-only). One change, one migration. |
| `supabase/dev_bypass_rls.sql` (modified) | Extends the existing catalog + events dev bypass with `grant select, insert, update, delete` for the 5 new tables. Loud dev-only header comment names `auth-flow` as the removal slice. |
| `docs/pos-setup.md` | User-facing one-time setup instructions (paste the new migration + re-run the extended bypass). Documents the cart-doesn't-survive-refresh caveat. |
| `src/types/pos.types.ts` | Spanish domain types (`Producto`, `Venta`, `VentaItem`, `VentaConItems`, `GastoImprevisto`, `CierreCaja`, `MetodoPago`, `CategoriaImprevisto`), `*Input` variants, plus the pure-function shapes (`LineaCarrito`, `ResumenCarrito`, `CierreResumen`). |
| `src/types/database.types.ts` (modified) | Adds 5 new tables to the hand-rolled `Database` interface. |
| `src/types/index.ts` (modified) | Re-exports pos types. |
| `src/services/productos.service.ts` | Owns Supabase CRUD for `productos` (the "para venta" toggle lives here). Factory takes `SupabaseClient<Database>` via DI. |
| `src/services/ventas.service.ts` | Owns Supabase CRUD for `ventas` + `venta_items` (joined — same parent-table + child-table pattern as events' `events.service` + `gastos_fijos`). `registrarVenta(ventaConItems)` is the public surface (atomic-at-API). |
| `src/services/gastosImprevistos.service.ts` | Owns Supabase CRUD for `gastos_imprevistos` (per-evento, simple list). |
| `src/services/cierres.service.ts` | Owns Supabase CRUD for `cierres_caja` (read + insert; immutable after creation — no update method). |
| `src/stores/productos.store.ts` | Pinia store for `productos` (per the one-store-per-domain rule). |
| `src/stores/ventas.store.ts` | Pinia store for `ventas` + `venta_items` + the in-memory `carrito` ref (transient UI state). |
| `src/stores/gastosImprevistos.store.ts` | Pinia store for `gastos_imprevistos` (the current evento's list). |
| `src/stores/cierres.store.ts` | Pinia store for `cierres_caja` (one cierre per evento — keyed by `eventoId`). |
| `src/composables/useProductos.ts` | Thin wrapper around `productos.store`. |
| `src/composables/useVentas.ts` | Wrapper around `ventas.store` + the in-memory cart helpers (`agregarAlCarrito`, `quitarDelCarrito`, `vaciarCarrito`, `actualizarCantidad`) + `calcularResumenCarrito` pure helper. |
| `src/composables/useGastosImprevistos.ts` | Wrapper around `gastosImprevistos.store`. |
| `src/composables/useCierreCaja.ts` | Wrapper around `cierres.store` + the pure function `calcularCierre(ventas, gastosFijos, gastosImprevistos, efectivoEsperado, efectivoReal)`. |
| `src/utils/cierre.ts` | Tiny pure helpers: `calcularCierre(...)` (snapshot math) and `formatearDiferencia(monto)` ("Sobrante $X" / "Faltante $X" / "Cuadre exacto"). |
| `src/components/business/ProductoCard.vue` | Clickable card: name + price + optional "Costo: $X" tooltip on hover (uses `useRecipes` + `useIngredients` to compute cost read-only). Emits `agregar`. |
| `src/components/business/ProductoGrid.vue` | Vuetify grid container. Responsive `cols="12 sm="6" md="4" lg="3"`. Emits `agregar`. |
| `src/components/business/CarritoPanel.vue` | Sidebar (desktop) / bottom-sheet (mobile). Shows cart items + total + "Vaciar" + "Registrar venta" + read-only "Ventas registradas hoy" mini-list. |
| `src/components/business/VentaItem.vue` | One cart line: name × quantity × price = subtotal + `+`/`-` buttons + delete. |
| `src/components/business/RegistrarVentaDialog.vue` | Confirmation dialog. Shows total + `metodo_pago` selector (4-value enum). Emits `confirmar` with `{ metodoPago }`. |
| `src/components/business/GastoImprevistoForm.vue` | Form for an imprevisto. Validates `monto > 0` and `motivo` non-empty (max 500 chars). |
| `src/components/business/GastoImprevistoListItem.vue` | Row in the imprevistos list: monto + motivo + categoria + delete. |
| `src/components/business/CierreResumenCard.vue` | Read-only card: 4 sections (ventas + gastos + utilidad + diferencia) + yellow `v-alert` when `diferencia !== 0`. |
| `src/views/PosView.vue` | Main POS page. Reads `eventsStore.eventoEnCurso`. If null → "Activar evento" picker. If exists → `ProductoGrid` + `CarritoPanel` + collapsible "Gastos imprevistos" section + online-status chip. |
| `src/views/PosCierreView.vue` | Cierre page. Loads ventas + gastos + existing cierre. Shows `CierreResumenCard` + cash-count inputs + "Registrar cierre" button (with confirm dialog). |
| `src/views/RecetaDetalleView.vue` (modified, catalog) | Adds a "Vender esta receta" button + dialog (1 button + 1 dialog + 2 tests). The **only** cross-slice touch in v1. |
| `src/router/routes.ts` (modified) | Appends 2 lazy routes: `/pos`, `/pos/cierre/:eventoId`. |
| `src/router/routes.spec.ts` (modified) | Adds 2 `expect` assertions for the new routes (mirrors catalog + events patterns). |
| **~17 spec files** (one per source file, strict TDD order) | Unit tests for `calcularResumenCarrito`, `calcularCierre`, `formatearDiferencia` + 4 service specs + 4 store specs + 7 component specs + 2 view specs + 1 routes spec delta + 1 modified `RecetaDetalleView` spec. |
| `tests/setup.ts` | **No changes needed** — the chainable Supabase mock is generic. |

### 4.2 Out-of-scope (explicit non-goals)

- **No stock / inventory tracking** — no `unidades_disponibles`, no `unidades_vendidas`, no stock decrement on sale. Stock is a known catalog gap (`stock_actual` not on `materias_primas`). The user trusts their own counts.
- **No offline sync / WAL / queue / custom service worker** — POS v1 is online-only. The `offline-sync` slice (Phase 5, item 20) wires the WAL + queue + custom SW. POS ships a `// TODO(offline-sync):` marker.
- **No real auth** — `useAuth()` stays stubbed. POS is single-user. The `auth-flow` slice ships real auth + adds `user_id` to ventas.
- **No multi-day eventos** — single-day events decision (events slice, locked). One cierre per evento. Multi-day is a future slice.
- **No `user_id` columns on ventas / venta_items / cierres_caja** — auth-flow owns it.
- **No merma surcharge on sales** — `redondearParaMermas` exists in `src/utils/moneda.ts` from catalog but is NOT wired into the sale math. Sales record the charged price. Merma is a production/cost concern (catalog `redondearParaMermas`), not a sales concern.
- **No receipts / printing** — no PDF, no thermal printer integration, no ticket generation. v1 shows the success toast and updates the cart. Receipts are a future slice (probably `reports`).
- **No refunds / corrections** — ventas are append-only; `cantidad > 0` CHECK prevents negative lines. A wrong sale is handled by registering a corrective venta (a future "Reembolso" slice adds the refund flow).
- **No barcode scanner integration** — the grid is click-driven. A future slice may add a `v-text-field` for barcode input.
- **No customer data** — no `cliente_id`, no `cliente_nombre`, no CRM. Sales are anonymous.
- **No product variants** — one `producto` per `receta`, one price. `productos_variantes` (small/medium/large at different prices) is a future slice.
- **No drag-to-reorder on the grid** — products ordered by `producto.orden ASC, producto.created_at ASC`. Reorder UI is a future Productos CRUD slice.
- **No CI / `gen:types`** — hand-rolled `Database` extension stays. CI slice owns CLI regeneration.
- **No new dependencies** — zero entries in `package.json`.

---

## 5. Stack (zero new dependencies)

POS adds **zero new entries to `package.json`**. Verification against exploration §1 + foundation + catalog + events archives:

| Concern | Package | Pin | POS use |
|---|---|---|---|
| UI | `vue@^3.5.38` + `vuetify@^3.12.8` | foundation (unchanged) | grid (`v-row`/`v-col`), cards, dialogs, chips, alerts, bottom-sheet, autocomplete, data tables |
| State | `pinia@^3.0.4` | foundation (unchanged) | 4 new stores (`productos`, `ventas`, `gastosImprevistos`, `cierres`) |
| Backend | `@supabase/supabase-js@^2.108.2` | foundation (unchanged) | service layer for 5 new tables |
| Routing | `vue-router@^4.6.4` | foundation (unchanged) | 2 new lazy routes |
| Math | `Math.round(x * 100 + Number.EPSILON) / 100` | vanilla JS | `redondearCentavos` from catalog's `src/utils/moneda.ts` is reused for cart subtotals + cierre totals + venta subtotals |
| Date | `dayjs@^1.11.13` | foundation (unchanged) | `formatearFecha` for the "Ventas de hoy" mini-list |
| Online status | `navigator.onLine` + `window` events | foundation (`useOnlineStatus()`) | the "En línea" / "Sin conexión" chip in `PosView` header |
| Offline WAL | `localforage@^1.10.0` | foundation (NOT consumed) | `// TODO(offline-sync):` marker only; no live usage |
| Testing | `vitest@^2.1.9` + `@vue/test-utils@^2.4.11` | foundation (unchanged) | ~80 new tests |
| Build | `vite@^5.4.21` + `vue-tsc@^3.3.5` | foundation (unchanged) | typecheck |
| Lint/Format | `eslint@^9.39.4` + `prettier@^3.8.4` | foundation (unchanged) | unchanged |

**No `zod` for form validation** — POS forms use native HTML5 + Vuetify field validation, same as catalog + events.

**No `supabase` CLI** — deferred to the CI slice.

---

## 6. File Structure (new files marked `NEW`, modified `MOD`)

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
│   │   ├── exploration.md                              (existing)
│   │   ├── proposal.md                                 NEW (this file)
│   │   ├── specs/                                      (sdd-spec writes here)
│   │   ├── design.md                                   (sdd-design writes here)
│   │   └── tasks.md                                    (sdd-tasks writes here)
│   └── config.yaml                                     (no changes — already aligned by catalog + events)
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
│   │   ├── PosCierreView.vue                           NEW (+ .spec.ts)
│   │   └── RecetaDetalleView.vue                       MOD (+1 button + 1 dialog)
│   └── router/
│       ├── routes.ts                                   MOD (+2 routes)
│       └── routes.spec.ts                              MOD (+2 assertions)
└── tests/
    └── setup.ts                                        (no changes — chainable mock is generic)
```

**Untouched foundation + catalog + events files** (proof of additive change): `App.vue`, `main.ts`, `App.spec.ts`, `utils/env.ts`, `plugins/vuetify.ts`, `plugins/services.ts`, `services/supabase.client.ts`, `localforage.client.ts`, `storage.interface.ts`, `storage.service.ts`, `composables/useAuth.ts`, `useOnlineStatus.ts`, `usePwaUpdate.ts`, `composables/useCalculoReceta.ts` (reused for the cost-tooltip), `utils/estado.ts` (reused for guards), `utils/moneda.ts` (reused for rounding), `utils/format.ts` (reused for currency formatting), `stores/app.store.ts`, `views/HomeView.vue`, all of `src/services/{ingredients,recipes,events,plans,gastosFijos}.service.ts`, all of `src/stores/{ingredients,recipes,events,plans,gastosFijos}.store.ts`, all of `src/composables/{useCalculoReceta,useEvents,useGastosFijos,useIngredients,usePlans,useProyeccionCostos,useRecipes}.ts`, all of `src/types/{catalog,events}.types.ts` (unchanged), and the catalog + events migrations.

**Counts**: ~22 new source files + ~17 new spec files + 6 modified files = ~45 files touched.

---

## 7. Data Model (5 new Supabase tables)

All five tables follow the catalog + events convention: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`. Only `productos` mutates (so it has `updated_at` + trigger); the other four are append-only (no `updated_at`).

### 7.1 `public.productos`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `receta_id` | `uuid` | NOT NULL, FK → `recetas(id) ON DELETE RESTRICT` | RESTRICT: cannot delete a receta that has a producto for sale. |
| `precio_venta` | `numeric(10,2)` | NOT NULL, CHECK `precio_venta > 0` | USD, 2 decimals. The source of truth for sale price. |
| `disponible` | `boolean` | NOT NULL, default `true` | "Para venta" toggle — soft-hide without delete. |
| `orden` | `integer` | NOT NULL, default `0` | Display order in the POS grid (lowest first). |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | Trigger on UPDATE. |

**Foreign keys**: `productos_receta_id_fkey` → `recetas.id` (RESTRICT).

**Indexes**:
- `idx_productos_receta_id` on `(receta_id)` — reverse lookup.
- `idx_productos_disponible_orden` on `(disponible, orden)` — hot path for the POS grid query (`WHERE disponible = true ORDER BY orden`).

**Unique constraint**: `uq_productos_receta` UNIQUE on `(receta_id)` — one producto per receta (a recipe is either for-sale or not, never two parallel prices).

### 7.2 `public.ventas`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE RESTRICT` | RESTRICT: cannot delete an evento with ventas (append-only ledger). |
| `fecha` | `timestamptz` | NOT NULL, `default now()` | Server timestamp; idempotent on retries. |
| `total` | `numeric(10,2)` | NOT NULL, CHECK `total >= 0` | USD. **Snapshot** at sale time. |
| `metodo_pago` | `text` | NOT NULL, CHECK `metodo_pago in ('efectivo','transferencia','tarjeta','mixto')` | **Locked 4-value enum** (KISS). |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**No `updated_at`** — ventas are immutable. A wrong sale is corrected by registering a corrective venta.

**Foreign keys**: `ventas_evento_id_fkey` → `eventos.id` (RESTRICT).

**Indexes**:
- `idx_ventas_evento_id` on `(evento_id)` — hot path for cierres.
- `idx_ventas_fecha` on `(fecha desc)` — "sales today" queries.
- `idx_ventas_metodo_pago` on `(metodo_pago)` — payment breakdown in cierres.

### 7.3 `public.venta_items`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `venta_id` | `uuid` | NOT NULL, FK → `ventas(id) ON DELETE CASCADE` | CASCADE: deleting a venta removes its items. |
| `producto_id` | `uuid` | NOT NULL, FK → `productos(id) ON DELETE RESTRICT` | RESTRICT: cannot delete a producto with sale history. |
| `cantidad` | `numeric(10,4)` | NOT NULL, CHECK `cantidad > 0` | Units sold. Decimal allows "0.5 kg of fudge". |
| `precio_unitario` | `numeric(10,2)` | NOT NULL, CHECK `precio_unitario >= 0` | USD. **Snapshot** at sale time — if `producto.precio_venta` changes later, historical sales keep their original price. |
| `subtotal` | `numeric(10,2)` | NOT NULL, CHECK `subtotal >= 0` | USD. **Computed** at insert time = `cantidad × precio_unitario` (rounded to 2 decimals via `redondearCentavos`). |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Why snapshot `precio_unitario` and `subtotal`**: analytics + cierres must reflect what actually happened at the moment of sale, not the current menu price. This is the explicit inversion of the catalog "no denormalized `costo_total` on recetas" pattern: where catalogs **derive** on read to stay fresh, ventas **snapshot** at write to stay honest.

**Foreign keys**: `venta_items_venta_id_fkey` → `ventas.id` (CASCADE); `venta_items_producto_id_fkey` → `productos.id` (RESTRICT).

**Indexes**:
- `idx_venta_items_venta_id` on `(venta_id)` — load all items for a venta.
- `idx_venta_items_producto_id` on `(producto_id)` — reverse lookup "how many X were sold?" (analytics).

### 7.4 `public.gastos_imprevistos`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE CASCADE` | CASCADE: deleting an evento removes its imprevistos. |
| `monto` | `numeric(10,2)` | NOT NULL, CHECK `monto > 0` | USD. Strictly positive (unplanned costs, never refunds). |
| `motivo` | `text` | NOT NULL, CHECK `length(motivo) > 0 AND length(motivo) <= 500` | Free text — what was it? |
| `categoria` | `text` | NULL, CHECK `categoria in ('insumos_extra','transporte','reparacion','propina','otro')` | Optional **5-value enum** (KISS). |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Foreign keys**: `gastos_imprevistos_evento_id_fkey` → `eventos.id` (CASCADE).

**Indexes**: `idx_gastos_imprevistos_evento_id` on `(evento_id)` — hot path for cierres.

**Why a separate table from `gastos_fijos`**: `gastos_fijos` are PLANNED (brief item 11) — entered pre-evento for cost projection. `gastos_imprevistos` are UNPLANNED (brief item 17) — entered during the event when something unexpected happens ("we ran out of cups"). Mixing them would corrupt `calcularProyeccion`'s math (events expects `gastos_fijos` to be a known input). The separation preserves the projection invariant.

**Frozen on `cerrado`**: same pattern as `gastos_fijos`. The POS view disables the "Agregar gasto imprevisto" button when `estado === 'cerrado'`. The store action `crearGastoImprevisto` reads `eventsStore.eventoActual.estado` and returns `EVENTO_CERRADO` if frozen.

### 7.5 `public.cierres_caja`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, UNIQUE, FK → `eventos(id) ON DELETE CASCADE` | UNIQUE: one cierre per evento. CASCADE: defensive (evento is usually `cerrado` first). |
| `fecha_cierre` | `timestamptz` | NOT NULL, `default now()` | When the cierre was registered. |
| `total_ventas` | `numeric(10,2)` | NOT NULL, CHECK `total_ventas >= 0` | USD. **Snapshot** = Σ(ventas.total). |
| `total_gastos_fijos` | `numeric(10,2)` | NOT NULL, CHECK `total_gastos_fijos >= 0` | USD. **Snapshot** = Σ(gastos_fijos.monto). |
| `total_gastos_imprevistos` | `numeric(10,2)` | NOT NULL, CHECK `total_gastos_imprevistos >= 0` | USD. **Snapshot** = Σ(gastos_imprevistos.monto). |
| `utilidad_bruta` | `numeric(10,2)` | NOT NULL | USD. **Snapshot** = `total_ventas − total_gastos_fijos − total_gastos_imprevistos`. |
| `efectivo_esperado` | `numeric(10,2)` | NULL | USD. User-entered expected cash (drawer count). |
| `efectivo_real` | `numeric(10,2)` | NULL | USD. User-entered actual cash on hand. |
| `diferencia` | `numeric(10,2)` | NULL | USD. **Snapshot** = `efectivo_real − efectivo_esperado`. NULL if user skipped the cash count. |
| `notas` | `text` | NULL | Optional free text. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**No `updated_at`**: cierres are immutable. Corrections live in a future "audit log" table (out of scope v1).

**Foreign keys**: `cierres_caja_evento_id_fkey` → `eventos.id` (CASCADE).

**Indexes**: `idx_cierres_caja_evento_id` UNIQUE on `(evento_id)` (FK enforces uniqueness; explicit index speeds the lookup).

**Why `utilidad_bruta` is a snapshot, not computed**: the brief's cierre is a frozen historical record. If a venta is added after the cierre (shouldn't happen — evento is `cerrado`), the cierre stays accurate to its day. Trades freshness for honesty.

### 7.6 RLS policies (same shape as catalog + events)

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

**Anon role is NOT granted access directly.** `dev_bypass_rls.sql` extends its existing grant block to include the 5 new tables. The `auth-flow` slice removes the bypass.

### 7.7 Migration ordering and atomicity

Single file `supabase/migrations/20260619000000_pos_inicial.sql` containing:
1. `productos` table + indexes + RLS + `updated_at` trigger.
2. `ventas` table + indexes + RLS.
3. `venta_items` table + indexes + RLS.
4. `gastos_imprevistos` table + indexes + RLS.
5. `cierres_caja` table + indexes + RLS.

**No new migration for `dev_bypass_rls.sql`** — the existing file is patched in the POS PR1 (5 new `grant` lines appended).

**Why single migration file**: POS is one logical change. Splitting it across migrations is premature; the `analytics` slice (Phase 5) can add a new migration later if it needs to alter the schema.

---

## 8. Producto vs Receta Decision (locked)

### Why a separate `productos` table (not `recetas.precio_venta`)

The catalog spec explicitly designed `recetas` as the **production** entity:
- Owns the ingredient lines (`receta_ingredientes`).
- Owns the cost math (`calcularCostoReceta`).
- Owns `rendimiento_unidades` (yield).

Adding `precio_venta` to `recetas` would conflate three concerns:
1. **Cost** (what it takes to make).
2. **Sale price** (what we charge).
3. **Availability** (whether it's on the menu).

The brief asks for all three, but they belong to different mental models. A recipe exists whether or not it's sold (test batch, sub-recipe). A sale price is a *commercial* decision that can change without touching the recipe. A menu toggle ("para venta") is a *publishing* decision.

### The `productos` table: the commercial layer

`productos` is the **commercial wrapper** around `recetas`:
- `receta_id` (FK) — references the underlying recipe.
- `precio_venta` (USD) — the user-facing price.
- `disponible` (bool) — the "para venta" toggle (soft-hide without delete).
- `orden` (int) — display order in the POS grid.
- UNIQUE on `(receta_id)` — one price per recipe.

### UX consequences

- **Catalog view** shows `recetas` (production domain).
- **POS view** shows `productos` WHERE `disponible = true` (sales domain).
- **Recipe detail view (catalog)** shows a small "Este producto se vende a $X.XX" badge IF a `producto` row exists for that `receta_id` (cross-domain hint).
- **Creating a producto**: from `RecetaDetalleView`, a "Vender esta receta" button opens a dialog asking for `precio_venta` and sets `disponible = true`. After save, the button is replaced by an "Editar precio de venta" link.

### The cross-slice `RecetaDetalleView` modification

POS needs a way to create `productos` from recipes. The cleanest UX is a 1-line button + a small dialog on `RecetaDetalleView.vue` (catalog domain). This is the FIRST cross-slice touch in kilo-lima. The change is minimal (~30 lines + 2 tests) but it must be documented in both `pos/exploration.md` and `pos/proposal.md`. A future "Configuración" or "Productos" view could centralize this, but v1 ships the inline button (KISS, one place to learn the flow).

```vue
<!-- New button + dialog, only visible if no producto exists for this receta -->
<v-btn
  v-if="!productoExistente"
  prepend-icon="mdi-cash-register"
  @click="mostrarDialogoVenta = true"
>
  Vender esta receta
</v-btn>
```

The view calls `useProductos().crear({ receta_id, precio_venta, disponible: true, orden: 0 })`.

### Future extension path (out of scope v1)

- **Variants** (small/medium/large at different prices): `productos_variantes (producto_id, nombre, precio_venta, ...)`. NOT v1.
- **Stock tracking** (`unidades_disponibles`, `unidades_vendidas` derived): a future slice adds the stock column to `productos`. NOT v1.

---

## 9. Sale Flow (brief item 15)

### The happy path

```
User opens /pos
       │
       ▼
PosView checks eventsStore.eventoEnCurso
       │
       ├── null (no evento in 'en_curso') ──► Show "Activar evento" picker
       │                                          │
       │                                          ├── select existing 'planificacion' evento
       │                                          └── cambiarEstado → 'en_curso'
       │                                          │
       │                                          ▼
       │                                     Show POS view
       │
       └── Evento en_curso exists ──► Show POS view (grid + cart)
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
       RegistrarVentaDialog opens (shows total + metodo_pago selector)
                                          │
                                          ▼
       User confirms
                                          │
                                          ▼
       useVentas.registrarVenta(metodoPago) — optimistic
       ├── ventas.service.crear({ evento_id, total, metodo_pago })
       └── for each cart item: venta_items.service.crear({ venta_id, producto_id, cantidad, precio_unitario, subtotal })
                                          │
                                          ▼
       Success: carrito cleared, green toast "🎉 Venta registrada: $X.XX"
       Failure: cart restored, red toast "❌ Error al registrar venta — revisá tu conexión"
```

### Atomicity concern (events lesson applied)

The events slice used `reemplazarTodos` (delete-then-insert) for the plan grid and accepted the risk of partial failure. **POS does NOT use that pattern.** Ventas are append-only, and a failed mid-transaction venta would corrupt the cart state. The strategy:

1. `ventas.service.registrarVenta(ventaConItems)` is a chain of one `crearVenta` + N `crearVentaItem` calls in v1 (a future Supabase RPC can make this atomic in one call). For v1, the service does:

```ts
async registrarVenta(input: VentaConItems): Promise<{ data, error }> {
  const { data: venta, error: ventaError } = await crearVenta(...)
  if (ventaError || !venta) return { data: null, error: ventaError }
  const items = await Promise.all(
    input.items.map((it) => crearVentaItem({ venta_id: venta.id, ...it })),
  )
  const firstError = items.find((r) => r.error)?.error
  if (firstError) return { data: null, error: firstError }
  return { data: { ...venta, items }, error: null }
}
```

2. On failure: the store keeps the cart intact and shows the error toast. The user can retry without losing data.
3. The brief item 5% merma is NOT applied here — that's a catalog `redondearParaMermas` concern, not a sales concern. The sale records what was charged.

### Optimistic UI (brief §3.1)

Every interaction is instant (this is the first slice where the brief's "feedback inmediato y emocional" shows up in the UI):

- Click `ProductoCard` → cart row appears (no network call).
- Click `+` on a cart row → quantity increments instantly.
- Click "Registrar venta" → cart clears immediately + green toast ("🎉 Venta registrada: $X.XX"), then Supabase call in background.
- If Supabase fails: red toast + cart re-populated with the unsaved items.

The cart lives in `ventas.store`; the `registrarVenta` action does optimistic update → Supabase call → revert-on-failure.

### What updates after a sale

- `events.store` — does NOT mutate (cross-store WRITE is forbidden). The `evento` row is unchanged.
- `ventas.store.ventas` — appends the new venta to the in-memory list (optimistic; Supabase confirmed it).
- `ventas.store.carrito` — cleared.
- The POS view re-renders (cart total = 0, the new venta appears in the optional "Ventas de hoy" mini-list at the bottom of the panel).

### The "Ventas de hoy" mini-list

POS shows a small "Ventas registradas hoy" section at the bottom of `CarritoPanel` (collapsed by default on mobile, expanded on desktop). This is read-only history within the current session — not a full historical view (analytics slice owns that). The list is the in-memory `ventas.store.ventas` filtered to `evento_id === eventoActual.id`, sorted by `fecha desc`.

### Stock decrement (deferred)

The brief says "decrements stock?" — but stock is a known catalog gap (REQ-CATALOG §Gaps #2, no `stock_actual` column on `materias_primas`). POS v1 **does NOT decrement anything**. The venta is recorded; the user trusts their own counts. Stock-aware validation is a future slice.

---

## 10. Daily Close (brief item 16)

### When does the user close?

The brief's "cierre de caja diario" is ambiguous — is it end of day or end of evento? The single-day v1 (events decision) collapses these into the same moment: when the evento ends, the user closes the caja. The `cierres_caja` row is the snapshot; the evento's `cambiarEstado('cerrado')` follows it (or happens in the same flow).

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
  utilidadBruta = totalVentas − totalGastosFijos − totalGastosImprevistos,
  efectivoEsperado,  // user-editable
  efectivoReal,      // user-editable
  diferencia,        // computed when both entered
  ventasPorMetodoPago: { efectivo, transferencia, tarjeta, mixto },
  cantidadVentas,
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
    efectivo: 0, transferencia: 0, tarjeta: 0, mixto: 0,
  }
  for (const v of input.ventas) {
    ventasPorMetodoPago[v.metodo_pago] = redondearCentavos(ventasPorMetodoPago[v.metodo_pago] + v.total)
  }
  return {
    totalVentas, totalGastosFijos, totalGastosImprevistos,
    utilidadBruta,
    efectivoEsperado: input.efectivoEsperado,
    efectivoReal: input.efectivoReal,
    diferencia,
    ventasPorMetodoPago,
    cantidadVentas: input.ventas.length,
  }
}
```

Unit tests cover: empty ventas, empty gastos, mixed metodo_pago, diferencia positive/negative/zero, diferencia NULL when either input is NULL, and the float-drift round-up case (mirrors events' `calcularProyeccion` tests).

### Why `efectivo_esperado` + `efectivo_real` + `diferencia` are NULLABLE

Not every feriante counts the drawer. The diferencia is the **discipline** field — "did we end the day with the cash we expected to have?". A NULL diferencia means "I didn't count; trust the utilidad_bruta number". The view makes the cash-count section optional with a clear checkbox: "Conté la caja al final del día".

### State machine integration

`useCierreCaja.registrarCierre` calls `transicionEstadoValida('en_curso', 'cerrado')` BEFORE inserting the cierre row. If the evento is already `cerrado`, the action returns `EVENTO_YA_CERRADO`. The two operations (insert cierre + cambiarEstado) are sequential, NOT transactional:

- If the cierre insert succeeds and the state change fails: the user sees the error and can retry the state change manually (the cierre row stays; `cierres_caja.evento_id` UNIQUE prevents a duplicate).
- If the cierre insert fails: nothing is mutated; the user retries.

The view shows a confirmation dialog: "Al cerrar la caja, el evento queda en estado 'Cerrado' y no se pueden registrar más ventas." ("Cancelar" / "Cerrar caja y evento").

### Retroactive cierre (documented exception)

If a user navigates to `/pos/cierre/:eventoId` for a `cerrado` evento with NO cierre row, the form is shown and a cierre can be created retroactively. Rationale: `cierres_caja` is meta-data about the evento, not a mutation of the evento itself. The evento is unchanged; we just add a snapshot row. The events precedent (CASCADE on delete) means adding a cierre post-cerrado is safe.

---

## 11. Gastos Imprevistos (brief item 17) — Separation from `gastos_fijos`

### Why a separate table (locked decision #4)

| Concern | `gastos_fijos` (events) | `gastos_imprevistos` (pos) |
|---|---|---|
| Phase | pre-evento (planning) | durante-evento (live) |
| Purpose | Cost projection input | Snapshot reality |
| Consumed by | `calcularProyeccion` | `calcularCierre` |
| Categories | 6 values: renta, transporte, permisos, publicidad, servicios, otro | 5 values: insumos_extra, transporte, reparacion, propina, otro |
| Mutability | Frozen on `cerrado` | Frozen on `cerrado` |
| Time of entry | Before the event | During the event |

Mixing them in one table would corrupt `calcularProyeccion`'s math (events expects `gastos_fijos` to be a known input). Keeping them separate preserves the cost-projection projection invariant and makes the cierres math simpler (each sum is a clean query).

### UX: an "Imprevistos" section inside the POS view

The POS view has a small "Gastos imprevistos de esta feria" collapsible section (or a tab on mobile, per brief §6.1). The user can add an imprevisto at any moment during the event without leaving the POS grid.

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

- `monto > 0` (no negative expenses; no zero) — DB CHECK enforces.
- `motivo` non-empty, max 500 chars — DB CHECK enforces.
- `categoria` optional; if set, must be in the 5-value enum — DB CHECK enforces.

### Form pattern

`GastoImprevistoForm.vue` mirrors `GastoFijoForm.vue` (events slice). Same `valoresIniciales` prop, same `submit` emit. The only differences:

- The categoria enum is different (5 vs 6 values, with `propina` and `reparacion` as POS-only concepts).
- The form lives inside the POS view, not on `EventoDetalleView`.

### Frozen on `cerrado`

Same pattern as `gastos_fijos`. The store action `gastosImprevistos.store.crear` reads `eventsStore.eventoActual.estado` and returns `EVENTO_CERRADO` if frozen. The POS view hides the "Agregar" button when `estado === 'cerrado'`.

---

## 12. Offline Strategy for POS (deferred to `offline-sync`)

### Decision: ONLINE-ONLY v1, defer WAL to `offline-sync` slice (locked decision #8)

The brief's offline promise is Phase 5 (item 20); foundation's `docs/offline-sync.md` defers the queue. POS inherits the same constraint EXCEPT for one architectural accommodation:

- **Reads**: store fetches from Supabase on mount. If unreachable, `error.value` surfaces in Spanish.
- **Writes**: store calls Supabase directly. On failure, optimistic update is reverted and the cart is restored (the user sees the red toast and can retry).
- **No `IStorageService` calls** in POS v1 code (the `offline-sync` slice may need it, but POS is online-only).
- **Online status chip**: POS renders the `useOnlineStatus()` chip (foundation primitive) as informational only. It does NOT block sales.

### Where the offline-sync slice plugs in (the TODO marker)

The `ventas.store.registrarVenta` action will be the integration point. When the offline-sync slice lands, the action will:

1. Append `{ id, op: 'CREATE_VENTA', payload, ts: Date.now() }` to the sync queue (foundation's `IStorageService`).
2. Try Supabase.
3. On failure, leave the queue entry; the SW replays it later.

The POS v1 implementation has a `// TODO(offline-sync): enqueue here` marker at the right line, so the future slice knows where to insert. The unit test for `registrarVenta` documents the marker as a `// TODO(offline-sync):` comment in the source (no behavioral assertion — the future slice's job).

### Why online-only v1 is safe

- Single-user, single-device (the brief explicitly says "no multi-device simultáneo").
- Supabase is a paid SaaS with 99.9% SLA; flaky 4G at a fair is the realistic failure mode.
- The offline-sync slice is the FIRST slice that ships a custom service worker (`injectManifest` strategy, `sync` event handler). Doing that in POS would inflate the slice by 1+ PR.
- The cart-in-memory pattern means a hard refresh (or browser crash) loses unsaved ventas — same risk as events. Acceptable for a single feriante at a fair who isn't juggling multiple devices.

---

## 13. State Machine Integration (POS drives it forward for the first time)

POS is the slice that **drives** the state machine forward (`en_curso → cerrado`) for the first time. Events locked the machine; POS consumes it.

### Guards (locked decision #6)

| Action | Reads | Returns |
|---|---|---|
| `ventas.store.registrarVenta` | `eventsStore.eventoActual.estado` | `EVENTO_CERRADO` if `cerrado` |
| `gastosImprevistos.store.crear` | `eventsStore.eventoActual.estado` | `EVENTO_CERRADO` if `cerrado` |
| `cierres.store.registrarCierre` | `transicionEstadoValida('en_curso', 'cerrado')` | `TRANSICION_INVALIDA` if evento not in `en_curso` |

All three guards use `estadoEsEditable` or `transicionEstadoValida` from `src/utils/estado.ts` (the single source of truth, events precedent). No duplicates.

### Forward-only

A `cerrado` evento can NEVER accept new ventas. The POS view reads `eventsStore.eventoActual.estado` and shows a friendly "Este evento está cerrado. Las ventas están en modo lectura" message instead of the grid.

### What happens when no evento is `en_curso`?

The user lands on `/pos`. The view checks `eventsStore.eventoEnCurso` (a `computed` that returns the first evento with `estado === 'en_curso'` or null). If null, the view shows:

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

The "Activar" button calls `events.service.cambiarEstado(eventoId, 'planificacion', 'en_curso')` then re-renders the grid.

---

## 14. Routing (2 new lazy routes)

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

`src/router/routes.spec.ts` is extended with 2 new entries (one `expect` per route) — same pattern as the catalog PR4 and events PR4 `routes.spec.ts`.

**Why no `/pos/carrito`**: the cart is a panel inside `/pos`, not a separate route. Splitting it would force a route transition mid-flow (bad UX) and lose the cart state (which lives in `ventas.store`, survives routes). The brief item 15 is "carrito y registro de ventas" — a single page with cart + register is the right decomposition.

---

## 15. Component Structure

### Components (8)

| File | Role | Spec |
|---|---|---|
| `ProductoCard.vue` | Clickable card: name + price + optional cost tooltip. Props: `producto: Producto`, `receta?: RecetaConIngredientes`. Emits `agregar`. | yes |
| `ProductoGrid.vue` | Vuetify grid container. Props: `productos: Producto[]`, `recetas: RecetaConIngredientes[]`. Emits `agregar`. Responsive cols. | yes |
| `CarritoPanel.vue` | Sidebar/bottom-sheet. Props: `carrito: ResumenCarrito`. Emits `registrar-venta`, `vaciar`, `update-cantidad`, `eliminar-linea`. Shows "Ventas registradas hoy" mini-list. | yes |
| `VentaItem.vue` | One cart line. Props: `linea: LineaCarrito`. Emits `update-cantidad`, `eliminar`. Shows quantity controls + subtotal. | yes |
| `RegistrarVentaDialog.vue` | Confirmation dialog. Props: `total: number`, `modelValue: boolean`. Emits `update:modelValue`, `confirmar` with `{ metodoPago }`. Shows `metodo_pago` select. | yes |
| `GastoImprevistoForm.vue` | Form for an imprevisto. Props: `valoresIniciales: GastoImprevistoInput`. Emits `submit`. | yes |
| `GastoImprevistoListItem.vue` | Row in the imprevistos list. Props: `gasto: GastoImprevisto`. Emits `eliminar`. | yes (with view spec) |
| `CierreResumenCard.vue` | Read-only card. Props: `cierre: CierreResumen`. Renders 4 sections + yellow `v-alert` for `diferencia != 0`. | yes |

### Views (2)

| File | Role | Spec |
|---|---|---|
| `PosView.vue` | Main POS page. Checks `eventsStore.eventoEnCurso`. If null → "Activar evento" picker. If exists → `ProductoGrid` + `CarritoPanel` + collapsible "Gastos imprevistos" section + online-status chip. | yes |
| `PosCierreView.vue` | Cierre page. Loads ventas + gastos + existing cierre. Shows `CierreResumenCard` + cash-count inputs + "Registrar cierre" button (with confirm dialog). | yes |

### Component patterns reused from catalog + events

- `ProductoCard` mirrors `RecetaCostoDesglose` (events): read-only display card.
- `ProductoGrid` mirrors `PlanProduccionGrid` (events): responsive grid container, click-driven.
- `VentaItem` mirrors `PlanProduccionRow` (events): one row with quantity controls and computed subtotal.
- `RegistrarVentaDialog` mirrors `EliminarConfirmDialog` (events delete confirmations): Vuetify `v-dialog` with cancel/confirm.
- `GastoImprevistoForm` mirrors `GastoFijoForm` (events): same shape, different enum.
- `CierreResumenCard` mirrors `ProyeccionCostosCard` (events): read-only breakdown card with yellow `v-alert` for warnings.
- `CarritoPanel` is NEW — no precedent for append-only in-cart state. Inline state in `ventas.store.carrito` ref.

---

## 16. Type Generation

### Decision: hand-rolled `Database` extension (events precedent)

`src/types/database.types.ts` gains 5 new entries under `Database['public']['Tables']`:

- `productos` — `id`, `receta_id`, `precio_venta`, `disponible`, `orden`, `created_at`, `updated_at`.
- `ventas` — `id`, `evento_id`, `fecha`, `total`, `metodo_pago`, `created_at`.
- `venta_items` — `id`, `venta_id`, `producto_id`, `cantidad`, `precio_unitario`, `subtotal`, `created_at`.
- `gastos_imprevistos` — `id`, `evento_id`, `monto`, `motivo`, `categoria`, `created_at`.
- `cierres_caja` — `id`, `evento_id`, `fecha_cierre`, `total_ventas`, `total_gastos_fijos`, `total_gastos_imprevistos`, `utilidad_bruta`, `efectivo_esperado`, `efectivo_real`, `diferencia`, `notas`, `created_at`.

Each table gets `Row`, `Insert`, `Update` (partial of Insert), and `Relationships` (foreign keys). The hand-rolled pattern matches the catalog's 3-table and events' 3-table shapes.

`pnpm typecheck` MUST pass. `pnpm test` covers at least one `supabase.from('ventas')` integration test to catch column-name mismatches at runtime.

### `src/types/pos.types.ts` (new)

Spanish domain types that mirror the SQL columns 1:1 (same convention as `catalog.types.ts` and `events.types.ts`):

```ts
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
export type CategoriaImprevisto =
  | 'insumos_extra' | 'transporte' | 'reparacion' | 'propina' | 'otro'

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
  fecha: string
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
export interface VentaConItems extends Venta { items: VentaItem[] }

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

// Pure-function shapes (NOT SQL rows)
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

`ServiceError` is reused from `catalog.types.ts` (already exported via `src/types/index.ts`).

---

## 17. Test Strategy (strict TDD — RED-GREEN-REFACTOR)

### Forecast: ~80 new tests

| Layer | Count | Examples |
|---|---|---|
| Unit (no Vue / Pinia / Supabase) | ~28 | `useVentas.spec.ts`: cart math (8 edge cases). `useCierreCaja.spec.ts`: cierre math (8 edge cases). `cierre.spec.ts`: `formatearDiferencia` (3 cases). 4 service specs (16 tests). |
| Integration (services + Pinia + mocked Supabase) | ~16 | 4 stores × ~4 actions (incl. cart state machine, EVENTO_CERRADO guard, UNIQUE cierre handling). |
| Component (`mount` + real Pinia + real Vuetify + mocked service) | ~24 | 8 component specs (cards, grid, panel, dialog, form, list-item, card). 2 view specs. |
| Routes + RecetaDetalleView delta | ~4 | `routes.spec.ts` (+2); `RecetaDetalleView.spec.ts` (+2). |
| **Total** | **~80** | Foundation ~4 + catalog ~60 + events ~60 + pos ~80 = cumulative ~204. `pnpm test` runtime target stays ≤12 s (events is ~7 s; +80 tests should fit in +5 s with jsdom). |

### Cart state machine edge cases (each MUST have a unit test)

| # | Case | Expected |
|---|---|---|
| 1 | Add same producto twice | ONE cart line with `cantidad = 2` (not two rows). |
| 2 | Add producto A, then click `−` until qty = 0 | Line removed from cart. |
| 3 | Cart with 3 lines, click "Vaciar" | Cart = []. |
| 4 | `actualizarCantidad(linea, 0)` | Line removed (defensive). |
| 5 | `actualizarCantidad(linea, -1)` | Throws or rejects (UI disables negative buttons; service is defensive). |
| 6 | `actualizarCantidad(linea, 1.5)` | Accepts decimal; recalculates subtotal. |
| 7 | Cart has 3 items totaling $15.75; user clicks "Registrar venta" → service fails | Toast in Spanish, cart restored, optimistic update reverted. |
| 8 | Cart with 1 item, producto's `disponible` flips to false mid-session | The cart line is still valid (it's a snapshot); warning shown on next `agregarAlCarrito` for that producto. |

### POS view edge cases (each MUST have a unit test)

| # | Case | Expected |
|---|---|---|
| 1 | User opens `/pos`, no evento en_curso | Show event picker ("Activar evento" or "Crear evento"). |
| 2 | User opens `/pos`, evento `en_curso` exists | Show grid + cart + gastos imprevistos section. |
| 3 | User opens `/pos`, evento `cerrado` exists | Show "Este evento está cerrado" + read-only sales history. |
| 4 | User opens `/pos/cierre/:eventoId` for evento `en_curso` | Show cierre view with form. |
| 5 | User opens `/pos/cierre/:eventoId` for evento `planificacion` | Show "El evento aún no empezó" message. |
| 6 | User opens `/pos/cierre/:eventoId` for evento `cerrado` AND cierre exists | Show read-only cierre card. |
| 7 | User opens `/pos/cierre/:eventoId` for evento `cerrado` AND NO cierre exists | Show "No hay cierre registrado" + retro-active form. |

### Supabase mock pattern (no changes to `tests/setup.ts`)

The chainable mock is already generic (it doesn't care about table names). POS tests import `__resetSupabaseMock` and `__pushSupabaseResponse` from `tests/setup.ts` exactly like the catalog and events tests do.

### TDD discipline (same as catalog + events)

- For every new file, the spec file is the **first commit of the PR**, the implementation is the second commit.
- PR reviewer's diff shows: (1) failing test, (2) passing implementation.
- `pnpm test` MUST be in the verify gate (already in `openspec/config.yaml` after catalog PR1).
- New test fixtures: a tiny `src/__fixtures__/pos.ts` (or co-located factory functions in each spec file) that builds `Producto`, `Venta`, `VentaItem`, `GastoImprevisto`, `CierreCaja` instances. The chainable Supabase mock receives the fixtures via `__pushSupabaseResponse`.

---

## 18. Delivery Plan (5 chained PRs, stacked-to-main)

`chain_strategy`: stacked-to-main (matches foundation + catalog + events). `delivery_strategy`: ask-always (preflight default). Total forecast: ~2,000 lines — exceeds 400-line review budget; chained PRs are MANDATORY.

| PR | Scope | Approx lines | Budget risk |
|---|---|---|---|
| **PR1 — Schema + state machine guards + cierre pure math** | SQL migration + `dev_bypass_rls.sql` extension + `docs/pos-setup.md` + `pos.types.ts` + hand-rolled `Database` extension + `src/utils/cierre.ts` + `src/composables/useCierreCaja.ts` (composable + pure function) + 3 specs (cierre, useCierreCaja, types snapshot). | ~450 | Medium (just over — recommend F2 split: PR1a schema+types ~220, PR1b utils+composable+specs ~230; or accept `size:exception`). |
| **PR2 — Productos + ventas services+stores (F2a)** | `productos.service.ts` + `productos.store.ts` + `useProductos.ts` + `ventas.service.ts` + `ventas.store.ts` + `useVentas.ts` + 6 specs (2 service + 2 store + 2 composable). | ~320 | Low (under budget). |
| **PR3 — POS components + views (F2b from PR2)** | `ProductoCard.vue` + `ProductoGrid.vue` + `CarritoPanel.vue` + `VentaItem.vue` + `RegistrarVentaDialog.vue` + `PosView.vue` + 7 specs (5 component + 2 view) + cross-slice `RecetaDetalleView` modification. | ~480 | Medium (just over — F2 split if reviewer flags). |
| **PR4 — Imprevistos + cierre services+stores+components+views** | `gastosImprevistos.service.ts` + `gastosImprevistos.store.ts` + `useGastosImprevistos.ts` + `cierres.service.ts` + `cierres.store.ts` + `GastoImprevistoForm.vue` + `GastoImprevistoListItem.vue` + `CierreResumenCard.vue` + `PosCierreView.vue` + 7 specs. | ~430 | Medium (just over — F2 split optional). |
| **PR5 — Router + docs + final verify** | Router modifications (2 lazy routes) + `routes.spec.ts` update + final `verify-report.md` + final docs polish. | ~100 | Low. |

**Recommendation for `sdd-tasks`**: PR1 MUST stay under 400 if possible (F2 split: PR1a schema+types ~220 lines, PR1b utils+composable ~230). PR3 is the largest component PR; if it exceeds 400, F2 split it (PR3a: components, PR3b: view + RecetaDetalleView modification). The foundation's F2 precedent (splitting Vuetify plugin from PR1 into PR2) and the catalog's + events' F2 precedents are the templates.

**Per-PR acceptance**: each PR has a clear start, clear finish, autonomous scope, verification (`pnpm typecheck && pnpm lint && pnpm test`), and reasonable rollback (`git revert <sha>` or `git reset --hard HEAD~1` before push).

---

## 19. Risks (8-10)

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Cart state lost on browser refresh** — carrito lives in `ventas.store` (in-memory). A refresh loses unsaved ventas. | Medium | v1 documents this in `docs/pos-setup.md` ("Las ventas sin registrar se pierden al refrescar"). The `offline-sync` slice will add WAL persistence via `LocalforageStorageService` + `IStorageService`. |
| 2 | **`registrarVenta` partial failure** (venta inserted, item fails) | Medium | Service returns the first item error; store reverts optimistic update and restores cart. UI shows red toast with the item that failed. User retries — duplicate venta is a known issue (documented; v1 tolerates it). |
| 3 | **No `user_id` on ventas** — anyone with the anon key could see/modify all ventas in dev. | High | Documented as a dev-only issue; `auth-flow` slice adds the column + RLS policies. v1 does NOT add the column (would break the snapshot pattern). |
| 4 | **400-line budget consistently exceeded** — events had 3/5 PRs with `size:exception`; POS forecasts the same. | High | F2 splits in PR1, PR3 are pre-planned. `delivery_strategy: ask-always` lets the user override. |
| 5 | **`producto.precio_venta` snapshot vs current price** — historical sales don't update if menu price changes. | Locked (intentional) | Snapshot is the source of truth for cierres + analytics. The product's `precio_venta` only affects FUTURE sales. |
| 6 | **`cierres_caja` retroactive creation** — if a user navigates to `/pos/cierre/:eventoId` for a `cerrado` evento with no cierre, the form is shown. This relaxes the "frozen on cerrado" pattern. | Low | Documented in §10. Rationale: `cierres_caja` is meta-data about the evento, not a mutation. The events precedent (CASCADE on delete) means adding a cierre post-cerrado is safe. |
| 7 | **Cross-slice `RecetaDetalleView` modification** — the catalog view gains a POS-domain button. Reviewer might flag "scope creep". | Low | Documented in both exploration and proposal. The button is 1 line + 1 dialog + 2 tests; the alternative (a separate Productos CRUD view) would inflate the slice by 1+ PR. |
| 8 | **`productos.disponible = false` mid-cart** — user adds a producto, then toggles it off (somewhere else in the app). | Locked out | v1 has no Productos CRUD view; `disponible` is set at creation time. A future Productos CRUD view (out of scope v1) can toggle this. The cart state-machine test #8 covers the defensive case. |
| 9 | **Service `registrarVenta` is NOT a Supabase RPC** — it's a chain of two inserts in the service. A future "atomic venta" RPC would be a 1-line change. | Low | The service interface stays the same (`registrarVenta` returns `{ data, error }`); the implementation swaps to RPC. v1 ships the simple chain; RPC is a v2 enhancement. |
| 10 | **Online-status chip is informational only** — sales are NOT blocked when offline in v1. A user might think their ventas are lost. | Low | The chip is labeled clearly ("Sin conexión — ventas se guardarán al reconectar"). The cart still works locally; the toast on failure is explicit. The `offline-sync` slice will change this to "queue + drain" semantics. |

---

## 20. Gaps from Brief (locked decisions)

| # | Gap | Decision |
|---|---|---|
| 1 | Brief says "decrements stock?" — but no stock column on `materias_primas`. | **v1: no stock decrement.** Stock-aware validation is a future slice. |
| 2 | Brief's Phase 5 (offline sync, item 20) — do we implement WAL here? | **No.** POS v1 is online-only. `offline-sync` slice owns the WAL + queue + custom SW. POS ships `// TODO(offline-sync):`. |
| 3 | Brief says "cierre de caja diario" — end of day or end of evento? | **End of evento** (single-day v1, events decision). One cierre per evento. |
| 4 | Brief says `metodo_pago` — which methods? | **4 values: efectivo, transferencia, tarjeta, mixto.** Locked enum. |
| 5 | Brief doesn't say "with 5% merma" for sales. | **No merma on sales.** Merma is a production/cost concern. Sales record the charged price. |
| 6 | Brief doesn't define "propina" or "imprevistos categorias". | **5-value enum**: insumos_extra, transporte, reparacion, propina, otro. The `motivo` text field is the source of truth for what happened. |
| 7 | Brief doesn't say "if evento is cerrado, can you still create a cierre?" | **Yes** (if no cierre exists). The cierre is a snapshot, not a mutation. The events `cerrado` freeze applies to gastos_fijos + plan_produccion + ventas (not cierres_caja). |
| 8 | Brief says "register a sale" — what about refunds/corrections? | **v1: no refunds.** A wrong sale is handled by registering a corrective venta. Negative-quantity venta_items blocked by `cantidad > 0` CHECK. A future "Reembolso" slice adds the refund flow. |
| 9 | Brief doesn't address "what if a producto is deleted while it has sale history?". | **`venta_items.producto_id` is RESTRICT** — cannot delete a producto with sales. The FK protects history. |
| 10 | Brief says "notas" on the cierre — what fields beyond free text? | **`notas` (text, optional) + 4 numeric snapshot columns + 2 optional cash-count columns + diferencia**. No `comentarios_por_seccion`, no per-metodo_pago notes. |

---

## 21. Acceptance Criteria (checkable list — "done" for pos)

- [ ] All 5 chained PRs (or 6-7 if PR1/PR3 F2-split) merged to `main`, in order, stacked.
- [ ] `pnpm install` completes without peer-dep errors.
- [ ] `pnpm dev` renders `/pos` and `/pos/cierre/:eventoId` (and the home view still works).
- [ ] `pnpm typecheck` passes with `strict: true`.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` runs ~80 new tests (foundation ~4 + catalog ~60 + events ~60 + pos ~80 = cumulative ~204) and ALL pass. Chainable Supabase mock is reused as-is from `tests/setup.ts`.
- [ ] `pnpm build` produces `dist/` with PWA artifacts.
- [ ] The pos migration SQL + extended `dev_bypass_rls.sql` run successfully in a fresh Supabase project via the Dashboard SQL editor.
- [ ] End-to-end happy path: create a producto from a recipe → open `/pos` with an evento en_curso → click 3 product cards to build a cart → click "Registrar venta" → pick `metodo_pago: efectivo` → confirm → cart clears + green toast + venta appears in "Ventas de hoy".
- [ ] Optimistic UI revert: simulate a Supabase failure on `registrarVenta` → cart is restored + red toast in Spanish.
- [ ] Daily close: open `/pos/cierre/:eventoId` for an evento en_curso → see ventas + gastos + utilidad → enter `efectivo_esperado` + `efectivo_real` → click "Registrar cierre" → confirm dialog → redirect to `/eventos/:id` with `estado === 'cerrado'`.
- [ ] Yellow `v-alert` shows on `CierreResumenCard` when `diferencia !== 0` ("Sobrante $X" / "Faltante $X").
- [ ] Frozen-on-`cerrado` enforced: an evento in `cerrado` rejects new ventas and new imprevistos with `ServiceError { code: 'EVENTO_CERRADO' }`; the "Agregar al carrito" button is hidden in the view.
- [ ] State machine: invalid transitions (e.g., trying to close a `planificacion` evento directly without going through `en_curso`) return `ServiceError { code: 'TRANSICION_INVALIDA' }`.
- [ ] `calcularCierre` covers all 8 edge cases: empty ventas, empty gastos, mixed metodo_pago, diferencia positive/negative/zero, diferencia NULL when either cash field is NULL, float-drift round-up.
- [ ] Cart state machine covers all 8 edge cases from §17: merge on duplicate add, qty=0 removal, "Vaciar", defensive qty=0/-1, decimal qty, optimistic revert on failure, mid-session `disponible` flip.
- [ ] Cross-slice `RecetaDetalleView` modification: 2 new tests pass — "Vender esta receta button is visible when no producto exists" + "Clicking the button opens the dialog and creating a producto hides the button".
- [ ] Online-status chip shows "En línea" / "Sin conexión" from `useOnlineStatus()` (informational only, never blocks sales in v1) AND the `// TODO(offline-sync):` marker exists at the `registrarVenta` line for the future slice.
- [ ] No `user_id` column on any of the 5 new tables; no `stock_actual` / `unidades_disponibles` / `unidades_vendidas` columns (no stock tracking in v1).
- [ ] No `expected_units_sold` / per-unit projection; no receipts/printing/PDF; no refunds/corrective ventas flow (all explicitly out of scope v1; covered by future analytics, reports, and Reembolso slices).
- [ ] `metodo_pago` enum locked to 4 values (`efectivo`, `transferencia`, `tarjeta`, `mixto`); `categoria_imprevisto` enum locked to 5 values (`insumos_extra`, `transporte`, `reparacion`, `propina`, `otro`).
- [ ] `productos.precio_venta` and `venta_items.precio_unitario` are decoupled snapshots (changing `producto.precio_venta` does NOT change historical `venta_items.precio_unitario`).
- [ ] `gastos_imprevistos` and `gastos_fijos` are on separate tables; `calcularProyeccion` (events) still works unchanged with no `gastos_imprevistos` reads.
- [ ] `dev_bypass_rls.sql` has a loud dev-only header comment naming `auth-flow` as the removal slice, AND the pos PR extends it with 5 new `grant` lines.
- [ ] All `.vue` files ≤ 200 lines; all functions ≤ 30 lines; all comments are "why" only.
- [ ] Spanish identifiers for business terms (`Producto`, `Venta`, `VentaItem`, `CierreCaja`, `GastoImprevisto`, `calcularCierre`, `agregarAlCarrito`, `registrarVenta`); English for infrastructure (`ventas.service.ts`, `productos.service.ts`, `useVentas`); all UI text in Spanish.
- [ ] No Options API, no Vuex, no Axios, no Bootstrap, no jQuery; no new entries in `package.json` (verifiable via `git diff main -- package.json`); `src/types/database.types.ts` has the 5 new tables in the hand-rolled `Database` interface plus a TODO comment block explaining CLI regeneration.
- [ ] `RecetaDetalleView.vue` is the ONLY cross-slice modification; no other catalog or events file is modified (proof of additive change).

---

## 22. Non-Goals (scope-creep guard)

- **No login UI, no sign-up, no password recovery, no session UI.** `useAuth()` stays stubbed.
- **No multi-user support.** Single-user assumption holds.
- **No stock / inventory tracking** (no `stock_actual`, no `unidades_disponibles`, no `unidades_vendidas`).
- **No multi-day eventos** — single-day events decision (events slice, locked).
- **No offline sync, no WAL, no queue, no custom service worker `sync` handler.** POS v1 is online-only.
- **No `user_id` columns on ventas / venta_items / cierres_caja** — auth-flow owns it.
- **No merma surcharge on sales** — `redondearParaMermas` ships as utility but is not wired.
- **No receipts / printing** — no PDF, no thermal printer integration, no ticket generation.
- **No refunds / corrections** — ventas are append-only.
- **No customer data** — no `cliente_id`, no `cliente_nombre`, no CRM.
- **No product variants** — one producto per receta, one price.
- **No barcode scanner** — the grid is click-driven.
- **No `expected_units_sold` / `costo_por_unidad` projection** — per-unit is for analytics.
- **No transactions (RPC) for `registrarVenta`** — chain of inserts in v1; future RPC.
- **No notifications / reminders / browser notifications** on state changes.
- **No export** — no jsPDF, no CSV, no share link. `reports` slice owns exports.
- **No bulk import** — no CSV / Excel import of productos or ventas.
- **No image attachments** — no `foto_url`, no thumbnail upload (placeholder letter in v1).
- **No drag-to-reorder on the grid** — products ordered by `producto.orden ASC, producto.created_at ASC`.
- **No CI / `gen:types`** — hand-rolled `Database` extension stays.
- **No dark theme.** No i18n (Spanish hardcoded).
- **No new entries in `package.json`.**

---

## 23. Future Work (depends on pos)

| Slice | What it consumes from pos | What it adds |
|---|---|---|
| **`analytics`** (Phase 5, items 18–19) | `ventas` + `venta_items` + `cierres_caja` tables. `metodo_pago` breakdown. `utilidad_bruta` per evento. | Dashboard with chart.js + vue-chartjs: sales over time, top productos, profit-vs-cost per evento, per-receta cost heatmap. |
| **`reports`** (Phase 5, items 18–19) | `cierres_caja` snapshots; `ventas` history. | PDF export of cierres with jsPDF; CSV export of ventas table. |
| **`auth-flow`** | RLS-enabled tables, extended `dev_bypass_rls.sql` to remove. Login UI required before sales can be tracked. | Login UI, Supabase Auth wiring, real session, removal of dev bypass, `user_id` column on ventas + RLS. |
| **`offline-sync`** (Phase 5, item 20) | The `// TODO(offline-sync):` marker in `ventas.store.registrarVenta`. The `IStorageService` LSP from foundation. | WAL in localforage, `sync.queue.store.ts`, `sync.service.ts`, custom SW `sync` handler, `useSyncStatus`. |
| **`ci-setup`** | `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm build`. | GitHub Actions workflow, `supabase` CLI install, `gen:types` prebuild hook. |
| **`productos-crud`** (future) | The `productos` table + `productos.service.ts`. | Dedicated Productos view (`/productos`) for managing precios, orden, `disponible` toggle, photo upload. Replaces the `RecetaDetalleView` button as the primary create path. |
| **`stock-tracking`** (future) | `ventas` + `venta_items`. | `stock_actual` column on `materias_primas` + stock-aware production plan + low-stock warnings on the POS grid. |
| **`reembolsos`** (future) | `ventas` + `venta_items`. | Refund flow (negative-quantity venta_items or a separate `reembolsos` table), `metodo_pago` reversal. |
| **`receipts`** (future) | `ventas` + `cierres_caja`. | PDF receipt per venta (jsPDF), thermal printer integration, `notas_impresas` column. |

---

## 24. References

- **`brief.md`** — source PRD (locked, 469 lines). §7 Phase 4 items 14–17 define pos scope.
- **`openspec/changes/pos/exploration.md`** — exploration artifact. **Every locked decision above is sourced from this file** — read it before questioning a decision.
- **`openspec/changes/archive/2026-06-18-events/`** — events proposal/spec/design/tasks/archive-report (the patterns pos follows: state machine integration, `useProyeccionCostos`, `transicionEstadoValida` + `estadoEsEditable`, the `dev_bypass_rls.sql` extension lifecycle).
- **`openspec/changes/archive/2026-06-17-catalog/`** — catalog proposal/spec/design/tasks/archive-report (the patterns pos follows: `calcularCostoReceta` for the cost tooltip, `redondearCentavos` for money math, the chainable Supabase mock).
- **`openspec/changes/archive/2026-06-16-foundation/`** — foundation proposal/spec/design/tasks/archive-report (the DI + types + supabase mock patterns pos inherits; `IStorageService` LSP for the offline-sync integration point; `useOnlineStatus()` for the chip).
- **`openspec/specs/foundation/spec.md`** — source of truth for the foundation API surface.
- **`openspec/specs/catalog/spec.md`** — source of truth for the catalog primitives (the recipe detail view the cross-slice button lives on).
- **`openspec/specs/events/spec.md`** — source of truth for the events primitives pos consumes.
- **`openspec/config.yaml`** — project SDD config (no changes needed for pos; already aligned by catalog PR1 + events).
- **Engram observations**:
  - `sdd/foundation/*` — full foundation context.
  - `sdd/catalog/*` — full catalog context.
  - `sdd/events/*` — full events context (the immediate precedent for state machine integration and multi-table composition).
  - `sdd/kilo-lima/testing-capabilities` — strict TDD ENABLED.
  - `conventions/kilo-lima` — locked naming conventions, file structure, line limits.
  - `sdd/pos/explore` — exploration summary for cross-session recovery.
- **Skill files**:
  - `~/.config/opencode/skills/sdd-propose/SKILL.md` — this phase.
  - `~/.config/opencode/skills/sdd-spec/SKILL.md` — next phase (reads this proposal's Capabilities).
  - `~/.config/opencode/skills/sdd-design/SKILL.md` — next phase (reads this proposal's Approach + Data Model + Sale Flow).
  - `~/.config/opencode/skills/sdd-tasks/SKILL.md` — next phase (refines the PR split in §18, decides on F2 splits for PR1 + PR3).
  - `~/.config/opencode/skills/chained-pr/SKILL.md` — chained-PR strategy.
  - `~/.config/opencode/skills/work-unit-commits/SKILL.md` — commit splitting for the chained PRs.
  - `~/.config/opencode/skills/judgment-day/SKILL.md` — dual review of spec + design.

---

## Capabilities (CONTRACT for sdd-spec)

The sdd-spec phase creates delta specs for each capability below. New capabilities → `openspec/changes/pos/specs/<name>/spec.md`. Modified capabilities → delta spec against `openspec/specs/<name>/spec.md`.

### New Capabilities

- **`pos-productos`**: Commercial wrapper around `recetas`. CRUD + list over `productos` with FK to `recetas`, `precio_venta > 0`, `disponible` toggle, `orden` integer. UNIQUE `(receta_id)` enforces one producto per receta. Hot-path index `(disponible, orden)` for the POS grid query. Reused by `RecetaDetalleView`'s "Vender esta receta" button (cross-slice touch, 1 button + 1 dialog).
- **`pos-ventas`**: Append-only sales ledger. CRUD + `registrarVenta` for `ventas` + `venta_items`. Snapshots `precio_unitario` + `subtotal` at write time (inversion of catalog's compute-on-read pattern). 4-value `metodo_pago` enum. Decimal `cantidad` (numeric(10,4)). FKs: `ventas.evento_id` RESTRICT, `venta_items.venta_id` CASCADE, `venta_items.producto_id` RESTRICT. Frozen on `cerrado` via `estadoEsEditable`.
- **`pos-gastos-imprevistos`**: Per-evento `gastos_imprevistos` rows (separate table from `gastos_fijos`). CRUD + list. 5-value optional `categoria` enum. `monto > 0` validation. `motivo` non-empty, max 500 chars. FK `evento_id` CASCADE. Frozen on `cerrado` via `estadoEsEditable`. Section inside `PosView` (collapsible on desktop, tab on mobile).
- **`pos-cierre-caja`**: Daily close snapshot. CRUD + `registrarCierre` over `cierres_caja`. UNIQUE `(evento_id)` enforces one cierre per evento. Snapshots `total_ventas`, `total_gastos_fijos`, `total_gastos_imprevistos`, `utilidad_bruta` at cierre time. NULLABLE `efectivo_esperado` + `efectivo_real` + `diferencia` for optional cash-count. Drives `en_curso → cerrado` state transition via `transicionEstadoValida`. Retroactive cierre creation allowed for `cerrado` eventos without a cierre row.
- **`pos-cart`**: In-memory `carrito` ref in `ventas.store`. Cart state machine: `agregarAlCarrito` (merge on duplicate), `actualizarCantidad` (qty=0 removes), `quitarDelCarrito`, `vaciarCarrito`. `calcularResumenCarrito(lineas)` pure function for subtotal + total. Optimistic UI on `registrarVenta` with revert-on-failure. `// TODO(offline-sync):` marker on the `registrarVenta` line.
- **`pos-cierre-math`**: Pure function `calcularCierre(ventas, gastosFijos, gastosImprevistos, efectivoEsperado, efectivoReal)` + `formatearDiferencia(monto)` helper. Output: `{ totalVentas, totalGastosFijos, totalGastosImprevistos, utilidadBruta, diferencia, ventasPorMetodoPago, cantidadVentas }`. 8 edge cases: empty ventas, empty gastos, mixed metodo_pago, diferencia positive/negative/zero, diferencia NULL when either cash field NULL, float-drift round-up. Reuses catalog's `redondearCentavos`.

### Modified Capabilities

- **None at spec level.** POS does NOT modify any foundation, catalog, or events requirement. The cross-slice `RecetaDetalleView` modification is a **UI touch** (1 button + 1 dialog + 2 tests) — it adds a visual element but does not change the catalog spec's requirements (recetas CRUD remains the catalog domain; the button is a UX bridge to the pos domain). If `sdd-spec` decides this constitutes a spec-level modification, it can produce a delta spec against `catalog/spec.md` for the `recetas-detalle-view` requirement.

---

## Rollback Plan

POS is 5 chained PRs (or 6-7 with F2 splits) merged to `main`. Each PR is independently revertable via `git revert <sha>` (if pushed) or `git reset --hard HEAD~1` (if not yet pushed). The `supabase` migration is reversible: the apply phase documents a one-shot `down` SQL (`drop table cierres_caja, gastos_imprevistos, venta_items, ventas, productos cascade;`) the user runs manually via the Dashboard SQL editor if needed. The `dev_bypass_rls.sql` extension is a forward-only add and can be left in place (the `auth-flow` slice removes the entire bypass later) or removed via the Dashboard. The 2 new lazy routes are additive; removing them is a one-line edit per route. The `RecetaDetalleView` modification is a 30-line delta; reverting the file to the catalog-only version is a single `git checkout main -- src/views/RecetaDetalleView.vue`.

---

## Key Learnings

- **POS is the first transactional domain in kilo-lima.** Catalog is CRUD with explicit save buttons; events is planning with read-only calc. POS appends ventas to a ledger and clears an in-memory cart, with optimistic UI + revert-on-failure. This is the first slice where the brief's "feedback inmediato y emocional" (§2.1) shows up in the UI.
- **The Producto vs Receta decision is the single most important architectural call.** Adding `precio_venta` to `recetas` would conflate "cost" with "sale price" with "availability". A separate `productos` table is the clean separation: catalog owns the recipe (cookable thing), POS owns the producto (commercial wrapper). The cross-slice "Vender esta receta" button is the bridge.
- **Ventas snapshot price at write time; recetas compute cost on read.** Two opposing patterns in the same codebase, each correct for its domain: where catalogs DERIVE (cost = f(current ingredient prices)) to stay fresh, ventas SNAPSHOT (precio_unitario = value at sale time) to stay honest. Cierres and analytics consume the snapshot.
- **Cart state lives in Pinia, not `IStorageService`.** v1 is online-only (the brief's Phase 5 offline promise is its own slice). The cart is in-memory; a browser refresh loses unsaved ventas. The TODO marker in `ventas.store.registrarVenta` is the integration point for `offline-sync`.
- **`cierres_caja` is a snapshot row, NOT a computed view.** Once a day is closed, it's closed. The `utilidad_bruta` is frozen at cierre time; if ventas are added later (shouldn't happen — the evento is `cerrado`), the cierre stays accurate to its day. This trades freshness for honesty.
- **POS drives the state machine forward for the first time.** Events locked the machine; POS is the consumer that triggers `en_curso → cerrado` (via `useCierreCaja.registrarCierre`). The same `transicionEstadoValida` + `estadoEsEditable` helpers from events are the single source of truth for the guards.
- **Gastos imprevistos is a separate table from gastos fijos.** Mixing them would corrupt `calcularProyeccion`'s math (events expects `gastos_fijos` to be a known input). The separation preserves the cost-projection projection invariant and makes cierres math cleaner.
- **The cross-slice `RecetaDetalleView` button is the FIRST multi-domain touch in kilo-lima.** It deserves explicit documentation in the proposal. The alternative (a Productos CRUD view) would inflate the slice by 1+ PR; the inline button is KISS.
- **The 2,000-line forecast still exceeds the 400-line review budget.** 5 PRs with F2 splits pre-planned for PR1 + PR3 (events precedent: PR2a/PR2b F2 split absorbed cleanly; PR3a/PR3b will follow the same pattern). The 400-line budget is consistently exceeded in multi-domain slices; consider a 500-line budget for state-machine + transactional domains in future slices.
- **The `// TODO(offline-sync):` marker is a contract with future slices.** POS v1 explicitly defers the WAL; the `offline-sync` slice's first task is "find the marker and insert the queue.guardar call". This is the same pattern foundation used for `docs/offline-sync.md` — document intent now, implement later.
- **Single-user + no auth = no `user_id` columns.** `useAuth()` is still a stub. POS does NOT add `user_id` to ventas (would break the snapshot pattern + introduce migration debt for the auth-flow slice). When auth-flow lands, it adds the column + RLS in one PR.
- **Optimistic UI is the first slice where it matters.** Catalog + events are CRUD with explicit save buttons; POS is the first slice where every interaction must feel instant. The revert-on-failure pattern in `ventas.store.registrarVenta` is the new architectural pattern; the `offline-sync` slice will refine it to "queue + drain" semantics.
