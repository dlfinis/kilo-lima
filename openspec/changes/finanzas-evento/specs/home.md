# Delta for Home

> **Change**: `finanzas-evento` | **Target**: `openspec/specs/home/spec.md`

## ADDED Requirements

### Requirement: Post-evento card enabled when cerrado eventos exist

The system SHALL enable the post-evento card in `HomeView` when at least one evento has `estado = 'cerrado'`. The enabled card SHALL display the latest cerrado evento's `nombre` (ordered by `fecha_fin DESC`), a summary indicator, and a clickable CTA linking to `/eventos/:id/reporte`.

#### Scenario: Card enabled with latest cerrado evento

- GIVEN 2 eventos are cerrado: "Feria Mayo" (fecha_fin 2026-05-22) and "Feria Abril" (fecha_fin 2026-04-15)
- WHEN `HomeView` renders
- THEN the post-evento card is enabled (NOT `disabled`)
- AND it shows "Feria Mayo" with a link to `/eventos/f-mayo/reporte`

#### Scenario: Card navigates to report on click

- GIVEN evento "Feria Mayo" (ev-1) is the latest cerrado
- WHEN the user clicks the enabled post-evento card
- THEN navigation goes to `/eventos/ev-1/reporte`

---

### Requirement: Post-evento card disabled when zero cerrado eventos

The system SHALL keep the post-evento card in its existing `disabled` state when zero eventos have `estado = 'cerrado'`. This preserves the current behavior for first-run and active-only scenarios.

#### Scenario: Card disabled with zero cerrado eventos

- GIVEN 0 eventos have estado = 'cerrado' (all are planificacion or en_curso)
- WHEN `HomeView` renders
- THEN the post-evento card is `disabled` with its current disabled-text
- AND clicking it has no effect

#### Scenario: Card disabled on fresh install

- GIVEN a fresh install with zero eventos in the database
- WHEN `HomeView` renders
- THEN the post-evento card is `disabled`
