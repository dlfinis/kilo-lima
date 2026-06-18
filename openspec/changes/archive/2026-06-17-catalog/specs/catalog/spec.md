# Catalog — Delta Specification

> **Change**: `catalog` | **Phase**: `sdd-spec` → feeds `sdd-design`
> **Source**: `openspec/changes/catalog/proposal.md` (8 locked decisions)
> **Foundation**: ARCHIVED — 54/54 REQ-IDs, `strict_tdd: ENABLED`
> **Type**: New capabilities (additive — zero foundation requirements modified)

---

## Purpose

The catalog slice delivers the first domain-specific features of kilo-lima: full
CRUD over `materias_primas` (ingredients), full CRUD over `recetas` (recipes)
with N-to-N ingredient lines, a deterministic on-the-fly cost calculator, and a
recipe-detail view that renders the cost breakdown. It is the first slice to use
the persisted Supabase backend and blocks every downstream slice (`events`,
`planning`, `pos`, `analytics`, `reports`, `auth-flow`). Strict TDD is enforced —
all ~60 tests must be written BEFORE implementation, one spec per source file.

---

## ADDED Requirements

### 1. Materias Primas CRUD

#### REQ-CATALOG-1: View list of ingredients

The system SHALL display a list of all `materias_primas` with the fields: name
(`nombre`), unit (`unidad`), and cost per unit (`costo_por_unidad`).

**Rationale**: The ingredient catalog is the foundational domain entity. Users
must see what ingredients exist before they can create recipes or calculate
costs.

##### Scenario: List shows all ingredients with correct fields

- GIVEN 3 ingredients exist in the database: "Azúcar" (g, $0.05), "Harina" (kg, $2.50), "Huevo" (unidad, $0.30)
- WHEN the user navigates to `/materias-primas`
- THEN the list displays 3 rows
- AND each row shows the ingredient's `nombre`, `unidad`, and `costo_por_unidad`

##### Scenario: List is empty when no ingredients exist

- GIVEN the `materias_primas` table is empty
- WHEN the user navigates to `/materias-primas`
- THEN the list shows zero rows (see REQ-CATALOG-6 for empty state)

---

#### REQ-CATALOG-2: Create new ingredient

The system SHALL allow creating a new `materia_prima` with fields: `nombre`
(non-empty string), `unidad` (one of `kg`, `g`, `l`, `ml`, `unidad`), and
`costo_por_unidad` (numeric, ≥ 0). The system MUST validate all fields before
submission and reject invalid input with a Spanish error message.

**Rationale**: Users must be able to add new ingredients to the catalog. The
5-unit enum matches the brief's locked scope; the `≥ 0` constraint prevents
negative costs.

##### Scenario: Successful creation with valid data

- GIVEN the user opens the create-ingredient form
- WHEN the user enters nombre "Mantequilla", selects unidad "g", enters costo_por_unidad "0.12", and submits
- THEN a new `materia_prima` is saved to Supabase
- AND the ingredient appears in the list with the submitted values
- AND a success toast is displayed

##### Scenario: Validation rejects empty name

- GIVEN the user opens the create-ingredient form
- WHEN the user submits with `nombre` empty or whitespace-only
- THEN the form shows a validation error in Spanish (e.g., "El nombre es obligatorio")
- AND no Supabase call is made

##### Scenario: Validation rejects invalid unit

- GIVEN the user opens the create-ingredient form
- WHEN the user submits with `unidad` not in the allowed list (e.g., "tonelada")
- THEN the form shows a validation error (e.g., "Unidad no válida")
- AND no Supabase call is made

##### Scenario: Validation rejects negative cost

- GIVEN the user opens the create-ingredient form
- WHEN the user submits with `costo_por_unidad` = -1
- THEN the form shows a validation error (e.g., "El costo por unidad debe ser mayor o igual a 0")
- AND no Supabase call is made

---

#### REQ-CATALOG-3: Edit existing ingredient

The system SHALL allow editing an existing `materia_prima`'s `nombre`, `unidad`,
and `costo_por_unidad`. The same validation rules from REQ-CATALOG-2 apply.
After a successful edit, the list MUST reflect the updated values reactively.

**Rationale**: Ingredient names and costs change over time (e.g., supplier price
updates). Editing is essential for a living catalog.

##### Scenario: Successful edit updates the list

- GIVEN "Azúcar" exists with unidad "g" and costo_por_unidad 0.05
- WHEN the user opens the edit form, changes costo_por_unidad to 0.06, and submits
- THEN the list row for "Azúcar" shows costo_por_unidad 0.06
- AND a success toast is displayed

##### Scenario: Edit validation fails on invalid data

- GIVEN "Azúcar" exists in the list
- WHEN the user opens the edit form, clears the name to empty, and submits
- THEN the form shows "El nombre es obligatorio"
- AND the original ingredient is unchanged in the list

---

#### REQ-CATALOG-4: Delete ingredient with referential protection

The system SHALL allow deleting a `materia_prima` only if it is NOT referenced
by any `receta_ingredientes` row. If it IS referenced, the system MUST reject the
deletion and display an error message listing the recipe names that use it.

**Rationale**: The `ON DELETE RESTRICT` FK constraint from `receta_ingredientes`
to `materias_primas` enforces business integrity at the database level. The UI
must surface this constraint with a user-friendly message.

##### Scenario: Delete succeeds when ingredient is unused

- GIVEN "Sal" exists and is NOT used in any recipe
- WHEN the user confirms deletion of "Sal"
- THEN "Sal" is removed from the list
- AND a success toast is displayed

##### Scenario: Delete is rejected when ingredient is in use

- GIVEN "Harina" is used in the recipe "Pan básico"
- WHEN the user attempts to delete "Harina"
- THEN the deletion is rejected
- AND an error message is displayed containing "Pan básico" (the recipe name)
- AND "Harina" remains in the list

---

#### REQ-CATALOG-5: Duplicate ingredient prevention

The system SHALL prevent creating an ingredient whose `nombre` matches an
existing ingredient case-insensitively. If a duplicate is detected, the system
MUST show a Spanish error message identifying the existing ingredient.

**Rationale**: Duplicate ingredients cause confusion in the recipe picker and
fragment cost data. Case-insensitive matching prevents "azúcar" and "Azúcar"
from coexisting.

##### Scenario: Duplicate detection rejects case-insensitive match

- GIVEN "Azúcar" already exists
- WHEN the user attempts to create "azúcar" (lowercase)
- THEN the creation is rejected
- AND an error message states "Ya existe una materia prima con el nombre 'Azúcar'"

##### Scenario: Non-duplicate name is accepted

- GIVEN "Azúcar" already exists
- WHEN the user creates "Azúcar glass" (different name)
- THEN the creation succeeds

---

#### REQ-CATALOG-6: Empty state when no ingredients exist

When the `materias_primas` table is empty, the system SHALL display a friendly
empty-state message in Spanish and a call-to-action button to create the first
ingredient.

**Rationale**: A blank list without guidance is a confusing first-run experience.
The empty state explains what the user should do next.

##### Scenario: Empty state is shown with CTA

- GIVEN no ingredients exist in the database
- WHEN the user navigates to `/materias-primas`
- THEN a message like "No hay materias primas todavía" is displayed
- AND a button labeled "Agregar primera materia prima" is visible
- AND clicking the button opens the create-ingredient form

---

#### REQ-CATALOG-7: Loading state during fetch

While fetching ingredients from Supabase, the system SHALL display a loading
indicator (skeleton or `v-progress-linear`) instead of the empty state or error
state.

**Rationale**: Prevent "flash of empty" — the list should not briefly show "no
ingredients" before the fetch completes. A loading indicator provides immediate
feedback that data is being loaded.

##### Scenario: Loading indicator is shown during fetch

- GIVEN the Supabase response is pending (not yet resolved/rejected)
- WHEN the user navigates to `/materias-primas`
- THEN a loading indicator (spinner, skeleton, or progress bar) is visible
- AND the empty-state message is NOT visible
- AND the list is NOT visible

##### Scenario: Loading indicator disappears after fetch completes

- GIVEN the Supabase fetch resolves with data
- WHEN the response arrives
- THEN the loading indicator disappears
- AND the ingredient list is rendered

---

#### REQ-CATALOG-8: Error state with retry

When fetching or mutating ingredients fails (network error, Supabase error), the
system SHALL display a friendly Spanish error message and a retry button.

**Rationale**: Network failures are expected in a fair environment. The user
should not see a raw 500 error or a blank screen. A clear message + retry button
keeps the user in control.

##### Scenario: Error message and retry on fetch failure

- GIVEN the Supabase fetch rejects with a network error
- WHEN the user navigates to `/materias-primas`
- THEN an error message like "Error al cargar las materias primas" is displayed
- AND a "Reintentar" button is visible
- AND clicking "Reintentar" triggers a new fetch

##### Scenario: Error message and retry on create failure

- GIVEN the Supabase insert rejects
- WHEN the user submits a valid create-ingredient form
- THEN an error toast like "No se pudo guardar la materia prima" is displayed
- AND the form remains open so the user can retry

---

### 2. Recetas CRUD

#### REQ-CATALOG-9: View list of recipes

The system SHALL display a list of all `recetas` with their `nombre` and
`descripcion`.

**Rationale**: Recipes are the second core domain entity. Users need to browse
their recipe catalog before viewing detail or calculating costs.

##### Scenario: List shows all recipes with name and description

- GIVEN 2 recipes exist: "Pan básico" (desc: "Pan de harina integral") and "Galleta de chocolate" (desc: null)
- WHEN the user navigates to `/recetas`
- THEN the list displays 2 rows
- AND "Pan básico" shows its description
- AND "Galleta de chocolate" shows no description (or "Sin descripción")

---

#### REQ-CATALOG-10: Create new recipe with ingredients

The system SHALL allow creating a new `receta` with: `nombre` (non-empty),
`descripcion` (optional), `rendimiento_unidades` (numeric, > 0), and N
`ingredientes` (each with a `materia_prima_id` selected from the existing
ingredients list and a `cantidad` > 0). The system MUST validate: (a) `nombre`
is non-empty, (b) at least 1 ingredient is provided, (c) all `cantidad` values
are > 0.

**Rationale**: A recipe without ingredients is meaningless. The minimum-one-
ingredient rule prevents accidental empty recipes. Quantity > 0 prevents
zero-cost recipes (which would distort the cost calculator).

##### Scenario: Successful recipe creation with 3 ingredients

- GIVEN "Harina" (kg), "Azúcar" (g), and "Huevo" (unidad) exist
- WHEN the user creates "Galleta" with descripción "Dulce", rendimiento_unidades 24, and ingredients: Harina 0.5 kg + Azúcar 200 g + Huevo 2 unidad
- THEN the recipe is saved to Supabase
- AND 3 `receta_ingredientes` rows are created
- AND the recipe appears in the list

##### Scenario: Validation rejects empty recipe name

- GIVEN the user opens the create-recipe form
- WHEN the user submits with `nombre` empty
- THEN the form shows "El nombre de la receta es obligatorio"
- AND no Supabase call is made

##### Scenario: Validation rejects zero ingredients

- GIVEN the user opens the create-recipe form
- WHEN the user submits a recipe with 0 ingredients
- THEN the form shows "Agregá al menos un ingrediente"
- AND no Supabase call is made

##### Scenario: Validation rejects zero or negative ingredient quantity

- GIVEN the user adds "Harina" to the recipe
- WHEN the user sets cantidad to 0 (or -1) and submits
- THEN the form shows "La cantidad debe ser mayor a 0"
- AND no Supabase call is made

---

#### REQ-CATALOG-11: Edit existing recipe

The system SHALL allow editing an existing `receta`: changing its `nombre`,
`descripcion`, `rendimiento_unidades`, and ingredient lines (add, remove, or
modify quantities). The same validation rules from REQ-CATALOG-10 apply.

**Rationale**: Recipes evolve — ingredient quantities change, ingredients are
substituted. Full edit capability keeps the catalog accurate.

##### Scenario: Edit modifies recipe fields and ingredient list

- GIVEN "Pan básico" exists with ingredients: Harina 1 kg, Agua 0.6 l
- WHEN the user edits the recipe: changes rendimiento_unidades from 2 to 3, removes "Agua", adds "Sal" 0.01 kg, and submits
- THEN the recipe's rendimiento_unidades is updated to 3
- AND the `receta_ingredientes` rows are updated: "Agua" removed, "Sal" added, "Harina" unchanged
- AND the recipe list reflects the changes

##### Scenario: Edit preserves minimum-1-ingredient validation

- GIVEN "Pan básico" exists with 2 ingredients
- WHEN the user removes all ingredients and submits
- THEN the form shows "Agregá al menos un ingrediente"
- AND the recipe is unchanged in the database

---

#### REQ-CATALOG-12: Delete recipe with cascading cleanup

The system SHALL allow deleting a `receta`. Deleting a recipe MUST cascade-delete
all its associated `receta_ingredientes` rows. The system SHALL show a
confirmation dialog before deletion.

**Rationale**: The FK constraint uses `ON DELETE CASCADE` for `receta_id` — the
database cleans up ingredient lines automatically. The confirmation dialog
prevents accidental deletions.

##### Scenario: Delete succeeds after user confirmation

- GIVEN "Galleta de chocolate" exists with 3 ingredient lines
- WHEN the user clicks delete and confirms in the dialog ("Eliminar")
- THEN the recipe is removed from the list
- AND all 3 `receta_ingredientes` rows are deleted (cascaded)
- AND a success toast is displayed

##### Scenario: Delete is cancelled on dialog dismissal

- GIVEN "Galleta de chocolate" exists in the list
- WHEN the user clicks delete but then clicks "Cancelar" in the dialog
- THEN the recipe remains in the list
- AND no changes are made to the database

---

#### REQ-CATALOG-13: Empty, loading, and error states for recipes

The recipe list view SHALL follow the same state pattern as ingredients
(REQ-CATALOG-6, REQ-CATALOG-7, REQ-CATALOG-8): empty state with CTA when no
recipes exist, loading indicator during fetch, error message with retry on
failure.

**Rationale**: Consistent UX across domain views reduces cognitive load.

##### Scenario: Empty state for recipes

- GIVEN no recipes exist in the database
- WHEN the user navigates to `/recetas`
- THEN "No hay recetas todavía" is displayed
- AND a "Crear primera receta" button is visible

##### Scenario: Error state for recipe fetch

- GIVEN the Supabase fetch for recipes fails
- WHEN the user navigates to `/recetas`
- THEN "Error al cargar las recetas" is displayed with a "Reintentar" button

---

### 3. Recipe Detail & Cost Breakdown

#### REQ-CATALOG-14: View single recipe detail with cost breakdown

The system SHALL display a single recipe's full detail at `/recetas/:id`:
`nombre`, `descripcion`, ingredient list (each showing `materia_prima.nombre`,
`cantidad`, `unidad`, `costo_por_unidad`, and computed `subtotal`), total cost
(`costo_total`), and cost per yield unit (`costo_por_unidad = costo_total /
rendimiento_unidades`).

**Rationale**: The recipe detail view is brief item 9's centerpiece — it ties
the catalog and cost calculator together in one screen.

##### Scenario: Full detail renders correctly with cost breakdown

- GIVEN recipe "Pan básico" (rendimiento_unidades: 2) has ingredients: Harina 1 kg ($2.50/kg → subtotal $2.50) + Agua 0.6 l ($0.00/l → subtotal $0.00)
- WHEN the user navigates to `/recetas/{pan-basico-id}`
- THEN the page shows "Pan básico" as the title
- THEN the ingredient list shows 2 rows: "Harina · 1 kg · $2.50 · $2.50" and "Agua · 0.6 l · $0.00 · $0.00"
- THEN total cost displays "$2.50"
- THEN cost per unit displays "$1.25" (2.50 / 2)

##### Scenario: Recipe with no description shows gracefully

- GIVEN a recipe has `descripcion` = null
- WHEN the user views the recipe detail
- THEN the description area is empty or hidden (no "null" text)

---

#### REQ-CATALOG-15: Reactive cost recalculation

When a `materia_prima`'s `costo_por_unidad` changes, the cost breakdown for any
recipe using that ingredient SHALL update reactively when the recipe detail view
is re-rendered. The calculator SHALL NOT cache stale values.

**Rationale**: Costs change. The user must see the most current price without
manually refreshing or recalculating.

##### Scenario: Updated ingredient cost reflects in recipe detail

- GIVEN "Pan básico" uses "Harina" at costo_por_unidad $2.50
- AND the user navigates to `/recetas/{pan-basico-id}` and sees total $2.50
- WHEN the user navigates back to `/materias-primas`, edits "Harina" to $3.00, then navigates to `/recetas/{pan-basico-id}`
- THEN the ingredient row shows $3.00 and subtotal $3.00
- THEN total cost displays $3.00
- THEN cost per unit displays $1.50 (3.00 / 2)

---

#### REQ-CATALOG-16: Missing materia prima edge case (defensive)

If a `receta_ingredientes` row references a `materia_prima_id` that no longer
exists (defensive coding; FK should prevent this), the system SHALL display that
line with a warning badge "Materia prima no disponible" and a subtotal of 0.

**Rationale**: FK `ON DELETE RESTRICT` should prevent this, but the calculator is
a pure function and must handle malformed data defensively (e.g., if a database
bug or direct SQL manipulation creates an orphan reference).

##### Scenario: Broken FK reference shows warning

- GIVEN a recipe has an ingredient line referencing `materia_prima_id` that does not exist in the loaded materias_primas list
- WHEN the cost calculator processes this recipe
- THEN the line shows a yellow warning badge "Materia prima no disponible"
- THEN the subtotal for that line is 0
- THEN the total cost excludes that line

---

### 4. Cost Calculator Pure Logic

#### REQ-CATALOG-17: Core calculation function

The system SHALL provide a pure function `calcularCostoReceta(ingredientes,
rendimiento)` that returns `{ costoTotal, costoPorUnidad, lineas }` where each
`linea` contains `{ materiaPrimaId, cantidad, unidad, costoUnitario, subtotal }`.

**Rationale**: Extracting the calculation into a pure function makes it
unit-testable without Vue/Pinia setup and reusable across composables, stores,
and future slices.

##### Scenario: Calculator returns correct cost breakdown

- GIVEN ingredients: [{ materia_prima_id: "1", nombre: "Harina", cantidad: 2, unidad: "kg", costo_por_unidad: 2.50 }, { materia_prima_id: "2", nombre: "Huevo", cantidad: 3, unidad: "unidad", costo_por_unidad: 0.30 }]
- AND rendimiento = 4
- WHEN `calcularCostoReceta(ingredientes, rendimiento)` is called
- THEN `costoTotal` = 5.90 (2 * 2.50 + 3 * 0.30)
- THEN `costoPorUnidad` = 1.48 (5.90 / 4, rounded to 2 decimals)
- THEN `lineas` has 2 entries: Harina subtotal 5.00 and Huevo subtotal 0.90

---

#### REQ-CATALOG-18: Empty ingredient list

When `calcularCostoReceta` receives an empty ingredient array, it SHALL return
`{ costoTotal: 0, costoPorUnidad: 0, lineas: [] }`.

**Rationale**: An empty recipe is not valid in the UI, but the pure function
should not throw. The UI validation (REQ-CATALOG-10) handles the user-facing
constraint.

##### Scenario: Empty ingredients return zeroed result

- GIVEN `ingredientes` = [] and rendimiento = 10
- WHEN `calcularCostoReceta([], 10)` is called
- THEN result is `{ costoTotal: 0, costoPorUnidad: 0, lineas: [] }`

---

#### REQ-CATALOG-19: Zero rendimiento guard

When `rendimiento` is 0, `calcularCostoReceta` SHALL return `costoPorUnidad: 0`
without dividing by zero.

**Rationale**: Defensive coding. `rendimiento_unidades = 0` is blocked by the
form validation (must be > 0), but the pure function must not crash if called
with bad data.

##### Scenario: Zero rendimiento produces costoPorUnidad 0

- GIVEN ingredients: [{ materia_prima_id: "1", cantidad: 5, costo_por_unidad: 2, ... }] and rendimiento = 0
- WHEN `calcularCostoReceta(ingredientes, 0)` is called
- THEN `costoTotal` = 10.00
- THEN `costoPorUnidad` = 0 (no division by zero)

---

#### REQ-CATALOG-20: Rounding policy

`calcularCostoReceta` SHALL round `costoTotal` and `costoPorUnidad` to 2 decimal
places using `Math.round(x * 100 + Number.EPSILON) / 100`. `subtotal` values on
individual `lineas` SHALL use full floating-point precision.

**Rationale**: Rounding at the end avoids cumulative float-drift across many
ingredient lines. Full-precision subtotals preserve accuracy; only totals are
display-rounded.

##### Scenario: Totals are rounded to 2 decimals

- GIVEN ingredients produce a sum of 1.005 (e.g., 0.333 + 0.333 + 0.339)
- WHEN `calcularCostoReceta` computes `costoTotal`
- THEN `costoTotal` is 1.01 (not 1.00)

##### Scenario: Subtotal precision is preserved

- GIVEN an ingredient with cantidad 0.3333 and costo_por_unidad 0.3333
- WHEN `calcularCostoReceta` computes the `subtotal`
- THEN the subtotal is approximately 0.11108889 (full precision)
- AND only `costoTotal` is rounded to 0.11

---

#### REQ-CATALOG-21: Unit label display

The system SHALL provide a function `formatearUnidad(cantidad, unidad)` that
returns a display string: "12.5 g", "3 unidad(es)".

**Rationale**: Consistent display of quantities with their units. The `(es)`
suffix on `unidad` avoids awkward "3 unidad" text.

##### Scenario: Metric unit renders quantity + unit

- GIVEN cantidad = 12.5 and unidad = "g"
- WHEN `formatearUnidad(12.5, "g")` is called
- THEN the result is "12.5 g"

##### Scenario: "Unidad" unit renders with plural suffix

- GIVEN cantidad = 3 and unidad = "unidad"
- WHEN `formatearUnidad(3, "unidad")` is called
- THEN the result is "3 unidad(es)"

---

### 5. Database Schema & Setup

#### REQ-CATALOG-22: SQL migration file

The system SHALL include an idempotent SQL migration file at
`supabase/migrations/20260616120000_catalog_inicial.sql` that creates:

- Table `public.materias_primas` with columns: `id` (uuid PK, default
  `gen_random_uuid()`), `nombre` (text NOT NULL, CHECK length > 0), `unidad`
  (text NOT NULL, CHECK in `('kg','g','l','ml','unidad')`), `costo_por_unidad`
  (numeric(10,4) NOT NULL, CHECK ≥ 0), `notas` (text NULL), `created_at`
  (timestamptz NOT NULL, default `now()`), `updated_at` (timestamptz NOT NULL,
  default `now()`).

- Table `public.recetas` with columns: `id` (uuid PK), `nombre` (text NOT NULL,
  CHECK length > 0), `descripcion` (text NULL), `rendimiento_unidades`
  (numeric(10,4) NOT NULL, CHECK > 0), `notas` (text NULL), `created_at`
  (timestamptz), `updated_at` (timestamptz).

- Table `public.receta_ingredientes` with columns: `id` (uuid PK), `receta_id`
  (uuid NOT NULL, FK → `recetas(id) ON DELETE CASCADE`), `materia_prima_id`
  (uuid NOT NULL, FK → `materias_primas(id) ON DELETE RESTRICT`), `cantidad`
  (numeric(12,6) NOT NULL, CHECK > 0), `created_at` (timestamptz).

- Indexes: `idx_materias_primas_nombre_lower` on `(lower(nombre))`,
  `idx_materias_primas_created_at`, `idx_recetas_nombre_lower`,
  `idx_recetas_created_at`, `idx_receta_ingredientes_receta_id`,
  `idx_receta_ingredientes_materia_prima_id`,
  `uq_receta_ingredientes_receta_materia` UNIQUE on `(receta_id,
  materia_prima_id)`.

- RLS policies: permissive `FOR SELECT` and `FOR ALL` for the `authenticated`
  role using `(true)`; anon role receives NO policies.

- An `updated_at` trigger function applied to `materias_primas` and `recetas`.

The migration SHALL be idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF
EXISTS`).

**Rationale**: The 3-table schema is the integration point for 4 future slices.
All constraints, indexes, and RLS policies are defined in one auditable file.

##### Scenario: Migration creates all 3 tables

- GIVEN a fresh Supabase project with no custom tables
- WHEN the migration SQL is executed via the Dashboard SQL editor
- THEN the tables `materias_primas`, `recetas`, and `receta_ingredientes` exist in the `public` schema
- AND all columns match the specification above
- AND all indexes are present
- AND RLS is enabled on all 3 tables

##### Scenario: Migration is idempotent on re-run

- GIVEN the migration has already been applied
- WHEN the migration SQL is executed a second time
- THEN no errors are raised
- AND the schema is unchanged

---

#### REQ-CATALOG-23: Seed script

The system SHALL include an idempotent seed script at `supabase/seed.sql`
containing:

- 5 sample `materias_primas`: azúcar (g, 0.05), harina (kg, 2.50), mantequilla
  (g, 0.12), huevo (unidad, 0.30), chocolate (kg, 15.00).
- 2 sample `recetas`: galleta de chocolate (rendimiento 24) and pan básico
  (rendimiento 2).
- 5 `receta_ingredientes` rows linking the recipes to their ingredients.

The seed SHALL use `ON CONFLICT DO NOTHING` to be safely re-runnable.

**Rationale**: First-run UX needs demo data. Idempotent seeds prevent duplicate
data on re-run.

##### Scenario: Seed inserts demo data on first run

- GIVEN the 3 catalog tables exist and are empty
- WHEN the seed SQL is executed
- THEN 5 `materias_primas` rows exist
- THEN 2 `recetas` rows exist
- THEN 5 `receta_ingredientes` rows exist

##### Scenario: Seed is idempotent on second run

- GIVEN the seed has already been executed
- WHEN the seed SQL is run again
- THEN the row counts remain 5, 2, and 5 (no duplicates)

---

#### REQ-CATALOG-24: Dev RLS bypass script

The system SHALL include `supabase/dev_bypass_rls.sql` — a temporary script that
grants the `anon` role `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on all 3
catalog tables. The file SHALL begin with a loud comment header identifying it as
"DEV-ONLY" and stating that it will be removed by the `auth-flow` slice.

**Rationale**: The catalog is developed before `auth-flow`, so the app must work
with the anon key. The bypass is a temporary dev convenience, not a permanent
security hole.

##### Scenario: Bypass script is clearly marked as dev-only

- GIVEN `supabase/dev_bypass_rls.sql` exists
- WHEN the developer reads the first 5 lines of the file
- THEN the text "DEV-ONLY" or "SOLO PARA DESARROLLO" appears
- THEN the text "auth-flow" appears as the removal point

##### Scenario: Anon role can query after bypass

- GIVEN RLS is enabled on `materias_primas` for authenticated users only
- AND `dev_bypass_rls.sql` has been executed
- WHEN the app queries `materias_primas` using the anon key
- THEN the query returns results (not a 403/permission-denied error)

---

#### REQ-CATALOG-25: Setup documentation

The system SHALL include `docs/catalog-setup.md` with one-time setup
instructions: open Supabase Dashboard → SQL Editor → paste migration file →
run → paste seed file → run → paste `dev_bypass_rls.sql` (if needed) → run.

**Rationale**: The migration workflow is manual (no Supabase CLI). Clear, linear
instructions prevent user error.

##### Scenario: Setup doc lists all steps in order

- GIVEN `docs/catalog-setup.md` exists
- WHEN the developer reads the file
- THEN the document lists: (1) open SQL Editor, (2) paste migration, (3) paste seed, (4) paste dev_bypass_rls if needed
- AND each step includes the exact filename to copy from

---

### 6. Types & Database Interface

#### REQ-CATALOG-26: Catalog domain types

`src/types/catalog.types.ts` SHALL export the following TypeScript interfaces:

- `MateriaPrima`: `id: string`, `nombre: string`, `unidad: UnidadMedida` (union
  of `'kg' | 'g' | 'l' | 'ml' | 'unidad'`), `costo_por_unidad: number`, `notas:
  string | null`, `created_at: string`, `updated_at: string`.
- `Receta`: `id: string`, `nombre: string`, `descripcion: string | null`,
  `rendimiento_unidades: number`, `notas: string | null`, `created_at: string`,
  `updated_at: string`.
- `IngredienteReceta`: `id: string`, `receta_id: string`, `materia_prima_id:
  string`, `cantidad: number`, `created_at: string`.
- `MateriaPrimaInput`: omit `id`, `created_at`, `updated_at` from `MateriaPrima`.
- `RecetaInput`: omit `id`, `created_at`, `updated_at` from `Receta`.

All fields SHALL use Spanish names matching the SQL columns exactly. The file
SHALL also export the `UnidadMedida` union type.

**Rationale**: Spanish domain type names match the business language convention
and mirror the SQL column names exactly, eliminating name-mapping bugs.

##### Scenario: MateriaPrima type is importable and typed

- GIVEN `src/types/catalog.types.ts` is imported
- WHEN a variable is typed as `MateriaPrima`
- THEN TypeScript requires `id`, `nombre`, `unidad`, `costo_por_unidad`, `notas`, `created_at`, and `updated_at`
- AND `unidad` accepts only `'kg' | 'g' | 'l' | 'ml' | 'unidad'`

##### Scenario: MateriaPrimaInput excludes auto-generated fields

- GIVEN `MateriaPrimaInput` is used as a parameter type
- WHEN a function expects `MateriaPrimaInput`
- THEN TypeScript does NOT require `id`, `created_at`, or `updated_at`

---

#### REQ-CATALOG-27: Hand-rolled Database interface

`src/types/database.types.ts` SHALL be modified to replace the foundation's
`Record<string, never>` stub with a hand-rolled `Database` interface containing
the `Tables` definitions for `materias_primas`, `recetas`, and
`receta_ingredientes`. Each table's `Row`, `Insert`, and `Update` types SHALL
mirror the SQL schema exactly. A comment block at the top of the file SHALL
explain that these types are hand-rolled for catalog and will be regenerated via
`supabase gen types` once the CLI is installed (deferred to CI slice).

**Rationale**: The Supabase CLI is not installed; types cannot be regenerated
before the schema exists. Hand-rolled types are short (3 tables) and
`pnpm typecheck` catches drift.

##### Scenario: Database type exports Tables with catalog entities

- GIVEN `src/types/database.types.ts` is imported
- WHEN `Database['public']['Tables']['materias_primas']['Row']` is accessed
- THEN TypeScript resolves it to an object type with `id`, `nombre`, `unidad`, `costo_por_unidad`, `notas`, `created_at`, `updated_at`
- AND `Database['public']['Tables']['recetas']['Row']` resolves similarly
- AND `Database['public']['Tables']['receta_ingredientes']['Row']` resolves similarly

##### Scenario: Comment block explains hand-rolled status

- GIVEN `src/types/database.types.ts` is opened
- WHEN the developer reads the first 10 lines
- THEN a comment explains these are hand-rolled for the catalog slice
- THEN the comment includes the regeneration command: `supabase gen types typescript --local`

---

### 7. Routing

#### REQ-CATALOG-28: Materias Primas route

The router SHALL define a lazy-loaded route at `/materias-primas` that renders
`MateriasPrimasView.vue`.

**Rationale**: The ingredient catalog needs its own navigable URL. Lazy-loading
keeps the initial bundle small.

##### Scenario: Navigating to /materias-primas renders the view

- GIVEN the app is loaded
- WHEN the user navigates to `/materias-primas`
- THEN `MateriasPrimasView.vue` is rendered
- AND the view displays the ingredient list (or empty/loading/error state)

##### Scenario: Route is lazy-loaded

- GIVEN the route definition for `/materias-primas`
- WHEN the developer inspects the route config
- THEN the `component` property uses dynamic `() => import(...)` syntax

---

#### REQ-CATALOG-29: Recetas route

The router SHALL define a lazy-loaded route at `/recetas` that renders
`RecetasView.vue`.

**Rationale**: The recipe catalog needs its own navigable URL.

##### Scenario: Navigating to /recetas renders the view

- GIVEN the app is loaded
- WHEN the user navigates to `/recetas`
- THEN `RecetasView.vue` is rendered
- AND the view displays the recipe list (or empty/loading/error state)

---

#### REQ-CATALOG-30: Recipe detail route

The router SHALL define a lazy-loaded route at `/recetas/:id` that renders
`RecetaDetalleView.vue`, receiving the `id` route parameter.

**Rationale**: The recipe detail with cost breakdown (brief item 9) needs a
deep-linked URL so users can bookmark or share recipe pages.

##### Scenario: Navigating to /recetas/:id renders detail

- GIVEN a recipe with id "abc-123" exists
- WHEN the user navigates to `/recetas/abc-123`
- THEN `RecetaDetalleView.vue` is rendered
- THEN the view receives the route param `id = "abc-123"`
- THEN the recipe detail and cost breakdown are displayed

##### Scenario: Invalid recipe ID shows error state

- GIVEN no recipe with id "nonexistent" exists
- WHEN the user navigates to `/recetas/nonexistent`
- THEN the view shows "Receta no encontrada" (or equivalent Spanish error)
- AND no blank page or uncaught error occurs

---

### 8. Config Alignment

#### REQ-CATALOG-31: Config drift reconciliation

`openspec/config.yaml` SHALL have the following fields set to `true` (or the
specified values) by PR1's first commit, BEFORE any catalog code lands:

- `testing.strict_tdd: true`
- `apply.tdd: true`
- `apply.test_command: "pnpm test"`
- `verify.test_command: "pnpm test"`
- `verify.build_command: "pnpm build"`
- `testing.runner: vitest`
- `testing.framework: vitest + @vue/test-utils`

**Rationale**: The config currently has `strict_tdd: false` and `apply.tdd:
false` despite the foundation archive confirming `strict_tdd: ENABLED`. Every
gate that reads the YAML will silently re-disable TDD unless this is fixed.

##### Scenario: Config has strict_tdd and apply.tdd set to true

- GIVEN the catalog PR1 has been merged
- WHEN the developer reads `openspec/config.yaml`
- THEN `testing.strict_tdd` is `true`
- THEN `apply.tdd` is `true`
- THEN `apply.test_command` is `"pnpm test"`
- THEN `verify.test_command` is `"pnpm test"`

##### Scenario: Config drift is resolved before catalog code

- GIVEN the catalog PR1 branch
- WHEN `git log --oneline` is inspected
- THEN the first commit flips config fields
- THEN subsequent commits add catalog code with TDD passing

---

### 9. Strict TDD Compliance

#### REQ-CATALOG-32: One spec per source file

For EVERY new source file created in the catalog slice (services, stores,
composables, utils, components, views), a corresponding `*.spec.ts` file SHALL
exist. The spec file MUST be committed BEFORE or in the same commit as its source
file, with the test committed first in git history (strict TDD order).

**Rationale**: Strict TDD discipline. The foundation's `strict_tdd: ENABLED`
flag enforces this across all slices. The reviewer's diff must show "failing
test → passing implementation."

##### Scenario: Every source file has a corresponding spec

- GIVEN all source files under `src/` that are new in the catalog slice
- WHEN the developer lists `*.spec.ts` files
- THEN for every `.ts` or `.vue` source file, a matching `.spec.ts` exists in the same directory (or in `src/` for components/views)
- AND at minimum the following 13 spec files exist: `useCalculoReceta.spec.ts`, `moneda.spec.ts`, `ingredients.service.spec.ts`, `recipes.service.spec.ts`, `ingredients.store.spec.ts`, `recipes.store.spec.ts`, `MateriaPrimaForm.spec.ts`, `RecetaForm.spec.ts`, `RecetaCostoDesglose.spec.ts`, `MateriasPrimasView.spec.ts`, `RecetasView.spec.ts`, `RecetaDetalleView.spec.ts`, `routes.spec.ts`

##### Scenario: Test is committed before implementation in git history

- GIVEN the catalog PR1 branch
- WHEN `git log --oneline` for a given source/spec file pair is inspected
- THEN the spec file commit appears before or at the same position as the implementation commit

---

#### REQ-CATALOG-33: Cumulative test count and passing status

`pnpm test` SHALL exit with code 0 and report ≥ 64 passing tests (foundation's 4
+ catalog's ≥ 60). No failing or skipped tests SHALL be present.

**Rationale**: The test gate proves the full catalog implementation works. 64 is
the cumulative minimum.

##### Scenario: pnpm test runs all tests and passes

- GIVEN all catalog source files and spec files are committed
- WHEN the developer runs `pnpm test`
- THEN the command exits with code 0
- THEN the output reports ≥ 64 tests passed
- THEN the output reports 0 tests failed

---

#### REQ-CATALOG-34: Test isolation via supabase mock reset

`tests/setup.ts` SHALL export a `__resetSupabaseMock()` function that resets the
chainable Supabase mock's call log and state between tests. Each test file using
the mock SHALL call `__resetSupabaseMock()` in a `beforeEach` hook.

**Rationale**: Test isolation prevents one test's mock configuration from
leaking into the next test, which would cause flaky or order-dependent test
failures.

##### Scenario: Mock reset prevents cross-test state leakage

- GIVEN Test A configures the supabase mock to return specific data
- AND Test B does not configure the mock (expects default)
- WHEN `__resetSupabaseMock()` is called in `beforeEach`
- THEN Test B receives a clean mock with default behavior
- AND Test B's result is independent of Test A

---

### 10. UI/UX and Conventions

#### REQ-CATALOG-35: All UI text in Spanish

All user-visible text in catalog components, views, and error messages SHALL be
in Spanish.

**Rationale**: The app's target user is a Spanish-speaking fair vendor. English
UI text breaks the "lenguaje del feriante" UX principle.

##### Scenario: Ingredient list labels are in Spanish

- GIVEN the user navigates to `/materias-primas`
- WHEN the DOM is inspected
- THEN column headers and empty-state messages are in Spanish (e.g., "Nombre", "Unidad", "Costo por unidad", "No hay materias primas todavía")
- AND no English UI labels exist (e.g., no "Name", "Unit", "Cost per unit")

##### Scenario: Error messages are in Spanish

- GIVEN a network failure occurs
- WHEN the error state renders
- THEN the error message is in Spanish (e.g., "Error al cargar las materias primas")
- THEN the retry button label is "Reintentar"

---

#### REQ-CATALOG-36: English filenames and technical identifiers

All filenames and infrastructure identifiers (import paths, module names, npm
scripts, Vite/Vitest config keys) SHALL be in English.

**Rationale**: Infrastructure artifacts must be readable by any developer and
match the broader JS ecosystem. Business logic is Spanish; infra is English.

##### Scenario: Service and store filenames are in English

- GIVEN the catalog source tree under `src/`
- WHEN the developer lists files in `src/services/` and `src/stores/`
- THEN filenames include `ingredients.service.ts`, `recipes.service.ts`, `ingredients.store.ts`, `recipes.store.ts` (English)

##### Scenario: Type filenames are in English

- GIVEN `src/types/`
- WHEN the developer lists files
- THEN `catalog.types.ts` and `database.types.ts` use English filenames

---

#### REQ-CATALOG-37: Spanish domain types and function names

All TypeScript type names, interface names, function names, and composable names
that represent business domain concepts SHALL be in Spanish (`MateriaPrima`,
`Receta`, `IngredienteReceta`, `calcularCostoReceta`, `redondearCentavos`,
`formatearUnidad`).

**Rationale**: Business names match the user's mental model ("lenguaje del
feriante"). Infrastructure names are English.

##### Scenario: Domain types use Spanish names

- GIVEN `src/types/catalog.types.ts` is imported
- WHEN the developer inspects exported types
- THEN `MateriaPrima`, `Receta`, `IngredienteReceta`, `UnidadMedida` are present with Spanish names
- AND no English-named type like `Ingredient` or `Recipe` exists in the catalog types file

##### Scenario: Pure functions use Spanish names

- GIVEN `calcularCostoReceta` is exported from `src/composables/useCalculoReceta.ts`
- GIVEN `redondearCentavos` is exported from `src/utils/moneda.ts`
- WHEN the functions are imported in test files
- THEN the imports reference Spanish-named functions

---

#### REQ-CATALOG-38: Loading states

During API calls, the system SHALL display a loading indicator (skeleton,
`v-progress-linear`, or spinner) instead of showing an empty list or flashing
content.

**Rationale**: "Flash of empty" is a poor UX — the user briefly sees "No hay
datos" before the data loads. A loading indicator communicates that the system
is working.

##### Scenario: Skeleton or progress bar renders during fetch

- GIVEN a component is fetching data from Supabase
- WHEN the data has not yet arrived
- THEN a `v-progress-linear` or `v-skeleton-loader` is visible
- AND the empty-state message is NOT visible
- AND the list is NOT visible

---

#### REQ-CATALOG-39: Error states

On Supabase errors or network failures, the system SHALL display a friendly
Spanish error message (`v-alert` or toast) with a retry action.

**Rationale**: Raw error messages (500, "Failed to fetch") are confusing and
unprofessional. A friendly message + retry keeps the user in control.

##### Scenario: v-alert displays error on fetch failure

- GIVEN the Supabase fetch fails
- WHEN the component renders the error state
- THEN a `v-alert` with type "error" is displayed
- THEN the alert contains a Spanish message (e.g., "Error al cargar los datos")
- THEN a "Reintentar" button or link is present

##### Scenario: Toast displays error on mutation failure

- GIVEN a create/update/delete operation fails
- WHEN the error occurs
- THEN a toast notification is displayed with a Spanish error message
- THEN the form or dialog remains open so the user can retry

---

#### REQ-CATALOG-40: Form validation

All catalog forms SHALL mark required fields visually, validate numeric fields
for `> 0`, display unit options in a select/combobox, and show inline validation
errors in Spanish before submission.

**Rationale**: Inline validation catches errors early and reduces frustration.
Visual markers (asterisks, red borders) help the user scan the form.

##### Scenario: Required field is marked and validated

- GIVEN the create-ingredient form is open
- WHEN the user submits without filling in `nombre`
- THEN an inline error "El nombre es obligatorio" appears below the field
- AND the field border turns red (Vuetify `error` state)

##### Scenario: Numeric field validates > 0

- GIVEN the create-ingredient form is open
- WHEN the user enters 0 for `costo_por_unidad` and tabs away
- THEN an inline error appears (e.g., "Debe ser mayor a 0")

---

#### REQ-CATALOG-41: Delete confirmations

Deleting a recipe or ingredient SHALL require user confirmation via a dialog
displaying the item's name and "Cancelar" / "Eliminar" buttons.

**Rationale**: Deletion is destructive. A confirmation dialog prevents
accidental data loss.

##### Scenario: Delete dialog shows item name and cancel/confirm buttons

- GIVEN the user clicks delete on "Azúcar" in the ingredient list
- WHEN the confirmation dialog appears
- THEN the dialog contains the name "Azúcar" (e.g., "¿Eliminar Azúcar?")
- THEN a "Cancelar" button is visible
- THEN an "Eliminar" button is visible
- THEN clicking "Cancelar" closes the dialog without deleting
- THEN clicking "Eliminar" triggers the deletion

---

### 11. SOLID Compliance

#### REQ-CATALOG-42: SRP — One store per domain

Each Pinia store file SHALL manage exactly ONE domain:
`ingredients.store.ts` SHALL only contain state, getters, and actions for
`materias_primas`. `recipes.store.ts` SHALL only contain state, getters, and
actions for `recetas`.

**Rationale**: Single Responsibility Principle. A store that manages both
ingredients and recipes becomes a god-object, hard to test, and hard to
maintain.

##### Scenario: Ingredients store has no recipe concerns

- GIVEN `src/stores/ingredients.store.ts` is opened
- WHEN the developer searches for "receta" (case-insensitive) in the file
- THEN the only occurrences, if any, are in comments (e.g., "// Used by recetas")
- AND no recipe state, getter, or action is defined in the ingredient store

##### Scenario: Recipes store has no ingredient concerns

- GIVEN `src/stores/recipes.store.ts` is opened
- WHEN the developer searches for "materia_prima" or "ingredient" in state definitions
- THEN no `materiasPrimas` or `ingredients` array is defined as store state
- AND the store imports `useIngredientsStore` to read ingredient data (not duplicate it)

---

#### REQ-CATALOG-43: OCP — Service factories accept supabase client

Service factories (`crearIngredientsService`, `crearRecipesService`) SHALL
receive the `SupabaseClient<Database>` as a parameter. They SHALL NOT import the
supabase client singleton directly.

**Rationale**: Open/Closed Principle. Passing the client as a parameter allows
the service to be tested with a mock client without module-level mocking. It
also allows a future slice to swap the client (e.g., a service-role-keyed client
for admin operations) without changing the service code.

##### Scenario: Service factory accepts client as parameter

- GIVEN `crearIngredientsService` is called
- WHEN a mock `SupabaseClient<Database>` is passed as the argument
- THEN the service methods use the provided client, not a hardcoded import
- THEN the service can be instantiated in a test file without module mocking

##### Scenario: Service file has no direct supabase import

- GIVEN `src/services/ingredients.service.ts`
- WHEN the developer inspects the imports
- THEN the file does NOT contain `import { supabase } from '@/services/supabase.client'`
- AND the file does NOT contain `import ... from '@supabase/supabase-js'` (the type may be imported, but not a concrete client)

---

#### REQ-CATALOG-44: LSP — Typed promises, no thrown errors from services

All service methods SHALL return typed `Promise<T>` values. Error paths SHALL
return structured error objects (e.g., `{ data: null, error: { code: string,
message: string } }`) rather than throwing exceptions. Throwing from the
view/composable layer is acceptable.

**Rationale**: Liskov Substitution Principle. Consumers can swap service
implementations if the return type contract is stable. Throwing from the service
layer forces all consumers to wrap in try/catch; returning structured errors
lets consumers handle errors declaratively.

##### Scenario: Service method returns { data, error } shape

- GIVEN `crearIngredientsService(client)` is instantiated
- WHEN `service.obtenerTodas()` is called and the Supabase query succeeds
- THEN the return value is `{ data: MateriaPrima[], error: null }`
- AND the method does NOT throw

##### Scenario: Service method returns error object on failure

- GIVEN the Supabase client's `.from()` chain rejects or returns an error
- WHEN `service.obtenerTodas()` is called
- THEN the return value is `{ data: null, error: { code: string, message: string } }`
- AND the method does NOT throw

---

#### REQ-CATALOG-45: ISP — Minimal typed props, forms receive initial values

Component props SHALL be minimal and well-typed. Form components SHALL receive
`valoresIniciales` (initial values) rather than raw domain models.

**Rationale**: Interface Segregation Principle. Components should declare only
the props they actually use. Passing raw models forces components to know about
fields they don't render, violating ISP and creating unnecessary coupling.

##### Scenario: MateriaPrimaForm receives valoresIniciales, not full model

- GIVEN `MateriaPrimaForm.vue` is mounted
- WHEN the developer inspects its props definition
- THEN the form receives a `valoresIniciales` prop typed as `MateriaPrimaInput` or `Partial<MateriaPrimaInput>`
- AND the form does NOT receive a full `MateriaPrima` object with `id`, `created_at`, `updated_at`
- AND the form emits a `submit` event with the validated input, not the original model

##### Scenario: Component has no unused props

- GIVEN any catalog component (list item, form, breakdown card)
- WHEN the developer inspects the component's `defineProps`
- THEN every declared prop is used in the template or script
- AND no prop is declared "just in case"

---

#### REQ-CATALOG-46: DIP — Views inject services, never import supabase

Views and composables SHALL receive service instances via DI (`provide`/`inject`
or parameter passing). They SHALL NOT import `supabase` from
`@/services/supabase.client` directly.

**Rationale**: Dependency Inversion Principle. Views depend on abstractions
(service interfaces), not concrete Supabase details. This makes views testable
with mocked services and allows the offline-sync slice to swap services without
touching views.

##### Scenario: MateriasPrimasView receives service via injection

- GIVEN `MateriasPrimasView.vue` is rendered
- WHEN the developer inspects the `<script setup>` block
- THEN the view calls `inject('ingredientsService')` or receives the service as a composable parameter
- AND the view does NOT import `{ supabase }` from any module

##### Scenario: Store receives service via constructor or DI

- GIVEN `ingredients.store.ts` is inspected
- WHEN the developer reads the store's setup function
- THEN the store receives `crearIngredientsService(supabaseClient)` where `supabaseClient` comes from the DI layer
- AND the store does NOT call `createClient()` or import the singleton directly

---

## Key Learnings

- The 46 requirements span 11 capability domains but are all additive — zero foundation requirements are modified. The foundation's API surface (`inject('supabase')`, `IStorageService`, `useAuth` stub) is consumed verbatim.
- Strict TDD enforcement (REQ-CATALOG-32 through REQ-CATALOG-34) means this spec's scenarios are the DIRECT basis for `.spec.ts` files. Every scenario is a test case. The 13 minimum spec files required cover the full architecture stack (pure functions → services → stores → composables → components → views → router).
- Config drift (REQ-CATALOG-31) must be resolved in PR1's FIRST commit — before any catalog code lands. If `openspec/config.yaml` still says `strict_tdd: false`, every TDD gate will silently re-disable.
- The cost calculator's location as a composable that exports a pure function (REQ-CATALOG-17 through REQ-CATALOG-20) is the single most important architectural decision for testability: unit tests skip Vue setup; the `computed` wrapper provides reactive memoization for the view layer.
