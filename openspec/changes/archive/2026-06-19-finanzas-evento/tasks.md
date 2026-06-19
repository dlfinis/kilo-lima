# Tasks: `finanzas-evento` — Financial Tracing, Margin Pricing & Post-Event Reports

> **34 REQ-FIN-IDs** | **2 phases / 4 PRs** | **~1,010 prod lines / ~1,400 test lines**
> **Strict TDD**: Every file ships a `.spec.ts` first. Each task's TDD column lists which spec file to write BEFORE implementation.

## Dependency Graph

```
Phase 1 (PR-1) ───────────────────────────────
1.1 (DB) ─→ 1.2 (Types events) ─→ 1.8/1.9 (Views)
     └─→ 1.3 (Types pos) ─→ 1.4 (Utils cierre) ─→ 1.5 (Services) ─→ 1.6 (Composable) ─→ 1.7 (Component)
                                                              └────────────────────────→ 1.10 (Cross-cutting)

Phase 2a (PR-2a) ─ chained on PR-1 ──────────
2a.1 (DB) ─→ 2a.2 (Types ep) ─→ 2a.3 (index) ─→ 2a.5 (Service) ─→ 2a.6 (Store) ─→ 2a.7 (Composable)
     └─→ 2a.4 (Utils pricing) ─→ 2a.8 (Composable proy) ─→ 2a.9 (Component slider)
                                           └─→ 2a.10 (View ep) ←─ 2a.11 (View modify)
                                                └─→ 2a.12 (Router)

Phase 2b (PR-2b) ─ chained on PR-2a ─────────
2a.6/2a.7 ─→ 2b.1 (Store ventas) ─→ 2b.2 (Service ventas) ─→ 2b.3 (View PosView)

Phase 2c (PR-2c) ─ chained on PR-2b ─────────
2b.1/2b.2 ─→ 2c.1 (Composable reporte) ─→ 2c.2 (View reporte)
2a.2 ─→ 2c.3 (View detalle reporte section)
2b.3 ─→ 2c.4 (Component resumen link) ─→ 2c.5 (View home)
2c.2 ─→ 2c.6 (Router reporte)
ALL ─→ 2c.7 (Docs) ─→ 2c.8 (Cross-cutting)

Legend: ─→ = "depends on"
```

---

## Phase 1: PR-1 — Cierre Fix + Multi-Day (≤ 400 prod lines)

**Branch**: `feat/finanzas-fase1-cierre-multidia` | **Base**: `main`

| # | Layer | File(s) | REQ-FIN | TDD File (write first) | Deps | Est. | Description |
|-- |-------|---------|---------|------------------------|------|------|-------------|
| [x] 1.1 | **DB** | `supabase/migrations/20260620000000_finanzas_evento.sql` (CREATE parts 1–5) | 1, 5 | — (migration, no spec) | none | 60 | Rename `fecha`→`fecha_inicio`, ADD `fecha_fin` NOT NULL w/ CHECK, ADD `total_cogs/bruta/neta` on `cierres_caja`. Update legacy rows COGS=0. |
| [x] 1.2 | **Types** | `src/types/events.types.ts` (MODIFY) | 1, 2, 3, 4 | `src/types/events.types.spec.ts` (extend) | 1.1 | 20 | `Evento.fecha`→`fecha_inicio`+`fecha_fin`. `EventoInput` mirrors. |
| [x] 1.3 | **Types** | `src/types/pos.types.ts` (MODIFY) | 5, 6, 7, 8, 11 | `src/types/pos.types.spec.ts` (extend) | 1.1 | 25 | Add `totalCogs/utilidadNeta` to `CierreResultado`. Add `ventaItems` to `CierreInput`. Extend `CierreCaja` with 3 new fields. |
| [x] 1.4 | **Utils** | `src/utils/cierre.ts` (MODIFY) | 6, 7, 8 | `src/utils/cierre.spec.ts` (extend) | 1.3 | 35 | NEW formula: `totalCogs`, `utilidadBruta = ventas − COGS`, `utilidadNeta = bruta − gastosOp`. `costo_unitario ?? 0` for legacy. |
| [x] 1.5 | **Services** | `src/services/cierresCaja.service.ts` (MODIFY) | 9 | `src/services/cierresCaja.service.spec.ts` (extend) | 1.1, 1.3 | 30 | Pre-insert backfill: update `venta_items` SET `costo_unitario`/`margen_aplicado` where NULL + linked via `evento_producto_id`. |
| [x] 1.6 | **Composables** | `src/composables/useCierreCaja.ts` (MODIFY) | 10 | `src/composables/useCierreCaja.spec.ts` (extend) | 1.4, 1.5 | 35 | Guard: reject `registrarCierre()` if `estado !== 'en_curso'`. Pass `ventaItems` to `calcularCierre()`. Persist new fields. |
| [x] 1.7 | **Components** | `src/components/business/CierreResumenCard.vue` (MODIFY) | 11 | `src/components/business/CierreResumenCard.spec.ts` (extend) | 1.3 | 30 | Show `utilidadBruta` (color-coded) + `utilidadNeta` subtotal. Add disabled "Ver reporte" placeholder. |
| [x] 1.8 | **Views** | `src/views/EventoDetalleView.vue` (MODIFY) | 2 | `src/views/EventoDetalleView.spec.ts` (extend) | 1.2 | 25 | Replace single date picker with `fecha_inicio` + `fecha_fin`. Show range display. |
| [x] 1.9 | **Views** | `src/views/PlanificarEventoView.vue` (MODIFY) | 3 | `src/views/PlanificarEventoView.spec.ts` (extend) | 1.2 | 20 | Two date pickers. Validation: `fecha_fin >= fecha_inicio`. |
| [x] 1.10 | **Cross** | All modified files | 29, 30 | — | all above | 0 | `pnpm test` green. `pnpm build` / `lint` / `typecheck` clean. |

---

## Phase 2: PR-2a — Pricing Model + Product Picker (≤ 400 prod lines)

**Branch**: `feat/finanzas-fase2a-pricing` | **Base**: `feat/finanzas-fase1-cierre-multidia`

| # | Layer | File(s) | REQ-FIN | TDD File (write first) | Deps | Est. | Description |
|---|-------|---------|---------|------------------------|------|------|-------------|
| [x] 2a.1 | **DB** | `supabase/migrations/20260620000000_finanzas_evento.sql` (EXTEND parts 6–8) | 12, 13 | — (migration, no spec) | F1 | 35 | CREATE `evento_productos` table (UNIQUE, FK CASCADE/RESTRICT). ADD `venta_items` columns: `costo_unitario`, `margen_aplicado`, `evento_producto_id`. RLS. |
| [x] 2a.2 | **Types** | `src/types/evento_productos.types.ts` (NEW) | 13 | `src/types/evento_productos.types.spec.ts` (new) | 2a.1 | 30 | `EventoProducto`, `EventoProductoConDetalle`, `CrearEventoProductoInput`, `ActualizarMargenInput`. |
| [x] 2a.3 | **Types** | `src/types/index.ts` (MODIFY) | — | (covered by 2a.2 spec) | 2a.2 | 3 | Re-export `evento_productos.types.ts`. |
| [x] 2a.4 | **Utils** | `src/utils/pricing.ts` (NEW) | 14, 15, 16 | `src/utils/pricing.spec.ts` (new) | 2a.1 | 30 | `calcularPrecioPorMargen(costo, margen)`, `calcularMargenReal(precio, costo)`. `redondearCentavos` only at end. Float-drift test. |
| [x] 2a.5 | **Services** | `src/services/eventoProductos.service.ts` (NEW) | 17 | `src/services/eventoProductos.service.spec.ts` (new) | 2a.2, 2a.4 | 55 | Factory `crearEventoProductosService(supabase)`. CRUD + `inicializarDesdeCatalogo(eventoId, margenDefault)` UPSERT. Never-throw pattern. |
| [x] 2a.6 | **Stores** | `src/stores/eventoProductos.store.ts` (NEW) | 18 | `src/stores/eventoProductos.store.spec.ts` (new) | 2a.5 | 55 | Pinia: `Map<eventoId, EventoProducto[]>`. Actions: `cargarParaEvento`, `actualizarMargen` (recomputes precio), `actualizarIncluido`, `inicializarDesdeCatalogo`. Gated by `estadoEsEditable`. |
| [x] 2a.7 | **Composables** | `src/composables/usePreciosEvento.ts` (NEW) | 28, 29 | `src/composables/usePreciosEvento.spec.ts` (new) | 2a.6 | 35 | `precioParaProducto(eventoId, prodId)` (fallback to `producto.precio_venta`), `margenParaProducto`, `productosDelEvento` (incluido=true). |
| [x] 2a.8 | **Composables** | `src/composables/useProyeccionCostos.ts` (MODIFY) | — | `src/composables/useProyeccionCostos.spec.ts` (extend) | 2a.4 | 15 | Extend `calcularProyeccion` with `margenEsperado` per producto and `ingresoProyectado = costo / (1 − margen)`. |
| [x] 2a.9 | **Components** | `src/components/business/MargenSlider.vue` (NEW) | 19 | `src/components/business/MargenSlider.spec.ts` (new) | 2a.4 | 30 | Slider 0–90% + text input. Live price preview via `calcularPrecioPorMargen(costo, modelValue)`. Auto-convert UI%↔DB decimal. `v-model` 0..1. |
| [x] 2a.10 | **Views** | `src/views/EventoProductosView.vue` (NEW) | 18 | `src/views/EventoProductosView.spec.ts` (new) | 2a.6, 2a.7, 2a.9 | 50 | Table: producto \| costo \| MargenSlider \| precio \| incluido. Bulk "SELECCIONAR TODOS CON MARGEN 40%". Read-only when cerrado. |
| [x] 2a.11 | **Views** | `src/views/EventoDetalleView.vue` (MODIFY) | 20 | (covered by existing EventoDetalleView spec) | 2a.2 | 20 | "PRODUCTOS DEL EVENTO" section with count. Link to `/eventos/:id/productos`. Gated by `estadoEsEditable`. |
| [x] 2a.12 | **Router** | `src/router/routes.ts` (MODIFY) | — | — (routing test) | 2a.10 | 5 | ADD `/eventos/:id/productos` → `EventoProductosView.vue`. `meta.breadcrumb`. |

---

## Phase 2: PR-2b — POS Integration (≤ 400 prod lines)

**Branch**: `feat/finanzas-fase2b-pos` | **Base**: `feat/finanzas-fase2a-pricing`

| # | Layer | File(s) | REQ-FIN | TDD File (write first) | Deps | Est. | Description |
|---|-------|---------|---------|------------------------|------|------|-------------|
| [x] 2b.1 | **Stores** | `src/stores/ventas.store.ts` (MODIFY) | 31 | `src/stores/ventas.store.spec.ts` (extend) | 2a.6, 2a.7 | 35 | `registrarVenta`: snapshot `costo_unitario` (from producto), `margen_aplicado`, `evento_producto_id` on each `venta_item`. Cross-store READ from `eventoProductosStore` + `productosStore`. |
| [x] 2b.2 | **Services** | `src/services/ventas.service.ts` (MODIFY) | 31 | `src/services/ventas.service.spec.ts` (extend) | 2a.5 | 20 | Extend `VentaItemInput` to accept `costo_unitario`, `margen_aplicado`, `evento_producto_id`. Forward to Supabase insert. |
| [x] 2b.3 | **Views** | `src/views/PosView.vue` (MODIFY) | 28, 29, 30, 32 | `src/views/PosView.spec.ts` (extend) | 2b.1, 2b.2 | 65 | Grid sourced from `eventoProductosStore.productosDelEvento` (incluido=true). Price = `ep.precio_venta`. Cerrado guard: show message, hide grid. `manejarAgregar` uses evento price. |

---

## Phase 2: PR-2c — Reports + Home (≤ 400 prod lines)

**Branch**: `feat/finanzas-fase2c-reportes` | **Base**: `feat/finanzas-fase2b-pos`

| # | Layer | File(s) | REQ-FIN | TDD File (write first) | Deps | Est. | Description |
|-- |-------|---------|---------|------------------------|------|------|-------------|
| [x] 2c.1 | **Composables** | `src/composables/useReporteEvento.ts` (NEW) | 21, 22, 26 | `src/composables/useReporteEvento.spec.ts` (new) | 2b.1, 2b.2 | 55 | `reportePorDia[]`, `reportePorProducto[]` aggregations from `venta_items`. Arithmetic consistency: Σ(porDia) = cierre snapshot. Empty arrays when not cerrado. |
| [x] 2c.2 | **Views** | `src/views/ReporteEventoView.vue` (NEW) | 23, 24, 25 | `src/views/ReporteEventoView.spec.ts` (new) | 2c.1 | 70 | 3 v-tabs: "Por día" (table), "Por producto" (table/bars), "Cierre" (CierreResumenCard). Empty state when not cerrado. Data from snapshots. |
| [x] 2c.3 | **Views** | `src/views/EventoDetalleView.vue` (MODIFY) | 27 | (covered by existing spec) | 2a.2 | 15 | "REPORTE" section with link to `/eventos/:id/reporte`. ONLY visible when `estado === 'cerrado'`. |
| [x] 2c.4 | **Components** | `src/components/business/CierreResumenCard.vue` (MODIFY) | 11 (ext) | (covered by existing spec) | 2b.3 | 20 | Wire "Ver reporte" button → `/eventos/:id/reporte`. Enabled when `evento.estado === 'cerrado'`. |
| [x] 2c.5 | **Views** | `src/views/HomeView.vue` (MODIFY) | 33, 34 | `src/views/HomeView.spec.ts` (extend) | 2b.3 | 25 | Post-evento card: `disabled` only when zero cerrado eventos. Links to latest cerrado's `/reporte`. |
| [x] 2c.6 | **Router** | `src/router/routes.ts` (MODIFY) | — | — (routing test) | 2c.2 | 5 | ADD `/eventos/:id/reporte` → `ReporteEventoView.vue`. `meta.breadcrumb`. |
| [ ] 2c.7 | **Docs** | `docs/flujo-financiero.md` (NEW) | SM-8 | — (documentation) | all above | 60 | ⚠️ KNOWN GAP: not created. Documented in archive report. |
| [x] 2c.8 | **Cross** | All files | 29, 30, 31, 32 | — | all above | 0 | `pnpm test` all green (≥60 new tests). `pnpm build`/`lint`/`typecheck` clean. Real-browser smoke checklist. |

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines (prod) | ~1,010 |
| Estimated test lines (new + modified) | ~1,400 |
| 400-line budget risk per PR | Low (PR-1: ~280, PR-2a: ~363, PR-2b: ~120, PR-2c: ~255) |
| Chained PRs recommended | Yes (user-confirmed in PD-6) |
| Suggested split | PR-1 (cierre+multi-day) → PR-2a (pricing model) → PR-2b (POS integration) → PR-2c (reports+home) |
| Chain strategy | stacked-to-main |
| Delivery strategy | auto-chain (user already confirmed Opción B in PD-6) |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low
```

### REQ-FIN-ID Coverage Summary

| Phase/PR | REQ-FIN IDs | Count |
|----------|-------------|-------|
| PR-1 (Fase 1) | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 | 11 |
| PR-2a | 12, 13, 14, 15, 16, 17, 18, 19, 20 | 9 |
| PR-2b | 28, 29, 30, 31, 32 | 5 |
| PR-2c | 21, 22, 23, 24, 25, 26, 27, 33, 34 | 9 |
| **Total** | **34 REQ-FIN-IDs** | **34** |

### Test File Inventory

| TDD Order | File | Phase | Type |
|-----------|------|-------|------|
| T1 | `src/utils/cierre.spec.ts` | F1 | MODIFY |
| T2 | `src/types/pos.types.spec.ts` | F1 | MODIFY |
| T3 | `src/composables/useCierreCaja.spec.ts` | F1 | MODIFY |
| T4 | `src/components/business/CierreResumenCard.spec.ts` | F1 | MODIFY |
| T5 | `src/views/EventoDetalleView.spec.ts` | F1 | MODIFY |
| T6 | `src/views/PlanificarEventoView.spec.ts` | F1 | MODIFY |
| T7 | `src/utils/pricing.spec.ts` | F2a | NEW |
| T8 | `src/services/eventoProductos.service.spec.ts` | F2a | NEW |
| T9 | `src/stores/eventoProductos.store.spec.ts` | F2a | NEW |
| T10 | `src/composables/usePreciosEvento.spec.ts` | F2a | NEW |
| T11 | `src/components/business/MargenSlider.spec.ts` | F2a | NEW |
| T12 | `src/views/EventoProductosView.spec.ts` | F2a | NEW |
| T13 | `src/stores/ventas.store.spec.ts` | F2b | MODIFY |
| T14 | `src/views/PosView.spec.ts` | F2b | MODIFY |
| T15 | `src/composables/useReporteEvento.spec.ts` | F2c | NEW |
| T16 | `src/views/ReporteEventoView.spec.ts` | F2c | NEW |
| T17 | `src/views/HomeView.spec.ts` | F2c | MODIFY |
