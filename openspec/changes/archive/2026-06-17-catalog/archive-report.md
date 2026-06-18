# Archive Report: Catalog

> **Change**: `catalog`
> **Archived**: 2026-06-17
> **Phase**: `sdd-archive` (final step of the SDD cycle)
> **Artifact store mode**: `hybrid` (both)
> **strict_tdd**: ENABLED and preserved (config drift reconciled in PR1 commit `addb183`)

---

## 1. Change Metadata

| Field | Value |
|-------|-------|
| **Change name** | `catalog` |
| **Started** | 2026-06-16 17:58 (exploration phase) |
| **First proposal commit** | 2026-06-16 18:07 |
| **PR1 merged** | 2026-06-17 08:28 -0500 (PR #5 `b200bd4`) |
| **PR2 merged** | 2026-06-17 09:18 -0500 (PR #6 `4f59df3`) |
| **PR3 merged** | 2026-06-17 10:42 -0500 (PR #7 `39b93f2`) |
| **PR4 merged** | 2026-06-17 11:42 -0500 (PR #8 `e9f6619`) |
| **Completed** | 2026-06-17 11:42 -0500 (PR4 merge) |
| **Authors** | Single author — `dlfinis` |
| **Repository** | `github.com/dlfinis/kilo-lima` |

### Pull Requests

| PR | Title | URL | Merged At | Lines |
|----|-------|-----|-----------|-------|
| **PR1** (#5) | Schema + types + utils + calculator | https://github.com/dlfinis/kilo-lima/pull/5 | 2026-06-17 08:28 -0500 | ~550 (size:exception) |
| **PR2** (#6) | Ingredients domain (service + store + composable + form + view) | https://github.com/dlfinis/kilo-lima/pull/6 | 2026-06-17 09:18 -0500 | ~470 |
| **PR3** (#7) | Recipes domain with F2 split (3a service+store+views, 3b forms+breakdown) | https://github.com/dlfinis/kilo-lima/pull/7 | 2026-06-17 10:42 -0500 | ~1,858 combined (3a+3b, size:exception) |
| **PR4** (#8) | Router wire-up + setup docs + final verification | https://github.com/dlfinis/kilo-lima/pull/8 | 2026-06-17 11:42 -0500 | ~86 |

---

## 2. What Was Built

The catalog change delivered **brief.md §7 Phase 2 items 6–9** in one cohesive change:

### CRUD Materias Primas (Ingredients)
- **3-table Supabase schema**: `materias_primas`, `recetas`, `receta_ingredientes` with FKs, indexes, RLS, and `updated_at` trigger
- **Service layer**: `crearIngredientsService(supabase)` factory (OCP/DIP) — CRUD + duplicate prevention
- **Pinia store**: `ingredients.store.ts` — setup-style, SRP domain boundary
- **Composable**: `useIngredients.ts` — thin `storeToRefs()` view wrapper
- **Components**: `MateriaPrimaForm.vue` (validation), `MateriaPrimaListItem.vue`
- **View**: `MateriasPrimasView.vue` — loading/error/empty/data states, CRUD dialogs

### CRUD Recetas (Recipes)
- **Service layer**: `crearRecipesService(supabase)` factory — joined insert, delete-then-reinsert for ingredients
- **Pinia store**: `recipes.store.ts` — `costoPorReceta(id)` computed getter with cross-store reactivity
- **Composable**: `useRecipes.ts` — view wrapper
- **Components**: `RecetaForm.vue` (dynamic N-ingredient lines via `SelectorMateriaPrima.vue`), `RecetaCostoDesglose.vue`
- **Views**: `RecetasView.vue`, `RecetaDetalleView.vue`

### Cost Calculator
- **Pure function** `calcularCostoReceta()` — O(N) on-the-fly, unit-testable without Vue
- **Reactive composable** `useCalculoReceta()` — thin `computed()` wrapper
- **Rounding utility** `redondearCentavos()` — single `Math.round(x * 100 + Number.EPSILON) / 100`
- **Format helper** `formatearUnidad()` — "12.5 g", "3 unidad(es)"

### Router & Config
- **3 lazy routes**: `/materias-primas`, `/recetas`, `/recetas/:id`
- **Config drift reconciled**: `strict_tdd: true`, `apply.tdd: true`, `test_command: "pnpm test"`

---

## 3. Final Artifact Inventory

### Source Code (~40 files)
| Category | Files |
|----------|-------|
| **Services** (2) | `src/services/ingredients.service.ts`, `src/services/recipes.service.ts` |
| **Stores** (2) | `src/stores/ingredients.store.ts`, `src/stores/recipes.store.ts` |
| **Composables** (3) | `src/composables/useIngredients.ts`, `src/composables/useRecipes.ts`, `src/composables/useCalculoReceta.ts` |
| **Utils** (2) | `src/utils/moneda.ts`, `src/utils/format.ts` (modified) |
| **Types** (2+1) | `src/types/catalog.types.ts` (new), `src/types/database.types.ts` (modified), `src/types/index.ts` (modified) |
| **Components** (5) | `MateriaPrimaForm.vue`, `MateriaPrimaListItem.vue`, `SelectorMateriaPrima.vue`, `RecetaForm.vue`, `RecetaCostoDesglose.vue` |
| **Views** (3) | `MateriasPrimasView.vue`, `RecetasView.vue`, `RecetaDetalleView.vue` |
| **Router** (1) | `src/router/routes.ts` (modified) |
| **Config** (1) | `openspec/config.yaml` (modified — config drift fix) |
| **Test setup** (1) | `tests/setup.ts` (modified — chainable supabase mock) |

### SQL & Docs (4 files)
| Category | Files |
|----------|-------|
| **Migration** (1) | `supabase/migrations/20260616120000_catalog_inicial.sql` |
| **Seed** (1) | `supabase/seed.sql` (idempotent, `ON CONFLICT DO NOTHING`) |
| **Dev bypass** (1) | `supabase/dev_bypass_rls.sql` (DEV-ONLY header, auth-flow removal marker) |
| **Setup doc** (1) | `docs/catalog-setup.md` (4 step instructions) |

### Spec Files (13 + 3 from foundation = 16 total)
| # | Spec File | Tests |
|---|-----------|-------|
| 1 | `src/utils/moneda.spec.ts` | Rounding edge cases |
| 2 | `src/utils/format.spec.ts` | Unit formatting |
| 3 | `src/composables/useCalculoReceta.spec.ts` | Calculator happy + 6 edge cases |
| 4 | `src/services/ingredients.service.spec.ts` | CRUD + error paths |
| 5 | `src/services/recipes.service.spec.ts` | Joined insert, delete-reinsert |
| 6 | `src/stores/ingredients.store.spec.ts` | State transitions |
| 7 | `src/stores/recipes.store.spec.ts` | Cross-store reactivity |
| 8 | `src/components/business/MateriaPrimaForm.spec.ts` | Validation scenarios |
| 9 | `src/components/business/RecetaForm.spec.ts` | Ingredient validation |
| 10 | `src/components/business/RecetaCostoDesglose.spec.ts` | Cost breakdown + warning |
| 11 | `src/views/MateriasPrimasView.spec.ts` | All 4 states + CRUD flows |
| 12 | `src/views/RecetasView.spec.ts` | All 4 states + CRUD flows |
| 13 | `src/views/RecetaDetalleView.spec.ts` | Route param, breakdown, not-found |
| 14 | `src/router/routes.spec.ts` | 3 routes registered |

---

## 4. Spec Compliance

All **46 REQ-CATALOG-*** requirements are satisfied:

| Domain | REQ-IDs | Status |
|--------|---------|--------|
| Materias Primas CRUD | REQ-CATALOG-1..8 | ✅ 8/8 |
| Recetas CRUD | REQ-CATALOG-9..13 | ✅ 5/5 |
| Recipe Detail & Cost | REQ-CATALOG-14..16 | ✅ 3/3 |
| Cost Calculator | REQ-CATALOG-17..21 | ✅ 5/5 |
| Database Schema & Setup | REQ-CATALOG-22..25 | ✅ 4/4 |
| Types & Database Interface | REQ-CATALOG-26..27 | ✅ 2/2 |
| Routing | REQ-CATALOG-28..30 | ✅ 3/3 |
| Config Alignment | REQ-CATALOG-31 | ✅ 1/1 |
| Strict TDD Compliance | REQ-CATALOG-32..34 | ✅ 3/3 |
| UI/UX and Conventions | REQ-CATALOG-35..41 | ✅ 7/7 |
| SOLID Compliance | REQ-CATALOG-42..46 | ✅ 5/5 |
| **Total** | **46/46** | **✅** |

**Tests**: 102 passing (0 failed, 0 skipped) across 16 test files.

---

## 5. Deviations from Plan

| # | Deviation | Detail | Impact |
|---|-----------|--------|--------|
| 1 | **PR1 size:exception (~550 lines)** | Exceeded the 400-line budget due to SQL migration (158 lines) + types (153 lines). Accepted as exception because the SQL is a single logical unit. | Low — SQL line count is declarative, not logic-heavy. |
| 2 | **PR3 size:exception (~1,858 lines combined)** | PR3 was PR3a (service+store+views) and PR3b (forms+breakdown) combined into one PR #7. This was flagged as "High" risk in the proposal and F2 split was applied in-git but reviewed as a single PR. | Medium — the 1,858 lines required more reviewer attention. Verified all gates passed. |
| 3 | **PR3a + PR3b combined** | The F2 split was maintained as sequential commits within PR3 (separate tasks and commit groups) rather than separate PRs. All commits followed RED→GREEN TDD order. | Low — architectural separation was maintained; merged cleanly. |
| 4 | **All 4 PRs strict TDD** | Every source file had its spec committed first (RED), then the implementation (GREEN). Consistent with the foundation pattern. | None — TDD was preserved throughout. |

---

## 6. Key Decisions (all 8 from proposal honored)

| # | Decision | Status | Implementation |
|---|----------|--------|----------------|
| 1 | 3-table Supabase schema with FKs, indexes, RLS | ✅ | `supabase/migrations/20260616120000_catalog_inicial.sql` |
| 2 | SQL migration + Dashboard SQL editor (no CLI) | ✅ | Migration file + `docs/catalog-setup.md` manual steps |
| 3 | Cost calculator = composable + pure function `calcularCostoReceta`; on-the-fly, no pre-calculated column | ✅ | `src/composables/useCalculoReceta.ts` — O(N) reactive computed |
| 4 | Online-only (no localforage in catalog) | ✅ | All reads/writes go directly to Supabase |
| 5 | Hand-rolled `Database` interface | ✅ | `src/types/database.types.ts` with CLI regeneration comment |
| 6 | Idempotent seed (`ON CONFLICT DO NOTHING`) | ✅ | `supabase/seed.sql` — 5 materias primas + 2 recetas + 5 ingredientes |
| 7 | Strict TDD (RED-GREEN-REFACTOR) | ✅ | 13 spec files, test-first commits, 102 tests |
| 8 | 4 chained PRs stacked-to-main | ✅ | PRs #5→#6→#7→#8 |

### Additional architectural patterns established:

- **Supabase mock chainable pattern**: `crearSupabaseMock()` in `tests/setup.ts` — chainable builder with `.from().select().eq().single()`, thenable for `await`. `__resetSupabaseMock()` exported for per-test isolation.
- **Never-throw service contract**: All service methods return `{ data, error }` — LSP surface for future offline-sync slice.
- **Cross-store computed for cost**: `recipes.store.costoPorReceta(id)` reads `useIngredientsStore().materiasPrimas` inside a `computed()` — reactive cost recalculation without watchers or event bus.

---

## 7. Delivery Metrics

| Metric | Value |
|--------|-------|
| **Total PRs** | 4 chained PRs (stacked-to-main) |
| **Production code lines** | ~3,800 (new + modified source) |
| **Test lines** | ~3,000 (13 spec files) |
| **Total tests** | 102 (passing, 0 failed, 0 skipped) |
| **Test files** | 16 (13 catalog + 3 foundation) |
| **Gates green** | 12 (install, typecheck, lint, test, build, preview, package.json, line limits, Spanish UI, no localforage, no costo_total, SOLID) |
| **Build output** | `dist/` with PWA artifacts + code-split chunks |
| **Config drift** | Resolved (PR1 commit `addb183`) |
| **Package.json** | Zero new entries |
| **Size exceptions** | PR1 (~550 lines), PR3 (~1,858 lines combined) |

---

## 8. Engram Observations

| Artifact | Observation ID | Title |
|----------|---------------|-------|
| Exploration | `#368` | `sdd/catalog/explore` |
| Proposal | `#375` | `sdd/catalog/proposal` |
| Spec | `#380` | `sdd/catalog/spec` |
| Design | `#381` | `sdd/catalog/design` |
| Tasks | `#382` | `sdd/catalog/tasks` |
| Apply Progress | `#387` | `sdd/catalog/apply-progress` |
| Verify Report | `#398` | `sdd/catalog/verify-report` |
| Archive Report | *(this file)* | `sdd/catalog/archive-report` |

---

## 9. What's Next

| Slice | Phase | Depends On | Priority |
|-------|-------|-----------|----------|
| **`events`** | Phase 3 (item 10) | Catalog (recetas + materias primas + cost calculator) | **Next** — recetas + cost calculator are the foundation for event planning |
| **`auth-flow`** | Cross-cutting | Catalog (RLS tables), `dev_bypass_rls.sql` to remove | Optional — depends on `useAuth` stub resolution |
| **`planning`** | Phase 3 (items 11-13) | Events, catalog (recetas, calculator, `redondearParaMermas`) | After events |
| **`offline-sync`** | Phase 5 (item 20) | Catalog (service factory pattern, `IStorageService` LSP) | Low priority — needed only for production deployment |

---

## 10. Archive Verdict

| Check | Status |
|-------|--------|
| Spec compliance | ✅ 46/46 REQ-IDs satisfied |
| Tests passing | ✅ 102 tests green |
| Config drift reconciled | ✅ `strict_tdd: true`, `apply.tdd: true` |
| All tasks complete | ✅ 33/33 tasks |
| Delivery PRs merged | ✅ 4/4 PRs merged to main |
| Archive folder moved | ✅ `openspec/changes/catalog/` → `openspec/changes/archive/2026-06-17-catalog/` |
| Global spec synced | ✅ `openspec/specs/catalog/spec.md` created |
| Engram persisted | ✅ `sdd/catalog/archive-report` saved |

---

## Key Learnings

- **Config drift reconciliation is non-negotiable**: `openspec/config.yaml` had `strict_tdd: false` and `apply.tdd: false` at catalog start. PR1 commit `addb183` flipped them before any code landed. This is the reference pattern for every future slice.
- **Factory pattern (services) + pure-function export (calculator) is the two-punch testability strategy**: services inject mocks; the pure function skips Vue/Pinia setup entirely. 102 tests with minimal boilerplate.
- **Cross-store reactivity via `computed()` is the key architectural invariant**: `recipes.store.costoPorReceta(id)` reads `useIngredientsStore().materiasPrimas` inside a `computed()` — no watchers, no event bus. Any future slice must preserve this pattern.
- **Chained PRs with F2 splits manage the review budget**: PR1's mock→PR2 and docs→PR4 splits, plus PR3's 3a/3b split, kept individual review slices under control despite the total ~3,800 production lines.
- **The never-throw `{ data, error }` contract is the LSP surface for the offline-sync slice**: services return structured errors; the future offline wrapper can swap implementations without touching stores/views.
