# Spec: Contribución Financiera

> **Change**: `contribucion-financiera` | **Phase**: `sdd-spec`
> **Capabilities modified**: `pricing-evento`, `reporte-evento`, `pos`, `events`
> **Delivery**: PR-1 (break-even) + PR-2 (contribution + alerts + reports)

## Purpose

Add `margen de contribución`, break-even projection, pricing alerts, and contribution-aware reports. Advisory only — the operator always controls prices.

## Product Decisions (Locked)

| # | Rule |
|---|------|
| PD-C1 | Contribution margin, NOT cost allocation |
| PD-C2 | 3-tier alerts: red < costo, amber < break-even min, none ≥ min |
| PD-C3 | Advisory — operator saves any price |
| PD-C4 | `breakEven = ceil(gastosFijos / contribucionPromedioPonderada)` |
| PD-C5 | Report banners: top-3 "pagaron la operación" + "ganancia pura" |
| PD-C6 | UI scales to 30+ products |

---

## Requirements

### PR-1: Break-even Projection

| REQ-ID | Title | AC | Summary |
|--------|-------|----|---------|
| REQ-CON-1 | `calcularContribucionUnitaria` / `calcularContribucionPorcentual` | AC-1, AC-2 | Pure `precio − costo` and `(precio−costo)/precio` with `redondearCentavos` at end |
| REQ-CON-2 | `calcularBreakEvenUnidades` | AC-3 | `Math.ceil(gastosFijos / contribucionPromedio)`, returns Infinity when 0 |
| REQ-CON-3 | `calcularPrecioMinimoBreakEven` | AC-4 | Price where `(p − c) × ventasProyectadas ≥ gastosFijos` (advisory) |
| REQ-CON-4 | `useProyeccionCostos` extended | AC-6, AC-9 | Returns `breakEvenUnidades`, `breakEvenIngreso`, `contribucionPromedioPonderada` |
| REQ-CON-5 | `ProyeccionCostosCard` break-even section | AC-7, AC-8 | Shows unit count, ingreso, live progress bar `ventasActuales / breakEvenUnidades` |

#### Scenario: REQ-CON-1 — Positive and negative contribution

- GIVEN precio=8.33, costo=5.00
- WHEN `calcularContribucionUnitaria(8.33, 5.00)` is called
- THEN returns 3.33; `calcularContribucionPorcentual(8.33, 5.00)` returns 0.40
- AND for precio=4.00, costo=5.00 → returns −1.00

#### Scenario: REQ-CON-2 — Normal and zero-division

- GIVEN gastosFijos=100, contribucionPromedio=3.33 → returns 31
- GIVEN contribucionPromedioPonderada=0 → returns Infinity; UI shows "Definí márgenes primero"

#### Scenario: REQ-CON-3 — Minimum break-even price

- GIVEN costo=5, gastosFijos=100, ventasProyectadas=50
- WHEN `calcularPrecioMinimoBreakEven(5, 100, 50)` is called
- THEN returns 7.00 (`(7−5) × 50 = 100`)

#### Scenario: REQ-CON-4 — Extended projection fields

- GIVEN evento has gastosFijos and evento_productos with márgenes
- WHEN `calcularProyeccion` is called
- THEN result includes `breakEvenUnidades`, `breakEvenIngreso`, `contribucionPromedioPonderada`
- AND existing fields (`costosFijos`, `costosVariables`, `costoTotal`) unchanged

#### Scenario: REQ-CON-5 — Break-even card with live progress

- GIVEN breakEvenUnidades=31, ventasActuales=15
- WHEN ProyeccionCostosCard renders
- THEN "Break-even: 31 unidades" with progress bar at 48%
- AND when 0 evento_productos → "Configurá los productos del evento para ver el break-even"

---

### PR-2: Contribution Margin + Alerts + Reports

| REQ-ID | Title | AC | Summary |
|--------|-------|----|---------|
| REQ-CON-6 | `ContribucionBadge` component | AC-11 | Color-coded chip: error(red<0), warning(amber 0-30%), default(30-50%), success(green≥50%) |
| REQ-CON-7 | `PricingAlert` component | AC-13,14,15 | 3-tier: red (precio<costo), amber (precio<breakEvenMin), none (≥min) |
| REQ-CON-8 | `PosView` contribution badge | AC-10,12 | Each product card shows `ContribucionBadge` from `usePreciosEvento.contribucionParaProducto` |
| REQ-CON-9 | `EventoProductosView` pricing alerts | AC-13,14,15,16 | `PricingAlert` per row, reactive on input change; save always succeeds |
| REQ-CON-10 | `EventoProductosView` bulk break-even action | AC-17 | "APLICAR PRECIO MÍNIMO BREAK-EVEN" with confirmation dialog, gated on `estadoEsEditable` |
| REQ-CON-11 | `useReporteEvento` contribution + ranking | AC-18,19 | Extended rows: `contribucionTotal`, `contribucionPorcentual`, `ranking` (estrella/equilibrado/entrada/bajo) |
| REQ-CON-12 | `ReporteEventoView` 4th tab "Contribución" | AC-20 | Table sorted by `contribucionTotal DESC`: nombre, unidades, ingreso, contribucionTotal, %, ranking |
| REQ-CON-13 | Report "Productos que pagaron la operación" banner | AC-21 | Top 3 by contribucionTotal with 🏆 icon |
| REQ-CON-14 | Report "Ganancia pura" section | AC-21 | Products whose contribucionTotal > pro-rata share of gastosFijos |
| REQ-CON-15 | `CierreResumenCard` contribution total line | AC-22 | Informational "Contribución total: $X" line, does not affect utilidadNeta |

#### Scenario: REQ-CON-6 — Badge color thresholds

- GIVEN contribucionUnitaria=5.00, porcentual=0.60 → green "+$5.00 (60%)"
- GIVEN contribucionUnitaria=1.00, porcentual=0.20 → amber "+$1.00 (20%)"
- GIVEN contribucionUnitaria=−1.00, porcentual=−0.25 → red "−$1.00"

#### Scenario: REQ-CON-7 — Alert tiers

- GIVEN costo=5.00, precio=4.00 → error "Estás vendiendo a pérdida. Costo: $5.00, precio: $4.00"
- GIVEN costo=5.00, precio=6.00, breakEvenMin=7.00 → warning "Precio bajo el mínimo sugerido ($7.00)"
- GIVEN costo=5.00, precio=8.00, breakEvenMin=7.00 → no alert rendered

#### Scenario: REQ-CON-8 — POS card badge

- GIVEN evento en_curso, Brownies at precio=16.67, costo=10.00
- WHEN PosView renders the product grid
- THEN each card shows "+$6.67 (40%)" badge; badge fits 4-col grid at 1024×768

#### Scenario: REQ-CON-9 — Live alert on price input

- GIVEN EventoProductosView with costo=5.00
- WHEN user types precio_venta=4.00 → red PricingAlert appears within 200ms
- AND user CAN save the record (advisory, not validation) — AC-16 verified

#### Scenario: REQ-CON-10 — Bulk action with confirmation

- GIVEN 5 productos, user clicks "APLICAR PRECIO MÍNIMO BREAK-EVEN"
- WHEN dialog shows "Vas a sobrescribir 5 productos. ¿Continuar?" and user confirms
- THEN all 5 precios updated to their break-even minimums
- WHEN user cancels → no prices modified

#### Scenario: REQ-CON-11 — Ranking computation

- GIVEN 5 productos: A(60%, 15u→estrella), B(25%, 25u→entrada), C(25%, 5u→bajo), D(40%, 8u→equilibrado), E(60%, 5u→equilibrado)
- WHEN reportePorProducto is computed
- THEN each row has correct ranking per AC-19 thresholds

#### Scenario: REQ-CON-12 — Contribución tab

- GIVEN evento cerrado with 3 productos sold
- WHEN user clicks "Contribución" tab (4th tab)
- THEN table sorted by contribucionTotal DESC: nombre | unidades | ingreso | contribucionTotal | % | ranking

#### Scenario: REQ-CON-13 — Top contributors banner

- GIVEN contribucionTotal: A=200, B=150, C=120, D=50, E=30
- WHEN Contribución tab renders
- THEN "Productos que pagaron la operación 🏆" shows A, B, C in descending order

#### Scenario: REQ-CON-14 — Ganancia pura section

- GIVEN gastosFijos=90, 3 productos: A(60), B(30), C(10); pro-rata=30
- WHEN the report renders
- THEN "Ganancia pura 💰" lists A (60>30); B and C omitted

#### Scenario: REQ-CON-15 — Cierre contribution line

- GIVEN cierre with 3 productos each contribucionTotal=50
- WHEN CierreResumenCard renders
- THEN "Contribución total: $150.00" displayed below utilidadBruta; utilidadNeta unchanged

---

## AC Coverage

| REQ-ID | AC | PR |
|--------|----|-----|
| REQ-CON-1 | AC-1, AC-2 | PR-1 |
| REQ-CON-2 | AC-3 | PR-1 |
| REQ-CON-3 | AC-4 | PR-2 |
| REQ-CON-4 | AC-6, AC-9 | PR-1 |
| REQ-CON-5 | AC-7, AC-8 | PR-1 |
| REQ-CON-6 | AC-11 | PR-2 |
| REQ-CON-7 | AC-13, AC-14, AC-15 | PR-2 |
| REQ-CON-8 | AC-10, AC-12 | PR-2 |
| REQ-CON-9 | AC-13, AC-14, AC-15, AC-16 | PR-2 |
| REQ-CON-10 | AC-17 | PR-2 |
| REQ-CON-11 | AC-18, AC-19 | PR-2 |
| REQ-CON-12 | AC-20 | PR-2 |
| REQ-CON-13 | AC-21 | PR-2 |
| REQ-CON-14 | AC-21 | PR-2 |
| REQ-CON-15 | AC-22 | PR-2 |
| — | AC-5, AC-23, AC-24, AC-25, AC-26 | Both |
