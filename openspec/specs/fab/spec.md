# FAB (Floating Action Button) — Specification

> **Source**: `ux-improvements` delta (REQ-UX-20 through REQ-UX-24)
> **Type**: Additive — zero foundation/catalog/events/POS requirements modified

---

## Purpose

The FAB component provides a reusable `<FabNuevo>` floating action button that replaces inline "+ Nuevo" create buttons on list views. It renders as a Vuetify `<v-fab>` with configurable `to`, `color`, `ariaLabel`, and `testid` props. Three list views (`MateriasPrimasView`, `RecetasView`, `EventosView`) use it with a visibility rule on EventosView to prevent clutter when the list is long.

---

## ADDED Requirements

### 1. FAB (Floating Action Button)

| ID | Requirement (SHALL) | Rationale |
|----|--------------------|-----------|
| REQ-UX-20 | `<FabNuevo>` component with `to`, `color`, `ariaLabel`, `testid` props and `@click` emit. | Per-view FAB; matches existing dialog-owner pattern. |
| REQ-UX-21 | `MateriasPrimasView` FAB: `testid="materia-prima-fab-nuevo"`, opens create dialog. | Replaces inline `+ Nueva materia prima` button. |
| REQ-UX-22 | `RecetasView` FAB: `testid="receta-fab-nuevo"`, opens create dialog. | Same pattern. |
| REQ-UX-23 | `EventosView` FAB: `testid="evento-fab-nuevo"`, opens create dialog. | Same pattern. |
| REQ-UX-24 | EventosView FAB only visible when `eventos.length < 5` OR `!cargando`; otherwise use inline button. | Avoids clutter on busy screens. |

#### Scenario: FAB opens creation dialog (REQ-UX-20, REQ-UX-21)
- GIVEN `MateriasPrimasView` renders with `<FabNuevo testid="materia-prima-fab-nuevo">`
- WHEN the user clicks the FAB
- THEN the `@click` handler opens the create-ingredient dialog
- AND the dialog state (`dialogo`) remains owned by the view

#### Scenario: FAB visibility rule (REQ-UX-24)
- GIVEN `eventos.length >= 5` AND `cargando` is false
- WHEN `EventosView` renders
- THEN `<FabNuevo>` is NOT rendered
- AND the inline `+ Nuevo evento` button is used instead
- GIVEN `eventos.length < 5`
- THEN `<FabNuevo>` IS rendered

---

## Key Learnings

- `<FabNuevo>` is a thin wrapper around `<v-fab>` — the dialog state remains owned by the view, keeping SRP clean.
- The visibility rule on EventosView prevents FAB clutter when the list is busy; below 5 events the FAB is the primary action.
