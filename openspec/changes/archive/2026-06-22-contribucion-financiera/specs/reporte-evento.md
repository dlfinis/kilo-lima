# Delta for Reporte-Evento

> **Change**: `contribucion-financiera` | **Source**: `proposal.md` §12.2
> **Existing**: `openspec/specs/reporte-evento/spec.md` (REQ-REPORTE-1 through REQ-REPORTE-7)

## MODIFIED Requirements

### REQ-REPORTE-C-1: reportePorProducto Extended with Contribution + Ranking

(Previously: returned `productoNombre`, `unidadesVendidas`, `ingresoTotal`, `cogsTotal`, `margenReal`, `utilidadBruta` — without contribution or ranking fields.)

**Source**: REQ-CON-11, AC-18, AC-19

The system SHALL extend `useReporteEvento(eventoId).reportePorProducto` to return additional fields: `contribucionTotal` (= `ingresoTotal − cogsTotal`), `contribucionPorcentual` (= `contribucionTotal / ingresoTotal`), and `ranking` (one of: `estrella`, `equilibrado`, `entrada`, `bajo`). Ranking rules:
- `estrella`: `contribucionPorcentual ≥ 0.50 AND unidadesVendidas ≥ 10`
- `entrada`: `contribucionPorcentual < 0.30 AND unidadesVendidas ≥ 20`
- `bajo`: `contribucionPorcentual < 0.30 AND unidadesVendidas < 10`
- `equilibrado`: all other cases

All existing fields (`productoNombre`, `unidadesVendidas`, `ingresoTotal`, `cogsTotal`, `margenReal`, `utilidadBruta`) SHALL be preserved. Products with zero ventas SHALL NOT appear. Legacy items with `costo_unitario = NULL` SHALL contribute 0 to `cogsTotal`.

#### Scenario: Per-product breakdown with ranking

- GIVEN venta_items for "ev-1": Brownies (10u, $50 ingreso, $20 cogs), Galletas (25u, $25 ingreso, $10 cogs), Empanadas (5u, $50 ingreso, $40 cogs)
- WHEN `reportePorProducto("ev-1")` is read
- THEN Brownies: `contribucionTotal=30`, `contribucionPorcentual=0.60`, `ranking=estrella`
- AND Galletas: `contribucionTotal=15`, `contribucionPorcentual=0.60`, `ranking=equilibrado` (unidades < 20 for estrella with ≥0.50? Actually 25u ≥ 20, but contribucionPorcentual=0.60 ≥ 0.50 AND unidades=25 ≥ 10 → estrella)
- AND Empanadas: `contribucionTotal=10`, `contribucionPorcentual=0.20`, `ranking=bajo` (unidades 5 < 10)

#### Scenario: Ranking covers all four categories

- GIVEN 5 productos: A(60%/15u→estrella), B(25%/25u→entrada), C(25%/5u→bajo), D(40%/8u→equilibrado), E(60%/5u→equilibrado)
- WHEN reportePorProducto is computed
- THEN each row has a valid ranking and all four rankings appear across the dataset

#### Scenario: Existing fields preserved

- GIVEN venta_items for "ev-1"
- WHEN `reportePorProducto("ev-1")` is read
- THEN all existing fields (`productoNombre`, `unidadesVendidas`, `ingresoTotal`, `cogsTotal`, `margenReal`, `utilidadBruta`) are present
- AND new fields (`contribucionTotal`, `contribucionPorcentual`, `ranking`) are also present

---

### REQ-REPORTE-C-2: ReporteEventoView — 4th Tab + Banners

(Previously: the view rendered 3 tabs — "Por día", "Por producto", "Cierre".)

**Source**: REQ-CON-12, REQ-CON-13, REQ-CON-14, AC-20, AC-21, PD-C5

The system SHALL extend `ReporteEventoView` with a 4th tab "Contribución" alongside existing tabs. The tab SHALL render:
1. A table sorted by `contribucionTotal DESC` with columns: nombre | unidades | ingreso | contribucionTotal | contribucion% | ranking.
2. Above the table, a 🏆 banner "Productos que pagaron la operación" listing the top 3 by `contribucionTotal`.
3. Below, a 💰 banner "Ganancia pura" listing productos whose `contribucionTotal > gastosFijos / count(productos vendidos)` (pro-rata share).

Existing tabs ("Por día", "Por producto", "Cierre") SHALL remain unchanged. The non-cerrado empty state SHALL apply to all tabs including "Contribución".

#### Scenario: Contribución tab renders sorted table

- GIVEN evento "ev-1" is cerrado with 3 productos: A(contribucionTotal=150), B(contribucionTotal=100), C(contribucionTotal=50)
- WHEN user navigates to reporte and clicks "Contribución" tab
- THEN table rows are ordered A, B, C with all 6 columns visible

#### Scenario: Top contributors banner

- GIVEN contribucionTotal: A=200, B=150, C=120, D=50, E=30
- WHEN Contribución tab renders
- THEN 🏆 "Productos que pagaron la operación" shows A(200), B(150), C(120)

#### Scenario: Ganancia pura banner

- GIVEN gastosFijos=90, 3 productos: A(contribucionTotal=60), B(contribucionTotal=30), C(contribucionTotal=10); pro-rata=30
- WHEN the report renders
- THEN 💰 "Ganancia pura" lists A only (60 > 30)

#### Scenario: Non-cerrado shows empty state on all tabs

- GIVEN evento "ev-1" has estado = 'planificacion'
- WHEN navigating to `/eventos/ev-1/reporte`
- THEN "El reporte estará disponible cuando cierres el evento" is displayed for all tabs
- AND no Supabase venta_items query is executed

---

### REQ-REPORTE-C-3: CierreResumenCard — Contribución Total Line

(Previously: displayed `utilidadBruta`, `utilidadNeta`, and `diferencia`; no contribution total.)

**Source**: REQ-CON-15, AC-22

The system SHALL extend `CierreResumenCard` with an optional "Contribución total: $X" line computed as `Σ contribucionTotal` across all productos. This line SHALL be informational only — it SHALL NOT affect the `utilidadNeta` calculation. Display SHALL be below `utilidadBruta` and above `utilidadNeta`.

#### Scenario: Contribución total displayed in cierre

- GIVEN cierre with 3 productos each at contribucionTotal = 50.00
- WHEN CierreResumenCard renders
- THEN "Contribución total: $150.00" is displayed below utilidadBruta
- AND utilidadNeta is unchanged (not affected by this line)
