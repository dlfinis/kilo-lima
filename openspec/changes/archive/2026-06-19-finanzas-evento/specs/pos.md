# Delta for POS

> **Change**: `finanzas-evento` | **Target**: `openspec/specs/pos/spec.md`

## MODIFIED Requirements

### Requirement: Calculate cierre totals (corrected formula)

The system SHALL compute cierre totals via `calcularCierre()` returning: `totalVentas`, `totalCogs`, `totalGastosFijos`, `totalGastosImprevistos`, `utilidadBruta = totalVentas − totalCogs`, `utilidadNeta = utilidadBruta − (totalGastosFijos + totalGastosImprevistos)`, `ventasPorMetodoPago`, `cantidadVentas`, `diferencia` (NULL if cash count skipped). `totalCogs` SHALL be `Σ(venta_item.cantidad × costo_unitario)`, with `costo_unitario = NULL` yielding 0.

(Previously: `utilidadBruta = totalVentas − totalGastosFijos − totalGastosImprevistos` — COGS was not subtracted.)

#### Scenario: Cierre with COGS produces correct utilidadBruta

- GIVEN 2 ventas: "v-1" (total=10, efectivo, COGS=4), "v-2" (total=15, tarjeta, COGS=6); gastos_fijos=5; gastos_imprevistos=3
- WHEN `calcularCierre` is called
- THEN `totalVentas=25`, `totalCogs=10`, `utilidadBruta=15` (25−10), `utilidadNeta=7` (15−5−3)

#### Scenario: Legacy venta_item with NULL costo_unitario

- GIVEN a venta_item with `costo_unitario = NULL`, cantidad=2, precio_unitario=5.00
- WHEN `calcularCierre` aggregates COGS
- THEN that item contributes 0 to COGS, but its subtotal still counts in totalVentas

#### Scenario: Cash count difference computed

- GIVEN `efectivoEsperado=100`, `efectivoReal=95`
- WHEN `calcularCierre` is called
- THEN `diferencia = -5`

---

### Requirement: Visual product grid (sourced from evento_productos)

The system SHALL render a visual grid of productos sourced from `eventoProductos.store` filtered by `incluido = true` for the current `eventoEnCurso`, sorted by `producto.orden ASC`. Each card SHALL display: recipe name, `evento_producto.precio_venta` (NOT `producto.precio_venta`), and an "Agregar" button.

(Previously: grid sourced from `productos` store filtered by `disponible = true`, displaying `producto.precio_venta`.)

#### Scenario: Grid displays evento-specific products

- GIVEN evento "ev-1" is `en_curso` with 3 evento_productos (2 incluido=true, 1 incluido=false)
- WHEN the POS view loads
- THEN the grid shows 2 cards (only the incluido=true ones)
- AND cards display `evento_producto.precio_venta`

#### Scenario: Grid empty when no evento_productos included

- GIVEN evento "ev-1" is `en_curso` with 0 evento_productos where `incluido = true`
- WHEN the POS view loads
- THEN the grid shows "No hay productos configurados para este evento" with link to `/eventos/ev-1/productos`

#### Scenario: Clicking a product card adds to cart with evento price

- GIVEN the POS grid renders evento_producto for "Brownies" at `precio_venta = 16.67`
- WHEN the user clicks "Agregar"
- THEN `agregarAlCarrito("prod-1")` is called with `precioSnapshot = 16.67`

---

## ADDED Requirements

### Requirement: venta_items gains COGS snapshot columns

The system SHALL extend `venta_items` with `costo_unitario` (NUMERIC nullable), `margen_aplicado` (NUMERIC nullable), and `evento_producto_id` (UUID nullable FK → evento_productos). At sale time, the system SHALL write `costo_unitario = producto.costo`, `margen_aplicado = evento_producto.margen`, and `evento_producto_id = evento_producto.id`.

#### Scenario: Sale writes COGS snapshot

- GIVEN evento "ev-1" is `en_curso` with evento_producto "ep-1" (costo=10.00, margen=0.40)
- WHEN a venta is registered with 2 units of "ep-1"
- THEN the `venta_item` has `costo_unitario=10.00`, `margen_aplicado=0.40`, `evento_producto_id="ep-1"`
- AND `precio_unitario` = snapshot of `evento_producto.precio_venta` at sale time

#### Scenario: Legacy venta_items preserve NULLs

- GIVEN existing venta_items from before migration
- WHEN the migration is applied
- THEN `costo_unitario`, `margen_aplicado`, `evento_producto_id` remain NULL

---

### Requirement: Closure-time COGS backfill

The system SHALL, at cierre time, backfill `costo_unitario` and `margen_aplicado` for every `venta_item` where `evento_producto_id IS NOT NULL` AND `costo_unitario IS NULL`. Legacy items with `evento_producto_id IS NULL` remain with `costo_unitario = NULL` (COGS=0). Backfill SHALL be one-shot during `registrarCierre`, NOT a background migration.

#### Scenario: Backfill fills COGS for linked venta_items

- GIVEN 3 venta_items: 2 linked to `evento_producto_id` with NULL costo_unitario, 1 with NULL event_producto_id
- WHEN `registrarCierre("ev-1")` executes
- THEN the 2 linked items get `costo_unitario`/`margen_aplicado` filled from evento_producto
- AND the 1 unlinked item retains `costo_unitario = NULL`

#### Scenario: Backfill does not overwrite existing values

- GIVEN a venta_item already has `costo_unitario = 12.50`
- WHEN `registrarCierre` runs the backfill
- THEN `costo_unitario` remains 12.50

---

### Requirement: Cierre guard rejects non-en_curso evento

The system SHALL reject `useCierreCaja().cerrar(eventoId)` when `evento.estado !== 'en_curso'`. If `estado === 'cerrado'` with no existing cierre, the system SHALL allow retroactive cierre. If `estado === 'planificacion'`, return `ServiceError { code: 'TRANSICION_INVALIDA' }`.

#### Scenario: Cierre succeeds for en_curso evento

- GIVEN evento "ev-1" is `en_curso`
- WHEN `registrarCierre("ev-1")` is called
- THEN a `cierres_caja` row is inserted and evento transitions to `cerrado`

#### Scenario: Cierre blocked on planificacion evento

- GIVEN evento "ev-1" is `planificacion`
- WHEN `registrarCierre("ev-1")` is called
- THEN returns `{ error: { code: 'TRANSICION_INVALIDA' } }` and no rows inserted

#### Scenario: Retroactive cierre for already-closed evento

- GIVEN evento "ev-1" is `cerrado` with NO existing cierre row
- WHEN `registrarCierre("ev-1")` is called
- THEN cierre row is inserted and evento remains `cerrado`

---

### Requirement: CierreResumenCard shows corrected utility fields

The system SHALL extend `cierres_caja` with `total_cogs`, `total_utilidad_bruta`, `total_utilidad_neta` (NUMERIC NOT NULL). `CierreResumenCard` SHALL display `utilidadBruta` in green (positive) / red (negative) and `utilidadNeta` as a subtotal.

#### Scenario: CierreResumenCard shows corrected profit

- GIVEN cierre with totalVentas=500, totalCogs=200, gastosFijos=80, gastosImprevistos=20
- WHEN `CierreResumenCard` renders
- THEN "Utilidad bruta: $300.00" in green and "Utilidad neta: $200.00" below it

#### Scenario: Negative utilidadBruta shown in red

- GIVEN cierre with `utilidadBruta = -50`
- WHEN `CierreResumenCard` renders
- THEN "Utilidad bruta: -$50.00" is displayed in red

---

### Requirement: PosView shows cerrado message

The system SHALL render "Este evento está cerrado — reporte disponible" on `PosView` when `eventoEnCurso.estado === 'cerrado'` and no other evento is `en_curso`. Product grid and cart SHALL be hidden. A "Ver reporte" button SHALL link to `/eventos/:id/reporte`.

#### Scenario: Cerrado event shows message instead of POS grid

- GIVEN the only evento "ev-1" is `cerrado`
- WHEN the user navigates to `/pos`
- THEN "Este evento está cerrado — reporte disponible" is displayed
- AND a "Ver reporte" button links to `/eventos/ev-1/reporte`
- AND the product grid and cart are NOT rendered

#### Scenario: New en_curso evento shows normal POS

- GIVEN evento "ev-1" is `cerrado` but evento "ev-2" is `en_curso`
- WHEN the user navigates to `/pos`
- THEN the POS grid renders with "ev-2" products (not the cerrado message)
