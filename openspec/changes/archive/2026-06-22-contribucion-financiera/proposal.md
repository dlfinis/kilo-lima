# Proposal: `contribucion-financiera` — Contribution Margin, Break-Even & Pricing Guidance

> **Change**: `contribucion-financiera` | **Phase**: `sdd-propose` → feeds `sdd-spec`, `sdd-design`, `sdd-tasks`
> **Source**: Orchestrator-user exploration (feriante identifies pricing decision gap after `finanzas-evento` is live)
> **Artifact store mode**: `both` (filesystem + Engram) — per `openspec/config.yaml` `preflight.artifact_store_mode`
> **Delivery**: **1 SDD cycle → 2 apply phases = 2 PRs** (PR-1 = break-even projection; PR-2 = contribution margin + pricing alerts). Each PR is ≤ 400 prod lines. See §10.
> **Strict TDD**: `strict_tdd: true` (project invariant). Every `.ts` ships a `.spec.ts` first; every new `.vue` ships a `.spec.ts`.
> **Project state**: `foundation` + `catalog` + `events` + `pos` + `ux-improvements` + `finanzas-evento` are ARCHIVED (all green, 615 tests). This change **modifies** `pricing-evento` and `reporte-evento`, and **does NOT introduce any new top-level capability** — contribution margin is an extension of pricing math, break-even is an extension of the projection card, alerts are an extension of the per-evento product picker.

---

## 1. Summary

`finanzas-evento` taught the system to compute COGS, price by margin, and close a caja with the corrected formula. But it never answered the operator's daily question: **"¿este producto me deja plata o no?"** This change adds the **margen de contribución** (`precio − costo_producción`) as a first-class number visible per product in POS, in `EventoProductosView`, and in the post-evento report; introduces a **break-even projection** ("¿cuántas unidades tengo que vender para no perder?") in `ProyeccionCostosCard`; and surfaces **pricing alerts** in `EventoProductosView` — a red warning when the user types a price below `costo_producción` (selling at loss) and a soft suggestion showing the break-even-aware recommended minimum. The system stays advisory: the user can set any price, and setting prices above the minimum triggers no warning.

## 2. Motivation

The operator can now see `utilidadBruta` and `utilidadNeta` after cierre. But during the evento, and even when planning the next one, they cannot answer the most consequential question for a feriante:

> **"¿Cuántas unidades tengo que vender para cubrir la renta del puesto y los gastos fijos?"**

Why the current state breaks this:

| Gap | Why it matters | Where it lives today |
|---|---|---|
| **`costo_unitario` is production-only.** Today `productos.costo` is COGS (recetas + ingredientes). Operating costs (renta del puesto, indumentaria, decoracion, implementos) are captured in `gastosFijos` but only shown as a single line in the cierre. The operator never sees them per-product, so they cannot price per-product to recover them. | Without per-product contribution visibility, the operator treats every sale as "pure profit" until the cierre. The feria can end with positive `utilidadBruta` on paper but negative cash after `gastosFijos`. | `src/utils/cierre.ts`, `ProyeccionCostosCard.vue` |
| **No break-even projection.** The projection card shows `ingresoProyectado = costo / (1 − margen)`, but never combines ventas proyectadas with `gastosFijos` to compute "¿cuántas unidades para no perder?". | The operator plans pricing in isolation. They cannot tell whether 30% margin is enough to cover $100 of rent; they learn only at cierre. | `src/composables/useProyeccionCostos.ts`, `ProyeccionCostosCard.vue` |
| **No per-product contribution in the POS or reports.** The operator sees `precio_venta` and `costo` separately. The number that actually matters — "how much of this $8.33 covers fixed costs vs. is pure profit" — is not shown anywhere. | In a 4-product stand, one producto (e.g., brownies at 60% margin) may be paying the entire rent, while another (e.g., empanadas at 25% margin) is barely breaking even. The operator cannot see this without a spreadsheet. | `PosView.vue`, `ReporteEventoView.vue` |
| **No pricing guidance.** The operator sets any price they want in `EventoProductosView` and the system never says "this is below cost" or "this is below the break-even-aware minimum". | A typo (extra zero, decimal mistake) silently prices a product at a loss. By the time the cierre shows it, the operator has already sold 50 unidades. | `EventoProductosView.vue`, `MargenSlider.vue` |

This change does NOT solve all four with cost allocation (prorrateo). Cost allocation is accounting fiction — it changes with volume and creates the false impression that "this product's true cost is $7". Instead, we expose the **contribution margin** as the operator's truth: of every $1 sold, how much is available to pay fixed costs, and how much is pure profit.

## 3. Scope

### 3.1 In-scope

| # | Layer | Deliverable | Single Responsibility |
|---|---|---|---|
| 1 | **Utils** | `src/utils/contribucion.ts` (NEW) | Pure: `calcularContribucionUnitaria(precio, costo)`, `calcularContribucionPorcentual(precio, costo)`, `calcularBreakEvenUnidades(gastosFijosTotales, contribucionPromedioPonderada)`, `calcularPrecioMinimoBreakEven(costoProduccion, contribucionPorcentualObjetivo)`. `redondearCentavos` only at the end. |
| 2 | **Utils** | `src/utils/pricing.ts` (MODIFY) | Re-export the contribution utils so pricing.ts remains the single entry point for all margin math. No breaking changes to existing `calcularPrecioPorMargen` / `calcularMargenReal`. |
| 3 | **Composable** | `src/composables/useProyeccionCostos.ts` (MODIFY) | Extend `calcularProyeccion` to return `contribucionPromedioPonderada` and `breakEvenUnidades`. Reads `gastosFijos` from `useEvents` (already there) and `margenesEsperados` from `eventoProductos.store`. |
| 4 | **Composable** | `src/composables/usePreciosEvento.ts` (MODIFY) | Expose `contribucionParaProducto(eventoId, productoId)` returning `{ absoluta, porcentual, alerta }`. New pure read composable — no new service. |
| 5 | **Composable** | `src/composables/useReporteEvento.ts` (MODIFY) | Extend `reportePorProducto` to include `contribucionTotal`, `contribucionPorcentual`, `ranking` ("estrella" / "equilibrado" / "entrada" / "bajo"), `clasificacionUsuario` (input from operator, optional). |
| 6 | **Component** | `src/components/business/ProyeccionCostosCard.vue` (MODIFY) | Add new section: "Proyección de break-even" with `breakEvenUnidades`, `breakEvenIngreso`, and a progress indicator `ventasActuales / breakEvenUnidades` (live during evento). |
| 7 | **Component** | `src/components/business/ContribucionBadge.vue` (NEW) | Reusable Vuetify chip showing `contribucion absoluta` + `contribucion %`. Variants: `default` (neutral), `warning` (below 30%), `success` (above 50%), `error` (negative — selling at loss). Used by POS and reports. |
| 8 | **Component** | `src/components/business/PricingAlert.vue` (NEW) | Reusable Vuetify alert showing the pricing diagnosis: `error` (price < costo), `warning` (price < precioMinimoBreakEven), `success` (price ≥ precioMinimoBreakEven). Used by `EventoProductosView`. |
| 9 | **View** | `src/views/EventoProductosView.vue` (MODIFY) | Add `PricingAlert` column to the per-product table. Show live `contribucion` badge per row. Bulk action "APLICAR PRECIO MÍNIMO BREAK-EVEN" using `calcularPrecioMinimoBreakEven`. |
| 10 | **View** | `src/views/PosView.vue` (MODIFY) | Add `ContribucionBadge` to each product card. The badge shows `contribucion absoluta` (e.g., "+$3.33") and is color-coded. No alert on the POS card (POS is for fast sales, not pricing decisions) — alerts live in `EventoProductosView`. |
| 11 | **View** | `src/views/ReporteEventoView.vue` (MODIFY) | New tab "Contribución por producto": table sorted by `contribucionTotal DESC`. Each row shows: nombre, unidadesVendidas, ingresoTotal, contribucionTotal, contribucionPorcentual, ranking. Header banner: "Productos que pagaron la operación" (top 3) vs "Ganancia pura" (below the operating line). |
| 12 | **Component** | `src/components/business/CierreResumenCard.vue` (MODIFY) | Add a small "Contribución total" line (sum of `contribucionTotal` across all productos) showing how much of `utilidadNeta` came from contribution vs. fixed-cost recovery. Optional second line for the operator's intuition. |
| 13 | **Tests** | ~25 new unit + ~10 component | Pure utils first (RED-GREEN-REFACTOR); integration on `useReporteEvento`; component tests for `ContribucionBadge` and `PricingAlert`. |
| 14 | **Docs** | `docs/margen-de-contribucion.md` (NEW) | Business doc: what contribution margin is, how break-even is computed, how to read the alerts, when a "low contribution" product is OK (high-volume "entrada"). Spanish. |

**Counts**: 5 new files (2 `.ts` utils + 2 `.vue` components + 1 `.md` docs) + 8 modified files (4 `.vue`, 2 `.ts`, 1 `.vue` component, 1 composable). Estimated ~450 production lines + ~600 test lines across both PRs.

### 3.2 Out-of-scope (explicit non-goals)

- **NO cost allocation / prorrateo.** Operating costs are NOT allocated to products. They are reported as a total and used to compute break-even (a volume-based formula), not a per-unit cost. Prorrateo is accounting fiction that confuses operators — explicitly rejected during exploration.
- **NO inventory tracking.** Stock in/out is not modeled. Break-even is a unit count, not a "stock I need to buy" calculation. (Inventory is a future `inventario` slice.)
- **NO demand forecasting.** Break-even assumes the operator's `margenesEsperados` from `useProyeccionCostos`. We do not predict "will I sell 50 brownies on Saturday" — the operator estimates that. (Forecasting is a future `prediccion-demanda` slice.)
- **NO automatic pricing.** The system is advisory, not prescriptive. The operator can set any price; the system shows alerts. There is no "auto-set to optimal" button.
- **NO changes to closed-evento behavior.** A `cerrado` evento is immutable. Contribution / break-even numbers on a cerrado evento are frozen — no recomputation, no retroactive alerts.
- **NO currency / tax.** All money stays USD; contribution % stays percentage-based. Tax treatment is a future `settings` slice.
- **NO cross-evento comparison.** The contribution tab is per-evento only. Cross-evento "which brownie recipe gave the best contribution over the last 5 eventos" is a future `analytics` slice.
- **NO new top-level capability.** This is an extension of `pricing-evento` (margin math) and `reporte-evento` (per-product aggregation). No new folder under `openspec/specs/`.

## 4. User Stories

| # | As a … | I want to … | So that … |
|---|---|---|---|
| **US-1** | feria operator | see the break-even unit count next to my cost projection ("necesitas vender X unidades para cubrir $Y de gastos fijos") | I know the sales target before the evento starts and can adjust my product mix if X is unrealistic. |
| **US-2** | feria operator | see each product's contribution margin (absolute + percentage) in the POS | at a glance I know which products are pulling weight and which are barely breaking even. |
| **US-3** | feria operator | set any price I want when configuring an evento | the system is a tool, not a gate. I'm the one making pricing decisions. |
| **US-4** | feria operator | get a RED warning when I type a price below `costo_producción` | I catch typos (extra zero, decimal mistake) before I sell 50 unidades at a loss. |
| **US-5** | feria operator | get a SUGGESTION (not a warning) when I type a price below the break-even-aware minimum | I can price competitively without losing sight of what I need to recover fixed costs. |
| **US-6** | feria operator | see a ranking in the post-evento report — "estrella" (high margin + high volume), "equilibrado", "entrada" (low margin but high volume — pulls traffic) | I can decide what to keep, what to tweak, and what to drop for the next evento. |
| **US-7** | feria operator | see in the post-evento report which productos paid the operación (top contributors) vs which were pure profit (after fixed costs are covered) | I know which products earn their slot in the stand and which are just decoration. |

## 5. Acceptance Criteria

> Each AC is verifiable by `pnpm test` (unit / component), `pnpm build`, `pnpm typecheck`, `pnpm lint`, or a manual browser smoke. Tagged **[PR-1]** = PR-1 (break-even projection), **[PR-2]** = PR-2 (contribution + alerts + reports).

### 5.1 Pure utils (PR-1 + PR-2)

- [ ] **AC-1 [PR-1]**: `calcularContribucionUnitaria(8.33, 5)` returns `3.33` (after `redondearCentavos`). Verified by unit test with 5 representative inputs.
- [ ] **AC-2 [PR-2]**: `calcularContribucionPorcentual(8.33, 5)` returns `0.40` (40%). Verified bidirectionally (compute % from $; compute $ from %).
- [ ] **AC-3 [PR-1]**: `calcularBreakEvenUnidades(100, 3.33)` returns `31` (units needed to cover $100 at $3.33/unit). Rounded up — `ceil`, not `floor`. Verified with 5 representative inputs including zero-division guard (`contribucionPromedioPonderada = 0` → returns `Infinity`, surfaced to UI as "definí márgenes primero").
- [ ] **AC-4 [PR-2]**: `calcularPrecioMinimoBreakEven(costoProduccion, contribucionPorcentualObjetivo)` returns the price at which `contribucionUnitaria × ventasProyectadas >= gastosFijos`. Uses the operator's `ventasProyectadas` from `useProyeccionCostos`. Verified by unit test.
- [ ] **AC-5 [PR-1+PR-2]**: `redondearCentavos` is applied **only at the end** of every contribution / break-even computation — no intermediate rounding. Float-drift test asserted.

### 5.2 Projection & break-even (PR-1)

- [ ] **AC-6 [PR-1]**: `useProyeccionCostos().calcularProyeccion(eventoId)` returns the existing fields PLUS `breakEvenUnidades`, `breakEvenIngreso`, and `contribucionPromedioPonderada`. Existing field names preserved (no breaking changes for consumers of `calcularProyeccion`).
- [ ] **AC-7 [PR-1]**: `ProyeccionCostosCard` shows a new section "Break-even" with: `breakEvenUnidades` (e.g., "31 unidades"), `breakEvenIngreso` (e.g., "$258.23"), and a sub-line showing the operator's current `ventasActuales` (during `en_curso`) vs `breakEvenUnidades` as a percentage progress bar. Verified by component test.
- [ ] **AC-8 [PR-1]**: If the operator has not configured `margenesEsperados` (no evento_productos yet), the card renders an empty state: "Configurá los productos del evento para ver el break-even". Verified by component test.
- [ ] **AC-9 [PR-1]**: `ventasActuales` is computed live from the `ventas` store during `en_curso`, NOT from `cierres_caja` snapshot. After cierre, the card freezes the snapshot value. Verified by component test.

### 5.3 Contribution margin in POS (PR-2)

- [ ] **AC-10 [PR-2]**: `PosView` shows a `ContribucionBadge` per product card. The badge displays the absolute contribution (e.g., "+$3.33") and the percentage (e.g., "40%"). Verified by component test against `usePreciosEvento.contribucionParaProducto`.
- [ ] **AC-11 [PR-2]**: `ContribucionBadge` is color-coded: `error` (red) when `contribucionUnitaria < 0`, `warning` (amber) when `0 ≤ contribucionPorcentual < 0.30`, `default` (neutral) when `0.30 ≤ contribucionPorcentual < 0.50`, `success` (green) when `contribucionPorcentual ≥ 0.50`. Thresholds are constants, not magic numbers — defined in `src/utils/contribucion.ts` and unit-tested.
- [ ] **AC-12 [PR-2]**: The POS card layout still fits a 4-column Vuetify grid at 1024×768. Verified by component test that snapshot `expect(wrapper.html()).toContain('class="v-card ..."')` and the badge does not overflow.

### 5.4 Pricing alerts in `EventoProductosView` (PR-2)

- [ ] **AC-13 [PR-2]**: When the operator enters a `precio_venta < costo_producción` in `EventoProductosView`, the row shows a `PricingAlert` of severity `error` with message: "Estás vendiendo a pérdida. Costo: $5.00, precio: $4.00". Verified by component test with a controlled v-text-field input.
- [ ] **AC-14 [PR-2]**: When `costo_producción ≤ precio_venta < precioMinimoBreakEven`, the row shows a `PricingAlert` of severity `warning` with message: "Precio bajo el mínimo sugerido ($X) para alcanzar el break-even". Verified by component test.
- [ ] **AC-15 [PR-2]**: When `precio_venta ≥ precioMinimoBreakEven`, NO alert is shown. Verified by component test — `wrapper.find('[data-test="pricing-alert"]').exists() === false`.
- [ ] **AC-16 [PR-2]**: The operator CAN save any price (including below cost). The alert is informational, not a validation error. Verified by integration test that the save action succeeds with `precio_venta = 4.00` and `costo = 5.00`.
- [ ] **AC-17 [PR-2]**: A new bulk action "APLICAR PRECIO MÍNIMO BREAK-EVEN" in `EventoProductosView` sets every included `evento_producto.precio_venta = precioMinimoBreakEven(producto.costo)`. Confirmed by the user via a Vuetify dialog BEFORE the bulk write — no silent overwrites.

### 5.5 Reports (PR-2)

- [ ] **AC-18 [PR-2]**: `useReporteEvento(eventoId).reportePorProducto` returns extended rows with: `contribucionTotal` (= `ingresoTotal − cogsTotal`), `contribucionPorcentual` (= `contribucionTotal / ingresoTotal`), and `ranking` ("estrella" / "equilibrado" / "entrada" / "bajo"). Verified by unit test with a fixture of 5 productos covering all 4 rankings.
- [ ] **AC-19 [PR-2]**: `Ranking` is computed by the rules: `estrella` = `contribucionPorcentual ≥ 0.50 AND unidadesVendidas ≥ 10`; `entrada` = `contribucionPorcentual < 0.30 AND unidadesVendidas ≥ 20`; `bajo` = `contribucionPorcentual < 0.30 AND unidadesVendidas < 10`; `equilibrado` = everything else. Thresholds are constants. Unit-tested.
- [ ] **AC-20 [PR-2]**: `ReporteEventoView` has a new tab "Contribución" (4th tab alongside Por día / Por producto / Cierre). The tab renders a table sorted by `contribucionTotal DESC`, with columns: nombre | unidades | ingreso | contribucionTotal | contribucion% | ranking. Verified by component test.
- [ ] **AC-21 [PR-2]**: Above the table, a banner reads "Productos que pagaron la operación" listing the top 3 by `contribucionTotal`. Below, a secondary banner "Ganancia pura" lists productos whose `contribucionTotal` exceeds their pro-rata share of `gastosFijos`. Verified by component test.
- [ ] **AC-22 [PR-2]**: `CierreResumenCard` shows an OPTIONAL line "Contribución total: $X" computed as `Σ contribucionTotal`. The line is informational and never affects `utilidadNeta`. Verified by component test.

### 5.6 Quality gates

- [ ] **AC-23**: `pnpm test` passes. `pnpm build` succeeds. `pnpm lint` clean. `pnpm typecheck` clean.
- [ ] **AC-24**: All new and modified files respect the 200-line `.vue` cap and the 30-line function cap from `openspec/config.yaml` `rules.apply`.
- [ ] **AC-25**: Both PRs are ≤ 400 prod lines each.
- [ ] **AC-26**: Real-browser smoke per PR (manual checklist in PR description).

## 6. Non-Goals

Restated for emphasis (no duplication with §3.2):

- **No prorrateo / cost allocation.** Operating costs are not divided across products. They are a total, used to compute break-even via volume.
- **No inventory tracking.** Break-even is a unit count, not a stock calculation.
- **No demand forecasting.** The operator estimates ventasProyectadas; the system does not predict them.
- **No automatic pricing.** System is advisory. No "auto-set to optimal".
- **No retroactive edits on cerrado eventos.** Contribution and break-even numbers are frozen.
- **No tax / multi-currency.**
- **No cross-evento comparison** (per-evento only).
- **No new top-level capability.** Extends `pricing-evento` and `reporte-evento`; no new folder under `openspec/specs/`.

## 7. Dependencies

### 7.1 What this change depends on externally

| Dependency | Status | Why we need it |
|---|---|---|
| `pricing-evento` (archived) | ✅ Green | Provides `calcularPrecioPorMargen`, `calcularMargenReal`, `eventoProductos` store with `margen`, `costo`, `precio_venta` per row. We EXTEND this spec with contribution-aware scenarios. |
| `reporte-evento` (archived) | ✅ Green | Provides `useReporteEvento` composable, `ReporteEventoView` (3 tabs), `CierreResumenCard`. We MODIFY `useReporteEvento` to include contribution columns and add a 4th tab. |
| `finanzas-evento` migration (archived) | ✅ Green | `evento_productos` table with `costo` (joined from `productos`), `margen`, `precio_venta`. We READ from it. No new columns needed. |
| `pos` (archived) | ✅ Green | Provides `ventas`, `venta_items` schemas, POS product grid. We MODIFY `PosView` to add the contribution badge. No new tables. |
| `foundation` (archived) | ✅ Green | Provides `redondearCentavos`, `formatearUSD`. Reused for all new utils. |

### 7.2 What depends on this change (future slices)

| Future slice | Depends on |
|---|---|
| `inventario` | Contribution-aware reorder points: if a product is `estrella`, reorder earlier. |
| `prediccion-demanda` | Break-even formulas consume `ventasProyectadas` — the forecasting slice improves the input. |
| `analytics` | Per-evento contribution feeds cross-evento comparisons. |
| `reportes-export` | Contribution tab exports to PDF/CSV. |

## 8. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| **R-1** | **Operator sets price = cost, contribution = 0.** The badge shows 0% (default color) and may look like "neutral". | Medium | The badge has a `warning` color when contribution% is `0 ≤ x < 0.30` — covers the 0 case. AC-11 covers this. |
| **R-2** | **`breakEvenUnidades` returns `Infinity` when no evento_productos exist.** | Low | The UI renders an empty state with a CTA "Configurá los productos del evento". AC-3 + AC-8 cover this. |
| **R-3** | **PR-2 PR budget blown** — 5 new files + 8 modified + multiple views. | Medium | PR-2 is split into 2 sub-deliverables but lands as a single PR because the components (`ContribucionBadge`, `PricingAlert`) are tiny (≤ 80 lines each) and the views are 1-column / 1-tab additions. Forecast ≤ 350 prod lines. If the forecast slips, we chained-PR split (`PR-2a` = badges + alerts; `PR-2b` = report tab + ranking). |
| **R-4** | **Float drift in `breakEvenUnidades`** — `100 / 3.33` is not exact. | Medium | `calcularBreakEvenUnidades` uses `Math.ceil` AFTER `redondearCentavos`. Unit-tested with 10 representative inputs. |
| **R-5** | **Bulk action "APLICAR PRECIO MÍNIMO" overwrites operator-customized prices silently.** | High | A Vuetify confirmation dialog shows: "Vas a sobrescribir X productos. ¿Continuar?". The action is recorded in `evento_productos.updated_at` for traceability. AC-17 covers this. |
| **R-6** | **Operator confuses "contribution" with "profit".** A product with 60% contribution is NOT 60% profit — fixed costs come off the top. | Medium | `docs/margen-de-contribucion.md` explains the distinction in Spanish, with a worked example. `ContribucionBadge` tooltip says "Margen de contribución: cuánto queda para cubrir gastos fijos". |
| **R-7** | **`Ranking` thresholds (`estrella`, `entrada`) feel arbitrary to the operator.** | Medium | Thresholds are constants exported from `src/utils/contribucion.ts` and documented in `docs/margen-de-contribucion.md`. Operator feedback after first evento can adjust them in a future iteration. |
| **R-8** | **`ventasActuales` count in the projection card goes stale** if the ventas store is not loaded. | Low | `useProyeccionCostos` reads from `useVentas` (already loaded by `useResumen`). If `cargado === false`, the progress bar shows indeterminate state. Component-tested. |

## 9. Success Metrics

The change is **successful** when **all** of the following hold:

- [ ] **SM-1**: For any configured evento, the operator can state within 10 seconds: "¿cuántas unidades necesito vender para no perder?" — and the answer is on the screen in `ProyeccionCostosCard`.
- [ ] **SM-2**: When the operator accidentally types a price below `costo_producción` in `EventoProductosView`, a red `PricingAlert` appears within 200ms (real-time, no save needed). Verified by manual smoke.
- [ ] **SM-3**: After cierre, the post-evento report's "Contribución" tab shows every producto with its `contribucionTotal`, `contribucionPorcentual`, and `ranking`. The "Productos que pagaron la operación" banner correctly identifies the top 3 contributors. (Manual smoke.)
- [ ] **SM-4**: The system NEVER blocks the operator from saving a price. Any price below cost still saves. (Verified by integration test in AC-16.)
- [ ] **SM-5**: `pnpm test` shows ≥ 30 new passing tests across both PRs (PR-1: ~12, PR-2: ~18). Cumulative kilo-lima test count: 615 → ~645.
- [ ] **SM-6**: `git diff main -- package.json` returns empty (no new dependencies).
- [ ] **SM-7**: Both PRs land as ≤ 400 prod lines each. Each PR is independently reviewable.
- [ ] **SM-8**: `docs/margen-de-contribucion.md` exists and explains (in Spanish) what contribution margin is, how break-even is computed, and how to read the alerts and rankings. Reviewed by the user before PR-2 archive.

## 10. Delivery Plan — 2 PRs, 1 SDD Cycle

> **One cycle**: proposal → spec → design → tasks. **Two apply phases / PRs**. Each PR is independently reviewable and reverts cleanly.

### 10.1 PR-1 — Break-even projection

**Goal**: Add `breakEvenUnidades` and `breakEvenIngreso` to the projection card. Pure utils + composable + 1 component. No new tables, no new views.

| Layer | Files | Notes |
|---|---|---|
| Utils | `src/utils/contribucion.ts` (NEW) | `calcularContribucionUnitaria`, `calcularContribucionPorcentual`, `calcularBreakEvenUnidades`. Pure, no Vue dependencies. |
| Utils | `src/utils/pricing.ts` (MODIFY) | Re-export contribution utils. |
| Composable | `src/composables/useProyeccionCostos.ts` (MODIFY) | Extend `calcularProyeccion` to return `contribucionPromedioPonderada`, `breakEvenUnidades`, `breakEvenIngreso`. |
| Component | `src/components/business/ProyeccionCostosCard.vue` (MODIFY) | Add "Break-even" section with unit count, ingreso, and live `ventasActuales / breakEvenUnidades` progress bar. |
| Tests | ~12 new + ~3 modified | Pure utils + composable + component. |

**ACs landed**: AC-1, AC-3, AC-5 (partial), AC-6, AC-7, AC-8, AC-9, AC-23, AC-24, AC-25.

**Branch**: `feat/contribucion-break-even`.

---

### 10.2 PR-2 — Contribution margin in POS + reports + pricing alerts

**Goal**: Show contribution everywhere it matters (POS, EventoProductosView, ReporteEventoView) and add pricing alerts. Builds on PR-1.

| Layer | Files | Notes |
|---|---|---|
| Utils | `src/utils/contribucion.ts` (MODIFY) | Add `calcularPrecioMinimoBreakEven`, `UMBRAL_ENTRADA`, `UMBRAL_ESTRELLA` constants. |
| Composable | `src/composables/usePreciosEvento.ts` (MODIFY) | Add `contribucionParaProducto(eventoId, productoId)`. |
| Composable | `src/composables/useReporteEvento.ts` (MODIFY) | Extend `reportePorProducto` with `contribucionTotal`, `contribucionPorcentual`, `ranking`. |
| Component | `src/components/business/ContribucionBadge.vue` (NEW) | Reusable chip with color-coded variants. |
| Component | `src/components/business/PricingAlert.vue` (NEW) | Reusable Vuetify alert with `error` / `warning` / hidden variants. |
| View | `src/views/EventoProductosView.vue` (MODIFY) | Add `PricingAlert` column + bulk action. |
| View | `src/views/PosView.vue` (MODIFY) | Add `ContribucionBadge` per card. |
| View | `src/views/ReporteEventoView.vue` (MODIFY) | Add 4th tab "Contribución" + banners. |
| Component | `src/components/business/CierreResumenCard.vue` (MODIFY) | Add optional "Contribución total" line. |
| Docs | `docs/margen-de-contribucion.md` (NEW) | Spanish business doc. |
| Tests | ~18 new + ~7 modified | Pure utils + composable + components + views. |

**ACs landed**: AC-2, AC-4, AC-5 (final), AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23 (final), AC-24 (final), AC-25 (final), AC-26.

**Branch**: `feat/contribucion-margin-alerts`.

---

### 10.3 Cumulative totals

| Phase | Prod lines | Test lines | PRs |
|---|---|---|---|
| PR-1 | ~150 | ~250 | 1 |
| PR-2 | ~300 | ~350 | 1 |
| **Total** | **~450** | **~600** | **2** |

Both PRs respect the 400-line review budget. PR-1 lands first (smaller, sets up the utils). PR-2 builds on PR-1 (the contribution utils are already in place). If PR-2 slips beyond 400 lines, it splits into `PR-2a` (badges + alerts) and `PR-2b` (report tab + ranking) — chained, not stacked.

## 11. Product Decisions Log

The following 6 decisions are LOCKED (user-confirmed during orchestrator-user exploration). The proposal does not re-litigate them. sdd-spec must reflect them verbatim.

| # | Decision | Rationale | Source |
|---|---|---|---|
| **PD-C1** | **Use contribution margin, NOT cost allocation / prorrateo.** Operating costs (`gastosFijos`) are reported as a total and used to compute break-even (volume-based), never allocated per product. | Prorrateo is accounting fiction — it creates the false impression that a producto's "true cost" is $X when in reality $X changes with volume. Contribution margin answers the operator's actual question: "of every $1 I sell, how much pays the rent vs. is pure profit?" | orchestrator 2026-06-20, citing standard managerial accounting distinction between absorption costing (prorrateo) and variable costing (contribution). |
| **PD-C2** | **Alert when `precio < costo_producción` (selling at loss), suggest when `precio < precioMinimoBreakEven`.** Red error for the first, amber warning for the second. NO alert when `precio ≥ precioMinimoBreakEven` — operator is free to set any price above the suggestion. | Three tiers match the operator's intuition: (1) red = "you are losing money on every sale"; (2) amber = "you are profitable but below what you'd need to break even"; (3) no message = "you know what you're doing". | user 2026-06-20: "ALERT si el precio está por debajo del mínimo recomendado (warning rojo)" and "No alert si está por encima". |
| **PD-C3** | **User sets prices freely — system is advisory, not restrictive.** Any price (including below cost) saves successfully. The alert is informational, not a validation error. | The operator is the decision-maker. A restriction breaks trust ("the system is blocking my decision"). An alert surfaces the consequence without taking the decision away. | user 2026-06-20: "Puedo ajustar precios libremente (subir o bajar)". |
| **PD-C4** | **`breakEvenUnidades = ceil(gastosFijosTotales / contribucionPromedioPonderada)`.** `contribucionPromedioPonderada` is the unit-weighted average contribution across all included `evento_productos`, using `margenesEsperados` as weights. | Volume-weighted because different products have different margins; the operator cares about how many TOTAL units (mixed basket) they need to sell, not how many of any single product. `ceil` because you can't sell 30.5 unidades — you need 31 to be safe. | standard managerial-accounting formula; `ceil` matches user intuition of "minimum to not lose". |
| **PD-C5** | **Reports show "qué productos pagaron la operación y cuáles fueron ganancia pura".** The Contribución tab shows the top-3 contributors banner ("pagaron la operación") and a secondary banner ("ganancia pura" — products whose contribution exceeds their pro-rata share of gastosFijos). | Two-tier narrative matches the operator's mental model: there are products that EARN their slot (pay for the booth) and products that ADD to profit (after the booth is paid). Without this distinction, the operator treats every product equally and may cut a low-contribution "entrada" product that actually pulls traffic. | user 2026-06-20: "Necesito identificar: qué productos son 'de entrada' (alto volumen, bajo margen) vs 'premium' (bajo volumen, alto margen)". |
| **PD-C6** | **Multiple products — UI scales, no artificial limits.** `EventoProductosView` table and the POS grid support 30+ products without performance degradation. The Contribución tab in the report sorts and paginates (Vuetify `v-data-table`) when more than 20 productos. | User has 30+ productos in catalog; the system is built for feria operators, not single-product stalls. | user 2026-06-20: "Múltiples productos — debe escalar a muchos productos". |

---

## 12. Capabilities (contract with `sdd-spec`)

> This section is MANDATORY — it is the contract between the proposal and the `sdd-spec` phase. sdd-spec reads it to know which `openspec/specs/<name>/spec.md` files to create or update.

### 12.1 New Capabilities

**None.** This change extends existing capabilities rather than introducing new ones. The contribution margin is a refinement of pricing math; break-even is a refinement of the projection; alerts are a refinement of the per-evento product picker.

### 12.2 Modified Capabilities (delta specs)

| Capability | What requirement is changing | Delta goes in |
|---|---|---|
| **`pricing-evento`** | New requirement: `calcularContribucionUnitaria` + `calcularContribucionPorcentual` + `calcularPrecioMinimoBreakEven` (pure utils). New requirement: `usePreciosEvento.contribucionParaProducto`. New scenario in `calcularPrecioPorMargen` REQ: shows `contribucionUnitaria` as a side-output. New scenario: `PricingAlert` severity rules. New requirement: `ContribucionBadge` color thresholds. | `openspec/changes/contribucion-financiera/specs/pricing-evento.md` |
| **`reporte-evento`** | Extend `reportePorProducto` requirement with `contribucionTotal`, `contribucionPorcentual`, `ranking` fields. New requirement: `Ranking` computation rules (estrella/equilibrado/entrada/bajo). New requirement: `ReporteEventoView` 4th tab "Contribución" with banners ("Productos que pagaron la operación" + "Ganancia pura"). Extend `CierreResumenCard` with optional "Contribución total" line. | `openspec/changes/contribucion-financiera/specs/reporte-evento.md` |
| **`pos`** | New requirement: `PosView` shows `ContribucionBadge` per product card. | `openspec/changes/contribucion-financiera/specs/pos.md` |
| **`events`** | New requirement: `ProyeccionCostosCard` shows "Break-even" section with `breakEvenUnidades`, `breakEvenIngreso`, and live progress bar. New requirement: `calcularProyeccion` returns extended fields. | `openspec/changes/contribucion-financiera/specs/events.md` |

### 12.3 Unchanged capabilities (explicit "no delta")

- `foundation` — no new requirements. `redondearCentavos`, `formatearUSD` are reused.
- `catalog` — no new requirements. `productos.costo` is read as-is.
- `app-shell`, `fab`, `home` — no changes (the post-evento home card was enabled in `finanzas-evento`).

---

## 13. Rollback Plan

The change is split into 2 PRs. Each PR is independently revertable:

1. **PR-1 (break-even projection)**: revert `src/utils/contribucion.ts`, revert the changes to `src/utils/pricing.ts` and `src/composables/useProyeccionCostos.ts`, revert `ProyeccionCostosCard.vue`. The projection card returns to showing only `ingresoProyectado` and `margenEsperado` per product. No data loss — no DB migration.
2. **PR-2 (contribution + alerts + reports)**: revert `ContribucionBadge.vue`, `PricingAlert.vue`, revert the changes to `usePreciosEvento`, `useReporteEvento`, `EventoProductosView`, `PosView`, `ReporteEventoView`, `CierreResumenCard`. Revert `docs/margen-de-contribucion.md`. POS cards return to showing only `precio_venta`. Reports lose the 4th tab. No data loss — no DB migration.

**Why rollback is safe**:
- No DB migration in this change. All data lives in existing tables (`evento_productos`, `venta_items`, `cierres_caja`).
- The new utils (`calcularBreakEvenUnidades`, etc.) are read-only consumers of existing fields.
- The new components (`ContribucionBadge`, `PricingAlert`) are presentational only — no state of their own.
- The new tab in `ReporteEventoView` is an additional tab — removing it returns the view to 3 tabs.

**Full-system rollback**: revert both PRs in reverse order. The codebase returns to the `finanzas-evento`-archived state with the original `ProyeccionCostosCard`, `PosView`, `EventoProductosView`, `ReporteEventoView`, and `CierreResumenCard`.

---

## 14. References

- `openspec/specs/pricing-evento/spec.md` — REQ-PRICING-* (per-evento margin math, `calcularPrecioPorMargen`, `calcularMargenReal`, `MargenSlider`).
- `openspec/specs/reporte-evento/spec.md` — REQ-REPORTE-* (`reportePorDia`, `reportePorProducto`, `ReporteEventoView` 3 tabs).
- `openspec/specs/events/spec.md` — REQ-EVENTS-* (multi-day eventos, `ProyeccionCostosCard` location).
- `openspec/specs/pos/spec.md` — REQ-POS-* (POS product grid, `PosView.vue`).
- `openspec/config.yaml` — `strict_tdd: true`, `test_command: "pnpm test"`, `review_budget_lines: 400`, `preflight.artifact_store_mode: both`, `preflight.delivery_strategy: ask-always`.
- `src/composables/usePreciosEvento.ts` — current price source for POS.
- `src/composables/useProyeccionCostos.ts` — current `calcularProyeccion` (extended in PR-1).
- `src/components/business/ProyeccionCostosCard.vue` — current projection card (extended in PR-1).
- `src/components/business/CierreResumenCard.vue` — current cierre summary (extended in PR-2).
- `src/views/PosView.vue` — current POS product grid (extended in PR-2).
- `src/views/EventoProductosView.vue` — current per-evento product picker (extended in PR-2).
- `src/views/ReporteEventoView.vue` — current post-evento report (extended in PR-2).
- Managerial-accounting standard: contribution margin = revenue − variable cost (NOT allocated fixed cost). Break-even = fixed costs / contribution per unit. Source: any intro to managerial accounting (Garrison, Noreen, Brewer).

---

## 15. Ready for Specs

**Yes.** The orchestrator should proceed with `sdd-spec contribucion-financiera` to write:

1. **DELTA** `openspec/changes/contribucion-financiera/specs/pricing-evento.md` — `calcularContribucionUnitaria`, `calcularContribucionPorcentual`, `calcularPrecioMinimoBreakEven`, `ContribucionBadge`, `PricingAlert`, `usePreciosEvento.contribucionParaProducto`.
2. **DELTA** `openspec/changes/contribucion-financiera/specs/reporte-evento.md` — extend `reportePorProducto` with contribution columns + `Ranking` rules; add 4th tab "Contribución" with banners.
3. **DELTA** `openspec/changes/contribucion-financiera/specs/pos.md` — `PosView` shows `ContribucionBadge` per product card.
4. **DELTA** `openspec/changes/contribucion-financiera/specs/events.md` — `ProyeccionCostosCard` shows "Break-even" section; `calcularProyeccion` extended.

The 6 product decisions in §11 are locked (no need to re-litigate them in the specs).