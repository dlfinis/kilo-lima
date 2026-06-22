# Delta for POS

> **Change**: `contribucion-financiera` | **Source**: `proposal.md` §12.2
> **Existing**: `openspec/specs/pos/spec.md` (REQ-POS-1 through REQ-POS-56)

## MODIFIED Requirements

### REQ-POS-C-1: PosView Product Grid — Contribution Badge Per Card

(Previously: REQ-POS-20 — each card displayed recipe name, `evento_producto.precio_venta`, and "Agregar" button. No contribution information.)

**Source**: REQ-CON-8, AC-10, AC-12

The system SHALL extend each product card in `PosView` to display a `ContribucionBadge` component sourced from `usePreciosEvento.contribucionParaProducto(eventoId, productoId)` for the current `eventoEnCurso`. The badge SHALL display absolute contribution and percentage, color-coded per REQ-PRICING-C-4 thresholds. The grid SHALL remain within a 4-column Vuetify layout at 1024×768 without overflow. All existing card content (recipe name, precio_venta, "Agregar" button) SHALL be preserved.

#### Scenario: POS card shows contribution badge

- GIVEN evento "ev-1" is `en_curso`, Brownies at precio_venta=16.67, costo=10.00
- WHEN PosView renders the product grid from `eventoProductos.store` filtered by `incluido=true`
- THEN each card displays a `ContribucionBadge` showing "+$6.67 (40%)" in green
- AND the recipe name, precio_venta ($16.67), and "Agregar" button are still visible

#### Scenario: Loss-product shows red badge in POS

- GIVEN evento_producto with precio_venta=4.00, costo=5.00, incluido=true
- WHEN PosView renders
- THEN the card shows a red `ContribucionBadge` displaying "−$1.00"
- AND the card is still clickable — badge is informational only

#### Scenario: Badge column doesn't break layout

- GIVEN PosView at 1024×768 viewport with 4 columns
- WHEN all cards render with ContribucionBadge
- THEN the grid fits without overflow and all card content remains visible

#### Scenario: Empty state preserved

- GIVEN evento "ev-1" has 0 evento_productos where `incluido = true`
- WHEN the POS view loads
- THEN the grid shows "No hay productos configurados para este evento" with link to `/eventos/ev-1/productos`
- AND no ContribucionBadge is rendered
