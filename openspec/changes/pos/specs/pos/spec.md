# POS Specification

> **Change**: `pos` | **Type**: New capabilities (greenfield)
> **Source**: `brief.md` §7 Phase 4 items 14–17. **Proposal**: `openspec/changes/pos/proposal.md`.
> **Exploration**: `openspec/changes/pos/exploration.md`. **Artifact store mode**: `both`.
>
> This spec defines the complete set of requirements and scenarios for the kilo-lima POS slice.
> It is the first **transactional** domain — ventas append to a ledger with optimistic UI and revert-on-failure.

## Purpose

Deliver a caja registradora: product grid sourced from new `productos` table (commercial wrapper around catalog `recetas`), in-memory cart with optimistic UI and snapshot-at-write semantics, append-only sales ledger (`ventas` + `venta_items`), daily close snapshot (`cierres_caja`), and unplanned expenses (`gastos_imprevistos`) on a separate table from `gastos_fijos`. POS drives the events state machine forward (`en_curso → cerrado`) for the first time. Spanish domain names; English infrastructure identifiers.

## Requirements

### 1. Productos

#### REQ-POS-1: CRUD productos

The system SHALL provide full CRUD for `productos` — the commercial wrapper around `recetas` — with fields: `receta_id` (FK → recetas ON DELETE RESTRICT), `precio_venta` (CHECK > 0), `disponible` (boolean, default true), `orden` (integer, default 0).

**Rationale**: Separate "what we sell" from "what we cook" (catalog owns recetas). A recipe may exist without being for sale. RESTRICT FK prevents deleting a receta that has a producto.

**Scenario: Create producto for a receta**

- GIVEN a receta with id "rec-1" exists and has `costoPorUnidad = 3.50`
- WHEN the user creates a producto with `receta_id = "rec-1"` and `precio_venta = 5.00`
- THEN a `producto` row is inserted with `disponible = true` and `orden = 0`
- AND the producto is returned with its generated `id` and timestamps

**Scenario: Delete producto with no sale history**

- GIVEN a producto "prod-1" exists with no associated `venta_items` rows
- WHEN the user deletes "prod-1"
- THEN the producto row is removed from the table

**Scenario: Cannot delete receta with active producto**

- GIVEN a receta "rec-1" has a linked producto "prod-1"
- WHEN attempting to delete receta "rec-1"
- THEN the operation is rejected by the RESTRICT foreign key

---

#### REQ-POS-2: UNIQUE(receta_id) constraint

The system SHALL enforce a UNIQUE constraint on `productos.receta_id` so that no more than one producto exists per receta.

**Rationale**: One recipe → one commercial price. Multi-variant pricing is a future slice (`productos_variantes`).

**Scenario: Prevent duplicate producto for same receta**

- GIVEN a producto "prod-1" already exists for receta "rec-1"
- WHEN attempting to insert a second producto for `receta_id = "rec-1"`
- THEN the insert fails with a unique-constraint violation error

---

#### REQ-POS-3: Toggle disponible (on/off sale)

The system SHALL support toggling `productos.disponible` between `true` (visible in POS grid) and `false` (hidden without delete).

**Rationale**: Soft-hide products without losing pricing data or sale history. Respects RESTRICT FK on venta_items.

**Scenario: Toggle producto to unavailable**

- GIVEN a producto with `disponible = true`
- WHEN the user updates `disponible` to `false`
- THEN the producto no longer appears in the POS product grid
- AND historical `venta_items` referencing this producto are unaffected

**Scenario: Toggle producto back to available**

- GIVEN a producto with `disponible = false`
- WHEN the user updates `disponible` to `true`
- THEN the producto reappears in the POS product grid

---

#### REQ-POS-4: precio_venta editable, defaults to receta.costoPorUnidad × markup

The system SHALL allow `precio_venta` to be set independently at create time and edited afterward. When creating a producto from `RecetaDetalleView`, the system SHOULD pre-fill `precio_venta` as `receta.costoPorUnidad × markup` where the markup is user-configurable (default 2.0).

**Rationale**: Decoupled pricing: changing `precio_venta` does NOT affect historical `venta_items.precio_unitario` (snapshot pattern).

**Scenario: Edit precio_venta of existing producto**

- GIVEN a producto "prod-1" with `precio_venta = 5.00`
- WHEN the user updates `precio_venta` to `6.00`
- THEN the producto row reflects `precio_venta = 6.00`
- AND existing `venta_items` rows referencing this producto keep their original `precio_unitario`

**Scenario: precio_venta validation**

- GIVEN the user is creating or editing a producto
- WHEN `precio_venta` is set to 0 or a negative value
- THEN the operation fails with validation error "El precio de venta debe ser mayor a 0"

---

#### REQ-POS-5: No delete if ventas exist (RESTRICT or soft-archive)

The system SHALL prevent deletion of a `producto` that has associated `venta_items` rows via ON DELETE RESTRICT foreign key.

**Rationale**: Sale history is an immutable ledger. Deleting a sold product would corrupt historical records.

**Scenario: Delete blocked by sale history**

- GIVEN a producto "prod-1" has at least one `venta_item` row referencing it
- WHEN attempting to delete "prod-1"
- THEN the operation is rejected with a foreign-key constraint error
- AND the producto row remains intact

---

### 2. Ventas (Cart + Sale Registration)

#### REQ-POS-6: In-memory cart state

The system SHALL maintain an in-memory cart state inside `ventas.store` (Pinia) with the shape `items: { productoId, cantidad, precioSnapshot }[]`, a computed `total`, and a computed `itemCount`.

**Rationale**: Cart is transient UI state — it does NOT persist across browser refresh. v1 is online-only; offline-sync slice will add WAL persistence.

**Scenario: Cart initial state is empty**

- GIVEN the `ventas.store` is initialized
- WHEN accessing the cart state
- THEN `items` is an empty array, `total` is 0, and `itemCount` is 0

---

#### REQ-POS-7: Add to cart (merge duplicates)

The system SHALL add a producto to the cart via `agregarAlCarrito(productoId)`. If the producto already exists in cart, its `cantidad` SHALL increment by 1 (merged, not duplicate row). Maximum cantidad SHALL be 99.

**Rationale**: Merging duplicates avoids clutter. Cart cap at 99 prevents unrealistic inputs.

**Scenario: Add new producto to empty cart**

- GIVEN the cart is empty
- WHEN `agregarAlCarrito("prod-1")` is called with the producto's `precio_venta = 5.00`
- THEN the cart contains one item with `productoId = "prod-1"`, `cantidad = 1`, `precioSnapshot = 5.00`

**Scenario: Add same producto twice merges quantity**

- GIVEN the cart has one item for "prod-1" with `cantidad = 1`
- WHEN `agregarAlCarrito("prod-1")` is called again
- THEN the cart still has one item for "prod-1" with `cantidad = 2`

**Scenario: Add producto when quantity already at max**

- GIVEN cart has item "prod-1" with `cantidad = 99`
- WHEN `agregarAlCarrito("prod-1")` is called
- THEN the operation returns an error or quantity stays at 99

---

#### REQ-POS-8: Update cantidad in cart

The system SHALL support `actualizarCantidad(productoId, cantidad)` to set a line's quantity directly. Setting `cantidad = 0` SHALL remove the line. Negative cantidad SHALL be rejected.

**Rationale**: Direct quantity editing for bulk adjustments.

**Scenario: Update quantity to a positive value**

- GIVEN the cart has "prod-1" with `cantidad = 1`
- WHEN `actualizarCantidad("prod-1", 3)` is called
- THEN the cart line reflects `cantidad = 3` and its subtotal updates accordingly

**Scenario: Update quantity to zero removes line**

- GIVEN the cart has "prod-1" with `cantidad = 2`
- WHEN `actualizarCantidad("prod-1", 0)` is called
- THEN the item is removed from the cart

**Scenario: Negative quantity is rejected**

- GIVEN any cart state
- WHEN `actualizarCantidad("prod-1", -1)` is called
- THEN the operation is rejected or ignored

---

#### REQ-POS-9: Remove from cart

The system SHALL support `quitarDelCarrito(productoId)` to remove a specific line from the cart.

**Scenario: Remove existing item from cart**

- GIVEN the cart has items for "prod-1" and "prod-2"
- WHEN `quitarDelCarrito("prod-1")` is called
- THEN "prod-1" is removed and "prod-2" remains

---

#### REQ-POS-10: Clear cart

The system SHALL support `vaciarCarrito()` to remove all items from the cart.

**Scenario: Clear cart with items**

- GIVEN the cart has 3 items
- WHEN `vaciarCarrito()` is called
- THEN the cart is empty with `items = []`, `total = 0`, `itemCount = 0`

---

#### REQ-POS-11: Cart total computation

The system SHALL compute cart total as `Σ(cantidad × precioSnapshot)` for all cart lines, rounded to 2 decimal places using `redondearCentavos`.

**Scenario: Cart total with multiple items**

- GIVEN the cart has: "prod-1" (cantidad=2, precio=5.00) and "prod-2" (cantidad=1, precio=3.50)
- WHEN `total` is computed
- THEN `total = 13.50` (2×5.00 + 1×3.50)

**Scenario: Empty cart total is zero**

- GIVEN the cart is empty
- WHEN `total` is computed
- THEN `total = 0`

---

#### REQ-POS-12: Registrar venta (sale registration)

The system SHALL provide `registrarVenta(metodoPago)` that creates a `venta` row plus N `venta_items` rows via the `ventas.service`. The service SHALL insert the venta header first, then all items, returning success only if all inserts succeed.

**Rationale**: Append-only ledger. Future Supabase RPC will make this atomic; v1 uses sequential inserts with failure detection.

**Scenario: Successful sale registration**

- GIVEN an evento is `en_curso` and the cart has 2 items totaling $13.50
- WHEN `registrarVenta('efectivo')` is called
- THEN a `venta` row is inserted with `total = 13.50` and `metodo_pago = 'efectivo'`
- AND 2 `venta_items` rows are inserted, each with `venta_id` matching the new venta
- AND each item's `precio_unitario` and `subtotal` are snapshotted from cart values

**Scenario: Sale registration fails mid-items**

- GIVEN the venta header insert succeeds but a venta_item insert fails
- WHEN `registrarVenta` detects a failure in one of the item inserts
- THEN the service returns `{ data: null, error: ServiceError }` with the first error encountered

---

#### REQ-POS-13: Snapshot precio_unitario at write time

The system SHALL store `precio_unitario` and `subtotal` as column values in `venta_items` at insert time — NOT derived from `productos.precio_venta` on read. If `producto.precio_venta` changes later, historical `venta_items.precio_unitario` SHALL remain unchanged.

**Rationale**: Explicit inversion of catalog's "compute on read" pattern. Where catalog DERIVES cost to stay fresh, ventas SNAPSHOT price to stay honest. Cierres and analytics consume what actually happened.

**Scenario: Historical venta unaffected by price change**

- GIVEN a venta was registered when "prod-1" had `precio_venta = 5.00`, so `venta_items.precio_unitario = 5.00`
- WHEN `producto.precio_venta` is later updated to `6.00`
- THEN the historical `venta_item` still reads `precio_unitario = 5.00`

---

#### REQ-POS-14: Optimistic UI on sale registration

The system SHALL implement optimistic UI for `registrarVenta`: immediately clear the cart, show a green toast "🎉 Venta registrada: $X.XX", and append the new venta to the in-memory list. If the Supabase call fails, the system SHALL revert: restore the cart, remove the optimistically-added venta, and show a red toast "❌ Error al registrar venta — revisá tu conexión".

**Rationale**: Brief §3.1 mandates "feedback inmediato y emocional." The cart must feel instant.

**Scenario: Optimistic success flow**

- GIVEN the cart has 1 item totaling $5.00
- WHEN `registrarVenta('efectivo')` is called and the Supabase call succeeds
- THEN the cart is cleared immediately (before network response)
- AND a green toast shows "🎉 Venta registrada: $5.00"
- AND the venta appears in the "Ventas de hoy" list

**Scenario: Optimistic revert on failure**

- GIVEN the cart has 1 item
- WHEN `registrarVenta` is called but the Supabase call fails
- THEN the cart is restored to its pre-call state
- AND a red toast shows "❌ Error al registrar venta — revisá tu conexión"

---

#### REQ-POS-15: Cart empty guard

The system SHALL prevent sale registration when the cart is empty. The "Registrar venta" button SHALL be disabled.

**Scenario: Empty cart cannot register**

- GIVEN the cart has 0 items
- WHEN the user attempts to trigger `registrarVenta`
- THEN the action is not executed and the "Registrar venta" button is disabled

---

#### REQ-POS-16: No evento en_curso guard

The system SHALL prevent sale registration when no evento is in `en_curso` state. The store action SHALL return `ServiceError { code: 'SIN_EVENTO_ACTIVO' }`.

**Scenario: Sale blocked without active evento**

- GIVEN no evento is `en_curso`
- WHEN `registrarVenta` is called
- THEN the action returns `ServiceError { code: 'SIN_EVENTO_ACTIVO' }` and no rows are inserted

---

### 3. Venta Items

#### REQ-POS-17: Each venta has ≥1 item

The system SHALL ensure every `venta` has at least one associated `venta_item`. The `registrarVenta` method SHALL reject a sale with zero items.

**Scenario: Sale with zero items is rejected**

- GIVEN the cart is empty
- WHEN `registrarVenta` is called
- THEN the action returns an error and no venta row is created

---

#### REQ-POS-18: Venta item fields and constraints

The system SHALL define `venta_items` with fields: `producto_id` (FK → productos RESTRICT), `cantidad` (CHECK > 0, numeric(10,4)), `precio_unitario` (CHECK >= 0, numeric(10,2)), `subtotal` (CHECK >= 0, numeric(10,2) = cantidad × precio_unitario).

**Rationale**: Decimal `cantidad` supports fractional units (e.g., 0.5 kg). RESTRICT on `producto_id` protects sale history.

**Scenario: Item with decimal cantidad**

- GIVEN the user adds "prod-1" to cart with `cantidad = 0.5`
- WHEN the sale is registered
- THEN the `venta_item` row has `cantidad = 0.5` and `subtotal = 0.5 × precio_unitario`

**Scenario: Cantidad zero or negative is rejected**

- GIVEN the cart has at least one item
- WHEN any item in the cart has `cantidad <= 0`
- THEN `registrarVenta` rejects with a validation error

---

#### REQ-POS-19: CASCADE delete from venta

The system SHALL define `venta_items.venta_id` FK with ON DELETE CASCADE so that deleting a venta removes its items. In practice, ventas are append-only so deletes rarely occur.

**Rationale**: Defensive integrity — if a venta is ever cleaned up (e.g., admin tool), orphan items should not remain.

**Scenario: Deleting a venta removes its items**

- GIVEN a venta "v-1" has 3 items
- WHEN "v-1" is deleted
- THEN all 3 `venta_items` rows referencing `venta_id = "v-1"` are also deleted

---

### 4. Grid de Productos (POS Main View)

#### REQ-POS-20: Visual product grid

The system SHALL render a visual grid of available productos (`disponible = true`) sorted by `orden ASC, created_at ASC`. Each card SHALL display: recipe name, `precio_venta`, and an "Agregar" button. Cards SHALL be clickable to add the producto to cart.

**Scenario: Grid displays available products**

- GIVEN 3 productos exist: "prod-1" (disponible=true, orden=1), "prod-2" (disponible=true, orden=2), "prod-3" (disponible=false)
- WHEN the POS view loads
- THEN the grid shows 2 cards (prod-1 before prod-2) and prod-3 is hidden

**Scenario: Clicking a product card adds to cart**

- GIVEN the POS grid is rendered with "prod-1"
- WHEN the user clicks the "Agregar" button on "prod-1"
- THEN `agregarAlCarrito("prod-1")` is called and the cart updates

---

#### REQ-POS-21: Touch-friendly tap targets

The system SHALL ensure all interactive elements in the POS grid have minimum 48px tap targets, per brief §6.1.

**Rationale**: Feria environments are mobile-first. Tap targets smaller than 48px cause mis-taps.

**Scenario: Card buttons meet minimum touch size**

- GIVEN the product grid is rendered on a mobile viewport
- WHEN measuring the "Agregar" button on any `ProductoCard`
- THEN its tap target height is ≥ 48px

---

#### REQ-POS-22: Filter by categoria (optional v1)

The system MAY support filtering the product grid by recipe category. v1 implements the filter as optional; the grid SHALL show all available productos by default.

**Scenario: Grid shows all products when no filter is active**

- GIVEN productos exist across multiple categorías
- WHEN no category filter is selected
- THEN all available productos are shown

---

#### REQ-POS-23: Search by name

The system SHALL support searching the product grid by recipe name, filtering results in real-time as the user types.

**Scenario: Name search filters the grid**

- GIVEN available productos include "Brownies" and "Galletas"
- WHEN the user types "brow" in the search field
- THEN only "Brownies" card is displayed

**Scenario: Search with no matches**

- GIVEN the search input is "xyz"
- WHEN no producto name matches
- THEN the grid shows an empty state: "No se encontraron productos"

---

#### REQ-POS-24: Empty state (no productos disponibles)

The system SHALL display an empty state when no productos are `disponible`. The message SHALL include a link to `/catalog`: "No hay productos disponibles. Creá productos desde el Catálogo."

**Scenario: Empty grid with link to catalog**

- GIVEN no productos exist with `disponible = true`
- WHEN the POS view loads
- THEN the grid shows "No hay productos disponibles" with a link to `/catalog`

---

### 5. Carrito Panel

#### REQ-POS-25: Cart panel as sidebar or bottom-sheet

The system SHALL render a cart panel as a sidebar on desktop (≥md breakpoint) and a bottom-sheet on mobile. The panel SHALL be always visible when the POS view is active.

**Scenario: Desktop shows sidebar cart**

- GIVEN the viewport is ≥ 960px wide
- WHEN the POS view renders
- THEN the cart panel appears as a sidebar alongside the product grid

**Scenario: Mobile shows bottom-sheet cart**

- GIVEN the viewport is < 960px wide
- WHEN the POS view renders
- THEN the cart panel appears as a bottom-sheet accessible via a floating action button

---

#### REQ-POS-26: Cart line item display

The system SHALL render each cart line with: recipe name, cantidad controls (+/− buttons), computed subtotal, and a remove (×) button.

**Scenario: Cart line shows all controls**

- GIVEN the cart has item "Brownies" (cantidad=2, precio=5.00)
- WHEN rendering the cart panel
- THEN the line shows "Brownies", a "−" button, "2", a "+" button, "$10.00" subtotal, and a "×" remove button

---

#### REQ-POS-27: Total prominently displayed

The system SHALL display the cart total in large text at the bottom of the cart panel, formatted as USD with 2 decimal places.

**Scenario: Total visible at bottom of cart**

- GIVEN the cart total is $25.00
- WHEN the cart panel renders
- THEN "$25.00" is displayed prominently at the bottom

---

#### REQ-POS-28: Registrar venta button guarded by empty cart

The system SHALL render a "Registrar venta" primary button at the bottom of the cart panel. The button SHALL be disabled when the cart is empty.

**Scenario: Register button disabled when cart is empty**

- GIVEN the cart has 0 items
- WHEN the cart panel renders
- THEN the "Registrar venta" button is disabled

**Scenario: Register button enabled when cart has items**

- GIVEN the cart has at least 1 item
- WHEN the cart panel renders
- THEN the "Registrar venta" button is enabled

---

#### REQ-POS-29: Vaciar carrito with confirmation

The system SHALL provide a "Vaciar carrito" button. Clicking it SHALL open a confirmation dialog ("¿Vaciar el carrito? Se perderán todos los productos agregados.") with "Cancelar" and "Vaciar" actions. Confirming SHALL call `vaciarCarrito()`.

**Scenario: Vaciar with confirmation accepted**

- GIVEN the cart has 3 items
- WHEN the user clicks "Vaciar carrito" and confirms
- THEN the cart is emptied

**Scenario: Vaciar with confirmation cancelled**

- GIVEN the cart has 3 items
- WHEN the user clicks "Vaciar carrito" but cancels
- THEN the cart is unchanged

---

### 6. Cierre de Caja

#### REQ-POS-30: CierreCajaView accessible from POS

The system SHALL provide a cierre de caja view at `/pos/cierre/:eventoId`, accessible from the POS menu. The view SHALL load ventas, gastos fijos, gastos imprevistos, and any existing cierre for the evento.

**Scenario: Navigate to cierre view for active evento**

- GIVEN an evento "ev-1" is `en_curso` with ventas and gastos
- WHEN the user navigates to `/pos/cierre/ev-1`
- THEN the cierre view renders with totals calculated from current data

---

#### REQ-POS-31: Calculate cierre totals

The system SHALL compute cierre totals via the pure function `calcularCierre()` returning: `totalVentas`, `totalGastosFijos`, `totalGastosImprevistos`, `utilidadBruta = totalVentas − totalGastosFijos − totalGastosImprevistos`, `ventasPorMetodoPago` breakdown, `cantidadVentas`, `diferencia = efectivoReal − efectivoEsperado` (NULL if cash count skipped).

**Scenario: Cierre calculation with mixed payment methods**

- GIVEN 2 ventas: "v-1" (total=10, efectivo), "v-2" (total=15, tarjeta); gastos_fijos = 5; gastos_imprevistos = 3
- WHEN `calcularCierre` is called with no cash count (efectivoEsperado=null, efectivoReal=null)
- THEN result has `totalVentas=25`, `totalGastosFijos=5`, `totalGastosImprevistos=3`, `utilidadBruta=17`, `ventasPorMetodoPago.efectivo=10`, `ventasPorMetodoPago.tarjeta=15`, `diferencia=null`

**Scenario: Cash count difference computed**

- GIVEN `efectivoEsperado=100`, `efectivoReal=95`
- WHEN `calcularCierre` is called
- THEN `diferencia = -5`

---

#### REQ-POS-32: Snapshot cierre at write time

The system SHALL insert a `cierres_caja` row with immutable totals at registration time. Once inserted, a cierre row SHALL NOT be updated (no `updated_at` column, no update method in the service).

**Rationale**: The cierre is a frozen historical record. If ventas change later (shouldn't — evento is cerrado), the cierre stays accurate to its day.

**Scenario: Cierre row is immutable after creation**

- GIVEN a `cierres_caja` row exists for evento "ev-1"
- WHEN the `cierres.service` is inspected
- THEN it exposes `crear` and `obtenerPorEventoId` but NO `actualizar` method

---

#### REQ-POS-33: Drive evento state machine forward

The system SHALL call `transicionEstadoValida('en_curso', 'cerrado')` before registering a cierre. If valid, it SHALL call `eventsService.cambiarEstado(eventoId, 'cerrado')` after the cierre insert. If the evento is already `cerrado` and a cierre row does NOT exist, the system SHALL allow retroactive cierre creation.

**Rationale**: POS is the first slice that drives the state machine forward. Retroactive cierre is meta-data, not a mutation.

**Scenario: Close evento via cierre registration**

- GIVEN evento "ev-1" is `en_curso` and the user confirms cierre
- WHEN `registrarCierre` is called
- THEN a `cierres_caja` row is inserted and the evento transitions to `cerrado`

**Scenario: Retroactive cierre for already-closed evento**

- GIVEN evento "ev-1" is `cerrado` with NO existing cierre row
- WHEN the user navigates to `/pos/cierre/ev-1` and registers a cierre
- THEN a `cierres_caja` row is inserted and the evento state remains `cerrado`

---

#### REQ-POS-34: Cierre review screen

The system SHALL render a review screen (`CierreResumenCard`) with 4 sections: (1) Ventas — count + total + per-metodo_pago breakdown, (2) Gastos — fijos + imprevistos with category breakdown, (3) Utilidad bruta, (4) Diferencia — with a yellow `v-alert` when `diferencia !== 0`.

**Scenario: Show yellow alert on non-zero diferencia**

- GIVEN the cierre has `diferencia = -5`
- WHEN `CierreResumenCard` renders
- THEN a yellow `v-alert` shows "Faltante: $5.00"

**Scenario: No alert when diferencia is zero**

- GIVEN the cierre has `diferencia = 0`
- WHEN `CierreResumenCard` renders
- THEN no warning alert is shown

---

#### REQ-POS-35: Cannot close without ventas OR if already cerrado

The system SHALL warn if attempting to close an evento with zero ventas: "No hay ventas registradas — ¿estás seguro de cerrar?" The system SHALL reject cierre if the evento is already `cerrado` AND a cierre row already exists (UNIQUE constraint on `evento_id`).

**Scenario: Zero-ventas warning with confirmation**

- GIVEN evento "ev-1" is `en_curso` with 0 ventas
- WHEN the user clicks "Registrar cierre"
- THEN a confirmation dialog warns about zero ventas before proceeding

**Scenario: Duplicate cierre rejected**

- GIVEN evento "ev-1" already has a `cierres_caja` row
- WHEN attempting to register a second cierre
- THEN the operation fails with a unique-constraint violation

---

#### REQ-POS-36: Close action writes cierre and transitions evento

The system SHALL execute `registrarCierre`: insert the `cierres_caja` row, then call `eventsService.cambiarEstado(eventoId, 'cerrado')`. On success, the system SHALL show a success toast and redirect to the evento detail view (`/eventos/:id`).

**Scenario: Successful close redirects to evento detail**

- GIVEN the user confirms cierre for evento "ev-1"
- WHEN the cierre insert and estado transition both succeed
- THEN a success toast is shown and the user is redirected to `/eventos/ev-1`

**Scenario: Cierre insert succeeds but estado transition fails**

- GIVEN the cierre row is inserted but `cambiarEstado` fails (e.g., evento already cerrado by another action)
- WHEN the error is returned
- THEN the cierre row stays (UNIQUE prevents duplicates) and the user sees an error: "No se pudo actualizar el estado del evento"

---

### 7. Gastos Imprevistos

#### REQ-POS-37: CRUD gastos_imprevistos

The system SHALL provide CRUD for `gastos_imprevistos` — per-evento unplanned expenses — with fields: `evento_id` (FK CASCADE), `monto` (CHECK > 0, numeric(10,2)), `motivo` (non-empty, max 500 chars), `categoria` (optional, 5-value enum), `created_at`.

**Scenario: Create an unexpected expense**

- GIVEN an evento "ev-1" is `en_curso`
- WHEN the user creates a gasto imprevisto with `monto=50`, `motivo="Compramos más vasos"`, `categoria="insumos_extra"`
- THEN a row is inserted and appears in the gastos imprevistos list

**Scenario: Delete an unexpected expense**

- GIVEN a gasto imprevisto "gi-1" exists for evento "ev-1"
- WHEN the user deletes "gi-1"
- THEN the row is removed from the table

---

#### REQ-POS-38: Separate table from gastos_fijos

The system SHALL store `gastos_imprevistos` in a separate table from `gastos_fijos`. The `calcularProyeccion` function from events SHALL NOT read `gastos_imprevistos` — it consumes only `gastos_fijos`.

**Rationale**: Mixing planned and unplanned costs would corrupt `calcularProyeccion`'s math. Events expects `gastos_fijos` to be a known input; imprevistos are runtime surprises.

**Scenario: Proyeccion unaffected by imprevistos**

- GIVEN an evento has `gastos_fijos` totaling $100 and `gastos_imprevistos` totaling $30
- WHEN `calcularProyeccion` is called
- THEN the projection uses only $100 (gastos_fijos), ignoring the $30 imprevistos

---

#### REQ-POS-39: Frozen on cerrado (estadoEsEditable gate)

The system SHALL gate gastos_imprevistos mutations on `estadoEsEditable(evento.estado)`. If the evento is `cerrado`, the crear/eliminar actions SHALL return `ServiceError { code: 'EVENTO_CERRADO' }`. The "Agregar" button in the UI SHALL be hidden when `estado === 'cerrado'`.

**Scenario: Add expense blocked for closed evento**

- GIVEN evento "ev-1" is `cerrado`
- WHEN attempting to create a gasto imprevisto for "ev-1"
- THEN the store action returns `ServiceError { code: 'EVENTO_CERRADO' }`

---

#### REQ-POS-40: Visible in cierre view

The system SHALL include `gastos_imprevistos` totals in the cierre review screen, impacting `utilidad_bruta` calculation. The gastos imprevistos section inside `PosView` SHALL be collapsible on desktop and a tab on mobile, per brief §6.1.

**Scenario: Imprevistos section shows in POS view**

- GIVEN evento "ev-1" is `en_curso` with 2 gastos imprevistos
- WHEN the POS view renders
- THEN the "Gastos imprevistos de esta feria" section shows both items with a total

---

### 8. Database Schema

#### REQ-POS-41: SQL migration with 5 tables

The system SHALL provide a single SQL migration `supabase/migrations/20260619000000_pos_inicial.sql` that creates: `productos`, `ventas`, `venta_items`, `gastos_imprevistos`, `cierres_caja` — each with columns, constraints, foreign keys, indexes, RLS policies, and an `updated_at` trigger on `productos` (the only mutable table). The migration SHALL be idempotent-safe.

**Scenario: All 5 tables exist after migration**

- GIVEN a fresh Supabase project
- WHEN the `20260619000000_pos_inicial.sql` migration is applied
- THEN all 5 tables exist with correct columns, CHECK constraints, FKs, indexes, and RLS enabled

---

#### REQ-POS-42: Extend Database interface

The system SHALL extend `src/types/database.types.ts` with 5 new entries under `Database['public']['Tables']` for `productos`, `ventas`, `venta_items`, `gastos_imprevistos`, and `cierres_caja`. Each entry SHALL include `Row`, `Insert`, `Update`, and `Relationships` types. `pnpm typecheck` SHALL pass.

**Scenario: TypeScript compilation succeeds with new tables**

- GIVEN the hand-rolled `Database` interface is extended with 5 new tables
- WHEN `pnpm typecheck` is run
- THEN type checking exits 0 with no errors

---

#### REQ-POS-43: Extend dev_bypass_rls.sql

The system SHALL extend `supabase/dev_bypass_rls.sql` with `grant select, insert, update, delete` on all 5 new tables for the `anon` role. The file SHALL retain its loud dev-only header comment naming `auth-flow` as the removal slice.

**Scenario: Anon role can access new tables in dev**

- GIVEN the extended `dev_bypass_rls.sql` script is run
- WHEN the anon key queries `productos`, `ventas`, `venta_items`, `gastos_imprevistos`, and `cierres_caja`
- THEN all CRUD operations succeed

---

### 9. Types & Routes

#### REQ-POS-44: src/types/pos.types.ts

The system SHALL create `src/types/pos.types.ts` with Spanish domain types: `Producto`, `ProductoInput`, `Venta`, `VentaInput`, `VentaItem`, `VentaItemInput`, `VentaConItems`, `GastoImprevisto`, `GastoImprevistoInput`, `CierreCaja`, `CierreCajaInput`, `MetodoPago` (4-value union), `CategoriaImprevisto` (5-value union), `LineaCarrito`, `ResumenCarrito`, `CierreResumen`, `CierreInput`. All types SHALL be re-exported from `src/types/index.ts`.

**Scenario: All pos types are importable**

- GIVEN the `pos.types.ts` file exists
- WHEN importing `Producto`, `Venta`, `MetodoPago`, `CierreResumen` from `@/types`
- THEN all types resolve correctly with no compiler errors

---

#### REQ-POS-45: Routes: /pos and /pos/cierre/:eventoId

The system SHALL add 2 lazy-loaded routes: `/pos` → `PosView.vue` and `/pos/cierre/:eventoId` → `PosCierreView.vue` (with `props: true`). Both routes SHALL be added to `src/router/routes.ts` and verified in `src/router/routes.spec.ts`.

**Scenario: /pos route resolves**

- GIVEN the router is configured with lazy-loaded POS routes
- WHEN navigating to `/pos`
- THEN `PosView.vue` is rendered

**Scenario: /pos/cierre/:eventoId route resolves with props**

- GIVEN the router is configured
- WHEN navigating to `/pos/cierre/ev-123`
- THEN `PosCierreView.vue` is rendered with `eventoId` prop set to `"ev-123"`

---

#### REQ-POS-46: /productos route

The system SHALL provide a `/productos` route (or integrate CRUD under `/catalog`) for managing what's for sale. v1 MAY ship a minimal product-management view; the cross-slice "Vender esta receta" button serves as the primary create path.

**Scenario: Product management accessible**

- GIVEN the system has routes configured
- WHEN navigating to a path that allows producto CRUD
- THEN a form for creating/editing productos is available

---

### 10. Cross-slice + UI/UX + SOLID + TDD

#### REQ-POS-47: RecetaDetalleView cross-slice touch

The system SHALL add a "Vender esta receta" button on `RecetaDetalleView.vue` (catalog domain) when no `producto` exists for that `receta_id`. Clicking SHALL open a dialog prompting for `precio_venta`, creating a `producto` with `disponible = true`. After creation, the button SHALL change to "Editar precio de venta". This is the ONLY cross-slice modification in v1.

**Rationale**: The cleanest UX for creating productos from recipes. A separate Productos CRUD view is a future slice.

**Scenario: Vender button visible when no producto exists**

- GIVEN a receta "rec-1" has no linked producto
- WHEN `RecetaDetalleView` renders for "rec-1"
- THEN a "Vender esta receta" button is visible

**Scenario: Creating a producto hides the button**

- GIVEN the user clicks "Vender esta receta" and enters `precio_venta = 5.00`
- WHEN the producto is created successfully
- THEN the "Vender esta receta" button is replaced by "Editar precio de venta"

---

#### REQ-POS-48: Spanish UI text

The system SHALL use Spanish for ALL user-facing text: labels, buttons, toasts, validation messages, empty states, and confirmation dialogs. Domain identifiers SHALL be Spanish (`Producto`, `Venta`, `agregarAlCarrito`). Infrastructure identifiers SHALL be English (`ventas.service.ts`, `useVentas`).

**Scenario: Toast message in Spanish**

- GIVEN a sale is registered successfully
- WHEN the toast appears
- THEN the message is in Spanish: "🎉 Venta registrada: $X.XX"

---

#### REQ-POS-49: Loading/error/empty states (4-state pattern)

The system SHALL implement 4-state handling for every data-fetching view: loading (skeleton/spinner), error (message + retry), empty (descriptive message with action), and data (normal render). Each view SHALL surface `cargando` and `error` refs from its store.

**Scenario: Loading state renders skeleton**

- GIVEN the POS view is loading productos from Supabase
- WHEN `cargando` is `true`
- THEN a loading indicator is displayed in place of the product grid

**Scenario: Error state shows retry option**

- GIVEN the Supabase fetch for productos fails
- WHEN `error` is set
- THEN an error message is displayed with a "Reintentar" button

---

#### REQ-POS-50: Form validation

The system SHALL validate all form inputs before submission: `cantidad > 0`, `precio > 0`, `motivo` non-empty (max 500 chars). Validation SHALL use native HTML5 + Vuetify field rules (no Zod). Invalid forms SHALL disable their submit button.

**Scenario: Form validation blocks submission**

- GIVEN the "Crear gasto imprevisto" form is open
- WHEN `monto` is 0 and `motivo` is empty
- THEN the "Guardar" button is disabled and validation errors are shown inline

---

#### REQ-POS-51: SRP — 4 stores, cross-store READS only

The system SHALL provide 4 Pinia stores with Single Responsibility: `productos.store`, `ventas.store`, `gastosImprevistos.store`, `cierres.store`. Cross-store READS are allowed inside `computed()`. Cross-store WRITES are FORBIDDEN.

**Rationale**: Events lesson — the `reemplazarTodos` pattern was fragile; cross-store writes create cascading side-effects.

**Scenario: Cross-store read via computed**

- GIVEN `ventas.store` needs `eventoEnCurso` from `events.store`
- WHEN a computed property accesses `eventsStore.eventoEnCurso`
- THEN the read is allowed and the computed value updates reactively

**Scenario: Cross-store write is forbidden**

- GIVEN `ventas.store.registrarVenta` completes
- WHEN inspecting the `events.store` state
- THEN the evento state is unchanged (no cross-store write occurred)

---

#### REQ-POS-52: OCP — factory services

The system SHALL implement all services as factory functions: `crearProductosService(supabase: SupabaseClient<Database>)`, etc. New functionality SHALL extend behavior via new service methods, not by modifying existing method signatures.

**Scenario: Service factory accepts typed Supabase client**

- GIVEN the DI plugin provides `SupabaseClient<Database>` via `inject('supabase')`
- WHEN a service is created via `crearVentasService(supabase)`
- THEN the returned object exposes typed CRUD methods with `{ data, error }` return shape

---

#### REQ-POS-53: LSP — never-throw contract

The system SHALL enforce the never-throw contract: every service method SHALL return `{ data, error: ServiceError | null }`. Services SHALL catch Supabase errors internally and return them as `ServiceError`. Views may throw if they choose, but services NEVER shall.

**Scenario: Service returns error instead of throwing**

- GIVEN the Supabase insert for a venta fails with a network error
- WHEN `ventas.service.crear()` is called
- THEN the method returns `{ data: null, error: { code: 'NETWORK_ERROR', message: '...' } }` without throwing

---

#### REQ-POS-54: ISP — minimal props

The system SHALL design components with minimal props: each component SHALL accept only the data it needs, not entire domain objects with unused fields. `ProductoCard` SHALL accept `producto: Producto` and optionally `receta?: RecetaConIngredientes` (only what's needed for the cost tooltip).

**Scenario: ProductoCard only receives needed props**

- GIVEN a `ProductoCard` is rendered
- WHEN inspecting its props interface
- THEN it accepts `producto` (required) and `receta` (optional) — not additional event or store objects

---

#### REQ-POS-55: DIP — inject('supabase')

The system SHALL use `inject('supabase')` for Supabase client access in stores, following the foundation DI pattern. All services SHALL accept `SupabaseClient<Database>` as their first constructor argument. No store or component SHALL import `supabase` directly.

**Scenario: Store obtains Supabase via inject**

- GIVEN the DI plugin has provided the Supabase client
- WHEN `ventas.store` calls `inject('supabase')`
- THEN it receives a typed `SupabaseClient<Database>` instance

---

#### REQ-POS-56: Strict TDD

The system SHALL follow strict TDD: every `.ts` file SHALL have a corresponding `.spec.ts` written BEFORE the implementation. The change SHALL deliver ≥80 new tests. `pnpm test` SHALL exit 0. The chainable Supabase mock from `tests/setup.ts` SHALL be reused without modification.

**Scenario: All tests pass**

- GIVEN all spec files exist alongside their implementations
- WHEN `pnpm test` is run
- THEN all ~80 new tests pass and the command exits 0

**Scenario: Red phase before green**

- GIVEN a new `.spec.ts` is written for `productos.store`
- WHEN `pnpm test` is run before the store implementation exists
- THEN the new tests fail (confirming the RED phase)

**Scenario: Supabase mock reused unchanged**

- GIVEN the `tests/setup.ts` exports `__resetSupabaseMock`, `__pushSupabaseResponse`, `__getSupabaseMockCalls`
- WHEN POS tests call these helpers
- THEN the mock behaves identically to how it does for catalog and events tests
