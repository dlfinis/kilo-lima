# Proposal: `finanzas-evento` — Financial Tracing, Margin Pricing & Post-Event Reports

> **Change**: `finanzas-evento` | **Phase**: `sdd-propose` → feeds `sdd-spec`, `sdd-design`, `sdd-tasks`
> **Source analysis**: Engram observations `#504` (architecture plan), `#505` (layer-by-layer spec), `#506` (gotchas)
> **User-reported pain (in scope, 3)**: (A) `utilidadBruta` formula ignores COGS — financial closure is wrong today; (B) no margin configurability — pricing is a manual spreadsheet exercise; (C) post-evento phase card is `disabled` — there is no way to read what happened after closing the caja
> **Artifact store mode**: `both` (filesystem + Engram)
> **Delivery**: **1 SDD cycle → 2 apply phases** (Fase 1 = multi-day + cierre corregido; Fase 2 = pricing configurable + reportes + UI nueva). Each phase is ≤ 400 prod lines. See §10.
> **Strict TDD**: `strict_tdd: true` (project invariant). Every `.ts` ships a `.spec.ts` first; every new `.vue` ships a `.spec.ts`.
> **Project state**: `foundation` + `catalog` + `events` + `pos` + `ux-improvements` are ARCHIVED (all green). This change **modifies** `events`, `pos`, and `home`, and introduces **two new capabilities**: `pricing-evento` and `reporte-evento`.

---

## 1. Summary

Kilo-lima currently closes a caja with `utilidadBruta = ventas − gastosFijos − gastosImprevistos` — a formula that ignores the cost of goods sold (COGS), making every "profit" reading systematically wrong by the amount the operator spent on ingredients and packaging. This change introduces **per-evento pricing with configurable margin** (precio = costo / (1 − margen)), **snapshots COGS at sale time** so historical reports stay stable, **multi-day eventos** (`fecha_inicio` + `fecha_fin`), a **corrected cierre** (`utilidadBruta = ventas − COGS`, `utilidadNeta = utilidadBruta − gastosOp`), and **post-evento reports** broken down by day and by product. The POS only shows products the operator explicitly selects for the evento, never the whole catalog. Closed eventos are immutable snapshots — reports are available immediately after closure, and no further ventas can be registered against them.

## 2. Motivation

Three concrete problems force this change now:

| # | Problem | Why it matters | Where it lives today |
|---|---|---|---|
| **A** | **Cierre reports lie.** `utilidadBruta` subtracts `gastosFijos` + `gastosImprevistos` from ventas but **never subtracts the cost of what was sold**. An operator who sells 100 units at $5 each ($500 ventas), paid $2 per unit in ingredients ($200 COGS), and has $50 in gastos fijos is told `utilidadBruta = $450` when real gross profit is $300. This breaks financial trust — the operator cannot tell which eventos are actually profitable. | The cierre is the only place where "did I make money?" gets answered. A wrong answer is worse than no answer. | `src/utils/cierre.ts:33`, REQ-POS-31 |
| **B** | **No margin concept.** Today `producto.precio_venta` is a hand-typed number set when the producto is created. If the operator wants a 40% margin they must do the math offline. If the costo de la receta changes (because an ingredient price moved), the selling price does not follow. | Pricing decisions are the operator's #1 lever for profitability. Today the system treats price as data, not as a derived value tied to cost + policy. | `src/types/pos.types.ts` `Producto.precio_venta`, `src/views/ProductosView.vue` |
| **C** | **No traceability of "what margin did I actually achieve".** `venta_items` records `precio_unitario` but never `costo_unitario` or `margen_aplicado`. After 100 ventas, the operator has zero insight into whether the assumed margin matched reality (e.g., shrinkage, rounding, missed ingredient updates). | Sales-vs-target analysis is impossible without historical COGS snapshots. | `src/types/pos.types.ts` `VentaItem` |
| **D** | **Events are single-day.** `eventos.fecha` is one date. Real ferias are multi-day (e.g., "Feria Navideña, 18–22 diciembre"). The current model forces the operator to create one evento per day, losing the unified financial picture. | The real-world shape of a feria does not fit the data model. | `supabase/migrations/20260618000000_events_inicial.sql` |
| **E** | **Post-evento card is disabled.** After cierre, the operator has nowhere to read what happened. The brief §2.1 explicitly calls out the "post-evento (analysis)" phase as part of the 3-phase UX flow. Today it is dead. | Brief §3.1 says "flujo guiado, sin pantallas muertas". The post-evento phase is the most-dead screen in the app. | `src/views/HomeView.vue` (post-evento card `disabled`) |

The change addresses all five. **Fase 1** solves A + D (the two that touch the closure math and the events schema); **Fase 2** solves B + C + E (the pricing model + the COGS snapshot + the new reports + the post-evento home card).

## 3. Scope

### 3.1 In-scope (concrete deliverables, ordered by layer)

| # | Layer | Deliverable | Single Responsibility |
|---|---|---|---|
| 1 | **Migration** | `supabase/migrations/20260620000000_finanzas_evento.sql` | 5 DDL changes: `eventos.fecha_inicio` + `eventos.fecha_fin` (rename `fecha`), new `evento_productos` table, `venta_items.costo_unitario` + `venta_items.margen_aplicado` + `venta_items.evento_producto_id`, `cierres_caja.total_cogs` + `total_utilidad_bruta` + `total_utilidad_neta`. |
| 2 | **Types** | `src/types/evento_productos.types.ts` | `EventoProducto`, `EventoProductoConDetalle`, `CrearEventoProductoInput`, `ActualizarMargenInput`. View model that assembles 4 sources. |
| 3 | **Utils** | `src/utils/pricing.ts` | Pure: `calcularPrecioPorMargen(costo, margen)` + `calcularMargenReal(precioVenta, costo)`. `redondearCentavos` only at the end. |
| 4 | **Utils** | `src/utils/cierre.ts` (MODIFY) | Correct formula: `utilidadBruta = ventas − COGS`, `utilidadNeta = utilidadBruta − gastosOp`. Add `desglosePorDia`, `desglosePorProducto`, `totalCogs`. Backward-compatible: missing `costo_unitario` → COGS=0 for that item (legacy data). |
| 5 | **Service** | `src/services/eventoProductos.service.ts` | CRUD on `evento_productos`. Factory function, never throws, returns `{ data, error }`. `inicializarDesdeCatalogo(eventoId, margenDefault)` helper that copies every receta-derived producto. |
| 6 | **Store** | `src/stores/eventoProductos.store.ts` | Pinia: `eventoProductos: Map<eventoId, EventoProducto[]>`, `cargarParaEvento(eventoId)`, `actualizarMargen(eventoProductoId, margen)`. |
| 7 | **Composable** | `src/composables/usePreciosEvento.ts` | Reads `eventoProductos.store`, exposes `precioParaProducto(eventoId, productoId)`, `margenParaProducto(eventoId, productoId)`. POS calls this instead of reading `producto.precio_venta` directly. |
| 8 | **Composable** | `src/composables/useProyeccionCostos.ts` (MODIFY) | Extend `calcularProyeccion` to include `margenEsperado` per producto and `ingresoProyectado = costo / (1 − margen)`. Existing fields preserved. |
| 9 | **Composable** | `src/composables/useReporteEvento.ts` | Read-only aggregation: `reportePorDia(eventoId)`, `reportePorProducto(eventoId)`. Reads from `eventoProductos`, `ventas`, `cierresCaja` stores. Returns `ReportePorDia[]` / `ReportePorProducto[]`. |
| 10 | **Composable** | `src/composables/useCierreCaja.ts` (MODIFY) | On cierre, freeze `costo_unitario` + `margen_aplicado` on every `venta_item` if not already set (legacy ventas). Reject cierre if `evento.estado !== 'en_curso'`. |
| 11 | **View** | `src/views/EventoProductosView.vue` | Per-evento product picker. Table: producto | costo | margen (slider/input) | precio (computed) | incluido (checkbox). Bulk action "SELECCIONAR TODOS CON MARGEN 40%" using `inicializarDesdeCatalogo`. |
| 12 | **View** | `src/views/ReporteEventoView.vue` | Post-evento report. Tabs: "Por día" | "Por producto" | "Cierre". Recharts/Chart.js optional for the por-producto bars. Frozen snapshot — no live data. |
| 13 | **View** | `src/views/EventoDetalleView.vue` (MODIFY) | Show `fecha_inicio` + `fecha_fin` + `margen_default`. New section "PRODUCTOS DEL EVENTO" linking to `EventoProductosView`. Section "REPORTE" enabled only when `evento.estado === 'cerrado'` → links to `ReporteEventoView`. |
| 14 | **View** | `src/views/PosView.vue` (MODIFY) | Product grid sourced from `eventoProductos.store` filtered by `incluido=true`. Price displayed = `evento_producto.precio_venta` (not `producto.precio_venta`). Block render if `eventoEnCurso === null` (existing) **or** `evento.estado === 'cerrado'` (NEW). |
| 15 | **View** | `src/views/HomeView.vue` (MODIFY) | Replace `disabled` on the post-evento card. If any evento is `cerrado`, the card shows the latest one and links to `/eventos/:id/reporte`. |
| 16 | **Component** | `src/components/business/ProyeccionCostosCard.vue` (MODIFY) | Extend with `ingresoProyectado` and `margenEsperado` columns. |
| 17 | **Component** | `src/components/business/CierreResumenCard.vue` (MODIFY) | Show `utilidadBruta` (sales − COGS, green/red) AND `utilidadNeta` (after gastosOp). Add "Ver reporte" link when `evento.estado === 'cerrado'`. |
| 18 | **Component** | `src/components/business/MargenSlider.vue` | Reusable slider/input 0–90% with live-computed price preview. Used by `EventoProductosView`. |
| 19 | **Router** | `src/router/routes.ts` (MODIFY) | Add `/eventos/:id/productos` and `/eventos/:id/reporte`. `meta.breadcrumb` updated. |
| 20 | **Docs** | `docs/flujo-financiero.md` | Business-facing doc: how margin works, how COGS is computed, how to read the cierre, how to read the report. Spanish. |

**Counts**: 12 new source files (8 `.vue` + 4 `.ts`) + 12 new spec files + 8 modified files (4 `.vue`, 2 `.ts`, 1 `.sql`, 1 `.vue` of router). Estimated ~900 production lines + ~1,300 test lines total across both phases.

### 3.2 Out-of-scope (explicit non-goals)

- **No backfill of historical ventas.** Sales made before the migration land with `costo_unitario = NULL` → COGS=0 for that item. The formula applies from `migration_time` forward only. This is a user-confirmed decision (§11 decision #4) and matches the project's "no migration of legacy data" precedent (pos `// TODO(offline-sync):`).
- **No multi-currency.** All money stays USD. Currency selector is a future `settings` slice.
- **No tax handling (IVA, IIBB, etc.).** Closing reports raw COGS / utilidad. Tax fields are out.
- **No inventory tracking.** Stock in/out is not modeled. COGS is computed from `venta_items.cantidad * costo_unitario_snapshot`, not from inventory depletion. (Inventory is a future slice.)
- **No price-change mid-evento policy.** The evento starts with one `evento_producto.precio_venta` per producto; ventas against it freeze that price at sale time (`venta_items.precio_unitario` is already a snapshot — extends naturally). A `cambiar_precio_durante_evento` feature is a future enhancement.
- **No auth / multi-tenant.** Single-user, no permissions model.
- **No exports (PDF, CSV) of the report.** `ReporteEventoView` is on-screen only. PDF/CSV export is a future `reportes-export` slice.
- **No automatic profit-share / commission splits** for collaborators. The cierre has one `utilidadNeta` total.
- **No edits to closed eventos.** A `cerrado` evento is an immutable financial snapshot. No `reabrir` button. The brief explicitly says cierre is the final state.
- **No analytics dashboard** (cross-evento comparisons, trends, charts over multiple eventos). Out of scope; the `analytics` slice owns it.
- **No changes to foundation / catalog / app-shell / fab specs** other than what is explicitly listed. The home view is modified but no new home-context capability is created — the post-evento card change is a 1-block modification to the existing `home` spec.

## 4. User Stories

| # | As a … | I want to … | So that … |
|---|---|---|---|
| **US-1** | feria operator | configure a per-evento margin (default 40%) on each producto I include in the evento | the system computes the selling price for me and I don't have to do spreadsheet math. |
| **US-2** | feria operator | bulk-select all my catalog productos for an evento with one click | I don't have to add 30 productos one by one to start selling. |
| **US-3** | feria operator | pick exactly which productos belong to an evento (not auto-include the whole catalog) | if I run a "chocolate-only" stand on day 1 and a "full menu" on day 2, my POS only shows what I actually have. |
| **US-4** | feria operator | see the projected ingreso (sales projection) for the evento based on the margin I chose | I can tell whether 40% margin is realistic given my fixed costs. |
| **US-5** | caja operator | sell against an evento whose products have event-specific prices and margins | the price I charge is the price the evento config says, not a global default. |
| **US-6** | feria operator | mark an evento as `cerrado` and immediately see a post-evento report (no waiting, no refresh) | the moment I close, I know whether I won or lost money. |
| **US-7** | feria operator | read a post-evento report broken down by day and by product | I can see which day was most profitable and which producto carried the evento. |
| **US-8** | feria operator | trust that `utilidadBruta` reflects the actual cost of what I sold (not just `ventas − gastosFijos`) | I can make pricing decisions for the next evento based on real numbers, not fake ones. |

## 5. Acceptance Criteria

> Each AC is verifiable by `pnpm test` (unit / component), `pnpm build`, `pnpm typecheck`, `pnpm lint`, or a manual browser smoke. Tagged **[F1]** = Fase 1, **[F2]** = Fase 2.

### 5.1 Schema & data

- [ ] **AC-1 [F1]**: Migration `20260620000000_finanzas_evento.sql` applies cleanly against the local Supabase. `eventos.fecha` is replaced by `eventos.fecha_inicio` (DATE NOT NULL) + `eventos.fecha_fin` (DATE NOT NULL CHECK `fecha_fin >= fecha_inicio`).
- [ ] **AC-2 [F2]**: New `evento_productos` table exists with columns `id`, `evento_id` (FK → eventos ON DELETE CASCADE), `producto_id` (FK → productos ON DELETE RESTRICT), `precio_venta` (NUMERIC > 0), `margen` (NUMERIC 0..1), `incluido` (BOOLEAN DEFAULT true), `created_at`, `updated_at`. UNIQUE constraint on `(evento_id, producto_id)`.
- [ ] **AC-3 [F2]**: `venta_items` gains `costo_unitario` (NUMERIC nullable), `margen_aplicado` (NUMERIC nullable), `evento_producto_id` (FK nullable — legacy ventas have no link). No constraint that breaks existing rows.
- [ ] **AC-4 [F1]**: `cierres_caja` gains `total_cogs` (NUMERIC NOT NULL DEFAULT 0), `total_utilidad_bruta` (NUMERIC NOT NULL), `total_utilidad_neta` (NUMERIC NOT NULL). Existing rows backfill `total_cogs = 0` and the utility fields are derived from the closure inputs.

### 5.2 Pricing & margen

- [ ] **AC-5 [F2]**: `calcularPrecioPorMargen(10, 0.40) === 16.67` (price = cost / (1 − margin), rounded to 2 decimals). Verified by unit test with 5 representative inputs (10/40, 5/25, 100/50, 3.33/33, 0/0).
- [ ] **AC-6 [F2]**: `calcularMargenReal(precio, costo)` returns `(precio - costo) / precio`, rounded. Verified by unit test in both directions (compute price from margin, compute margin from price).
- [ ] **AC-7 [F2]**: `redondearCentavos` is applied **only at the end** of each pricing computation — no intermediate rounding. Verified by float-drift test (e.g., 0.1 + 0.2 = 0.30, not 0.30000000000000004).
- [ ] **AC-8 [F2]**: `inicializarDesdeCatalogo(eventoId, 0.40)` creates one `evento_producto` per existing `producto` with `incluido = true` and `margen = 0.40`. `precio_venta` is computed via `calcularPrecioPorMargen(producto.costo, 0.40)`. Idempotent: re-running does not duplicate rows.

### 5.3 Cierre (the bug fix)

- [ ] **AC-9 [F1]**: `calcularCierre(ventas, gastosFijos, gastosImprevistos, ventaItems)` returns `utilidadBruta = totalVentas − COGS` (NOT `totalVentas − gastosFijos − gastosImprevistos`). Verified by unit test where COGS=200, gastosFijos=50, ventas=500 → `utilidadBruta = 300`.
- [ ] **AC-10 [F1]**: `utilidadNeta = utilidadBruta − (gastosFijos + gastosImprevistos)`. Same test extends: `utilidadNeta = 300 − 50 = 250`.
- [ ] **AC-11 [F1]**: A `venta_item` with `costo_unitario = NULL` contributes `0` to COGS. Verified: legacy ventas don't break the closure; their `costo_unitario` is filled at the moment of closure if the corresponding `evento_producto` exists.
- [ ] **AC-12 [F1]**: On cierre, for every `venta_item` whose `evento_producto_id` is not null and `costo_unitario` is null, the system writes the snapshot from `evento_productos.costo` (receta cost at sale time) and `margen_aplicado` from `evento_productos.margen`. This is a one-shot data fix at cierre time, not a background migration.
- [ ] **AC-13 [F1]**: `useCierreCaja().cerrar(eventoId)` rejects with a clear error if `evento.estado !== 'en_curso'`. Unit + component test. POS continues to block ventas against a cerrado evento (already blocked by `estadoEsEditable`).

### 5.4 Multi-day eventos

- [ ] **AC-14 [F1]**: `EventoDetalleView` shows `fecha_inicio` and `fecha_fin` as two date pickers, both required. Validation: `fecha_fin >= fecha_inicio`.
- [ ] **AC-15 [F1]**: `PlanificarEventoView` (event-creation form) accepts the two dates. Existing single-date tests are migrated to the new model.
- [ ] **AC-16 [F1]**: The `useResumen()` counter chips split `eventos` by estado (`planificacion`, `en_curso`, `cerrado`) — unchanged — but the detail of an evento in any view shows the date range, not a single date.

### 5.5 POS integration

- [ ] **AC-17 [F2]**: `PosView` renders products sourced from `eventoProductos.eventoProductos.get(eventoEnCurso.id).filter(e => e.incluido)`. NOT from the global `productos` store.
- [ ] **AC-18 [F2]**: The price displayed on each product card = `evento_producto.precio_venta`, not `producto.precio_venta`. Verified by component test where the global product price differs from the evento price.
- [ ] **AC-19 [F2]**: A producto that exists in `productos` but has no `evento_producto.incluido = true` row for the current evento does NOT appear in the POS grid. Verified by component test.
- [ ] **AC-20 [F2]**: At sale time, the `venta_item` is written with `precio_unitario = evento_producto.precio_venta` AND `costo_unitario = producto.costo` AND `margen_aplicado = evento_producto.margen` AND `evento_producto_id = evento_producto.id`. Verified by service-level test against the chainable Supabase mock.
- [ ] **AC-21 [F2]**: POS shows a clear "Este evento está cerrado — reporte disponible" message if the user navigates to `/pos` while `eventoEnCurso.estado === 'cerrado'` and there is no other `en_curso` evento. Verified by component test.

### 5.6 Reports

- [ ] **AC-22 [F2]**: `useReporteEvento(eventoId)` returns `reportePorDia: ReportePorDia[]` where each row has `fecha`, `ventas`, `cantidad`, `cogs`, `utilidadBruta`, `utilidadNeta`. Verified by unit test with a multi-day evento fixture.
- [ ] **AC-23 [F2]**: `reportePorProducto: ReportePorProducto[]` where each row has `productoNombre`, `unidadesVendidas`, `ingresoTotal`, `cogsTotal`, `margenReal`, `utilidadBruta`. `margenReal = (ingresoTotal - cogsTotal) / ingresoTotal`. Verified by unit test.
- [ ] **AC-24 [F2]**: `ReporteEventoView` has 3 tabs (Por día, Por producto, Cierre). Tabs render from `useReporteEvento(eventoId)`. The Cierre tab reuses `CierreResumenCard` with the snapshot data.
- [ ] **AC-25 [F2]**: Report data is computed from `cierres_caja` snapshot fields (NOT from live stores) once the evento is cerrado. The cierre row IS the report's source of truth.
- [ ] **AC-26 [F2]**: A report for a `planificacion` or `en_curso` evento renders an empty state ("El reporte estará disponible cuando cierres el evento"). Verified by component test.

### 5.7 Home

- [ ] **AC-27 [F2]**: `HomeView` post-evento card is no longer `disabled` when at least one `evento.estado === 'cerrado'`. It shows the latest cerrado evento by `fecha_fin desc` and links to `/eventos/:id/reporte`.
- [ ] **AC-28 [F2]**: If no evento is cerrado, the post-evento card stays `disabled` (matching current behavior).

### 5.8 Quality gates

- [ ] **AC-29 [F1+F2]**: `pnpm test` passes. `pnpm build` succeeds. `pnpm lint` clean. `pnpm typecheck` clean.
- [ ] **AC-30 [F1+F2]**: All new and modified files respect the 200-line `.vue` cap and the 30-line function cap from `openspec/config.yaml` `rules.apply`.
- [ ] **AC-31 [F1+F2]**: Each apply phase is ≤ 400 prod lines. Fase 1 and Fase 2 land as separate PRs (see §10).
- [ ] **AC-32 [F1+F2]**: Real-browser smoke per phase (manual checklist in PR description): open the evento, configure products, sell at POS, close, see report, navigate home, click post-evento card.

## 6. Non-Goals

Restated for clarity (no duplication with §3.2):

- No historical-data backfill beyond the one-shot closure-time fix in AC-12.
- No tax handling, no multi-currency, no inventory, no offline-sync, no PDF/CSV exports, no cross-evento analytics, no multi-tenant auth, no reopening closed eventos, no mid-evento price changes policy.
- No new capability beyond `pricing-evento` and `reporte-evento`. The `events`, `pos`, `home` specs are modified in-place (delta specs) — no new foundation / catalog / app-shell / fab requirements are introduced.
- No new entries in `package.json` (Chart.js 4 is already a dependency for the future `analytics` slice — if used here for the report bars, we reuse the existing install; no `pnpm add`).

## 7. Dependencies

### 7.1 What must be done first (within this change)

| Order | Layer | Reason |
|---|---|---|
| **1** | Migration | All new columns must exist before any service writes them. |
| **2** | Types (`evento_productos.types.ts`) | Services depend on the types. |
| **3** | Pure utils (`pricing.ts`, modified `cierre.ts`) | Composables and services depend on them. |
| **4** | Service (`eventoProductos.service.ts`) + modified `useCierreCaja` | Stores depend on services. |
| **5** | Store (`eventoProductos.store.ts`) | Composables depend on the store. |
| **6** | Composables (`usePreciosEvento`, `useReporteEvento`, modified `useProyeccionCostos`) | Views depend on composables. |
| **7** | Components (`MargenSlider`, modified `ProyeccionCostosCard`, `CierreResumenCard`) | Views depend on components. |
| **8** | Views (`EventoProductosView`, `ReporteEventoView`, modified `EventoDetalleView`, `PosView`, `HomeView`) | End of the dependency chain. |
| **9** | Router | Routes registered after views exist. |
| **10** | Docs (`docs/flujo-financiero.md`) | Last — documents the final shape. |

### 7.2 What this change depends on externally

| Dependency | Status | Why we need it |
|---|---|---|
| `foundation` (archived, 54 REQ-IDs) | ✅ Green | Provides Pinia, Vuetify, `redondearCentavos`, `formatearUSD`, `useResumen` skeleton. |
| `catalog` (archived, 46 REQ-IDs) | ✅ Green | Provides `calcularCostoReceta`, `recetas`/`ingredientes` tables that feed `productos.costo`. |
| `events` (archived, 46 REQ-IDs) | ✅ Green | Provides `eventos` table, state machine (`planificacion` → `en_curso` → `cerrado`), `useEvents` composable. We modify this spec with delta requirements. |
| `pos` (archived, 40 REQ-IDs) | ✅ Green | Provides `productos`, `ventas`, `venta_items`, `cierres_caja`, `gastos_imprevistos`. We modify this spec with delta requirements. |
| `ux-improvements` (archived) | ✅ Green | Provides global AppBar + breadcrumb + `useNavegacion`. New routes (`/eventos/:id/productos`, `/eventos/:id/reporte`) follow the same `meta.breadcrumb` convention. |

### 7.3 What depends on this change (future slices)

| Future slice | Depends on |
|---|---|
| `analytics` (cross-evento dashboards) | `reporte-evento` capability (per-evento reports are the building blocks). |
| `offline-sync` | `evento_productos` writes need to enter the WAL. |
| `inventory` (stock depletion) | `venta_items.costo_unitario` is the input; inventory backfills a COGS ledger from it. |
| `reportes-export` (PDF, CSV) | `useReporteEvento` is the source. |
| `settings` (currency, tax) | `redondearCentavos` / `formatearUSD` become configurable. |

## 8. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| **R-1** | **Wrong margin interpretation.** Operator enters `40` thinking 40% margin, code reads it as 0.40. | High | The UI uses a `<MargenSlider>` showing both the percentage (40%) AND the resulting price ($16.67) live. The DB stores 0..1, the UI displays 0..100. Two unit tests cover the conversion in both directions. |
| **R-2** | **400-line PR budget blown.** Fase 2 has 8 new files + 6 modified; could exceed the budget if not split. | Medium | Fase 2 itself is a chained-PR structure: PR-2a = pricing model (utils + service + store + composable + `EventoProductosView` + `EventoDetalleView` link); PR-2b = POS integration (`PosView` + AC-17..21); PR-2c = reports + home card (`useReporteEvento` + `ReporteEventoView` + `HomeView` + modified `CierreResumenCard`). See §10. |
| **R-3** | **Float-drift in COGS computation.** `venta_items.costo_unitario * cantidad` can drift across many ventas. | Medium | `redondearCentavos` is called once at the cierre aggregation step, never per-item. A float-drift unit test asserts the closure total is exactly correct after 100 ventas. |
| **R-4** | **`inicializarDesdeCatalogo` re-run creates duplicates.** | Low | UNIQUE constraint on `(evento_id, producto_id)` + service uses `upsert` with `onConflict: 'evento_id,producto_id'`. Unit test asserts idempotency. |
| **R-5** | **POS shows stale products** if `eventoProductos.store` hasn't loaded. | Medium | `PosView` shows a `<v-progress-circular>` until `cargado === true` AND an empty-state message if the evento has zero `incluido` productos (with a CTA "Ir a productos del evento"). |
| **R-6** | **A `cerrado` evento is reopened by accident** because the state machine has a back-door somewhere. | Low | `useCierreCaja.cerrar()` is the only path to `cerrado`. The state-machine guard `estadoEsEditable` (from `events`) is reused on `useVentas.registrarVenta` and `useEventoProductos.actualizarMargen` to refuse mutations on cerrado eventos. Unit tests on both guard paths. |
| **R-7** | **Backfill of `costo_unitario` on closure overwrites a value the operator intentionally set to NULL** (e.g., a promo / freebie). | Low | The backfill only fires when `costo_unitario IS NULL AND evento_producto_id IS NOT NULL`. Operator-set NULLs with no `evento_producto_id` link stay NULL → COGS=0 (matching the "no backfill of historical data" decision). |
| **R-8** | **Multi-day date validation is bypassed** by a stale `fecha_fin` left over from a closed evento. | Low | The form-level validation rejects `fecha_fin < fecha_inicio` at submit. The DB CHECK constraint catches direct SQL writes. |
| **R-9** | **Report numbers disagree with cierre numbers.** | Medium | The Cierre tab of the report renders from the SAME `cierres_caja` snapshot fields (`total_utilidad_bruta`, `total_utilidad_neta`). The Por día / Por producto tabs are aggregations of `venta_items` and are tested for arithmetic consistency with the cierre snapshot in a property-style test. |
| **R-10** | **`useResumen` counter chips on home go stale** because `eventoProductos` is not in the existing 6-store aggregation. | Low | `useResumen` is modified (delta) to add `eventoProductos.cargarParaEvento(eventoEnCurso.id)` after `events.cargarTodas()`. Home counter chips don't show this count (they show `eventos` by estado, unchanged); the data is loaded lazily for the post-evento card. |

## 9. Success Metrics

The change is **successful** when **all** of the following hold:

- [ ] **SM-1**: `utilidadBruta` on the cierre card equals `ventas − COGS` for every closed evento in the local DB (verified by an integration test that loads 3 eventos with known ventas/gastos and asserts the displayed number matches the formula).
- [ ] **SM-2**: An operator can plan a new evento, configure 5 productos with different margins (30%, 40%, 50%, 60%, 0%), and the POS shows 5 different prices — without leaving the evento detail screen. (Manual smoke.)
- [ ] **SM-3**: Closing the evento and clicking "Ver reporte" lands on `/eventos/:id/reporte` with the Por día and Por producto tabs populated. The Por producto tab shows the real margen for each producto (not the assumed margin). (Manual smoke.)
- [ ] **SM-4**: The home post-evento card becomes clickable and routes to the latest closed evento's report. After a fresh install with zero eventos, the card stays `disabled` (no regression). (Manual smoke.)
- [ ] **SM-5**: `pnpm test` shows ≥ 60 new passing tests across the two phases (Fase 1: ~25, Fase 2: ~35). Cumulative kilo-lima test count: ~470 → ~530.
- [ ] **SM-6**: `git diff main -- package.json` returns empty (no new dependencies).
- [ ] **SM-7**: Both apply phases land as ≤ 400 prod lines each. Each PR is independently reviewable.
- [ ] **SM-8**: `docs/flujo-financiero.md` exists and explains (in Spanish, for the operator) what margin is, how COGS is computed, how to read the cierre, and how to read the report. Reviewed by the user before Fase 2 archive.

## 10. Delivery Plan — 2 Phases, 1 SDD Cycle

> **One cycle**: proposal → spec → design → tasks. **Two apply phases**. Each phase ships as its own PR (Fase 1 = 1 PR; Fase 2 = 3 chained PRs). Total: 4 PRs.

### 10.1 Fase 1 — Multi-day + cierre corregido (1 PR, ≤ 400 prod lines)

**Goal**: Fix the wrong cierre formula and enable multi-day eventos. Pure data + utils + service + view modifications. No new tables (the `cierres_caja` column adds are an additive migration on an existing table).

| Layer | Files | Notes |
|---|---|---|
| Migration | `20260620000000_finanzas_evento.sql` | Rename `eventos.fecha` → `fecha_inicio` + add `fecha_fin` + add `cierres_caja.total_cogs`/`total_utilidad_bruta`/`total_utilidad_neta`. NO `evento_productos` table yet (that's Fase 2). |
| Utils | `src/utils/cierre.ts` (MODIFY) | Fix the formula. Add `totalCogs`, `utilidadBruta` (new), `utilidadNeta` (new). Keep the existing field names where possible for backward-compat with components that already consume them. |
| Types | `src/types/pos.types.ts` (MODIFY) | Extend `CierreResumen` with `totalCogs`, `utilidadNeta`. Extend `VentaItem` with `costoUnitario`, `margenAplicado`. |
| Service | `src/services/cierresCaja.service.ts` (MODIFY) | Closure-time backfill: write `costo_unitario` on legacy `venta_items` where null + `evento_producto_id` set (or just snapshot from `producto.costo` if no link — Fase 2 brings the link). |
| Composable | `src/composables/useCierreCaja.ts` (MODIFY) | Reject cierre if `evento.estado !== 'en_curso'`. Persist the new fields on `cierres_caja`. |
| Component | `src/components/business/CierreResumenCard.vue` (MODIFY) | Show `utilidadBruta` (green/red) AND `utilidadNeta` (subtotal line). Add "Ver reporte" placeholder button (disabled, Fase 2 wires the route). |
| View | `src/views/EventoDetalleView.vue` (MODIFY) | Replace `fecha` with `fecha_inicio` + `fecha_fin` (two date pickers). |
| View | `src/views/PlanificarEventoView.vue` (MODIFY) | Same — two date pickers. |
| View | `src/views/HomeView.vue` (MODIFY) | NO change in Fase 1 (post-evento card stays disabled — Fase 2 enables it). |
| Tests | ~25 new + ~10 modified | Pure utils: float-drift, COGS aggregation, empty ventas. Component: date validation, cierre rejection. |

**ACs landed in Fase 1**: AC-1, AC-4, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-29 (partial), AC-30, AC-31, AC-32 (partial).

**Branch**: `feat/finanzas-fase1-cierre-multidia`.

---

### 10.2 Fase 2 — Pricing configurable + reportes + UI nueva (3 chained PRs, ≤ 400 prod lines each)

**Goal**: Bring pricing configurable, the per-evento product picker, the POS filter, the post-evento report, and the home post-evento card to life. The biggest single change in the project so far — split into 3 chained PRs.

#### PR-2a — Pricing model + per-evento product picker

| Layer | Files |
|---|---|
| Migration | Extend `20260620000000_finanzas_evento.sql` with `evento_productos` table + `venta_items` columns (`costo_unitario`, `margen_aplicado`, `evento_producto_id`). |
| Types | `src/types/evento_productos.types.ts` (NEW). |
| Utils | `src/utils/pricing.ts` (NEW). |
| Service | `src/services/eventoProductos.service.ts` (NEW). |
| Store | `src/stores/eventoProductos.store.ts` (NEW). |
| Composable | `src/composables/usePreciosEvento.ts` (NEW). `src/composables/useProyeccionCostos.ts` (MODIFY). |
| Component | `src/components/business/MargenSlider.vue` (NEW). `src/components/business/ProyeccionCostosCard.vue` (MODIFY). |
| View | `src/views/EventoProductosView.vue` (NEW). |
| View | `src/views/EventoDetalleView.vue` (MODIFY) — add "PRODUCTOS DEL EVENTO" section linking to the picker. |
| Router | `src/router/routes.ts` (MODIFY) — add `/eventos/:id/productos` with `meta.breadcrumb`. |

**ACs landed**: AC-2, AC-3, AC-5, AC-6, AC-7, AC-8.

**Branch**: `feat/finanzas-fase2a-pricing` (stacked on Fase 1).

#### PR-2b — POS integration (productos filtrados + precios del evento)

| Layer | Files |
|---|---|
| Composable | `src/composables/usePreciosEvento.ts` is already used by the POS in PR-2a; this PR wires it into `PosView`. |
| View | `src/views/PosView.vue` (MODIFY) — source products from `eventoProductos`, display `evento_producto.precio_venta`, block on cerrado evento. |
| Service | `src/services/ventas.service.ts` (MODIFY) — write `costo_unitario` + `margen_aplicado` + `evento_producto_id` on `venta_items` insert. |

**ACs landed**: AC-17, AC-18, AC-19, AC-20, AC-21.

**Branch**: `feat/finanzas-fase2b-pos` (stacked on PR-2a).

#### PR-2c — Reports + home post-evento card

| Layer | Files |
|---|---|
| Composable | `src/composables/useReporteEvento.ts` (NEW). |
| View | `src/views/ReporteEventoView.vue` (NEW). |
| View | `src/views/HomeView.vue` (MODIFY) — enable post-evento card. |
| View | `src/views/EventoDetalleView.vue` (MODIFY) — "REPORTE" section link (enabled when cerrado). |
| Component | `src/components/business/CierreResumenCard.vue` (MODIFY) — wire "Ver reporte" button. |
| Router | `src/router/routes.ts` (MODIFY) — add `/eventos/:id/reporte`. |
| Docs | `docs/flujo-financiero.md` (NEW). |

**ACs landed**: AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29 (final), AC-32 (final).

**Branch**: `feat/finanzas-fase2c-reportes` (stacked on PR-2b).

---

### 10.3 Cumulative totals

| Phase | Prod lines | Test lines | PRs |
|---|---|---|---|
| Fase 1 | ~280 | ~350 | 1 |
| Fase 2a | ~360 | ~500 | 1 |
| Fase 2b | ~120 | ~200 | 1 |
| Fase 2c | ~250 | ~350 | 1 |
| **Total** | **~1,010** | **~1,400** | **4** |

All four PRs respect the 400-line review budget. PR-2a + PR-2b + PR-2c are stacked-to-main in order; PR-2c is the "review me last" one because it has the highest cognitive load (new view + new composable + docs).

## 11. Product Decisions Log

The following 6 decisions are LOCKED (user-confirmed during exploration). The proposal does not re-litigate them. sdd-spec must reflect them verbatim.

| # | Decision | Rationale | Source |
|---|---|---|---|
| **PD-1** | **Margen de ganancia is configurable per evento.** The default is a setting (initial value `0.40`), not hardcoded. The UI must make clear which margen is being used at every step (picker shows both percentage and computed price live). | Hardcoding 40% forces spreadsheet math on the operator for every non-default case. Per-evento config matches the "every evento is a different experiment" mental model of a feria. | user 2026-06-19 10:39 |
| **PD-2** | **POS shows ONLY productos explicitly selected by the user** AND whose costo is computable. No auto-include of the full catalog. `inicializarDesdeCatalogo` is an OPTIONAL helper that "selects all with default margin" — never the default behavior. | The user's literal phrasing: "en 2 no van productos que no se hayan seleccionado, y los que no tengan cálculo de costo". Auto-include confuses the operator and breaks the "what you see is what you sell" mental model. | user 2026-06-19 10:39 |
| **PD-3** | **Cierre is immediate.** A cerrado evento is an immutable financial snapshot. The report is available the moment the cierre is written. No ventas can be registered against a cerrado evento (POS shows the report-available message instead of the grid). | A feria operator closes the caja and needs to know NOW. Deferred reports force them to come back later — they will not. | user 2026-06-19 10:39 |
| **PD-4** | **No backfill of historical ventas.** Pre-migration ventas with `costo_unitario = NULL` contribute 0 to COGS. The corrected formula applies from `migration_time` forward only. A one-shot backfill at closure time freezes `costo_unitario` from `evento_productos.costo` for ventas that have an `evento_producto_id` link (Fase 2 link) — ventas without the link stay COGS=0. | Backfilling months of historical data is risky and the user has explicitly opted out. The closure-time backfill is a forward-compatibility safety net, not a historical rewrite. | user 2026-06-19 10:39 |
| **PD-5** | **Both Fase 1 and Fase 2 are needed.** The system is not in production. Half-implementation is worse than no implementation: the cierre would still be wrong OR the pricing would exist without the cierre to verify it. | A wrong cierre in production is a business-credibility disaster. The user wants the whole slice fully configured and functional with understandable UI. | user 2026-06-19 10:39 |
| **PD-6** | **Delivery = Opción B.** Two apply phases (Fase 1: multi-day + cierre corregido; Fase 2: pricing configurable + reportes + UI nueva), but a single SDD cycle (one proposal, one spec, one design, one tasks file, two apply runs). | Single-cycle keeps the architecture coherent; two-phase delivery respects the 400-line review budget per PR. | user 2026-06-19 10:33 |

---

## 12. Capabilities (contract with `sdd-spec`)

> This section is MANDATORY — it is the contract between the proposal and the `sdd-spec` phase. sdd-spec reads it to know which `openspec/specs/<name>/spec.md` files to create or update.

### 12.1 New Capabilities

| Capability | Description | Becomes |
|---|---|---|
| **`pricing-evento`** | Per-evento pricing with configurable margin: the `evento_productos` table, `calcularPrecioPorMargen` / `calcularMargenReal` utils, `eventoProductos` service + store + composable, `MargenSlider` component, `EventoProductosView`, `inicializarDesdeCatalogo` helper, POS price-source change. | `openspec/specs/pricing-evento/spec.md` (NEW) |
| **`reporte-evento`** | Post-evento reports: `useReporteEvento` composable (Por día + Por producto aggregations), `ReporteEventoView` with 3 tabs, home post-evento card enabling, `docs/flujo-financiero.md`. | `openspec/specs/reporte-evento/spec.md` (NEW) |

### 12.2 Modified Capabilities (delta specs)

| Capability | What requirement is changing | Delta goes in |
|---|---|---|
| **`events`** | `fecha` → `fecha_inicio` + `fecha_fin` (multi-day). `evento.detalle` shows margen_default + link to `EventoProductosView` + (when cerrado) link to `ReporteEventoView`. | `openspec/changes/finanzas-evento/specs/events.md` |
| **`pos`** | `CierreResumen` shape: `utilidadBruta = ventas − COGS` (NOT `ventas − gastosFijos − gastosImprevistos`), `utilidadNeta = utilidadBruta − gastosOp`. New `totalCogs` field. Closure-time backfill of `venta_items.costo_unitario` + `margen_aplicado`. POS product grid sourced from `evento_productos`, not from `productos`. `venta_items` schema gains `costo_unitario` + `margen_aplicado` + `evento_producto_id`. | `openspec/changes/finanzas-evento/specs/pos.md` |
| **`home`** | Post-evento card is no longer `disabled` when at least one evento is `cerrado`. Links to the latest cerrado evento's `/reporte`. | `openspec/changes/finanzas-evento/specs/home.md` |

### 12.3 Unchanged capabilities (explicit "no delta")

- `foundation` — no new requirements. We reuse `redondearCentavos`, `formatearUSD`, `useResumen` skeleton (delta to `useResumen` is internal, not a new requirement).
- `catalog` — no new requirements. We reuse `calcularCostoReceta` and the `recetas`/`ingredientes`/`productos` tables. The `productos.precio_venta` field stays as-is (it becomes the "default" when an evento is configured without explicit pricing — Fase 2 PR-2a documents this).
- `app-shell`, `fab` — no changes.

---

## 13. Rollback Plan

The change is **split into 4 PRs** (1 Fase 1 + 3 Fase 2). Each PR is independently revertable:

1. **PR Fase 1 (cierre + multi-day)**: revert the migration (down-migration drops `fecha_fin` and the `cierres_caja` columns, renames `fecha_inicio` back to `fecha`). Revert the closure-formula change in `cierre.ts`. Revert the views' date pickers. The legacy single-date + wrong-formula state is restored. No data loss because no rows depend on the new columns being non-null.
2. **PR-2a (pricing model)**: revert the migration's `evento_productos` table addition (DROP TABLE). Revert the new files. `EventoDetalleView` returns to its pre-PR state (no "PRODUCTOS DEL EVENTO" section). No data loss — `evento_productos` is new.
3. **PR-2b (POS integration)**: revert `PosView` + `ventas.service.ts`. POS returns to sourcing from `productos.precio_venta`. Legacy ventas (pre-PR-2b) had no `costo_unitario`/`margen_aplicado` writes — those columns are nullable, so no data loss.
4. **PR-2c (reports + home)**: revert the new `ReporteEventoView` + `useReporteEvento` + `HomeView` modification + `docs/flujo-financiero.md`. Home post-evento card returns to `disabled`. No data loss.

**Why rollback is safe**:
- Every new column is nullable or has a default. Drop is non-destructive.
- The closure-time backfill only writes `costo_unitario` where it was NULL — it never overwrites a real value. Reverting the closure code leaves the backfilled values in place, but the closure still computes correctly (it reads them).
- The `evento_productos` table is new — DROP is clean.
- The new routes (`/eventos/:id/productos`, `/eventos/:id/reporte`) are unreachable after revert.

**Full-system rollback**: revert all 4 PRs in reverse order. The codebase returns to the `ux-improvements`-archived state.

---

## 14. References

- Engram `#504` — Plan de finanzas y costeo operativo (architecture overview, 8-layer plan, 10 new + 8 modified files).
- Engram `#505` — Especificación capa por capa (every file change with line-level rationale).
- Engram `#506` — Gotchas y hallazgos (formula bug, NULL backfill, redondearCentavos placement, factory services, EventoProductoConDetalle view model).
- `openspec/changes/ux-improvements/proposal.md` — template precedent (21-section structure, table-heavy).
- `openspec/changes/events/proposal.md` — the archived events proposal (multi-table state-machine domain).
- `openspec/changes/pos/proposal.md` — the archived POS proposal (transactional domain, snapshot-at-write precedent).
- `openspec/specs/events/spec.md` — REQ-EVENTS-* (state machine, `estadoEsEditable` guard).
- `openspec/specs/pos/spec.md` — REQ-POS-* (current `cierre` shape, REQ-POS-31 = the buggy formula).
- `openspec/specs/foundation/spec.md` — REQ-FOUNDATION-* (`redondearCentavos`, `formatearUSD`).
- `openspec/specs/home/spec.md` — REQ-HOME-* (current `disabled` post-evento card).
- `openspec/config.yaml` — `strict_tdd: true`, `test_command: "pnpm test"`, `review_budget_lines: 400`, `preflight.delivery_strategy: ask-always`.
- `brief.md` §2.1.4 (post-evento phase), §3.1 (no pantallas muertas), §7 phase 4 items 14–17 (cierre).
- `src/utils/cierre.ts:33` — the buggy formula being fixed.
- `src/types/pos.types.ts` — `CierreResumen` (current shape, will gain fields).

---

## 15. Ready for Specs

**Yes.** The orchestrator should proceed with `sdd-spec finanzas-evento` to write:

1. **NEW** `openspec/specs/pricing-evento/spec.md` — full spec for the pricing model (REQ-PRICING-*).
2. **NEW** `openspec/specs/reporte-evento/spec.md` — full spec for the post-evento report (REQ-REPORTE-*).
3. **DELTA** `openspec/changes/finanzas-evento/specs/events.md` — multi-day + cierre-related changes (REQ-EVENTS-DX-*).
4. **DELTA** `openspec/changes/finanzas-evento/specs/pos.md` — cierre formula fix + venta_items schema (REQ-POS-DX-*).
5. **DELTA** `openspec/changes/finanzas-evento/specs/home.md` — post-evento card enabling (REQ-HOME-DX-*).

The 6 product decisions in §11 and the file inventory in §3.1 are locked (no need to re-litigate them in the specs).