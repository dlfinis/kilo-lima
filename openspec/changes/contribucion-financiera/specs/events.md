# Delta for Events

> **Change**: `contribucion-financiera` | **Source**: `proposal.md` §12.2
> **Existing**: `openspec/specs/events/spec.md` (REQ-EVENTS-1 through REQ-EVENTS-48)

## MODIFIED Requirements

### REQ-EVENTS-C-1: calcularProyeccion Extended — Break-even Fields

(Previously: REQ-EVENTS-20 and REQ-EVENTS-21 — `calcularProyeccion` returned `{ costosFijos, costosVariables, costoTotal, lineas, desgloseFijos, desgloseVariables }` and `useProyeccionCostos` returned a `ComputedRef<ProyeccionCostos | null>`. No break-even or contribution data.)

**Source**: REQ-CON-4, AC-6, AC-9, PD-C4

The system SHALL extend `calcularProyeccion` to also return `breakEvenUnidades`, `breakEvenIngreso`, and `contribucionPromedioPonderada`. `contribucionPromedioPonderada` SHALL be the unit-weighted average contribution across all `evento_productos` using `margenesEsperados` as weights. `breakEvenUnidades` SHALL be `Math.ceil(gastosFijosTotales / contribucionPromedioPonderada)` (returns `Infinity` when `contribucionPromedioPonderada = 0`). `breakEvenIngreso` SHALL be `breakEvenUnidades × precioVentaPromedioPonderado`. All existing fields and return types SHALL be preserved. `useProyeccionCostos(eventoId)` SHALL return these new fields reactively.

#### Scenario: Projection returns break-even data

- GIVEN evento with gastosFijos=100 and 2 evento_productos: A(costo=5, margen=0.40, ventasProyectadas=30), B(costo=8, margen=0.50, ventasProyectadas=20)
- WHEN `calcularProyeccion` is called
- THEN result includes `contribucionPromedioPonderada` (weighted by ventasProyectadas)
- AND `breakEvenUnidades = ceil(100 / contribucionPromedioPonderada)`
- AND `breakEvenIngreso = breakEvenUnidades × precioVentaPromedioPonderado`
- AND existing fields (`costosFijos`, `costosVariables`, `costoTotal`, `lineas`, `desgloseFijos`, `desgloseVariables`) are preserved

#### Scenario: Zero contribucionPromedio returns Infinity

- GIVEN evento has 0 evento_productos (contribucionPromedioPonderada = 0)
- WHEN `calcularProyeccion` is called
- THEN `breakEvenUnidades = Infinity`
- AND UI displays "Definí márgenes primero"

#### Scenario: Reactivity preserved

- GIVEN `useProyeccionCostos("ev-1")` is bound
- WHEN a new gasto fijo is added to the store
- THEN `breakEvenUnidades` updates reactively along with `costosFijos`

---

### REQ-EVENTS-C-2: ProyeccionCostosCard — Break-even Section

(Previously: REQ-EVENTS-22 and REQ-EVENTS-23 — `ProyeccionCostosCard` rendered three sections: costos fijos, costos variables, and costo total. No break-even section.)

**Source**: REQ-CON-5, AC-7, AC-8

The system SHALL extend `ProyeccionCostosCard` with a new "Break-even" section rendered between the "costos variables" breakdown and the "costo total" line. The section SHALL display:
- `breakEvenUnidades` (e.g., "31 unidades para cubrir gastos fijos")
- `breakEvenIngreso` (e.g., "$258.23 de ingreso necesario")
- A live progress bar showing `ventasActuales / breakEvenUnidades` as percentage (only when `evento.estado === 'en_curso'`)
- An empty state "Configurá los productos del evento para ver el break-even" when `breakEvenUnidades === Infinity`

The three existing sections (costos fijos breakdown, costos variables breakdown, costo total) SHALL remain unchanged. During `en_curso`, `ventasActuales` SHALL be read live from the ventas store. After cierre, the progress bar SHALL freeze with the snapshot value.

#### Scenario: Break-even section with live progress

- GIVEN breakEvenUnidades=31, breakEvenIngreso=258.23, ventasActuales=15, estado=en_curso
- WHEN ProyeccionCostosCard renders
- THEN "Break-even" section shows "31 unidades para cubrir gastos fijos"
- AND "$258.23 de ingreso necesario"
- AND a progress bar at 48% labeled "15 / 31 unidades (48%)"

#### Scenario: Empty state when no productos configured

- GIVEN breakEvenUnidades = Infinity (no evento_productos)
- WHEN the card renders
- THEN "Configurá los productos del evento para ver el break-even" is shown
- AND the break-even progress bar is not rendered

#### Scenario: Progress bar frozen after cierre

- GIVEN evento cerrado, breakEvenUnidades=31, ventasActuales at cierre=27
- WHEN the card renders for the cerrado evento
- THEN the progress bar shows 87% (27/31) — uses the cierre snapshot, not live data

#### Scenario: Existing sections preserved

- GIVEN projection data with costosFijos=800, costosVariables=150, costoTotal=950
- WHEN ProyeccionCostosCard renders
- THEN "Costos fijos: $800.00", "Costos variables: $150.00", "Total: $950.00" are all displayed
- AND the new break-even section appears between "costos variables" and "costo total"
