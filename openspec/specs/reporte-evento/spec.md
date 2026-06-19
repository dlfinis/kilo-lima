# Reporte-Evento Specification

> **Change**: `finanzas-evento` | **Type**: New capability (greenfield)
> **Source**: `proposal.md` §3.1 items 9, 12, §5.6, PD-3

## Purpose

Deliver post-evento financial reports available immediately upon cierre: Por día, Por producto, and Cierre tabs computed from the immutable `cierres_caja` snapshot and historical `venta_items`. Reports are read-only aggregations — no live data, no mutations.

## Requirements

### Requirement: reportePorDia Aggregation

The system SHALL provide `useReporteEvento(eventoId).reportePorDia` returning `ReportePorDia[]` where each row has: `fecha` (Date), `ventas` (count), `cantidad` (sum), `cogs` (sum), `utilidadBruta` (`ventas − cogs`), `utilidadNeta`. Days with zero ventas SHALL NOT appear. Rows ordered by `fecha ASC`. Aggregation SHALL use `redondearCentavos` once per row.

#### Scenario: Multi-day evento produces one row per active day

- GIVEN evento multi-day "ev-1" (Dec 18–20) with ventas: Dec 18 (3 ventas, $150), Dec 19 (2 ventas, $100), Dec 20 (0 ventas)
- WHEN `reportePorDia("ev-1")` is read
- THEN returns 2 rows: Dec 18 and Dec 19
- AND each row has `fecha`, `ventas`, `cantidad`, `cogs`, `utilidadBruta`, `utilidadNeta`
- AND rows are ordered `fecha ASC`

#### Scenario: Zero-ventas evento returns empty array

- GIVEN evento "ev-3" with zero venta_items
- WHEN `reportePorDia("ev-3")` is read
- THEN returns `[]`

---

### Requirement: reportePorProducto Aggregation

The system SHALL provide `useReporteEvento(eventoId).reportePorProducto` returning `ReportePorProducto[]` where each row has: `productoNombre`, `unidadesVendidas`, `ingresoTotal`, `cogsTotal`, `margenReal` = `(ingresoTotal − cogsTotal) / ingresoTotal`, `utilidadBruta`. Products with zero ventas SHALL NOT appear. Legacy items with `costo_unitario = NULL` contribute 0 to cogsTotal.

#### Scenario: Per-product breakdown computes real margin

- GIVEN venta_items for "ev-1": Brownies (10 units, $50 ingreso, $20 cogs), Galletas (5 units, $25 ingreso, $10 cogs)
- WHEN `reportePorProducto("ev-1")` is read
- THEN Brownies: `margenReal = 0.60`, Galletas: `margenReal = 0.60`
- AND both rows show `unidadesVendidas`, `ingresoTotal`, `cogsTotal`, `utilidadBruta`

#### Scenario: NULL costo_unitario yields margenReal = 1.0

- GIVEN a legacy venta_item with `costo_unitario = NULL`, ingreso = $20
- WHEN `reportePorProducto` aggregates
- THEN that product's `cogsTotal` includes 0 for those items
- AND `margenReal = 1.0` (100% — all revenue is margin)

---

### Requirement: ReporteEventoView Three Tabs

The system SHALL provide `ReporteEventoView.vue` at `/eventos/:id/reporte` rendering 3 Vuetify tabs: "Por día" (table from REQ-REPORTE-1), "Por producto" (bars from REQ-REPORTE-2), "Cierre" (reuses `CierreResumenCard` with cierre snapshot data).

#### Scenario: Three tabs render with data

- GIVEN a cerrado evento "ev-1" with ventas across 2 days and 3 productos
- WHEN navigating to `/eventos/ev-1/reporte`
- THEN "Por día" tab shows a table with 2 rows
- AND "Por producto" tab shows bars for 3 productos
- AND "Cierre" tab shows `CierreResumenCard` with `utilidadBruta`, `utilidadNeta`

---

### Requirement: Snapshot-Based Report Data

The system SHALL compute report data from `cierres_caja` snapshot fields and historical `venta_items` — NOT from live Pinia stores. Once cerrado, the report SHALL remain stable regardless of changes to `productos` or `recetas`.

#### Scenario: Report stable after receta cost change

- GIVEN evento "ev-1" is cerrado with cierre `total_utilidad_bruta = 300`
- WHEN a receta's cost changes in catalog after cierre
- THEN the report's "Cierre" tab still shows `utilidadBruta = 300`

#### Scenario: Report stable after producto deletion

- GIVEN producto "prod-1" was sold in evento "ev-1" (snapshot in venta_items), then deleted
- WHEN the report for "ev-1" is generated
- THEN the Por producto tab still shows "prod-1" with its historical data from venta_items

---

### Requirement: Non-Cerrado Empty State

The system SHALL display an empty state when `evento.estado !== 'cerrado'`: the report view SHALL show "El reporte estará disponible cuando cierres el evento" with an icon. No data query SHALL execute for a non-cerrado evento.

#### Scenario: Planificacion evento shows empty state

- GIVEN evento "ev-1" has estado = 'planificacion'
- WHEN navigating to `/eventos/ev-1/reporte`
- THEN "El reporte estará disponible cuando cierres el evento" is displayed
- AND no Supabase venta_items query is executed

#### Scenario: En_curso evento shows same empty state

- GIVEN evento "ev-1" has estado = 'en_curso'
- WHEN navigating to `/eventos/ev-1/reporte`
- THEN the same empty state is displayed with no data query

---

### Requirement: Report-Cierre Arithmetic Consistency

The system SHALL guarantee that the sum of `utilidadBruta` across all rows in `reportePorDia` and `reportePorProducto` equals the cierre snapshot's `total_utilidad_bruta` (±0.01). A property-style test SHALL verify this across 3 distinct evento fixtures.

#### Scenario: Per-day totals sum to cierre total

- GIVEN evento "ev-1" cierre has `total_utilidad_bruta = 300`
- WHEN `reportePorDia("ev-1")` utilidadBruta values are summed
- THEN the sum equals 300 within 0.01

#### Scenario: Per-product totals sum to cierre total

- GIVEN evento "ev-1" cierre has `total_utilidad_bruta = 300`
- WHEN `reportePorProducto("ev-1")` utilidadBruta values are summed
- THEN the sum equals 300 within 0.01
