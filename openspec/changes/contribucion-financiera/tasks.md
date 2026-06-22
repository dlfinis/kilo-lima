# Tasks: `contribucion-financiera` — Contribution Margin, Break-Even & Pricing Guidance

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 (PR-1) + ~300 (PR-2) = ~450 prod |
| 400-line budget risk | **Low** — each PR ≤ 400 |
| Chained PRs recommended | No — already split, each fits budget |
| Delivery strategy | ask-always (resolved by user plan) |
| Chain strategy | stacked-to-main (PR-1 → main, PR-2 → main) |

### Suggested Work Units

| Unit | Goal | Likely PR | Base |
|------|------|-----------|------|
| 1 | Break-even projection (utils + composable + card) | PR-1 | `main` |
| 2 | Contribution margin + alerts + reports (components + views) | PR-2 | `main` |

---

## PR-1: Break-even Projection (~150 prod lines)

- [ ] **1.1** | Utils | `src/utils/contribucion.ts` (CREATE) | REQ-CON-1,2,3 | TDD: 1.2 first | Dep: none | ~50 lines | 4 pure fns: `calcularContribucionUnitaria`, `calcularContribucionPorcentual`, `calcularBreakEvenUnidades`, `calcularPrecioMinimoBreakEven` + ranking classifier (`clasificarProducto`) + thresholds as exported constants
- [ ] **1.2** | Utils | `src/utils/contribucion.spec.ts` (CREATE) | REQ-CON-1,2,3 | TDD: N/A (is the spec) | Dep: none | ~0 prod (test) | 12+ tests: positive/negative/zero/Infinity/float-drift coverage for all pure fns — write FIRST per strict TDD
- [ ] **1.3** | Types | `src/types/events.types.ts` (MODIFY) | REQ-CON-4 | TDD: none | Dep: none | ~10 lines | Extend `ProyeccionResultado` with `breakEvenUnidades`, `breakEvenIngreso`, `contribucionPromedioPonderada` (`number \| null`)
- [ ] **1.4** | Composables | `src/composables/useProyeccionCostos.ts` (MODIFY) | REQ-CON-4 | TDD: existing spec | Dep: 1.1, 1.3 | ~40 lines | `calcularProyeccion` — add optional `productos` param; return new break-even + contribution fields
- [ ] **1.5** | Components | `src/components/business/ProyeccionCostosCard.vue` (MODIFY) | REQ-CON-5 | TDD: existing spec | Dep: 1.4 | ~30 lines | Add "Break-even" section: unidad count, ingreso, live progress bar `ventasActuales/breakEvenUnidades` + empty state when no productos
- [ ] **1.6** | Cross-cutting | `src/utils/pricing.ts` (MODIFY) | REQ-CON-1 | TDD: none | Dep: 1.1 | ~5 lines | Re-export contribution utils from `contribucion.ts` so `pricing.ts` stays the single entry point
- [ ] **1.7** | Cross-cutting | `pnpm test && pnpm lint && pnpm typecheck` | AC-23,24,25 | — | Dep: 1.1-1.6 | ~0 | Quality gates pass. Create `scripts/verify-contribucion-pr1.mjs` + `"verify:contribucion-pr1"` npm script

## PR-2: Contribution Margin + Alerts + Reports (~300 prod lines)

- [x] **2.1** | Components | `src/components/business/ContribucionBadge.vue` (CREATE) | REQ-CON-6 | TDD: `ContribucionBadge.spec.ts` first | Dep: 1.1 | ~50 lines | Color-coded v-chip: error(red<0), warning(amber 0-30%), default(30-50%), success(green≥50%) + tooltip "Margen de contribución"
- [x] **2.2** | Components | `src/components/business/PricingAlert.vue` (CREATE) | REQ-CON-7 | TDD: `PricingAlert.spec.ts` first | Dep: 1.1 | ~40 lines | v-alert: red when `precio < costo`, amber when `precio < breakEvenMin`, hidden when `≥ min` — advisory, no save blocking
- [x] **2.3** | Composables | `src/composables/usePreciosEvento.ts` (MODIFY) | REQ-CON-8 | TDD: existing spec | Dep: 1.1, 2.1 | ~30 lines | Add `contribucionParaProducto(eventoId, prodId)` and `precioMinimoParaProducto(prodId)` — pure read composables
- [x] **2.4** | Views | `src/views/PosView.vue` (MODIFY) | REQ-CON-8 | TDD: existing spec | Dep: 2.1, 2.3 | ~15 lines | Add `<ContribucionBadge>` per product card; badge must fit 4-col grid at 1024×768
- [x] **2.5** | Views | `src/views/EventoProductosView.vue` (MODIFY) | REQ-CON-9,10 | TDD: existing spec | Dep: 2.2, 2.3 | ~50 lines | Add `<PricingAlert>` per row, reactive on `precio_venta` input; bulk action "APLICAR PRECIO MÍNIMO BREAK-EVEN" with confirmation dialog
- [x] **2.6** | Composables | `src/composables/useReporteEvento.ts` (MODIFY) | REQ-CON-11 | TDD: existing spec | Dep: 1.1 | ~40 lines | Extend `reportePorProducto` with `contribucionTotal`, `contribucionPorcentual`, `ranking` (estrella/equilibrado/entrada/bajo); add `rankingContribucion`, `productosPagaronOperacion`, `productosGananciaPura` computeds
- [x] **2.7** | Views | `src/views/ReporteEventoView.vue` (MODIFY) | REQ-CON-12,13,14 | TDD: existing spec | Dep: 2.6 | ~50 lines | Add "Contribución" tab (4th): table sorted by `contribucionTotal DESC` with columns nombre|unidades|ingreso|contribucionTotal|%|ranking + "pagaron la operación" top-3 banner + "ganancia pura" section
- [x] **2.8** | Components | `src/components/business/CierreResumenCard.vue` (MODIFY) | REQ-CON-15 | TDD: existing spec | Dep: 2.6 | ~10 lines | Add informational line "Contribución total: $X" after `utilidadBruta` — does not affect `utilidadNeta`
- [x] **2.9** | Docs | `docs/margen-de-contribucion.md` (CREATE) | REQ-CON (docs) | TDD: none | Dep: none | ~15 lines | Spanish business guide: qué es margen de contribución, cómo se calcula break-even, cómo leer alertas y rankings
- [x] **2.10** | Cross-cutting | `pnpm test && pnpm lint && pnpm typecheck` | AC-23,24,25 | — | Dep: 2.1-2.9 | ~0 | Quality gates pass + verify all new tests pass (cumulative: 615 → ~645)
- [x] **2.11** | Verify | Create `scripts/verify-contribucion-pr2.mjs` + `"verify:contribucion-all"` npm script | AC-26 | — | Dep: 2.10 | ~0 | Verification script for PR-2 + combined `verify:contribucion-all` running both PR-1 and PR-2 checks

## Implementation Order

PR-1 (tasks 1.1–1.7) lands first — it establishes the pure math utils, extended types, and the composable/component changes for break-even. PR-2 (tasks 2.1–2.11) builds on PR-1's utils. Within each PR, follow the numbered order: test-first (1.2 before 1.1 for TDD), then foundation → core → wiring → verify.
