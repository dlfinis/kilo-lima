# Events — Specification

> **Change**: `events` | **Phase**: `sdd-spec` → feeds `sdd-design`
> **Source**: `openspec/changes/events/proposal.md` (8 locked decisions)
> **Foundation**: ARCHIVED — 54/54 REQ-IDs, `strict_tdd: ENABLED`
> **Catalog**: ARCHIVED — 46/46 REQ-IDs, 3 tables, `calcularCostoReceta` reused verbatim
> **Type**: New capabilities (additive — zero foundation or catalog requirements modified)

---

## Purpose

The events slice delivers the first multi-table, state-machine-driven domain in
kilo-lima: full CRUD over `eventos` with a 3-state machine (`planificacion` →
`en_curso` → `cerrado`), per-event `gastos_fijos` rows in 6 locked categories, a
manual `plan_produccion` grid (one row per `(receta, unidades_a_producir)`), and
an on-the-fly `calcularProyeccion` pure function that reuses catalog's
`calcularCostoReceta` to produce a `costosFijos + costosVariables = costoTotal`
breakdown. It blocks `pos`, `analytics`, and `reports`. Strict TDD applies — ~60
new tests land before implementation across 4 chained PRs.

---

## ADDED Requirements

### 1. Eventos CRUD

#### REQ-EVENTS-1: List eventos with name, date range, location, status

The system SHALL display a list of all `eventos` ordered by `fecha_inicio`
descending (newest first), with each row showing `nombre`, the date range
`fecha_inicio` – `fecha_fin` (formatted), `ubicacion`, and an `EventoStatusChip`
component.

**Rationale**: Mirrors catalog's `MateriaPrimaListItem` pattern. Users need a
quick overview of all events before drilling into detail. Events are now multi-day
so the list shows a date range instead of a single date.

**Scenario: List shows eventos ordered by fecha_inicio desc**

- GIVEN eventos exist for "Feria Abril" (2026-04-15 to 2026-04-16), "Feria Marzo" (2026-03-10 to 2026-03-12), "Feria Mayo" (2026-05-20 to 2026-05-22)
- WHEN the user navigates to `/eventos`
- THEN "Feria Mayo" appears first, "Feria Abril" second, "Feria Marzo" third
- AND each row shows `nombre`, formatted date range, `ubicacion`, and an `EventoStatusChip`

**Scenario: Empty list shows friendly message**

- GIVEN no `eventos` exist in the database
- WHEN the user navigates to `/eventos`
- THEN an empty-state message is displayed with a "Crear primer evento" CTA

---

#### REQ-EVENTS-2: Create evento with date range validation

The system SHALL allow creating a new `evento` with fields: `nombre` (non-empty,
max 200 chars), `fecha_inicio` (valid ISO date, required), `fecha_fin` (valid ISO
date, required, CHECK `fecha_fin >= fecha_inicio`), `ubicacion` (optional, max 500
chars), `notas` (optional, max 2000 chars). The system MUST validate all fields
before submission and reject invalid input with Spanish error messages.

**Rationale**: Core create flow. Events are now multi-day, so two required dates
with range validation replace the single `fecha` field.

**Scenario: Successful creation with date range**

- GIVEN the user opens the create-evento form
- WHEN the user enters nombre "Feria del Sol", fecha_inicio "2026-07-15", fecha_fin "2026-07-17", and submits
- THEN a new `evento` is saved to Supabase with `estado` defaulting to `planificacion`
- AND the evento appears in the list

**Scenario: Validation rejects fecha_fin < fecha_inicio**

- GIVEN the user opens the create-evento form
- WHEN the user enters fecha_inicio "2026-07-15" and fecha_fin "2026-07-10"
- THEN the form shows "La fecha de fin debe ser mayor o igual a la fecha de inicio"
- AND no Supabase call is made

**Scenario: Validation rejects empty name**

- GIVEN the user opens the create-evento form
- WHEN the user submits with `nombre` empty or whitespace-only
- THEN the form shows "El nombre es obligatorio"
- AND no Supabase call is made

---

#### REQ-EVENTS-3: Edit evento (allowed only if estado !== 'cerrado')

The system SHALL allow editing an `evento`'s `nombre`, `fecha_inicio`, `fecha_fin`,
`ubicacion`, and `notas` only when `estado !== 'cerrado'`. When `estado ===
'cerrado'`, the edit action MUST be disabled and the form displayed in read-only
mode.

**Rationale**: Matches the brief's "post-evento: análisis" phase — closed events
are historical records. Unified via `estadoEsEditable()` helper.

**Scenario: Edit succeeds when evento is in planificacion**

- GIVEN an evento with `estado = 'planificacion'`
- WHEN the user opens the edit form, changes `nombre` and `fecha_fin` and submits
- THEN the evento is updated in Supabase
- AND the list reflects the new name and date range reactively

**Scenario: Edit is blocked when evento is cerrado**

- GIVEN an evento with `estado = 'cerrado'`
- WHEN the user navigates to the evento detail page
- THEN the "Editar" button is disabled
- AND the form fields are read-only
- AND a `v-alert` displays "Evento cerrado — no editable"

---

#### REQ-EVENTS-4: Delete evento (CASCADE deletes gastos_fijos + plan_produccion)

The system SHALL allow deleting an `evento`. Due to the `ON DELETE CASCADE` FK
constraint on `gastos_fijos` and `plan_produccion`, deleting an evento MUST
remove all associated gastos fijos and plan rows. Before deletion, the system
MUST show a confirmation dialog listing the evento name and the count of gastos
fijos + plan rows that will be deleted.

**Rationale**: Destructive action requires user confirmation. Cascade is the
correct semantic: if an event is removed, its costs and plan are meaningless.

**Scenario: Delete succeeds with confirmation**

- GIVEN an evento "Feria Cancelada" with 3 gastos fijos and 5 plan rows
- WHEN the user clicks "Eliminar" and confirms the dialog showing "3 gastos fijos y 5 filas de plan"
- THEN the evento and all associated rows are removed
- AND the list no longer shows "Feria Cancelada"

**Scenario: Delete cancelled does nothing**

- GIVEN an evento with associated gastos and plan rows
- WHEN the user clicks "Eliminar" but cancels the confirmation dialog
- THEN the evento remains unchanged
- AND no Supabase calls are made

---

#### REQ-EVENTS-5: Estado state machine enum

The `estado` field on `eventos` SHALL accept exactly three values:
`'planificacion'`, `'en_curso'`, `'cerrado'`. The default for new eventos SHALL
be `'planificacion'`. The database MUST enforce this via a CHECK constraint.

**Rationale**: Maps 1:1 to the brief's 3-phase flow (pre-evento / durante /
post-evento). The CHECK constraint is the source of truth; the TypeScript type
mirrors it.

**Scenario: New evento defaults to planificacion**

- GIVEN the user creates an evento without specifying `estado`
- WHEN the evento is saved
- THEN `estado` is `'planificacion'`

**Scenario: Invalid estado is rejected at DB and type level**

- GIVEN code attempts to assign `estado = 'cancelado'`
- THEN TypeScript compilation fails (invalid enum member)
- AND if bypassed, the DB CHECK constraint rejects the INSERT/UPDATE

---

#### REQ-EVENTS-6: Transition rules — forward and cancel only, no backward

The system SHALL enforce valid `estado` transitions:
`planificacion → en_curso`, `en_curso → cerrado`, `planificacion → cerrado`
(cancel). All other transitions (e.g., `en_curso → planificacion`,
`cerrado → en_curso`) MUST return `ServiceError { code: 'TRANSICION_INVALIDA' }`
and MUST NOT update the database row.

**Rationale**: Matches the brief's "Post-evento: análisis" — closed events are
historical records. Backward transitions would break analytics integrity.
Enforcement lives in `transicionEstadoValida(desde, hacia): boolean`.

**Scenario: Valid transition planificacion → en_curso succeeds**

- GIVEN an evento with `estado = 'planificacion'`
- WHEN `cambiarEstado('en_curso')` is called
- THEN the evento's `estado` updates to `'en_curso'` in Supabase

**Scenario: Valid transition planificacion → cerrado (cancel) succeeds**

- GIVEN an evento with `estado = 'planificacion'`
- WHEN `cambiarEstado('cerrado')` is called
- THEN the evento's `estado` updates to `'cerrado'`

**Scenario: Invalid transition en_curso → planificacion is rejected**

- GIVEN an evento with `estado = 'en_curso'`
- WHEN `cambiarEstado('planificacion')` is called
- THEN the service returns `{ data: null, error: { code: 'TRANSICION_INVALIDA' } }`
- AND the evento's `estado` remains `'en_curso'`

**Scenario: Invalid transition cerrado → en_curso is rejected**

- GIVEN an evento with `estado = 'cerrado'`
- WHEN `cambiarEstado('en_curso')` is called
- THEN the service returns `{ data: null, error: { code: 'TRANSICION_INVALIDA' } }`
- AND the evento's `estado` remains `'cerrado'`

**Scenario: Idempotent transition to same estado is rejected**

- GIVEN an evento with `estado = 'planificacion'`
- WHEN `cambiarEstado('planificacion')` is called
- THEN the service returns `{ data: null, error: { code: 'TRANSICION_INVALIDA' } }`

---

#### REQ-EVENTS-7: Empty state, loading, and error states

The eventos list view SHALL handle four states: loading (Vuetify progress
bar/skeleton), empty (friendly message with CTA), error (retry button + Spanish
message), and populated (list rows). This follows the same pattern established in
catalog's REQ-CATALOG-6 through REQ-CATALOG-8.

**Rationale**: Reuses the established 4-state UI pattern from catalog for
consistency and reduced cognitive load.

**Scenario: Loading spinner shown during fetch**

- GIVEN the `eventos` table has data but the fetch is in flight
- WHEN the user navigates to `/eventos`
- THEN a loading indicator is displayed
- AND the list rows are not yet rendered

**Scenario: Error state with retry**

- GIVEN the Supabase fetch for eventos fails (network error)
- WHEN the user navigates to `/eventos`
- THEN a Spanish error message is shown
- AND a "Reintentar" button triggers a re-fetch

---

#### REQ-EVENTS-8: Filter by estado

The eventos list view SHALL provide a filter control (tabs or dropdown) to show
eventos filtered by `estado`: "Todos", "Planificación", "En curso", "Cerrado".
The filter MUST be client-side on the already-fetched list.

**Rationale**: Users managing many eventos need to focus on active vs. closed
events. Client-side filtering avoids extra Supabase round-trips for a single-user
app with <100 eventos.

**Scenario: Filter shows only planificacion eventos**

- GIVEN 3 eventos: "A" (planificacion), "B" (en_curso), "C" (cerrado)
- WHEN the user selects the "Planificación" tab
- THEN only evento "A" is displayed
- AND eventos "B" and "C" are hidden

**Scenario: "Todos" tab shows all eventos**

- GIVEN eventos in multiple estados
- WHEN the user selects the "Todos" tab
- THEN all eventos are displayed

---

#### REQ-EVENTS-9: Sort by fecha_inicio (default desc)

The eventos list SHALL default to ordering by `fecha_inicio` descending (newest
first). The system MAY offer ascending sort as a user-toggleable option.

**Rationale**: Users typically care about upcoming/future events more than past
ones. The DB index on `fecha_inicio desc` supports this.

**Scenario: Default sort is fecha_inicio desc**

- GIVEN eventos with fecha_inicio "2026-03-10", "2026-07-20", "2026-05-15"
- WHEN the user navigates to `/eventos`
- THEN the order is "2026-07-20", "2026-05-15", "2026-03-10"

---

### 2. Gastos Fijos

#### REQ-EVENTS-10: Add gasto fijo to evento

The system SHALL allow adding a `gasto_fijo` to an `evento` with fields:
`categoria` (one of the 6 enum values), `monto` (numeric, ≥ 0), `descripcion`
(optional, max 500 chars). The gasto is scoped to the evento via `evento_id`.

**Rationale**: Fixed costs (rent, transport, permits, etc.) are per-event by
business definition. Scoping them to `evento_id` enables clean cascade-delete.

**Scenario: Add gasto fijo with valid data**

- GIVEN the user is viewing an evento with `estado = 'planificacion'`
- WHEN the user opens the gasto form, selects categoria "renta", enters monto 500, descripcion "Alquiler del local", and submits
- THEN the gasto is saved to Supabase with `evento_id` set to the current evento
- AND the gasto appears in the gastos list reactively

**Scenario: Validation rejects negative monto**

- GIVEN the user opens the gasto form
- WHEN the user enters monto -100 and submits
- THEN the form shows "El monto debe ser mayor o igual a 0"
- AND no Supabase call is made

---

#### REQ-EVENTS-11: Edit/delete gasto fijo (gated by estado !== 'cerrado')

The system SHALL allow editing and deleting a `gasto_fijo` only when its parent
evento's `estado !== 'cerrado'`. When `estado === 'cerrado'`, edit and delete
actions MUST be disabled and return `ServiceError { code: 'EVENTO_CERRADO' }`.

**Rationale**: Frozen-on-cerrado enforcement. Same gate as evento edits.

**Scenario: Edit gasto succeeds when evento is not cerrado**

- GIVEN an evento with `estado = 'en_curso'` and a gasto of monto 200
- WHEN the user edits the gasto to monto 250 and submits
- THEN the gasto is updated in Supabase

**Scenario: Delete gasto is blocked when evento is cerrado**

- GIVEN an evento with `estado = 'cerrado'` and a gasto
- WHEN the user attempts to delete the gasto
- THEN the action returns `{ error: { code: 'EVENTO_CERRADO' } }`
- AND the gasto remains unchanged

---

#### REQ-EVENTS-12: Categorize gastos with 6 Spanish labels

The `categoria` field SHALL accept exactly six values: `'renta'`, `'transporte'`,
`'permisos'`, `'publicidad'`, `'servicios'`, `'otro'`. The UI SHALL display these
with Spanish labels: "Renta", "Transporte", "Permisos", "Publicidad",
"Servicios", "Otro". The database MUST enforce this via a CHECK constraint.

**Rationale**: Locked 6-value enum from the proposal (KISS — covers the brief's
common cost categories). The DB constraint is the source of truth.

**Scenario: Categoria select shows Spanish labels**

- GIVEN the gasto form is open
- WHEN the user opens the categoria dropdown
- THEN the options are "Renta", "Transporte", "Permisos", "Publicidad", "Servicios", "Otro"

**Scenario: Invalid categoria is rejected at DB level**

- GIVEN code attempts to insert a gasto with `categoria = 'seguros'`
- THEN the DB CHECK constraint rejects the INSERT

---

#### REQ-EVENTS-13: Validate monto > 0

The system SHALL validate that `monto` is a positive number (> 0) before
submission. Zero and negative values MUST be rejected with a Spanish error
message on the form field.

**Rationale**: A gasto of zero has no business meaning. Negative gastos would
break cost projection sums.

**Scenario: Zero monto is rejected**

- GIVEN the gasto form is open
- WHEN the user enters monto 0 and submits
- THEN the form shows "El monto debe ser mayor a 0"

**Scenario: Positive monto is accepted**

- GIVEN the gasto form is open
- WHEN the user enters monto 150.50 and submits
- THEN the gasto is saved successfully

---

#### REQ-EVENTS-14: Sum gastos fijos by evento (computed in store)

The events store SHALL expose a computed total of all `gastos_fijos` for the
current evento. The sum MUST be rounded to 2 decimal places using
`Math.round(sum * 100 + Number.EPSILON) / 100`.

**Rationale**: The projection composable needs this number.
Store-level computation avoids re-deriving in every consumer.

**Scenario: Sum reflects all gastos for the current evento**

- GIVEN the current evento has gastos: renta $500, transporte $200, servicios $50
- WHEN the store's computed sum is read
- THEN the value is 750.00

**Scenario: Sum is 0 when no gastos exist**

- GIVEN the current evento has no gastos fijos
- WHEN the store's computed sum is read
- THEN the value is 0

---

### 3. Planificación de Producción

#### REQ-EVENTS-15: Add plan row (select receta + unidades_a_producir ≥ 1)

The system SHALL allow adding a `plan_produccion` row to an evento. Each row
consists of a `receta_id` (selected via autocomplete) and `unidades_a_producir`
(number ≥ 1). The row is scoped to the evento via `evento_id`.

**Rationale**: Manual production planning v1. The user decides what recipes to
make and how many units.

**Scenario: Add plan row with valid data**

- GIVEN the user is on the planning page for an evento with `estado = 'planificacion'`
- WHEN the user selects receta "Pan de muerto" and enters unidades_a_producir 50
- THEN the row appears in the grid
- AND the live cost display shows the computed line cost

**Scenario: Validation rejects unidades_a_producir < 1**

- GIVEN the user adds a plan row
- WHEN the user enters unidades_a_producir 0
- THEN the form shows "Las unidades deben ser al menos 1"

---

#### REQ-EVENTS-16: Edit/delete plan row (gated by estado !== 'cerrado')

The system SHALL allow editing `unidades_a_producir` and deleting a plan row only
when the parent evento's `estado !== 'cerrado'`. When `estado === 'cerrado'`, the
grid MUST be read-only — no add, edit, delete, or save actions are available.

**Rationale**: Same frozen-on-cerrado enforcement applied to the plan domain.

**Scenario: Edit plan row succeeds when evento is not cerrado**

- GIVEN an evento with `estado = 'planificacion'` and a plan row with unidades 20
- WHEN the user changes unidades to 30 and saves the plan
- THEN the plan row is updated

**Scenario: Delete plan row is blocked when evento is cerrado**

- GIVEN an evento with `estado = 'cerrado'` and a plan row
- WHEN the user attempts to delete the plan row
- THEN the delete button is not rendered
- AND the grid is read-only

---

#### REQ-EVENTS-17: Prevent duplicate receta in same evento

The system SHALL prevent adding the same `receta` twice within the same evento.
The database MUST enforce this via a UNIQUE constraint on `(evento_id,
receta_id)`. The UI MUST prevent adding a duplicate row client-side and show a
validation message.

**Rationale**: A plan listing the same receta twice is a data entry error. The
UNIQUE constraint is the source of truth; the UI check is a fast-prevention layer.

**Scenario: Duplicate receta is rejected by UI**

- GIVEN the plan grid already has a row for receta "Pan de muerto"
- WHEN the user attempts to add another row with receta "Pan de muerto"
- THEN the UI prevents the addition and shows "Esta receta ya está en el plan"

**Scenario: Duplicate receta is rejected by DB if UI bypassed**

- GIVEN a plan row for receta "Pan de muerto" already exists in the DB
- WHEN a second INSERT with the same `(evento_id, receta_id)` is attempted
- THEN the DB UNIQUE constraint rejects it
- AND the service returns an appropriate error

---

#### REQ-EVENTS-18: Show live unit cost from catalog as user types unidades

Each plan row SHALL display a live-computed line cost formula: "× {unidades} = $
{costoLinea}" updated reactively as the user types `unidades_a_producir`. The
calculation uses `costoPorUnidad` from catalog's `calcularCostoReceta`.

**Rationale**: Gives the user immediate feedback on the cost impact of their
production quantity decisions before saving.

**Scenario: Live cost updates as unidades change**

- GIVEN a plan row for receta "Pan de muerto" with costoPorUnidad of $1.50
- WHEN the user types unidades_a_producir 10
- THEN the row displays "× 10 = $15.00"
- AND when the user changes to 20, the display updates to "× 20 = $30.00"

---

#### REQ-EVENTS-19: Replace-all on save (destructive — simple v1)

The system SHALL save the plan via `reemplazarTodos(eventoId, filas)`: delete all
existing plan rows for the evento, then insert the new list. This is two separate
calls (no transaction). On insert failure, the error MUST be surfaced and the
plan SHALL be shown as empty (user retries).

**Rationale**: Simplest v1 save strategy matching `recipes.service.actualizar`'s
pattern. A proper `BEGIN`/`COMMIT` block is deferred to the `pos` slice.

**Scenario: Save replaces all existing plan rows**

- GIVEN an evento has 2 plan rows
- WHEN the user modifies the grid to have 3 rows (drops 1, adds 2) and clicks "Guardar plan"
- THEN the 2 old rows are deleted
- AND 3 new rows are inserted
- AND the grid reflects exactly the 3 new rows

**Scenario: Save failure leaves plan empty with error**

- GIVEN the delete succeeds but the insert fails (Supabase error)
- WHEN the user clicks "Guardar plan"
- THEN the plan grid shows empty
- AND a Spanish error toast informs the user to retry

---

### 4. Proyección de Costos (Computed)

#### REQ-EVENTS-20: Pure function `calcularProyeccion`

The system SHALL provide a pure function `calcularProyeccion(evento, gastosFijos,
plan, recetas, materiasPrimas)` that returns `{ costosFijos, costosVariables,
costoTotal, lineas: LineaProyeccion[], desgloseFijos: DesgloseFijo[],
desgloseVariables: DesgloseVariable[] }`. It SHALL reuse catalog's
`calcularCostoReceta` verbatim for the variable-cost side.

**Rationale**: Pure function = unit-testable without Vue/Pinia/Supabase. Reusing
`calcularCostoReceta` is the single source of truth for cost math.

**Scenario: Projection computes totals correctly**

- GIVEN gastosFijos = [{monto: 500}, {monto: 300}] and a plan row with costoLinea 150
- WHEN `calcularProyeccion` is called
- THEN `costosFijos` = 800.00, `costosVariables` = 150.00, `costoTotal` = 950.00

**Scenario: Projection rounds to 2 decimals**

- GIVEN gastosFijos = [{monto: 10.555}]
- WHEN `calcularProyeccion` is called
- THEN `costosFijos` = 10.56 (rounded, not 10.555)

---

#### REQ-EVENTS-21: `useProyeccionCostos(eventoId)` reactive composable

The system SHALL provide a composable `useProyeccionCostos(eventoId)` that
returns a `ComputedRef<ProyeccionCostos | null>`. It SHALL read from 4 stores
(events, plans, recipes, ingredients) and recompute reactively when any source
changes. If `eventoId` is null, it SHALL return null.

**Rationale**: Reactive memoization via Vue's `computed`. Cross-store reads
inside the computed function are tracked by Vue's dependency system.

**Scenario: Projection recomputes when gastos change**

- GIVEN the composable is bound to an evento
- WHEN a new gasto fijo is added to the store
- THEN the projection's `costosFijos` updates reactively

**Scenario: Returns null when eventoId is null**

- GIVEN the composable is called with `eventoId = null`
- WHEN the returned value is read
- THEN it is `null`

---

#### REQ-EVENTS-22: `ProyeccionCostosCard` displays total + breakdowns

The `ProyeccionCostosCard` component SHALL render three sections: costos fijos
(sum + line breakdown per gasto), costos variables (sum + line breakdown per
receta), and costo total (bold). Each line in the variable breakdown SHALL show
the receta name, unidades, and computed line cost.

**Rationale**: Transparent cost breakdown. Users can trace the total back to
individual gastos and recetas.

**Scenario: Card renders all three sections with correct numbers**

- GIVEN a projection with costosFijos=800, costosVariables=150, costoTotal=950
- WHEN the card is rendered
- THEN it displays "Costos fijos: $800.00" with line items
- AND "Costos variables: $150.00" with line items
- AND "Total: $950.00" in bold

---

#### REQ-EVENTS-23: Edge case — empty evento (no gastos, no plan)

When an evento has zero gastos fijos and zero plan rows, the projection SHALL
return `{ costosFijos: 0, costosVariables: 0, costoTotal: 0, lineas: [] }`. The
`ProyeccionCostosCard` SHALL display a friendly empty state message.

**Rationale**: Degrade gracefully, not with errors or NaN values.

**Scenario: Empty projection shows zeros and friendly message**

- GIVEN an evento with no gastos and no plan rows
- WHEN `calcularProyeccion` is called
- THEN all three totals are 0
- AND the card shows "Sin gastos ni plan — agregá datos para ver la proyección"

---

#### REQ-EVENTS-24: Edge case — receta in plan has missing materia prima

When a plan row references a receta whose materia prima has been deleted (catalog
gap), `calcularCostoReceta` returns 0 for that line's subtotal. The projection
SHALL flag the line with `advertencia: 'MATERIA_PRIMA_FALTANTE'` and set
`costoLinea: 0`. The `ProyeccionCostosCard` SHALL display a yellow `v-alert`.

**Rationale**: Defensive handling of referential gaps. The alert prompts the user
to fix the recipe, ensuring the projection stays accurate.

**Scenario: Missing materia prima flagged in projection**

- GIVEN a plan row for receta "Galletas" whose "Harina" materia prima no longer exists
- WHEN `calcularProyeccion` is called
- THEN the line for "Galletas" has `costoLinea: 0` and `advertencia: 'MATERIA_PRIMA_FALTANTE'`
- AND the card shows a yellow alert "Hay 1 línea con problemas — revisá la receta"

---

### 5. Estado Freeze

#### REQ-EVENTS-25: `estadoEsEditable(estado): boolean` helper

The system SHALL provide a pure helper function `estadoEsEditable(estado:
EstadoEvento): boolean` that returns `true` unless `estado === 'cerrado'`. This
function SHALL be the single source of truth for the frozen-on-cerrado check.

**Rationale**: One function, tested once, consumed everywhere — eliminates
enforcement drift across the 3 enforcement points.

**Scenario: Returns true for planificacion**

- GIVEN `estado = 'planificacion'`
- WHEN `estadoEsEditable` is called
- THEN it returns `true`

**Scenario: Returns true for en_curso**

- GIVEN `estado = 'en_curso'`
- WHEN `estadoEsEditable` is called
- THEN it returns `true`

**Scenario: Returns false for cerrado**

- GIVEN `estado = 'cerrado'`
- WHEN `estadoEsEditable` is called
- THEN it returns `false`

---

#### REQ-EVENTS-26: Enforced at all edit points

The system SHALL enforce `estadoEsEditable` at every mutation point: evento form
(edit submit), gasto form (create/edit/delete), plan grid (add/edit/delete/save),
and `cambiarEstado` transitions to non-terminals. Any mutation attempt on a
cerrado evento MUST return `ServiceError { code: 'EVENTO_CERRADO' }`.

**Rationale**: The freeze is only as strong as its weakest enforcement point.
Exhaustive gating prevents data corruption.

**Scenario: Gasto creation blocked on cerrado**

- GIVEN an evento with `estado = 'cerrado'`
- WHEN the store's `crearGasto` action is called
- THEN it returns `{ data: null, error: { code: 'EVENTO_CERRADO' } }`
- AND no Supabase call is made

**Scenario: Plan save blocked on cerrado**

- GIVEN an evento with `estado = 'cerrado'`
- WHEN the store's `guardarPlan` action is called
- THEN it returns `{ data: null, error: { code: 'EVENTO_CERRADO' } }`

**Scenario: Evento edit blocked on cerrado**

- GIVEN an evento with `estado = 'cerrado'`
- WHEN the store's `actualizar` action is called
- THEN it returns `{ data: null, error: { code: 'EVENTO_CERRADO' } }`

---

#### REQ-EVENTS-27: Read-only view when estado === 'cerrado'

When viewing an evento with `estado === 'cerrado'`, the detail view SHALL render
all edit buttons as disabled/hidden and display a `v-alert` with the message
"Evento cerrado — no editable". The plan grid and gasto form sections SHALL be
read-only.

**Rationale**: The view layer is the user-facing enforcement. A frozen DB + store
is invisible without a frozen UI. The `v-alert` explains WHY editing is disabled.

**Scenario: Cerrado evento shows read-only alert**

- GIVEN the user navigates to `/eventos/:id` for a cerrado evento
- WHEN the page renders
- THEN a `v-alert` displays "Evento cerrado — no editable"
- AND the "Editar", "Agregar gasto", and "Guardar plan" buttons are not visible
- AND the plan grid shows data but no add/edit/delete controls

---

### 6. Database Schema

#### REQ-EVENTS-28: SQL migration file (idempotent, 3 tables + indexes + FKs + RLS)

The system SHALL provide a single idempotent SQL migration at
`supabase/migrations/20260618000000_events_inicial.sql` that creates:
1. `eventos` table (8 columns, 3 indexes, CHECK for estado, CHECK for
   nombre length > 0)
2. `gastos_fijos` table (6 columns, FK CASCADE to eventos, CHECK for categoria,
   CHECK for monto >= 0, 1 index)
3. `plan_produccion` table (5 columns, FK CASCADE to eventos, FK RESTRICT to
   recetas, CHECK for unidades_a_producir > 0, UNIQUE(evento_id, receta_id), 3
   indexes)
4. RLS policies (select + write for authenticated role on all 3 tables)
5. `updated_at` trigger on `eventos`
All DDL SHALL use `IF NOT EXISTS` / `DROP POLICY IF EXISTS` for idempotent
re-runs.

**Rationale**: Single migration = one logical change. Idempotent for safe
re-runs via Supabase Dashboard SQL editor.

**Scenario: Migration runs successfully on fresh Supabase project**

- GIVEN a fresh Supabase project with the catalog migration already applied
- WHEN the events migration is pasted and run in the SQL Editor
- THEN all 3 tables are created with correct columns, constraints, indexes
- AND RLS policies are active (authenticated can read/write)
- AND `SELECT * FROM eventos` returns 0 rows (empty, ready for use)

**Scenario: Migration is idempotent (safe re-run)**

- GIVEN the events migration has already been applied
- WHEN the same SQL is pasted and run again
- THEN no errors occur (all `IF NOT EXISTS` / `DROP POLICY IF EXISTS` guards work)
- AND existing data is not lost

---

#### REQ-EVENTS-29: Extends `dev_bypass_rls.sql`

The existing `supabase/dev_bypass_rls.sql` file SHALL be extended with 3 new
`GRANT SELECT, INSERT, UPDATE, DELETE` lines for the `eventos`, `gastos_fijos`,
and `plan_produccion` tables to the `anon` role. A loud header comment SHALL name
the `auth-flow` slice as the removal point.

**Rationale**: Development convenience. The bypass lets the anon-key Supabase
client work without auth in dev. The `auth-flow` slice removes it entirely.

**Scenario: Dev bypass grants anon access to events tables**

- GIVEN the extended `dev_bypass_rls.sql` has been run
- WHEN the anon-key client queries `supabase.from('eventos').select('*')`
- THEN the query succeeds (no RLS 403 error)

**Scenario: Header comment identifies removal slice**

- GIVEN the extended `dev_bypass_rls.sql` file
- WHEN a developer reads the header
- THEN it states "REMOVE IN: auth-flow slice — grants anon role full access for dev only"

---

#### REQ-EVENTS-30: `Database` interface extended with 3 new tables

The hand-rolled `src/types/database.types.ts` file SHALL be extended with 3 new
entries under `Database['public']['Tables']`: `eventos`, `gastos_fijos`,
`plan_produccion`. Each table SHALL include `Row`, `Insert`, `Update` (partial of
Insert), and `Relationships` (foreign keys). A TODO comment SHALL document the
CLI regeneration command (deferred to CI slice).

**Rationale**: Type-safe Supabase queries. Hand-rolled (not generated) to match
the catalog precedent until the CI slice adds `gen:types`.

**Scenario: TypeScript compiles with new table types**

- GIVEN the `Database` interface includes `eventos`, `gastos_fijos`, `plan_produccion`
- WHEN `pnpm typecheck` is run
- THEN it exits 0
- AND `supabase.from('eventos').select('*')` returns correctly typed results

---

### 7. Types

#### REQ-EVENTS-31: `src/types/events.types.ts` with all domain types

The system SHALL provide `src/types/events.types.ts` exporting: `Evento`,
`GastoFijo`, `PlanProduccion`, `EstadoEvento`, `CategoriaGasto`, `EventoInput`,
`GastoFijoInput`, `PlanProduccionInput`, `ProyeccionResultado`, `DesgloseFijo`,
`DesgloseVariable`, `LineaProyeccion`. `EventoInput` SHALL exclude `id`,
`created_at`, `updated_at`. `GastoFijoInput` SHALL exclude `id`, `created_at`.
`PlanProduccionInput` SHALL exclude `id`, `created_at`.

**Rationale**: Spanish domain types mirroring SQL columns 1:1, matching
`catalog.types.ts` convention. `*Input` variants are the form contract; domain
types are the full row contract.

**Scenario: All types are importable from @/types**

- GIVEN `src/types/index.ts` re-exports events types
- WHEN a component imports `import { Evento, GastoFijoInput } from '@/types'`
- THEN both types resolve correctly
- AND `pnpm typecheck` exits 0

---

#### REQ-EVENTS-32: Reuses catalog's `MateriaPrima`, `Receta` types (no duplication)

The events slice SHALL import `MateriaPrima` and `Receta` types from
`@/types/catalog.types.ts` or `@/types`. It SHALL NOT redeclare or duplicate
these types.

**Rationale**: Single source of truth. Duplication invites drift when catalog
types evolve.

**Scenario: Events types file has no duplicate MateriaPrima or Receta**

- GIVEN `src/types/events.types.ts`
- WHEN a developer searches for `interface MateriaPrima` or `interface Receta`
- THEN neither is found in the file
- AND imports reference `@/types` or `@/types/catalog.types`

---

### 8. Routing

#### REQ-EVENTS-33: `/eventos` route (lazy list)

The router SHALL define a `/eventos` route that lazy-loads `EventosView.vue`.
The route name SHALL be `'eventos'`.

**Rationale**: Matches catalog's `/materias-primas` and `/recetas` lazy route
pattern.

**Scenario: Navigating to /eventos renders the list**

- GIVEN the app is running
- WHEN the user navigates to `/eventos`
- THEN `EventosView.vue` is loaded and rendered
- AND the eventos list is fetched and displayed

---

#### REQ-EVENTS-34: `/eventos/:id` route (lazy detail)

The router SHALL define a `/eventos/:id` route that lazy-loads
`EventoDetalleView.vue`. The route name SHALL be `'evento-detalle'`. The `:id`
param SHALL be passed to the view to load the specific evento. The detail view
SHALL display `fecha_inicio` and `fecha_fin` as two date pickers, a "PRODUCTOS
DEL EVENTO" section linking to `/eventos/:id/productos` (gated by
`estadoEsEditable`), and a "REPORTE" section linking to `/eventos/:id/reporte`
(visible only when `estado === 'cerrado'`).

**Rationale**: Detail view for gastos + plan + projection per evento. The
PRODUCTOS section links to the per-evento pricing configurator. The REPORTE
section provides post-evento financial reports.

**Scenario: Navigating to /eventos/:id renders the detail page**

- GIVEN an evento with id "abc-123" exists
- WHEN the user navigates to `/eventos/abc-123`
- THEN `EventoDetalleView.vue` is loaded
- AND the evento's name, date range, status, gastos, and projection are displayed
- AND the PRODUCTOS DEL EVENTO section is visible (gated by editability)
- AND the REPORTE section is visible only when estado === 'cerrado'

---

#### REQ-EVENTS-35: `/eventos/:id/planificar` route (redirects if cerrado)

The router SHALL define a `/eventos/:id/planificar` route that lazy-loads
`PlanificarEventoView.vue`. The route name SHALL be `'planificar-evento'`. If the
evento's `estado === 'cerrado'`, the view SHALL redirect to `/eventos/:id` with a
query param `?mensaje=evento-cerrado`.

**Rationale**: Dedicated full-width planning screen for the grid experience.
Cerrado gate prevents wasted navigation.

**Scenario: Navigating to planificar for a cerrado evento redirects**

- GIVEN an evento with id "abc-123" and `estado = 'cerrado'`
- WHEN the user navigates to `/eventos/abc-123/planificar`
- THEN the app redirects to `/eventos/abc-123?mensaje=evento-cerrado`
- AND the detail view shows the "Evento cerrado — no editable" alert

**Scenario: Navigating to planificar for planificacion evento succeeds**

- GIVEN an evento with id "abc-123" and `estado = 'planificacion'`
- WHEN the user navigates to `/eventos/abc-123/planificar`
- THEN `PlanificarEventoView.vue` renders with the planning grid and projection card

---

### 9. UI/UX Conventions

#### REQ-EVENTS-36: All UI text in Spanish

Every user-visible string in events components SHALL be in Spanish: labels,
validation errors, toasts, empty states, alerts, confirmation dialogs, button
text. Code identifiers (variable names, function names, type names) SHALL follow
the established convention: Spanish for business terms (`Evento`, `GastoFijo`),
English for infrastructure (`events.service.ts`, `useEvents`).

**Rationale**: Brief requirement for Spanish UI. Consistent with catalog and
foundation conventions.

**Scenario: Create evento form labels are in Spanish**

- GIVEN the `EventoForm` dialog is open
- WHEN a developer inspects the rendered DOM
- THEN the form fields have Spanish labels: "Nombre", "Fecha", "Ubicación", "Notas"
- AND the submit button text is "Guardar" or "Crear evento"

**Scenario: Error toasts are in Spanish**

- GIVEN a Supabase error occurs during evento creation
- WHEN the error is surfaced to the user
- THEN the toast message is in Spanish (e.g., "Error al crear el evento")

---

#### REQ-EVENTS-37: Status chips with colors

The `EventoStatusChip` component SHALL render a Vuetify `v-chip` with color and
label per `estado`: `planificacion` → blue/info + "Planificación", `en_curso` →
orange/warning + "En curso", `cerrado` → grey + "Cerrado".

**Rationale**: Visual status differentiation at a glance. Vuetify chip colors are
semantic (info = active planning, warning = in-progress, grey = completed).

**Scenario: Planificacion chip is blue**

- GIVEN an evento with `estado = 'planificacion'`
- WHEN `EventoStatusChip` is rendered
- THEN the chip has color "info" (blue) and text "Planificación"

**Scenario: En_curso chip is orange**

- GIVEN an evento with `estado = 'en_curso'`
- WHEN `EventoStatusChip` is rendered
- THEN the chip has color "warning" (orange) and text "En curso"

**Scenario: Cerrado chip is grey**

- GIVEN an evento with `estado = 'cerrado'`
- WHEN `EventoStatusChip` is rendered
- THEN the chip color is muted (grey) and text "Cerrado"

---

#### REQ-EVENTS-38: Loading/error/empty states (4-state pattern)

All evento list and detail views SHALL handle four states: loading (Vuetify
progress indicator), error (Spanish message + retry button), empty (friendly
message + CTA), and populated (data rendered). This SHALL match the pattern from
catalog's REQ-CATALOG-6 through REQ-CATALOG-8.

**Rationale**: Consistent UX across slices. Users learn one pattern for all
CRUD views.

**Scenario: Loading state shown during evento detail fetch**

- GIVEN the user navigates to `/eventos/:id` and the fetch is in flight
- WHEN the page renders
- THEN a loading indicator is shown
- AND the gastos list and projection card are not yet rendered

**Scenario: Error state shown when fetch fails**

- GIVEN the Supabase fetch for an evento detail fails
- WHEN the user navigates to `/eventos/:id`
- THEN a Spanish error message is displayed
- AND a "Reintentar" button is available

---

#### REQ-EVENTS-39: Delete confirmations with evento details

Delete actions for eventos, gastos fijos, and plan rows SHALL prompt a Vuetify
confirmation dialog before execution. The evento delete dialog SHALL list the
evento name and the count of gastos fijos + plan rows that will be cascade-
deleted. Gasto and plan row delete dialogs SHALL show the item description.

**Rationale**: Destructive actions need explicit confirmation. Cascade-delete
warnings prevent accidental data loss.

**Scenario: Evento delete dialog shows cascade counts**

- GIVEN an evento "Feria del Sol" with 4 gastos and 6 plan rows
- WHEN the user clicks "Eliminar" on the evento
- THEN a dialog appears: "¿Eliminar 'Feria del Sol'? Se eliminarán 4 gastos fijos y 6 filas del plan."
- AND two buttons: "Cancelar" and "Eliminar"

**Scenario: Gasto delete dialog shows description**

- GIVEN a gasto with descripcion "Alquiler del local"
- WHEN the user clicks the delete icon on the gasto row
- THEN a dialog appears: "¿Eliminar gasto 'Alquiler del local'?"

---

### 10. SOLID + TDD

#### REQ-EVENTS-40: SRP — Three separate stores, cross-store READS only

The system SHALL provide three Pinia stores: `events.store.ts` (owns eventos +
gastosFijos), `plans.store.ts` (owns plan_produccion rows), and the existing
`recipes.store.ts` + `ingredients.store.ts` (catalog, unchanged). Cross-store
interaction SHALL be READS only — no store writes to another store's state.
The projection composable SHALL read from all four stores inside a `computed`.

**Rationale**: Single Responsibility Principle. Each store owns one domain's
mutation lifecycle. Cross-store writes create spaghetti; cross-store reads inside
computed functions are clean and reactive.

**Scenario: events.store has no plan-related state or mutations**

- GIVEN `src/stores/events.store.ts`
- WHEN a developer inspects the store's return object
- THEN it contains `eventos`, `eventoActual`, `gastosFijos` state
- AND it does NOT contain any `plan` or `planProduccion` refs or actions

**Scenario: plans.store has no evento CRUD actions**

- GIVEN `src/stores/plans.store.ts`
- WHEN a developer inspects the store
- THEN it contains `plan`, `cargando`, `error`, `cargarPara`, `guardarPlan`
- AND it does NOT contain `crearEvento`, `eliminarEvento`, or `cambiarEstado`

---

#### REQ-EVENTS-41: OCP — Service factories receive supabase param

Both `crearEventsService(supabase: SupabaseClient<Database>)` and
`crearPlansService(supabase: SupabaseClient<Database>)` SHALL receive the
Supabase client as a parameter (not import it). This SHALL match the catalog's
`crearIngredientsService` and `crearRecipesService` factory pattern.

**Rationale**: Open/Closed Principle. Services are open for extension (new
implementations with different backends) but closed for modification. The factory
pattern lets offline-sync swap implementations.

**Scenario: Service factory accepts supabase parameter**

- GIVEN a test file instantiates `crearEventsService(mockSupabaseClient)`
- WHEN the service is used
- THEN it uses the provided mock client, not the real singleton
- AND no import of `@/services/supabase.client` exists in the service file

---

#### REQ-EVENTS-42: LSP — Never-throw contract

All service methods SHALL return `{ data: T | null, error: ServiceError | null
}` and SHALL NOT throw. `ServiceError` SHALL be reused from
`catalog.types.ts` (already exported). Store actions SHALL call services and
surface errors via the store's `error` ref.

**Rationale**: Liskov Substitution Principle. Consumers can swap service
implementations if the return type contract is stable. Throwing forces try/catch;
structured errors enable declarative error handling.

**Scenario: events.service.listar returns error object on failure, never throws**

- GIVEN the Supabase query for eventos fails
- WHEN `eventsService.listar()` is called
- THEN it returns `{ data: null, error: { code: string, message: string } }`
- AND it does NOT throw

**Scenario: plans.service.reemplazarTodos returns error on insert failure**

- GIVEN Supabase insert fails after successful delete
- WHEN `plansService.reemplazarTodos(eventoId, filas)` is called
- THEN it returns `{ data: null, error: { code: string, message: string } }`
- AND it does NOT throw

---

#### REQ-EVENTS-43: ISP — Minimal typed props

All form components SHALL receive `valoresIniciales` (typed as `*Input`) rather
than raw domain models with `id`, `created_at`. Components SHALL declare only the
props they use. `SelectorReceta.vue` SHALL be a separate component from
`SelectorMateriaPrima.vue` (ISP — different domain, no shared prop coupling).

**Rationale**: Interface Segregation Principle. Components should not depend on
fields they don't use. `EventoForm` doesn't need `id` or `created_at`; it needs
the fields the user can edit.

**Scenario: EventoForm receives EventoInput, not full Evento**

- GIVEN `EventoForm.vue` is inspected
- WHEN a developer reads `defineProps`
- THEN the form receives `valoresIniciales: EventoInput` (or `Partial<EventoInput>`)
- AND does NOT receive `id`, `created_at`, `updated_at` fields

**Scenario: SelectorReceta is a separate file from SelectorMateriaPrima**

- GIVEN `src/components/business/`
- WHEN a developer lists files
- THEN `SelectorReceta.vue` and `SelectorMateriaPrima.vue` are two separate files
- AND neither imports the other

---

#### REQ-EVENTS-44: DIP — Stores use `inject('supabase')`

Pinia stores SHALL obtain the Supabase client via `inject('supabase')` (from
`src/plugins/services.ts`). They SHALL NOT import `createClient` or the singleton
supabase client directly. The DI layer is the single integration point.

**Rationale**: Dependency Inversion Principle. Stores depend on the abstraction
(the injected client), not a concrete import. This makes stores testable with
mocked clients.

**Scenario: events.store uses inject('supabase')**

- GIVEN `src/stores/events.store.ts`
- WHEN a developer inspects the store's setup function
- THEN it calls `const supabase = inject('supabase')` (or receives it via the service factory)
- AND it does NOT import from `@/services/supabase.client`

---

#### REQ-EVENTS-45: Strict TDD — spec-first, ≥60 new tests, pnpm test exits 0

Every `.ts` source file SHALL have a corresponding `.spec.ts` file written FIRST
(RED phase). The total new test count SHALL be ≥ 60. `pnpm test` SHALL exit 0
after all implementation is complete. The chainable Supabase mock from
`tests/setup.ts` SHALL be reused as-is without modifications.

**Rationale**: TDD discipline enforced by `openspec/config.yaml`'s
`strict_tdd: true`. Tests are the spec's executable verification.

**Scenario: Spec file exists before implementation file**

- GIVEN a new source file `src/services/events.service.ts` is being added in a PR
- WHEN the reviewer inspects the first commit of the PR
- THEN `src/services/events.service.spec.ts` exists with failing tests
- AND the implementation file appears in the second commit

**Scenario: pnpm test exits 0 with ≥124 total tests**

- GIVEN all events implementation is complete
- WHEN `pnpm test` is run
- THEN the exit code is 0
- AND the test count is ≥ 124 (foundation 4 + catalog 60 + events 60)

**Scenario: Supabase mock is reused without changes**

- GIVEN `tests/setup.ts` is inspected
- WHEN `git diff main -- tests/setup.ts` is run
- THEN the file has zero changes (the chainable mock is generic)

---

#### REQ-EVENTS-46: Single source of truth for `estadoEsEditable`

The `estadoEsEditable(estado): boolean` helper in `src/utils/estado.ts` SHALL be
the ONLY function in the codebase that determines editability. Every store guard,
UI button disable, and form lock SHALL call it directly or via a composable that
calls it. It SHALL be unit-tested with all 3 `EstadoEvento` values.

**Rationale**: Eliminates enforcement drift. If the freeze rule ever changes
(e.g., `en_curso` also gets frozen for certain fields in a future slice), only
one function changes.

**Scenario: Every guard imports from src/utils/estado.ts**

- GIVEN all events source files
- WHEN a developer searches for `estado === 'cerrado'` in store or composable files
- THEN the only hardcoded check is inside `estadoEsEditable` itself
- AND all other files call `estadoEsEditable(estado)` or access it via the store

**Scenario: estadoEsEditable is unit-tested for all 3 estados**

- GIVEN `src/utils/estado.spec.ts`
- WHEN tests are run
- THEN 3 assertions verify: `planificacion → true`, `en_curso → true`, `cerrado → false`

---

### 11. EventoDetalleView Sections (finanzas-evento)

#### REQ-EVENTS-47: "PRODUCTOS DEL EVENTO" Section on EventoDetalleView

The system SHALL render a "PRODUCTOS DEL EVENTO" section within `EventoDetalleView`.
When `estadoEsEditable(evento.estado)` is true, the section SHALL show the count
of `evento_productos` and a link to `/eventos/:id/productos`. When `estado ===
'cerrado'`, the section SHALL be read-only (count only, no link).

**Rationale**: Links EventoDetalleView to the per-evento pricing configurator
(EventoProductosView). Gated by editability to prevent navigation to a config
that cannot be changed.

**Scenario: Active evento shows product link**

- GIVEN evento "ev-1" with estado = 'planificacion' and 5 evento_productos
- WHEN EventoDetalleView renders
- THEN "PRODUCTOS DEL EVENTO (5)" is displayed with link to `/eventos/ev-1/productos`

**Scenario: Cerrado evento shows count only**

- GIVEN evento "ev-1" with estado = 'cerrado' and 8 evento_productos
- WHEN EventoDetalleView renders
- THEN "PRODUCTOS DEL EVENTO (8)" is displayed without a navigation link

---

#### REQ-EVENTS-48: "REPORTE" Section on EventoDetalleView (cerrado only)

The system SHALL render a "REPORTE" section within `EventoDetalleView` ONLY when
`evento.estado === 'cerrado'`. The section SHALL display a "Ver reporte financiero"
button linking to `/eventos/:id/reporte`. When `estado !== 'cerrado'`, the section
SHALL NOT be rendered.

**Rationale**: The post-evento financial report is only meaningful after closure.
Showing the section only when cerrado prevents navigation to an empty report.

**Scenario: Cerrado evento shows report link**

- GIVEN evento "ev-1" with estado = 'cerrado'
- WHEN EventoDetalleView renders
- THEN a "Ver reporte financiero" button is displayed linking to `/eventos/ev-1/reporte`

**Scenario: Non-cerrado evento hides report section**

- GIVEN evento "ev-1" with estado = 'en_curso'
- WHEN EventoDetalleView renders
- THEN no "REPORTE" section or "Ver reporte financiero" button is rendered

---

## Key Learnings

- The 46 requirements span 10 capability sections, all additive — zero foundation
  or catalog requirements are modified. `calcularCostoReceta` is reused verbatim
  as a black box.
- The estado state machine (`planificacion → en_curso → cerrado`) is the first
  domain state machine in the codebase. `transicionEstadoValida` and
  `estadoEsEditable` are the two pure helpers that form the single source of truth
  for all transition and freeze logic.
- Frozen-on-cerrado enforcement spans 3 layers (DB CHECK constraint, store guards,
  UI disable) but all read from one function — `estadoEsEditable`. This prevents
  enforcement drift.
- The projection is computed, never stored. `calcularProyeccion` is a pure
  function that reads from 4 stores in a `computed`. This matches the catalog's
  "no denormalized `costo_total` column" precedent.
- Production planning is manual v1 — the user enters `unidades_a_producir` per
  receta. Stock-aware and demand-aware suggestions are deferred to future slices.
- `reemplazarTodos` is destructive by design (delete-then-insert, two separate
  calls). A proper transaction is a `pos` slice concern.
- Strict TDD: ~60 new tests, spec-first, chainable Supabase mock reused as-is.
- The `SelectorReceta` component is separate from `SelectorMateriaPrima` (ISP) —
  same prop/emit shape, separate file.
- All 46 REQ-EVENTS requirements are verified by the proposal's 22 acceptance
  criteria. Every scenario maps to at least one test assertion.
