# Tasks: `pos` — Caja Registradora

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,700 (2,000 prod + 700 specs) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 5 PRs stacked-to-main |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Lines | Notes |
|------|------|----|-------|-------|
| 1 | Schema + types + cierre pure math | PR1 | ~430 | F2 split: PR1a schema+types ~220, PR1b utils+specs ~210 |
| 2 | Productos domain (service, store, CRUD view) | PR2 | ~500 | Base: main |
| 3 | Ventas + cart + components + PosView | PR3 | ~550 | F2 split: PR3a ventas service+store ~250, PR3b components+view ~300 |
| 4 | Imprevistos + cierre services/stores/views | PR4 | ~450 | Base: main |
| 5 | Router + cross-slice + docs + verify | PR5 | ~80 | Lazy routes, RecetaDetalleView, docs |

## PR 1 — Schema + Types + Cierre Pure Math

- [ ] 1.1 Write `src/utils/cierre.spec.ts` (RED) — `calcularCierre` edge cases (empty, mixed pago, diferencia ±/0/null, float-drift) + `formatearDiferencia`
- [ ] 1.2 Implement `src/utils/cierre.ts` (GREEN) — `calcularCierre(input)` + `formatearDiferencia(monto)`
- [ ] 1.3 Create `src/types/pos.types.ts` — Domain types: Producto, Venta, VentaItem, GastoImprevisto, CierreCaja, enums, *Input, cart/cierre shapes
- [ ] 1.4 Extend `src/types/database.types.ts` — 5 tables (Row, Insert, Update, Relationships)
- [ ] 1.5 Modify `src/types/index.ts` — Re-export pos types
- [ ] 1.6 Create `supabase/migrations/20260619000000_pos_inicial.sql` — 5 tables (idempotent), FKs, CHECKs, indexes, RLS, updated_at trigger on productos
- [ ] 1.7 Extend `supabase/dev_bypass_rls.sql` — Grant anon to 5 new tables

## PR 2 — Productos Domain

- [x] 2.1 Write `src/services/productos.service.spec.ts` (RED) — CRUD + UNIQUE receta_id + RESTRICT FK scenarios
- [x] 2.2 Implement `src/services/productos.service.ts` (GREEN) — Factory `crearProductosService(supabase)`
- [x] 2.3 Write `src/stores/productos.store.spec.ts` (RED) — cargarDisponibles, crear, actualizar, eliminar
- [x] 2.4 Implement `src/stores/productos.store.ts` (GREEN) — Pinia store with `inject('supabase')`
- [x] 2.5 Implement `src/composables/useProductos.ts` — `storeToRefs` wrapper
- [x] 2.6 Implement Productos CRUD view — minimal management (precio_venta, disponible toggle, orden) + spec

## PR 3 — Ventas + Cart + Components + PosView

- [ ] 3.1 Write `src/services/ventas.service.spec.ts` (RED) — `listarPorEvento`, `registrarVenta` header+items, item failure rollback
- [ ] 3.2 Implement `src/services/ventas.service.ts` (GREEN) — Factory with `registrarVenta(input)` chain (insert header → Promise.all items)
- [ ] 3.3 Write `src/stores/ventas.store.spec.ts` (RED) — Cart state machine: agregar/quitar/vaciar/actualizarCantidad (qty=0 removes, qty≥99 capped) + optimistic registrarVenta + revert-on-failure
- [ ] 3.4 Implement `src/stores/ventas.store.ts` (GREEN) — Pinia store with carrito ref, `// TODO(offline-sync):` marker, `estadoEsEditable` guard, SIN_EVENTO_ACTIVO
- [ ] 3.5 Write `src/composables/useVentas.spec.ts` (RED) — Cart math (subtotal, total, itemCount, merge duplicates)
- [ ] 3.6 Implement `src/composables/useVentas.ts` (GREEN) — `storeToRefs` + cart helper wrappers
- [ ] 3.7 Write 5 component specs (RED) — ProductoCard, ProductoGrid, CarritoPanel, VentaItem, RegistrarVentaDialog
- [ ] 3.8 Implement 5 components (GREEN) — Cards (≥48px tap), responsive grid, sidebar/bottom-sheet panel, quantity controls, payment dialog
- [ ] 3.9 Write `src/views/PosView.spec.ts` (RED) — event picker vs grid, 4-state (loading/error/empty/data), no-evento guard, cerrado read-only
- [ ] 3.10 Implement `src/views/PosView.vue` (GREEN) — Main POS: eventoEnCurso check, grid+cart+imprevistos section+online-status chip (REQ-POS-49)

## PR 4 — Gastos Imprevistos + Cierre

- [ ] 4.1 Write `src/services/gastosImprevistos.service.spec.ts` (RED) → implement service (GREEN) — CRUD per-evento
- [ ] 4.2 Write `src/stores/gastosImprevistos.store.spec.ts` (RED) → implement store (GREEN) — EVENTO_CERRADO guard via `estadoEsEditable`
- [ ] 4.3 Implement `src/composables/useGastosImprevistos.ts` — Thin store wrapper
- [ ] 4.4 Write `src/services/cierres.service.spec.ts` (RED) → implement service (GREEN) — `obtenerPorEvento`, `crear`, no `actualizar`
- [ ] 4.5 Write `src/stores/cierres.store.spec.ts` (RED) → implement store (GREEN) — `registrarCierre` (insert + cambiarEstado), UNIQUE violation
- [ ] 4.6 Write `src/composables/useCierreCaja.spec.ts` (RED) → implement `useCierreCaja.ts` (GREEN) — Wraps cierres.store + `calcularCierre` + `transicionEstadoValida`
- [ ] 4.7 Write 3 component specs (RED) — GastoImprevistoForm, GastoImprevistoListItem, CierreResumenCard
- [ ] 4.8 Implement 3 components (GREEN) — Form (monto>0, motivo≤500), ListItem row, ResumenCard (4 sections + yellow alert on diferencia≠0)
- [ ] 4.9 Write `src/views/PosCierreView.spec.ts` (RED) → implement view (GREEN) — Cierre page with cash-count inputs, confirm dialog, redirect, retroactive cierre support

## PR 5 — Router + Cross-slice + Docs + Verify

- [ ] 5.1 Modify `src/router/routes.ts` — Append lazy routes: `/pos` → PosView, `/pos/cierre/:eventoId` → PosCierreView (props:true)
- [ ] 5.2 Modify `src/router/routes.spec.ts` — 2 new assertions for route resolution
- [ ] 5.3 Modify `src/views/RecetaDetalleView.vue` — Add "Vender esta receta" button + precio_venta dialog when no producto exists; add 2 tests to `.spec.ts`
- [ ] 5.4 Create `docs/pos-setup.md` — One-time setup: migration + bypass + cart-refresh caveat
- [ ] 5.5 Final verify — `pnpm test` (≥80 passing), `pnpm typecheck` (0), `pnpm build` (passes)

Total: ~35 tasks across 5 PRs. ~80 new tests. strict TDD (RED→GREEN per file).
