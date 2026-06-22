# Delta for Pricing-Evento

> **Change**: `contribucion-financiera` | **Source**: `proposal.md` §12.2
> **Existing**: `openspec/specs/pricing-evento/spec.md` (REQ-PRICING-1 through REQ-PRICING-8)

## ADDED Requirements

### REQ-PRICING-C-1: Pure Contribution Math Functions

**Source**: REQ-CON-1, AC-1, AC-2

The system SHALL provide `calcularContribucionUnitaria(precio: number, costo: number): number` returning `redondearCentavos(precio − costo)`, and `calcularContribucionPorcentual(precio: number, costo: number): number` returning `(precio − costo) / precio`. `redondearCentavos` SHALL be applied only at the end. Both SHALL be exported from `src/utils/contribucion.ts` and re-exported from `src/utils/pricing.ts`.

#### Scenario: Positive contribution

- GIVEN precio = 8.33, costo = 5.00
- WHEN `calcularContribucionUnitaria(8.33, 5.00)` is called
- THEN returns 3.33 and `calcularContribucionPorcentual(8.33, 5.00)` returns 0.40

#### Scenario: Negative contribution (loss)

- GIVEN precio = 4.00, costo = 5.00
- WHEN `calcularContribucionUnitaria(4.00, 5.00)` is called
- THEN returns −1.00 and `calcularContribucionPorcentual(4.00, 5.00)` returns −0.25

#### Scenario: Zero costo

- GIVEN precio = 5.00, costo = 0.00
- WHEN `calcularContribucionPorcentual(5.00, 0.00)` is called
- THEN returns 1.00

---

### REQ-PRICING-C-2: calcularPrecioMinimoBreakEven

**Source**: REQ-CON-3, AC-4, PD-C4

The system SHALL provide `calcularPrecioMinimoBreakEven(costoProduccion: number, gastosFijos: number, ventasProyectadas: number): number` returning the price at which `(precio − costoProduccion) × ventasProyectadas ≥ gastosFijos`. This is advisory — the operator MAY set any price.

#### Scenario: Computes minimum break-even price

- GIVEN costo = 5.00, gastosFijos = 100, ventasProyectadas = 50
- WHEN `calcularPrecioMinimoBreakEven(5, 100, 50)` is called
- THEN returns 7.00 (2.00 contribution × 50 = 100)

#### Scenario: Zero ventasProyectadas guard

- GIVEN ventasProyectadas = 0
- WHEN the function is called
- THEN returns `Infinity` (surface to UI as "Definí ventas proyectadas primero")

---

### REQ-PRICING-C-3: usePreciosEvento.contribucionParaProducto

**Source**: REQ-CON-8, AC-10

The system SHALL extend `usePreciosEvento` with `contribucionParaProducto(eventoId: string, productoId: string)` returning `{ absoluta: number, porcentual: number } | null`. It SHALL read `evento_producto.precio_venta` and `producto.costo` from existing stores.

#### Scenario: Returns contribution for configured product

- GIVEN evento_producto with precio_venta = 16.67, producto.costo = 10.00
- WHEN `contribucionParaProducto("ev-1", "prod-1")` is called
- THEN returns `{ absoluta: 6.67, porcentual: 0.40 }`

#### Scenario: Returns null when no evento_producto found

- GIVEN no evento_producto exists for (ev-1, prod-99)
- WHEN the function is called
- THEN returns null

---

### REQ-PRICING-C-4: ContribucionBadge Component

**Source**: REQ-CON-6, AC-11

The system SHALL provide `ContribucionBadge.vue` — a Vuetify chip displaying `contribucion absoluta` + `contribucion %`. Color variants: `error` (red) when `absoluta < 0`, `warning` (amber) when `0 ≤ porcentual < 0.30`, `default` (neutral) when `0.30 ≤ porcentual < 0.50`, `success` (green) when `≥ 0.50`. Thresholds SHALL be exported constants: `UMBRAL_ALERTA`, `UMBRAL_EXITO`.

#### Scenario: High-margin green badge

- GIVEN props `{ absoluta: 5.00, porcentual: 0.60 }`
- WHEN ContribucionBadge renders
- THEN displays "+$5.00 (60%)" with `color="success"`

#### Scenario: Loss red badge

- GIVEN props `{ absoluta: −1.00, porcentual: −0.25 }`
- WHEN ContribucionBadge renders
- THEN displays "−$1.00" with `color="error"`

---

### REQ-PRICING-C-5: PricingAlert Component

**Source**: REQ-CON-7, AC-13, AC-14, AC-15, PD-C2

The system SHALL provide `PricingAlert.vue` — a Vuetify alert with three tiers:
- `error` (red): `precio < costo_producción` — "Estás vendiendo a pérdida. Costo: $X, precio: $Y"
- `warning` (amber): `costo ≤ precio < precioMinimoBreakEven` — "Precio bajo el mínimo sugerido ($X)"
- No alert: `precio ≥ precioMinimoBreakEven`

#### Scenario: Red alert below cost

- GIVEN props `{ precio: 4.00, costo: 5.00, precioMinimoBreakEven: 7.00 }`
- WHEN PricingAlert renders
- THEN `severity="error"` with "Estás vendiendo a pérdida. Costo: $5.00, precio: $4.00"

#### Scenario: No alert at or above minimum

- GIVEN props `{ precio: 8.00, costo: 5.00, precioMinimoBreakEven: 7.00 }`
- WHEN PricingAlert renders
- THEN component returns empty (no `v-alert` rendered)

---

### REQ-PRICING-C-6: EventoProductosView — Pricing Alerts + Bulk Action

**Source**: REQ-CON-9, REQ-CON-10, AC-13 through AC-17, PD-C3

The system SHALL extend `EventoProductosView` with:
1. A `PricingAlert` column per row, reactively updated as the user edits `precio_venta`.
2. A bulk action "APLICAR PRECIO MÍNIMO BREAK-EVEN" showing a Vuetify confirmation dialog ("Vas a sobrescribir X productos. ¿Continuar?") before overwriting `precio_venta` for selected productos.
3. The user CAN save any price — alerts are informational, not validation errors.

#### Scenario: Alert appears on price edit

- GIVEN evento_producto with costo = 5.00
- WHEN user types precio_venta = 4.00
- THEN a red PricingAlert appears in the row within 200ms

#### Scenario: Save succeeds with price below cost

- GIVEN precio_venta = 4.00, costo = 5.00
- WHEN user clicks save
- THEN the record saves successfully (AC-16)

#### Scenario: Bulk action with confirmation accepted

- GIVEN 5 productos selected, user clicks bulk action
- WHEN dialog shows "Vas a sobrescribir 5 productos" and user confirms
- THEN all 5 precios_venta updated to break-even minimums

#### Scenario: Bulk action cancelled

- GIVEN confirmation dialog is shown
- WHEN user clicks "Cancelar"
- THEN no precios_venta are modified
