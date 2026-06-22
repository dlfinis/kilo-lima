# Design: `contribucion-financiera` — Contribution Margin, Break-Even & Pricing Guidance

> **Phase**: `sdd-design` | **Spec**: [spec.md](./spec.md)
> **PR-1** (break-even) + **PR-2** (contribution + alerts + reports)
> **Lines budget**: ~150 (PR-1) + ~300 (PR-2) = ~450 prod

## Technical Approach

**VIEW LAYER + UTILS addition** — no new stores, services, routes, or DB changes. Pure calculation functions in `src/utils/contribucion.ts` compute contribution and break-even math; presentational Vue components consume them reactively via existing composables and stores. All inputs are already loaded — `useEvents` (gastosFijos), `usePreciosEvento` (costo_unitario, precio_final), `useVentas` (ventasActuales), `useReporteEvento` (venta_items).

## Architecture Decisions

| Decision | Option | Tradeoff | Verdict |
|----------|--------|----------|---------|
| Pure vs composable break-even | Put math in `calcularProyeccion` pure fn (add param) | Pure fn already has cost logic; adding products param couples it to event_productos | **Extend pure fn**: adds optional `productos?: EventoProductoConDetalle[]` param; when absent, new fields = null. Backward-compatible, fully testable. |
| `calcularBreakEvenUnidades` rounding | `Math.ceil` vs `Math.round` | Round could undershoot — "30.2 → 30" means operator is short 0.2 units of contribution | **`Math.ceil`** (conservative — PD-C4). Zero-division → `Infinity`. |
| `rankingContribucion` data source | Compute from venta_items in `useReporteEvento` vs join from `usePreciosEvento` | venta_items are already loaded in the report path; no extra DB query | **venta_items** (already in `reportePorProducto`). |
| "Ganancia pura" logic | Accumulated contribution vs pro-rata share | Pro-rata is simpler but treats all products equally | **Accumulated**: products sold after cumulative contribution exceeds `gastosFijos` are "ganancia pura" (matches PD-C5). |
| Naming: `calcularMargenContribucion` vs `calcularContribucionUnitaria` | Orchestrator brief vs spec | Spec is SDD source of truth | **Spec names**: `calcularContribucionUnitaria`, `calcularContribucionPorcentual`, `calcularBreakEvenUnidades`, `calcularPrecioMinimoBreakEven`. See reconciliation below. |

### Naming reconciliation

The orchestrator brief used `calcularMargenContribucion`/`calcularMargenContribucionPorcentaje`/`calcularPuntoEquilibrio`. The spec (REQ-CON-1..3) formalized them as `calcularContribucionUnitaria`/`calcularContribucionPorcentual`/`calcularBreakEvenUnidades`. The spec is the design contract — all implementation references use spec names. The brief's `calcularMargenContribucion` ≡ `calcularContribucionUnitaria`, `calcularPuntoEquilibrio` ≡ `calcularBreakEvenUnidades`.

## Data Flow

```
useEventsStore ─── gastosFijos ──┐
useEventoProductosStore ────┐    │
  EventoProductoConDetalle[]─┤    │
useRecipesStore ─── recetas ─┤    │    calcularProyeccion(          ProyeccionCostosCard
useIngredientsStore - mprimas┤    │      evento, gastos, plan,      "Break-even" section
usePlansStore ────── plan ───┤    │      recetas, mprimas,          ├─ breakEvenUnidades
                             │    │      productos ← NEW param       ├─ breakEvenIngreso
                             └────┤    )──→ ProyeccionResultado ────┼─ progress bar
usePreciosEvento ─── EventoProductoConDetalle[]                      └─ contribucionPromedio
  └─ contribucionParaProducto(id) → { absoluta, porcentual }
        │                              │
        ├── PosView ──→ ContribucionBadge per card
        │
        └── EventoProductosView ──→ PricingAlert per row
                                       + bulk break-even action

useVentasStore/useReporteEvento ── venta_items
  └─ reportePorProducto (extended)
       ├─ contribucionTotal, contribucionPorcentual, ranking
       ├─ rankingContribucion (sorted desc)
       └─ ReporteEventoView "Contribución" tab
            ├─ top-3 banner
            └─ gananciaPura section
```

## File Changes

| File | Action | PR | Description |
|------|--------|-----|-------------|
| `src/utils/contribucion.ts` | **Create** | 1 | 4 pure functions (REQ-CON-1..3) + ranking thresholds |
| `src/utils/contribucion.spec.ts` | **Create** | 1 | 12+ tests: positive/negative/zero/Infinity/float-drift |
| `src/utils/pricing.ts` | Modify | 1 | Re-export `src/utils/contribucion.ts` |
| `src/types/events.types.ts` | Modify | 1 | ProyeccionResultado: +`breakEvenUnidades`, +`breakEvenIngreso`, +`contribucionPromedioPonderada` (all `number \| null`) |
| `src/types/pos.types.ts` | Modify | 2 | DesgloseProducto: +`contribucionTotal`, +`contribucionPorcentual`, +`ranking` |
| `src/composables/useProyeccionCostos.ts` | Modify | 1 | `calcularProyeccion`: add optional `productos` param; composable reads eventoProductosStore |
| `src/components/business/ProyeccionCostosCard.vue` | Modify | 1 | "Break-even" section: unidades, ingreso, progress bar `ventasActuales/breakEvenUnidades` |
| `src/composables/usePreciosEvento.ts` | Modify | 2 | +`contribucionParaProducto(eventoId, productoId)`; +`precioMinimoParaProducto(productoId)` |
| `src/composables/useReporteEvento.ts` | Modify | 2 | +`rankingContribucion`; +`productosPagaronOperacion`; +`productosGananciaPura` |
| `src/components/business/ContribucionBadge.vue` | **Create** | 2 | v-chip: color-coded (green≥50%, default 30-50%, amber 0-30%, red<0). Props: `contribucion`, `formato?` |
| `src/components/business/ContribucionBadge.spec.ts` | **Create** | 2 | 4 tests: all color thresholds |
| `src/components/business/PricingAlert.vue` | **Create** | 2 | v-alert: red< costo, amber< breakEvenMin, none≥min. Props: `precio`, `costoProduccion`, `precioMinimo` |
| `src/components/business/PricingAlert.spec.ts` | **Create** | 2 | 5 tests: error/warning/hidden tiers + message content |
| `src/views/PosView.vue` | Modify | 2 | +`ContribucionBadge` per product card |
| `src/views/EventoProductosView.vue` | Modify | 2 | +`PricingAlert` per row; bulk "APLICAR PRECIO MÍNIMO" action |
| `src/views/ReporteEventoView.vue` | Modify | 2 | 4th tab "Contribución": table + top-3/gananciaPura banners |
| `src/components/business/CierreResumenCard.vue` | Modify | 2 | Optional "Contribución total: $X" line after utilidadBruta |

**Totals**: 5 new files (1 util + 1 spec + 2 components + 2 specs), 11 modified.

## Interfaces / Contracts

```ts
// src/utils/contribucion.ts — NEW pure functions
export function calcularContribucionUnitaria(precio: number, costo: number): number
export function calcularContribucionPorcentual(precio: number, costo: number): number
export function calcularBreakEvenUnidades(gastosFijos: number, contribucionPromedio: number): number
export function calcularPrecioMinimoBreakEven(costo: number, gastosFijos: number, ventasProyectadas: number): number

// Ranking thresholds (constants, exported for testability)
export const UMBRAL_ESTRELLA_CONTRIBUCION = 0.50
export const UMBRAL_ESTRELLA_UNIDADES = 10
export const UMBRAL_ENTRADA_CONTRIBUCION = 0.30
export const UMBRAL_ENTRADA_UNIDADES = 20
export type RankingProducto = 'estrella' | 'equilibrado' | 'entrada' | 'bajo'
export function clasificarProducto(contribucionPct: number, unidades: number): RankingProducto

// Extended types
// ProyeccionResultado (events.types.ts) — fields added:
breakEvenUnidades: number | null
breakEvenIngreso: number | null
contribucionPromedioPonderada: number | null

// DesgloseProducto (pos.types.ts) — fields added:
contribucionTotal: number
contribucionPorcentual: number
ranking: RankingProducto

// UsePreciosEvento interface — methods added:
contribucionParaProducto: ComputedRef<(productoId: string) => { absoluta: number; porcentual: number } | null>
precioMinimoParaProducto: ComputedRef<(productoId: string) => number>

// UseReporteEventoReturn — computed added:
rankingContribucion: ComputedRef<DesgloseProducto[]>  // sorted by contribucionTotal DESC
productosPagaronOperacion: ComputedRef<DesgloseProducto[]>  // top 3
productosGananciaPura: ComputedRef<DesgloseProducto[]>  // post-break-even
```

## Testing Strategy

| Layer | What | Approach | Count |
|-------|------|----------|-------|
| **Unit** | `src/utils/contribucion.ts` — all 4 fns + ranking | Vitest + `redondearCentavos`; factory fixtures; zero, negative, Infinity, float-drift | 12+ |
| **Unit** | `calcularProyeccion` extended (new param) | Extend existing spec with product-aware fixtures | 3+ |
| **Unit** | `calcularDesglosePorProducto` extended | Extend existing spec with contribution + ranking assertions | 3+ |
| **Component** | `ContribucionBadge` | mount + Vuetify; assert color class + text per threshold | 4 |
| **Component** | `PricingAlert` | mount + props; assert alert type (error/warning/none), message match | 5 |
| **Component** | `ProyeccionCostosCard` break-even section | mount with extended ProyeccionResultado; assert bar %, empty state | 3+ |
| **Component** | `ReporteEventoView` 4th tab | mount with mock composable return; assert table rows, banner text | 3+ |

**Total**: ~30 new tests (PR-1: ~15, PR-2: ~15). Existing 615 tests preserved.

## Rounding Policy

Same as `pricing.ts` and `cierre.ts`: single `redondearCentavos` at calculation end — no intermediate rounding, no `toFixed()` drift. `calcularBreakEvenUnidades` uses `Math.ceil` after computing the raw quotient; `calcularContribucionPorcentual` divides then rounds.

## Migration / Rollout

No migration required. No DB schema changes, no new tables, no new columns. All data computed live from existing stores. Rollback is pure revert: remove the new files, revert the 11 modified files to pre-change state. Zero data loss.

## Open Questions

- [ ] **REQ-CON-3 signature**: The spec scenario passes `(costo, gastosFijos, ventasProyectadas)` but the proposal mentions target-based formula. Clarify during apply whether the formula is `costo + gastosFijos/ventasProyectadas` (simple) or based on contribution percentage objective (proposal AC-4). Tentative: simple formula per spec — adjusts contribution to hit break-even.
- [ ] **Progress bar source for `ventasActuales`**: The spec says live from ventas store during `en_curso`, frozen at cierre. The ProyeccionCostosCard currently receives only `ProyeccionResultado`. Adding a separate `ventasActuales` prop vs reading from a Pinia store inside the component. **Tentative**: additional prop `ventasActuales?: number` (pure component pattern, matches existing architecture).
