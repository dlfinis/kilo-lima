# Tasks: Catalog — Materias Primas, Recetas, Cost Calculator

> **Change**: `catalog` | **Phase**: `sdd-tasks`
> **Proposal**: `openspec/changes/catalog/proposal.md` (8 locked decisions)
> **Spec**: `openspec/changes/catalog/specs/catalog/spec.md` (46 REQ-IDs, 83 scenarios)
> **Design**: `openspec/changes/catalog/design.md` (14 sections, factory pattern, test order in §11)
> **Delivery**: 4 chained PRs, stacked-to-main
> **Config drift**: resolved in PR1 Task 1.1 (BEFORE any catalog code) per proposal §14 / design §13 / REQ-CATALOG-31

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated total changed lines | ~1,635 (PR1 ~410, PR2 ~470, PR3a ~300, PR3b ~280, PR4 ~175) |
| 400-line budget risk | Medium (PR1, PR2, PR3b borderline; PR3a safe) |
| Chained PRs recommended | Yes |
| F2 splits applied | PR1 (mock → PR2, docs → PR4), PR3 (split into 3a+3b) |
| Delivery strategy | ask-always (preflight default, resolved via chained PRs) |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### F2 Split Rationale

- **PR1 F2 split**: `tests/setup.ts` supabase mock (~40 lines) deferred to PR2 (first consumed by ingredient service tests); `docs/catalog-setup.md` (~30 lines) deferred to PR4 (documents full setup after all code exists). PR1 drops from ~480 to ~410.
- **PR3 F2 split**: Recipes domain split into PR3a (service+store+composable+views — ~300 lines) and PR3b (form+selector+breakdown components — ~280 lines). Both stay as sequential phases within PR3, clearly separated for review.

---

## Per-PR Verification Gates (before moving to next PR)

After EACH PR merges to main:
- [ ] `pnpm install` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test -- --run` exits 0 (new tests green)
- [ ] `pnpm build` exits 0 and produces `dist/`
- [ ] PR diff is ≤ 400 lines (gate)
- [ ] No new `package.json` entries (verify via `git diff main -- package.json`)
- [ ] All `.vue` ≤ 200 lines, all functions ≤ 30 lines
- [ ] All UI text in Spanish
- [ ] No `localforage` calls in catalog code
- [ ] No `costo_total` column on `recetas`

---

## Strict TDD Compliance

- **Every create-source-file task has a preceding create-spec-file task** (RED → GREEN). `sdd-apply` MUST commit the `.spec.ts` FIRST, then the implementation, then run `pnpm test -- --run` to confirm GREEN.
- **Test order** (per PR): utility pure functions → services → stores → components → views → router. Each layer depends on the mock/testability of the previous.
- **`__resetSupabaseMock()`** is called in `beforeEach` for every service/store test (REQ-CATALOG-34).

---

## PR1 — Schema + Types + Utils + Calculator (Config drift fix FIRST)

After PR1, main has the 3-table Supabase schema (migration + seed + dev bypass), hand-rolled `Database` types, domain types (`MateriaPrima`, `Receta`, etc.), utility helpers (`redondearCentavos`, `formatearUnidad`), the cost calculator (`calcularCostoReceta` pure function), and 3 spec files — all tested green. **(F2 splits applied: supabase mock deferred to PR2; setup docs deferred to PR4; reactive composable deferred to PR3 since the recipes store lands there.)**

### Task 1.1: Reconcile config drift (PR1 FIRST commit — before any catalog code) ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-31
- **Files**: `openspec/config.yaml` (modify)
- **Depends on**: none
- **Work-unit commit message**: `chore(config): flip strict_tdd, apply.tdd, test_command for catalog` ✅ `addb183`
- **Verification**:
  - [x] `testing.strict_tdd: true`, `apply.tdd: true`, `apply.test_command: "pnpm test"`, `verify.test_command: "pnpm test"`, `verify.build_command: "pnpm build"`, `testing.runner: vitest`, `testing.framework: vitest + @vue/test-utils`
  - [x] `pnpm typecheck` passes
- **Estimated changed lines**: 15
- **Notes**: Per proposal §14 and design §13. This MUST be the first commit of PR1. Without this, every downstream TDD gate silently re-disables.

### Task 1.2: Author SQL migration, seed, and dev bypass ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-22, REQ-CATALOG-23, REQ-CATALOG-24
- **Files**:
  - `supabase/migrations/20260616120000_catalog_inicial.sql` (create — 3 tables, indexes, RLS, updated_at trigger)
  - `supabase/seed.sql` (create — 5 materias primas, 2 recetas, 5 receta_ingredientes, idempotent)
  - `supabase/dev_bypass_rls.sql` (create — loud DEV-ONLY header, grants anon role)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `feat(db): catalog migration, idempotent seed, and dev rls bypass` ✅ `da8478d`
- **Verification**:
  - [x] Migration is idempotent (all `CREATE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `DROP TRIGGER IF EXISTS`)
  - [x] Seed uses `ON CONFLICT DO NOTHING`
  - [x] `dev_bypass_rls.sql` has "DEV-ONLY" and "auth-flow" in header comment
- **Estimated changed lines**: 158
- **Notes**: Single migration file per proposal §7. `dev_bypass_rls.sql` is temporary — removed by auth-flow slice.

### Task 1.3: Author catalog domain types and Database interface ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-26, REQ-CATALOG-27
- **Files**:
  - `src/types/catalog.types.ts` (create — `MateriaPrima`, `Receta`, `IngredienteReceta`, `*Input`, `UnidadMedida`, `CalculoReceta`, `LineaCalculo`, `ServiceError`)
  - `src/types/database.types.ts` (modify — replace `Record<string, never>` stub with hand-rolled 3-table `Database`)
  - `src/types/index.ts` (modify — add re-exports from catalog.types)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `feat(types): catalog domain types and hand-rolled Database interface` ✅ `53c913d`
- **Verification**:
  - [x] `pnpm typecheck` passes
  - [x] `MateriaPrima` requires `nombre`, `unidad`, `costo_por_unidad`
  - [x] `Database['public']['Tables']['materias_primas']['Row']` resolves correctly
  - [x] `database.types.ts` has a comment block explaining hand-rolled status and CLI regeneration
- **Estimated changed lines**: 153
- **Notes**: Spanish type names per REQ-CATALOG-26/37. `ServiceError` with `{ code, message }` per REQ-CATALOG-44 LSP contract. Hand-rolled per proposal §11.

### Task 1.4a (RED): Create moneda.spec.ts ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-20
- **Files**:
  - `src/utils/moneda.spec.ts` (create — `redondearCentavos` happy + 4 edge: EPSILON, 1.005, 0.1+0.2, large)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `test(catalog): add moneda.spec.ts with rounding edge cases` ✅ `74738a5`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — implementation does not exist yet)
- **Estimated changed lines**: 25

### Task 1.4b (GREEN): Create moneda.ts ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-20
- **Files**:
  - `src/utils/moneda.ts` (create — `redondearCentavos` using `Math.round(x * 100 + Number.EPSILON) / 100`)
- **Depends on**: Task 1.4a
- **Work-unit commit message**: `feat(catalog): implement redondearCentavos rounding helper` ✅ `22ec5cb`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN — spec now passes)
  - [x] `redondearCentavos(1.005)` returns `1.01`
  - [x] `redondearCentavos(0.1 + 0.2)` returns `0.3`
- **Estimated changed lines**: 15

### Task 1.5a (RED): Create format.spec.ts ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-21
- **Files**:
  - `src/utils/format.spec.ts` (create — `formatearUnidad` for "12.5 g", "3 unidad(es)", edge cases)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `test(catalog): add format.spec.ts with unit formatting cases` ✅ `ce12033`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED)
- **Estimated changed lines**: 25

### Task 1.5b (GREEN): Modify format.ts ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-21
- **Files**:
  - `src/utils/format.ts` (modify — add `formatearUnidad(cantidad, unidad)` preserving existing `formatUSD`)
- **Depends on**: Task 1.5a
- **Work-unit commit message**: `feat(catalog): add formatearUnidad unit display helper` ✅ `ca87d43`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN)
  - [x] `formatearUnidad(3, 'unidad')` returns `"3 unidad(es)"`
- **Estimated changed lines**: 15

### Task 1.6a (RED): Create useCalculoReceta.spec.ts ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-17, REQ-CATALOG-18, REQ-CATALOG-19, REQ-CATALOG-20
- **Files**:
  - `src/composables/useCalculoReceta.spec.ts` (create — `calcularCostoReceta` happy path + 6 edge cases: empty, zero yield, missing MP, float noise, rounding, 20+ ingredients)
- **Depends on**: Task 1.3 (types)
- **Work-unit commit message**: `test(catalog): add useCalculoReceta.spec.ts with 7 calculator scenarios` ✅ `a540aa4`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — function not yet implemented)
- **Estimated changed lines**: 60

### Task 1.6b (GREEN): Create useCalculoReceta.ts ✅

- **PR**: PR1
- **REQ-IDs covered**: REQ-CATALOG-17, REQ-CATALOG-18, REQ-CATALOG-19, REQ-CATALOG-20
- **Files**:
  - `src/composables/useCalculoReceta.ts` (create — `calcularCostoReceta` pure function only; reactive composable deferred to PR3)
- **Depends on**: Task 1.6a (spec), Task 1.3 (types)
- **Work-unit commit message**: `feat(catalog): implement calcularCostoReceta and useCalculoReceta composable` ✅ `a3efeda` (+ `f69b760` F2 split)
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN — all 7 calculator scenarios pass)
  - [x] Empty ingredients → `{ costoTotal: 0, costoPorUnidad: 0, ingredientes: [] }`
  - [x] `rendimiento = 0` → `costoPorUnidad = 0` (no division by zero)
  - [x] Missing materia prima → line with `advertencia: 'MATERIA_PRIMA_FALTANTE'`
- **Estimated changed lines**: 44 (+F2 split removed placeholder composable, -7 net)
- **Notes**: F2 split applied — reactive `useCalculoReceta(recetaId)` composable deferred to PR3 since `useRecipesStore` lands there. The pure function (REQ-CATALOG-17) is the spec-mandated deliverable; the composable is a thin `computed()` wrapper that has no behavior until the store exists. Per design §8 algorithm. Single `redondearCentavos` at the end, NOT per-line.

---

## PR2 — Ingredients Domain (service + store + composable + form + list + view + supabase mock)

After PR2, main has full CRUD over `materias_primas` via the factory-based service, Pinia store, thin composable wrapper, create/edit form, list row component, and materias-primas view with empty/loading/error states. Supabase chainable mock available in `tests/setup.ts`. 5 spec files show RED→GREEN.

### Task 2.1: Add supabase chainable mock to tests/setup.ts (F2 split from PR1)

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-34
- **Files**:
  - `tests/setup.ts` (modify — add `crearSupabaseMock()`, `__resetSupabaseMock()`, `__getSupabaseMockCalls()`)
- **Depends on**: PR1 merged
- **Work-unit commit message**: `test(setup): add chainable supabase mock with reset helper` ✅ `634bc37`
- **Verification**:
  - [x] `pnpm typecheck` passes
  - [x] `__resetSupabaseMock()` is exported and callable
  - [x] Mock builder supports `.from().select().eq().single()` chain
  - [x] Mock is thenable (`await` works in service tests)
- **Estimated changed lines**: 40
- **Notes**: F2 split from PR1. Per design §10: chainable design, every method returns builder. `__resetSupabaseMock()` called in `beforeEach` for test isolation.

### Task 2.2a (RED): Create ingredients.service.spec.ts

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-1, REQ-CATALOG-4, REQ-CATALOG-5, REQ-CATALOG-44
- **Files**:
  - `src/services/ingredients.service.spec.ts` (create — `listar`, `crear`, `actualizar`, `eliminar`, error path, duplicate prevention)
- **Depends on**: Task 2.1 (supabase mock), Task 1.3 (types)
- **Work-unit commit message**: `test(catalog): add ingredients.service.spec.ts with CRUD + error scenarios` ✅ `e51b2cd`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — service not yet implemented)
- **Estimated changed lines**: 60

### Task 2.2b (GREEN): Create ingredients.service.ts

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-1, REQ-CATALOG-4, REQ-CATALOG-5, REQ-CATALOG-43, REQ-CATALOG-44
- **Files**:
  - `src/services/ingredients.service.ts` (create — `crearIngredientsService(supabase)` factory with 4 methods)
- **Depends on**: Task 2.2a (spec), Task 1.3 (types)
- **Work-unit commit message**: `feat(catalog): implement ingredients service with factory pattern` ✅ `17580dc`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN)
  - [x] Factory accepts `SupabaseClient<Database>` parameter (no direct import)
  - [x] Each method returns `{ data, error }` — never throws
- **Estimated changed lines**: 50
- **Notes**: Factory pattern per design §2. OCP — client injected, not imported. `crear` checks for duplicates case-insensitively (REQ-CATALOG-5).

### Task 2.3a (RED): Create ingredients.store.spec.ts

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-1, REQ-CATALOG-2, REQ-CATALOG-3, REQ-CATALOG-4, REQ-CATALOG-7, REQ-CATALOG-8, REQ-CATALOG-42
- **Files**:
  - `src/stores/ingredients.store.spec.ts` (create — state transitions, `cargarTodas`, `crear`, `actualizar`, `eliminar`, error handling, reactive updates)
- **Depends on**: Task 2.2b (service), Task 2.1 (mock)
- **Work-unit commit message**: `test(catalog): add ingredients.store.spec.ts with state + action tests` ✅ `1ba0c84`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — store not yet implemented)
- **Estimated changed lines**: 60

### Task 2.3b (GREEN): Create ingredients.store.ts

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-1, REQ-CATALOG-2, REQ-CATALOG-3, REQ-CATALOG-4, REQ-CATALOG-5, REQ-CATALOG-7, REQ-CATALOG-8, REQ-CATALOG-42
- **Files**:
  - `src/stores/ingredients.store.ts` (create — setup-style Pinia store with `materiasPrimas`, `cargando`, `error`, CRUD actions)
- **Depends on**: Task 2.3a (spec), Task 2.2b (service)
- **Work-unit commit message**: `feat(catalog): implement ingredients store with CRUD actions` ✅ `158a2b9`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN)
  - [x] Store receives `crearIngredientsService(supabaseClient)` via DI — no direct import
  - [x] SRP verified: no recipe concerns (REQ-CATALOG-42)
- **Estimated changed lines**: 50
- **Notes**: Setup-style Pinia per design §3. SRP: manages only `materias_primas` state. Cross-store `costoPorReceta` lives in recipes.store.

### Task 2.4: Create useIngredients composable

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-46
- **Files**:
  - `src/composables/useIngredients.ts` (create — thin `storeToRefs()` wrapper around `useIngredientsStore`)
- **Depends on**: Task 2.3b (store)
- **Work-unit commit message**: `feat(catalog): add useIngredients composable wrapping store` ✅ `66eb293`
- **Verification**:
  - [x] `pnpm typecheck` passes
  - [x] Exposes `{ materiasPrimas, cargando, error, cargar, crear, actualizar, eliminar }`
- **Estimated changed lines**: 20
- **Notes**: Container/presentational seam per design §4. No spec required — covered by view spec.

### Task 2.5a (RED): Create MateriaPrimaForm.spec.ts

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-2, REQ-CATALOG-40, REQ-CATALOG-45
- **Files**:
  - `src/components/business/MateriaPrimaForm.spec.ts` (create — mount with `valoresIniciales`, fill form, submit, validation: empty nombre, bad unidad, negative cost)
- **Depends on**: Task 1.3 (types)
- **Work-unit commit message**: `test(catalog): add MateriaPrimaForm.spec.ts with validation scenarios` ✅ `b03ffa4`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — component not yet created)
- **Estimated changed lines**: 40

### Task 2.5b (GREEN): Create MateriaPrimaForm.vue

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-2, REQ-CATALOG-3, REQ-CATALOG-40, REQ-CATALOG-45
- **Files**:
  - `src/components/business/MateriaPrimaForm.vue` (create — props: `valoresIniciales`, emits: `submit`, `cancel`; inline Spanish validation)
- **Depends on**: Task 2.5a (spec), Task 1.3 (types)
- **Work-unit commit message**: `feat(catalog): implement MateriaPrimaForm with inline Spanish validation` ✅ `f1889a1`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN)
  - [x] Fields: nombre, unidad (select), costo_por_unidad (number), notas (textarea)
  - [x] Validation in Spanish before submission
  - [x] Receives `valoresIniciales: MateriaPrimaInput | null` (ISP per REQ-CATALOG-45)
- **Estimated changed lines**: 80
- **Notes**: Pure form component — no DI, no store import. All state from props. `v-dialog` rendered by the parent view.

### Task 2.6: Create MateriaPrimaListItem.vue

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-1
- **Files**:
  - `src/components/business/MateriaPrimaListItem.vue` (create — props: `materia: MateriaPrima`, emits: `edit`, `delete`)
- **Depends on**: Task 1.3 (types)
- **Work-unit commit message**: `feat(catalog): add MateriaPrimaListItem row component` ✅ `8f399eb`
- **Verification**:
  - [x] `pnpm typecheck` passes
  - [x] Displays `nombre`, `unidad`, `costo_por_unidad` formatted
  - [x] Emits `edit` and `delete` on button click
- **Estimated changed lines**: 40
- **Notes**: No spec required — covered by view spec. Minimal typed props per ISP.

### Task 2.7a (RED): Create MateriasPrimasView.spec.ts

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-1, REQ-CATALOG-6, REQ-CATALOG-7, REQ-CATALOG-8, REQ-CATALOG-35, REQ-CATALOG-38, REQ-CATALOG-39, REQ-CATALOG-41
- **Files**:
  - `src/views/MateriasPrimasView.spec.ts` (create — mount, list renders, create flow, edit flow, delete with confirmation, empty/loading/error states)
- **Depends on**: Tasks 2.3b, 2.5b, 2.6
- **Work-unit commit message**: `test(catalog): add MateriasPrimasView.spec.ts with all states and flows` ✅ `f396cfb`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — view not yet implemented)
- **Estimated changed lines**: 55

### Task 2.7b (GREEN): Create MateriasPrimasView.vue

- **PR**: PR2
- **REQ-IDs covered**: REQ-CATALOG-1, REQ-CATALOG-2, REQ-CATALOG-3, REQ-CATALOG-4, REQ-CATALOG-5, REQ-CATALOG-6, REQ-CATALOG-7, REQ-CATALOG-8, REQ-CATALOG-35, REQ-CATALOG-38, REQ-CATALOG-39, REQ-CATALOG-41, REQ-CATALOG-46
- **Files**:
  - `src/views/MateriasPrimasView.vue` (create — list with `v-data-table`, create/edit `v-dialog`, delete confirmation `v-dialog`, loading `v-progress-linear`, error `v-alert`, empty state CTA)
- **Depends on**: Task 2.7a (spec), Tasks 2.4, 2.5b, 2.6
- **Work-unit commit message**: `feat(catalog): implement MateriasPrimasView with all states and CRUD flows` ✅ `507064d`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN)
  - [x] All 4 states: loading, empty-with-CTA, error-with-retry, data-list
  - [x] Delete shows confirmation dialog with "Eliminar" / "Cancelar"
  - [x] View calls `inject('supabase')` — no direct supabase import (DIP per REQ-CATALOG-46)
  - [x] All UI text in Spanish
  - [x] ≤ 200 lines (143 lines)
- **Estimated changed lines**: 120
- **Notes**: 143 lines — within the 200-line budget. v-dialog teleports content to document.body; tests assert via `document.querySelector` and `findComponent` (component tree) rather than the wrapper's DOM directly.

---

## PR3 — Recipes Domain (F2 split: PR3a service+store+views → PR3b forms+breakdown)

After PR3, main has full CRUD over `recetas` with joined ingredient lines, the cross-store reactive `costoPorReceta` getter, recipe list view with states, recipe detail view with cost breakdown, `SelectorMateriaPrima` autocomplete, `RecetaForm` with dynamic ingredient rows, and `RecetaCostoDesglose` display card. The F2 split separates backend (3a) from frontend (3b) for review sanity.

### PR3a — Service + Store + Composable + Views (~300 lines)

### Task 3.1a (RED): Create recipes.service.spec.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-9, REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-12, REQ-CATALOG-44
- **Files**:
  - `src/services/recipes.service.spec.ts` (create — `listar`, `crear` joined insert, `actualizar` delete-reinsert, `eliminar` cascade, error path)
- **Depends on**: Task 2.1 (mock), Task 1.3 (types)
- **Work-unit commit message**: `test(catalog): add recipes.service.spec.ts with joined insert and delete-reinsert` ✅ `e49007b`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — service not yet implemented)
- **Estimated changed lines**: 65

### Task 3.1b (GREEN): Create recipes.service.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-9, REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-12, REQ-CATALOG-43, REQ-CATALOG-44
- **Files**:
  - `src/services/recipes.service.ts` (create — `crearRecipesService(supabase)` factory with `crear` joined insert, `actualizar` delete-reinsert, `listar`, `eliminar`)
- **Depends on**: Task 3.1a (spec), Task 1.3 (types)
- **Work-unit commit message**: `feat(catalog): implement recipes service with joined insert and delete-reinsert` ✅ `704ad76`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN)
  - [x] `crear()` inserts `recetas` row + batch-inserts `receta_ingredientes` rows
  - [x] `actualizar()` deletes all existing ingredients then inserts new set
  - [x] Each method returns `{ data, error }` — never throws
- **Estimated changed lines**: 65
- **Notes**: Factory pattern per design §2. `actualizar` uses delete-then-reinsert strategy for ingredient lines.

### Task 3.2a (RED): Create recipes.store.spec.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-9, REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-12, REQ-CATALOG-15, REQ-CATALOG-42
- **Files**:
  - `src/stores/recipes.store.spec.ts` (create — state transitions, `cargarTodas`, `crear`, `actualizar`, `eliminar`, `costoPorReceta` reactive getter, cross-store reactivity)
- **Depends on**: Task 3.1b (service), Task 2.1 (mock), PR2 (ingredients store for cross-store test)
- **Work-unit commit message**: `test(catalog): add recipes.store.spec.ts with cross-store costoPorReceta` ✅ `04ac907`
- **Verification**:
  - [x] `pnpm test -- --run` fails (RED — store not yet implemented)
- **Estimated changed lines**: 65

### Task 3.2b (GREEN): Create recipes.store.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-9, REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-12, REQ-CATALOG-15, REQ-CATALOG-42
- **Files**:
  - `src/stores/recipes.store.ts` (create — setup-style Pinia store with `recetas`, `cargando`, `error`, CRUD actions, `costoPorReceta(id)` computed getter)
- **Depends on**: Task 3.2a (spec), Task 3.1b (service), PR2 (ingredients.store)
- **Work-unit commit message**: `feat(catalog): implement recipes store with reactive costoPorReceta getter` ✅ `8acac4c`
- **Verification**:
  - [x] `pnpm test -- --run` passes (GREEN)
  - [x] `costoPorReceta(id)` reads `useIngredientsStore().materiasPrimas` inside `computed()` (cross-store reactivity)
  - [x] SRP: no `materiasPrimas` state array (reads from ingredients store)
- **Estimated changed lines**: 60
- **Notes**: Cross-store reactivity via `computed()` per design §3 / proposal §15 risk #4 mitigation. No manual watchers.

### Task 3.3: Create useRecipes composable (+ F2 reactive useCalculoReceta from PR1)

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-46
- **Files**:
  - `src/composables/useRecipes.ts` (create — thin `storeToRefs()` wrapper around `useRecipesStore` + form state)
  - `src/composables/useCalculoReceta.ts` (modify — add reactive `useCalculoReceta(recetaId)` wrapper alongside the pure function)
  - `src/types/catalog.types.ts` (modify — add `RecetaConIngredientes`, `IngredienteRecetaInput`)
  - `src/types/index.ts` (modify — re-export new types)
- **Depends on**: Task 3.2b (store)
- **Work-unit commit message**: `feat(catalog): add useRecipes composable and useCalculoReceta reactive wrapper (F2 from PR1)` ✅ `d93d2dc` (composable) / `6c3d9ef` (types)
- **Verification**:
  - [x] `pnpm typecheck` passes
  - [x] Exposes `{ recetas, cargando, error, cargar, crear, actualizar, eliminar }`
- **Estimated changed lines**: 25
- **Notes**: Container/presentational seam per design §4. F2 split from PR1: the reactive `useCalculoReceta(recetaId)` composable lands here, not in PR1, because it depends on the recipes store. The pure `calcularCostoReceta` function remains in the same file and is the only thing PR1 tested.

### Task 3.4a (RED): Create RecetasView.spec.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-9, REQ-CATALOG-13, REQ-CATALOG-35, REQ-CATALOG-38, REQ-CATALOG-39, REQ-CATALOG-41
- **Files**:
  - `src/views/RecetasView.spec.ts` (create — mount, list, create flow, edit flow, delete with confirmation, empty/loading/error states)
- **Depends on**: Task 3.2b (store), PR2 patterns
- **Work-unit commit message**: `test(catalog): add RecetasView.spec.ts with all states`
- **Verification**:
  - [ ] `pnpm test -- --run` fails (RED — view not yet implemented)
- **Estimated changed lines**: 55

### Task 3.4b (GREEN): Create RecetasView.vue

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-9, REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-12, REQ-CATALOG-13, REQ-CATALOG-35, REQ-CATALOG-38, REQ-CATALOG-39, REQ-CATALOG-41, REQ-CATALOG-46
- **Files**:
  - `src/views/RecetasView.vue` (create — list with `v-data-table`, create/edit dialog, delete confirmation, loading/error/empty states)
- **Depends on**: Task 3.4a (spec), Task 3.3 (composable)
- **Work-unit commit message**: `feat(catalog): implement RecetasView with list and CRUD dialogs`
- **Verification**:
  - [ ] `pnpm test -- --run` passes (GREEN)
  - [ ] 4 states: loading, empty-with-CTA, error-with-retry, data-list
  - [ ] Row click → navigates to `/recetas/:id`
  - [ ] All UI text in Spanish
- **Estimated changed lines**: 110
- **Notes**: Matches MateriasPrimasView pattern (loading/error/empty/data). Row navigation uses `useRouter()`.

### Task 3.5a (RED): Create RecetaDetalleView.spec.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-14, REQ-CATALOG-15, REQ-CATALOG-16, REQ-CATALOG-30
- **Files**:
  - `src/views/RecetaDetalleView.spec.ts` (create — route param `:id`, cost breakdown renders, "not found" state, reactive recalculation)
- **Depends on**: Task 3.2b (store), Task 1.6b (calculator)
- **Work-unit commit message**: `test(catalog): add RecetaDetalleView.spec.ts with breakdown and not-found states`
- **Verification**:
  - [ ] `pnpm test -- --run` fails (RED — view not yet implemented)
- **Estimated changed lines**: 50

### Task 3.5b (GREEN): Create RecetaDetalleView.vue

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-14, REQ-CATALOG-15, REQ-CATALOG-16, REQ-CATALOG-30, REQ-CATALOG-35, REQ-CATALOG-46
- **Files**:
  - `src/views/RecetaDetalleView.vue` (create — reads route param `:id`, renders recipe detail + `<RecetaCostoDesglose>`, error state for not-found)
- **Depends on**: Task 3.5a (spec), Task 3.2b (store), Task 3.8b (RecetaCostoDesglose)
- **Work-unit commit message**: `feat(catalog): implement RecetaDetalleView with cost breakdown`
- **Verification**:
  - [ ] `pnpm test -- --run` passes (GREEN)
  - [ ] Route param `:id` loads correct recipe
  - [ ] "Receta no encontrada" on invalid ID
- **Estimated changed lines**: 60
- **Notes**: The recipe detail is brief item 9's centerpiece. Delegates rendering to `<RecetaCostoDesglose>`.

---

### PR3b — Selector + Recipe Form + Cost Breakdown (~280 lines)

### Task 3.6: Create SelectorMateriaPrima.vue

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-10, REQ-CATALOG-40
- **Files**:
  - `src/components/business/SelectorMateriaPrima.vue` (create — `v-autocomplete` showing `nombre (unidad)`, props: `modelValue`, `materiasPrimas`)
- **Depends on**: Task 2.3b (ingredients store for data)
- **Work-unit commit message**: `feat(catalog): add SelectorMateriaPrima autocomplete component`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] Renders "Harina (kg)" format for each option
  - [ ] Emits `update:modelValue` on selection
- **Estimated changed lines**: 50
- **Notes**: No spec required — covered by RecetaForm spec. Props per ISP design §5.

### Task 3.7a (RED): Create RecetaForm.spec.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-40, REQ-CATALOG-45
- **Files**:
  - `src/components/business/RecetaForm.spec.ts` (create — add/remove ingredients, submit, validation: empty nombre, 0 ingredients, negative cantidad)
- **Depends on**: Task 1.3 (types)
- **Work-unit commit message**: `test(catalog): add RecetaForm.spec.ts with ingredient validation scenarios`
- **Verification**:
  - [ ] `pnpm test -- --run` fails (RED — form not yet implemented)
- **Estimated changed lines**: 50

### Task 3.7b (GREEN): Create RecetaForm.vue

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-10, REQ-CATALOG-11, REQ-CATALOG-40, REQ-CATALOG-45
- **Files**:
  - `src/components/business/RecetaForm.vue` (create — N dynamic ingredient rows with `SelectorMateriaPrima`, add/remove buttons, validation)
- **Depends on**: Task 3.7a (spec), Task 3.6 (SelectorMateriaPrima), Task 1.3 (types)
- **Work-unit commit message**: `feat(catalog): implement RecetaForm with dynamic ingredient lines`
- **Verification**:
  - [ ] `pnpm test -- --run` passes (GREEN)
  - [ ] Dynamic add/remove ingredient rows
  - [ ] Validation in Spanish: empty nombre, ≥1 ingredient, all cantidad > 0
  - [ ] Receives `valoresIniciales: RecetaInput | null` (ISP per REQ-CATALOG-45)
- **Estimated changed lines**: 120
- **Notes**: Most complex form in catalog. N `SelectorMateriaPrima` instances with add/remove array logic.

### Task 3.8a (RED): Create RecetaCostoDesglose.spec.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-14, REQ-CATALOG-16, REQ-CATALOG-45
- **Files**:
  - `src/components/business/RecetaCostoDesglose.spec.ts` (create — render with fixture `CalculoReceta`, assert lines + totals + `MATERIA_PRIMA_FALTANTE` warning)
- **Depends on**: Task 1.3 (types)
- **Work-unit commit message**: `test(catalog): add RecetaCostoDesglose.spec.ts with warning state`
- **Verification**:
  - [ ] `pnpm test -- --run` fails (RED — component not yet implemented)
- **Estimated changed lines**: 40

### Task 3.8b (GREEN): Create RecetaCostoDesglose.vue

- **PR**: PR3
- **REQ-IDs covered**: REQ-CATALOG-14, REQ-CATALOG-16, REQ-CATALOG-45
- **Files**:
  - `src/components/business/RecetaCostoDesglose.vue` (create — display-only table: per-ingredient line, totals row, yellow `v-alert` for missing MP)
- **Depends on**: Task 3.8a (spec), Task 1.6b (calculator types)
- **Work-unit commit message**: `feat(catalog): implement RecetaCostoDesglose breakdown card`
- **Verification**:
  - [ ] `pnpm test -- --run` passes (GREEN)
  - [ ] Displays each ingredient: nombre, cantidad, unidad, costo_por_unidad, subtotal
  - [ ] Shows `costoTotal` and `costoPorUnidad`
  - [ ] Yellow `v-alert` when `advertencia === 'MATERIA_PRIMA_FALTANTE'`
- **Estimated changed lines**: 70
- **Notes**: Display-only (no emits). Pure presentation component per design §5.

---

## PR4 — Router + Setup Docs + docs/catalog-setup.md + Verify (~175 lines)

After PR4, main has the 3 lazy catalog routes, `docs/catalog-setup.md` with full one-time setup instructions, and the final verification proving all 46 REQ-IDs satisfied with ≥64 passing tests.

### Task 4.1a (RED): Create routes.spec.ts

- **PR**: PR4
- **REQ-IDs covered**: REQ-CATALOG-28, REQ-CATALOG-29, REQ-CATALOG-30
- **Files**:
  - `src/router/routes.spec.ts` (create — 3 routes registered, `/materias-primas` resolves, `/recetas` resolves, `/recetas/:id` resolves)
- **Depends on**: PR3 merged
- **Work-unit commit message**: `test(catalog): add routes.spec.ts for 3 lazy catalog routes`
- **Verification**:
  - [ ] `pnpm test -- --run` fails (RED — routes not yet added)
- **Estimated changed lines**: 30

### Task 4.1b (GREEN): Modify routes.ts and add 3 catalog routes

- **PR**: PR4
- **REQ-IDs covered**: REQ-CATALOG-28, REQ-CATALOG-29, REQ-CATALOG-30
- **Files**:
  - `src/router/routes.ts` (modify — append 3 lazy routes before catch-all: `/materias-primas`, `/recetas`, `/recetas/:id`)
- **Depends on**: Task 4.1a (spec)
- **Work-unit commit message**: `feat(catalog): add lazy routes for materias-primas, recetas, recetas/:id`
- **Verification**:
  - [ ] `pnpm test -- --run` passes (GREEN)
  - [ ] `router.resolve('/materias-primas').name === 'materias-primas'`
  - [ ] All 3 routes use `() => import(...)` lazy-loading
  - [ ] Catch-all (`/:pathMatch(.*)*`) unchanged
- **Estimated changed lines**: 25
- **Notes**: 3 routes appended, no modifications to foundation routes. Per design §9.

### Task 4.2: Author catalog setup docs

- **PR**: PR4
- **REQ-IDs covered**: REQ-CATALOG-25
- **Files**:
  - `docs/catalog-setup.md` (create — one-time setup instructions: SQL Editor steps, migration → seed → bypass order)
- **Depends on**: PR3 merged
- **Work-unit commit message**: `docs(catalog): add one-time setup instructions for supabase tables`
- **Verification**:
  - [ ] Lists steps: (1) open SQL Editor, (2) paste migration, (3) paste seed, (4) paste dev_bypass_rls if needed
  - [ ] Each step includes exact filename to copy from
  - [ ] Highlights `dev_bypass_rls.sql` as dev-only (removed in auth-flow)
- **Estimated changed lines**: 30
- **Notes**: Manual setup workflow per proposal §10. No Supabase CLI required.

### Task 4.3: Final verification

- **PR**: PR4
- **REQ-IDs covered**: REQ-CATALOG-33 (cumulative ≥ 64 tests)
- **Files**: None (verification-only task)
- **Depends on**: All PR4 tasks complete and merged
- **Work-unit commit message**: `chore(verify): final catalog verification — 46 REQ-IDs, ≥64 tests`
- **Verification**:
  - [ ] `pnpm test -- --run` exits 0 with ≥ 64 passing tests
  - [ ] `pnpm typecheck` exits 0
  - [ ] `pnpm lint` exits 0
  - [ ] `pnpm build` exits 0 with `dist/`
  - [ ] All 46 REQ-IDs traced (cross-check against spec)
  - [ ] No new `package.json` entries
  - [ ] All `.vue` ≤ 200 lines, all functions ≤ 30 lines
  - [ ] All comments are "why" only
  - [ ] No `localforage` calls in catalog code
  - [ ] No `costo_total` column on `recetas`
- **Estimated changed lines**: 0
- **Notes**: This task exists to gate the final merge. If any verification fails, fix in the affected PR before merging.

---

## Final Verification (after PR4 merges)

- [ ] `pnpm test` exits 0 with ≥ 64 passing tests (foundation 4 + catalog ≥ 60)
- [ ] All 46 REQ-IDs satisfied (cross-check against `openspec/changes/catalog/specs/catalog/spec.md`)
- [ ] `pnpm typecheck` passes with `strict: true`
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` produces `dist/` with PWA artifacts
- [ ] No new entries in `package.json` (verified via `git diff main -- package.json`)
- [ ] Config drift reconciled: `testing.strict_tdd: true`, `apply.tdd: true`, `apply.test_command: "pnpm test"`, `verify.test_command: "pnpm test"`
- [ ] All `.vue` ≤ 200 lines, all functions ≤ 30 lines
- [ ] All comments are "why" only, never "what"
- [ ] Spanish identified for business types; English for infrastructure
- [ ] All UI text in Spanish
- [ ] No `localforage` calls in catalog code
- [ ] No `costo_total` column on `recetas`
- [ ] CRUD lifecycle works end-to-end on a fresh Supabase project
- [ ] `supabase/dev_bypass_rls.sql` has loud DEV-ONLY header naming `auth-flow` as removal point
- [ ] `src/types/database.types.ts` has hand-rolled `Database` interface with CLI regeneration comment

---

## Key Learnings

- **F2 splits prevent budget overflow**: PR1's mock (+40) and docs (+30) moved to PR2/PR4, keeping PR1 ~410 lines. PR3's F2 split (3a/3b) keeps each review slice under ~300 lines. Without these splits, three of four PRs would exceed the 400-line budget.
- **Strict TDD doubles task count but protects quality**: Each of the 10 source files with spec coverage adds a RED task before its GREEN task. The total 23 task pairs (12 test + 11 impl + 8 impl-only for small files without specs) is manageable but requires `sdd-apply` to follow the commit order precisely.
- **Cross-store reactivity via `computed()` is the key architectural invariant**: `recipes.store.costoPorReceta(id)` reads `useIngredientsStore().materiasPrimas` inside a `computed()` — no watchers, no event bus. If this getter is accidentally made non-reactive (e.g. by reading the value outside `computed()`), the cost breakdown will go stale when ingredient prices change.
- **Config drift must be fixed before any code**: `openspec/config.yaml` still says `strict_tdd: false` and `apply.tdd: false`. Task 1.1 flips these in the first commit of PR1. If `sdd-apply` processes PR1 tasks without this commit first, every TDD gate silently re-disables.
