# Pricing-Evento Specification

> **Change**: `finanzas-evento` | **Type**: New capability (greenfield)
> **Source**: `proposal.md` §3.1 items 2–7, §5.2, PD-1, PD-2

## Purpose

Deliver per-evento configurable-margin pricing: the `evento_productos` table links productos to eventos with a per-product `margen` and computed `precio_venta = costo / (1 − margen)`. Pure pricing utils, a Pinia store, a product-picker view with `MargenSlider`, and the POS price-source change from global `producto.precio_venta` to per-evento product pricing.

## Requirements

### Requirement: evento_productos Table Schema

The system SHALL provide the `evento_productos` table with columns: `id` (UUID PK), `evento_id` (FK → eventos ON DELETE CASCADE), `producto_id` (FK → productos ON DELETE RESTRICT), `precio_venta` (NUMERIC > 0), `margen` (NUMERIC 0..1), `incluido` (BOOLEAN DEFAULT true), `created_at`, `updated_at`. A UNIQUE constraint on `(evento_id, producto_id)` SHALL prevent duplicate entries.

#### Scenario: Create evento_producto with computed price

- GIVEN an evento "ev-1" and a producto "prod-1" with costo 10.00
- WHEN an evento_producto is created with `margen = 0.40`
- THEN `precio_venta` = 16.67 (computed from `calcularPrecioPorMargen(10, 0.40)`)
- AND `incluido` defaults to `true`

#### Scenario: UNIQUE constraint prevents duplicate

- GIVEN evento_producto exists for (ev-1, prod-1)
- WHEN attempting to insert a second row for same pair
- THEN the DB rejects with a unique-constraint error

#### Scenario: CASCADE delete on evento

- GIVEN evento "ev-1" has 5 evento_producto rows
- WHEN evento "ev-1" is deleted
- THEN all 5 evento_producto rows are cascade-deleted

---

### Requirement: calcularPrecioPorMargen

The system SHALL provide `calcularPrecioPorMargen(costo: number, margen: number): number` that returns `redondearCentavos(costo / (1 − margen))`. Edge cases: `margen = 0` returns costo; `costo = 0` returns 0.

#### Scenario: Standard margin 40%

- GIVEN costo = 10.00, margen = 0.40
- WHEN `calcularPrecioPorMargen(10, 0.40)` is called
- THEN returns 16.67

#### Scenario: Zero margin returns costo

- GIVEN costo = 10.00, margen = 0.00
- WHEN `calcularPrecioPorMargen(10, 0)` is called
- THEN returns 10.00

#### Scenario: Five representative inputs verified

- GIVEN inputs: (10, 0.40→16.67), (5, 0.25→6.67), (100, 0.50→200.00), (3.33, 0.33→4.97), (0, 0→0)
- WHEN each is computed
- THEN all match expected outputs within 0.01 precision

---

### Requirement: calcularMargenReal

The system SHALL provide `calcularMargenReal(precioVenta: number, costo: number): number` returning `redondearCentavos((precioVenta − costo) / precioVenta)`. SHALL be bidirectional with REQ-PRICING-2.

#### Scenario: Bidirectional consistency with calcularPrecioPorMargen

- GIVEN costo = 10.00, margen = 0.40
- WHEN price = calcularPrecioPorMargen(10, 0.40) = 16.67
- AND marginBack = calcularMargenReal(16.67, 10.00)
- THEN marginBack ≈ 0.40 (±0.01 tolerance)

#### Scenario: Zero cost edge case

- GIVEN precioVenta = 5.00, costo = 0.00
- WHEN `calcularMargenReal(5.00, 0.00)` is called
- THEN returns 1.00 (100% margin)

---

### Requirement: No Intermediate Rounding

The system SHALL apply `redondearCentavos` ONLY at the final result of pricing functions. Intermediate arithmetic SHALL use raw floating-point. A float-drift test with 100 accumulated values SHALL assert total is exact within 0.01.

#### Scenario: Float-drift safe across 100 items

- GIVEN 100 venta_items each with costo_unitario = 1.67, cantidad = 1
- WHEN COGS is aggregated and `redondearCentavos` called once at end
- THEN total COGS = 167.00 (not 166.99999 or 167.01)

---

### Requirement: inicializarDesdeCatalogo

The system SHALL provide `inicializarDesdeCatalogo(eventoId: string, margenDefault: number)` that bulk-creates one `evento_producto` row per existing `producto`, with `incluido = true`, `margen = margenDefault`, and `precio_venta` computed from `calcularPrecioPorMargen(producto.costo, margenDefault)`. The operation SHALL be idempotent via UPSERT on UNIQUE constraint.

#### Scenario: Bulk initialization with default margin

- GIVEN 5 productos exist in catalog, evento "ev-1" has zero evento_productos
- WHEN `inicializarDesdeCatalogo("ev-1", 0.40)` is called
- THEN 5 evento_producto rows are created, all with `incluido = true` and `margen = 0.40`

#### Scenario: Idempotent — re-run does not duplicate

- GIVEN evento "ev-1" already has evento_productos for all 5 productos
- WHEN `inicializarDesdeCatalogo("ev-1", 0.40)` is called again
- THEN row count remains 5 (upsert, not insert-duplicate)

---

### Requirement: EventoProductosView

The system SHALL provide `EventoProductosView` at `/eventos/:id/productos` rendering a per-evento product table with columns: producto name, costo, margen (slider 0–90%), computed precio (live-updated), and incluido (checkbox). A bulk action "SELECCIONAR TODOS CON MARGEN 40%" SHALL call `inicializarDesdeCatalogo`. The view SHALL be gated by `estadoEsEditable`.

#### Scenario: Table renders with live price preview

- GIVEN evento "ev-1" in planificacion with 3 evento_producto rows
- WHEN `EventoProductosView` loads
- THEN each row shows producto name, costo, margen slider, precio (computed), and incluido checkbox
- AND changing a margen slider updates the precio in real-time

#### Scenario: Read-only when cerrado

- GIVEN evento "ev-1" has estado = 'cerrado'
- WHEN navigating to `/eventos/ev-1/productos`
- THEN the view renders read-only with "Evento cerrado — no editable" alert
- AND margen sliders and incluido checkboxes are disabled

---

### Requirement: MargenSlider Component

The system SHALL provide `MargenSlider.vue` — a reusable component with a slider/input accepting 0–90 (percentage display), storing 0..1 (DB value), and showing a live-computed price preview. Props: `modelValue: number` (0..1), `costo: number`. Emits: `update:modelValue`.

#### Scenario: Slider shows percentage and live price

- GIVEN `MargenSlider` with `costo = 10.00` and `modelValue = 0.40`
- WHEN the component renders
- THEN displays "40%" and computed price "$16.67"
- AND sliding to 50% updates emit to 0.50 and shows "$20.00"

---

### Requirement: eventoProductos Store

The system SHALL provide `eventoProductos.store.ts` (Pinia) with state: `eventoProductos: Map<string, EventoProducto[]>`. Actions: `cargarParaEvento(eventoId)`, `actualizarMargen(eventoProductoId, margen)`, `actualizarIncluido(eventoProductoId, incluido)`. Mutations SHALL be gated on `estadoEsEditable`.

#### Scenario: Load evento productos reactively

- GIVEN evento "ev-1" has 3 evento_producto rows in Supabase
- WHEN `cargarParaEvento("ev-1")` is called
- THEN `eventoProductos.get("ev-1")` contains 3 items

#### Scenario: actualizarMargen blocked on cerrado

- GIVEN evento "ev-1" has estado = 'cerrado'
- WHEN `actualizarMargen(id, 0.50)` is called
- THEN returns `{ error: { code: 'EVENTO_CERRADO' } }`
