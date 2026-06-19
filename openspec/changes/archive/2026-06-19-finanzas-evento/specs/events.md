# Delta for Events

> **Change**: `finanzas-evento` | **Target**: `openspec/specs/events/spec.md`

## MODIFIED Requirements

### Requirement: List eventos with name, date range, location, status

The system SHALL display a list of all `eventos` ordered by `fecha_inicio` descending (newest first), with each row showing `nombre`, the date range `fecha_inicio` – `fecha_fin` (formatted), `ubicacion`, and an `EventoStatusChip` component.

(Previously: displayed a single `fecha` field, not a date range.)

#### Scenario: List shows eventos ordered by fecha_inicio desc

- GIVEN eventos exist for "Feria Abril" (2026-04-15 to 2026-04-16), "Feria Marzo" (2026-03-10 to 2026-03-12), "Feria Mayo" (2026-05-20 to 2026-05-22)
- WHEN the user navigates to `/eventos`
- THEN "Feria Mayo" appears first, "Feria Abril" second, "Feria Marzo" third
- AND each row shows `nombre`, formatted date range, `ubicacion`, and `EventoStatusChip`

#### Scenario: Empty list shows friendly message

- GIVEN no `eventos` exist in the database
- WHEN the user navigates to `/eventos`
- THEN an empty-state message is displayed with a "Crear primer evento" CTA

---

### Requirement: Create evento with date range validation

The system SHALL allow creating a new `evento` with fields: `nombre` (non-empty, max 200 chars), `fecha_inicio` (valid ISO date, required), `fecha_fin` (valid ISO date, required, CHECK `fecha_fin >= fecha_inicio`), `ubicacion` (optional), `notas` (optional). The system MUST validate all fields and reject invalid input with Spanish error messages.

(Previously: single `fecha` field — no date range.)

#### Scenario: Successful creation with date range

- GIVEN the user opens the create-evento form
- WHEN the user enters nombre "Feria del Sol", fecha_inicio "2026-07-15", fecha_fin "2026-07-17", and submits
- THEN a new `evento` is saved with `estado = 'planificacion'`
- AND the evento appears in the list

#### Scenario: Validation rejects fecha_fin < fecha_inicio

- GIVEN the user opens the create-evento form
- WHEN the user enters fecha_inicio "2026-07-15" and fecha_fin "2026-07-10"
- THEN the form shows "La fecha de fin debe ser mayor o igual a la fecha de inicio"
- AND no Supabase call is made

#### Scenario: Validation rejects empty name

- GIVEN the user opens the create-evento form
- WHEN the user submits with `nombre` empty
- THEN the form shows "El nombre es obligatorio" and no Supabase call is made

---

### Requirement: Sort by fecha_inicio (default desc)

The eventos list SHALL default to ordering by `fecha_inicio` descending (newest first).

(Previously: sorted by single `fecha` field descending.)

#### Scenario: Default sort is fecha_inicio desc

- GIVEN eventos with fecha_inicio "2026-03-10", "2026-07-20", "2026-05-15"
- WHEN the user navigates to `/eventos`
- THEN the order is "2026-07-20", "2026-05-15", "2026-03-10"

---

### Requirement: `/eventos/:id` route with product and report links

The router SHALL define a `/eventos/:id` route that lazy-loads `EventoDetalleView.vue`. The detail view SHALL display `fecha_inicio` and `fecha_fin` as two date pickers, a "PRODUCTOS DEL EVENTO" section linking to `/eventos/:id/productos` (gated by `estadoEsEditable`), and a "REPORTE" section linking to `/eventos/:id/reporte` (visible only when `estado === 'cerrado'`).

(Previously: `EventoDetalleView` showed a single `fecha` picker with no product-pricing or report sections.)

#### Scenario: EventoDetalleView shows date range and product section

- GIVEN an evento "abc-123" with estado = 'planificacion'
- WHEN the user navigates to `/eventos/abc-123`
- THEN the view shows `fecha_inicio` and `fecha_fin` date pickers
- AND a "PRODUCTOS DEL EVENTO" section is visible with link

#### Scenario: Report section visible only when cerrado

- GIVEN evento "abc-123" has estado = 'cerrado'
- WHEN navigating to `/eventos/abc-123`
- THEN the "REPORTE" section is visible with link to `/eventos/abc-123/reporte`
- AND the "PRODUCTOS DEL EVENTO" section is read-only

#### Scenario: Report section hidden when not cerrado

- GIVEN evento "abc-123" has estado = 'planificacion'
- WHEN navigating to `/eventos/abc-123`
- THEN the "REPORTE" section is NOT rendered

---

## ADDED Requirements

### Requirement: "PRODUCTOS DEL EVENTO" Section on EventoDetalleView

The system SHALL render a "PRODUCTOS DEL EVENTO" section within `EventoDetalleView`. When `estadoEsEditable(evento.estado)` is true, the section SHALL show the count of `evento_productos` and a link to `/eventos/:id/productos`. When `estado === 'cerrado'`, the section SHALL be read-only (count only, no link).

#### Scenario: Active evento shows product link

- GIVEN evento "ev-1" with estado = 'planificacion' and 5 evento_productos
- WHEN EventoDetalleView renders
- THEN "PRODUCTOS DEL EVENTO (5)" is displayed with link to `/eventos/ev-1/productos`

#### Scenario: Cerrado evento shows count only

- GIVEN evento "ev-1" with estado = 'cerrado' and 8 evento_productos
- WHEN EventoDetalleView renders
- THEN "PRODUCTOS DEL EVENTO (8)" is displayed without a navigation link

---

### Requirement: "REPORTE" Section on EventoDetalleView (cerrado only)

The system SHALL render a "REPORTE" section within `EventoDetalleView` ONLY when `evento.estado === 'cerrado'`. The section SHALL display a "Ver reporte financiero" button linking to `/eventos/:id/reporte`. When `estado !== 'cerrado'`, the section SHALL NOT be rendered.

#### Scenario: Cerrado evento shows report link

- GIVEN evento "ev-1" with estado = 'cerrado'
- WHEN EventoDetalleView renders
- THEN a "Ver reporte financiero" button is displayed linking to `/eventos/ev-1/reporte`

#### Scenario: Non-cerrado evento hides report section

- GIVEN evento "ev-1" with estado = 'en_curso'
- WHEN EventoDetalleView renders
- THEN no "REPORTE" section or "Ver reporte financiero" button is rendered
