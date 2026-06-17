# Proposal: `catalog` — Materias Primas, Recetas, Cost Calculator

> **Change**: `catalog` | **Phase**: `sdd-propose` → feeds `sdd-spec` and `sdd-design`
> **Source PRD**: `brief.md` §7 Phase 2 (items 6–9, locked scope).
> **Source analysis**: `openspec/changes/catalog/exploration.md` (READ FIRST — every decision below is sourced from it).
> **Artifact store mode**: `both` (filesystem + Engram).
> **Delivery**: chained PRs (4 slices), stacked-to-main, exceeds 400-line budget — chained PRs are MANDATORY.

---

## 1. Title and Executive Summary

**Title**: `catalog` — CRUD Materias Primas + CRUD Recetas + Cost Calculator + Recipe View with Cost Breakdown.

**Executive summary**: The `catalog` slice delivers brief Phase 2 items 6–9 in one cohesive change: full create/read/update/delete over `materias_primas` and `recetas`, a deterministic on-the-fly cost calculator, and a recipe-detail view that renders the cost breakdown. It is the **first slice that uses the persisted Supabase backend** (the foundation shipped only the client + types stub). Catalog is **additive** to the foundation's frozen API surface (`inject('supabase')`, `inject('storageService')`, the IStorageService LSP, the typed `Database` interface) and **introduces zero new dependencies** to `package.json`. It blocks `events` (which needs recetas + materias_primas), `pos` (which prices from recetas), `analytics` (which uses cost breakdown), and `auth-flow` (which wires real auth against the RLS-enabled tables). Strict TDD applies — ~60 tests land before the implementation in four chained PRs.

---

## 2. Context and Motivation

- **PRD scope** (`brief.md` §7 Phase 2, items 6–9): CRUD Materias Primas → CRUD Recetas → Calculadora de costos → Vista de recetas con desglose. Locked; no extensions.
- **Foundation is ARCHIVED**: 54/54 REQ-IDs satisfied, `strict_tdd: ENABLED`, smoke test green, `useAuth` stubbed (throws), `IStorageService` ready. Catalog inherits the foundation API surface verbatim — `inject('supabase')` for the typed `SupabaseClient<Database>`, Pinia stores in setup-style, services as factories, components in `src/components/business/`, Spanish for domain concepts.
- **Why now**: every later slice (events, planning, POS, analytics, reports) depends on recetas + materias_primas + cost calculator. Without this change, no downstream slice can be specified, designed, or implemented.
- **Why a separate slice** (not absorbed into `foundation`): foundation intentionally stopped at "types + DI + smoke test". Catalog introduces the first real schema (3 tables), the first CRUD UX, and the first real business logic — all of which are too large and too domain-specific to belong in foundation.

---

## 3. Decisions (LOCKED — immutable, sourced from exploration)

| # | Decision | One-line rationale | Source |
|---|---|---|---|
| 1 | **Data model = 3 Supabase tables**: `materias_primas`, `recetas`, `receta_ingredientes` | Normalized 3NF; FK + UNIQUE enforce business invariants; RESTRICT on FK to `materias_primas` prevents accidental orphan recipes. | exploration §Data Model |
| 2 | **DB setup = SQL migration file + Dashboard SQL editor** (no supabase CLI installed); RLS permissive for authenticated, strict for anon; `dev_bypass_rls.sql` for catalog dev removed in `auth-flow` slice | Lowest friction for a single-user app; auditable from git; CLI install deferred to CI slice. | exploration §Database Setup |
| 3 | **Cost calculator = composable + pure function `calcularCostoReceta`**. No pre-calculated column; O(N) on-the-fly | Reactive + unit-testable in isolation; no sync-bug surface for future offline-sync slice; performance is irrelevant at <10k rows. | exploration §Cost Calculator |
| 4 | **Offline strategy = online-only**. Reads fetch from Supabase; writes call Supabase directly; friendly error messages. localforage not touched in catalog | Brief's offline promise is Phase 5 (item 20). Foundation explicitly deferred the sync queue. Building partial offline-cache is a footgun. | exploration §Offline Strategy |
| 5 | **Type generation = hand-rolled `Database` interface** in `src/types/database.types.ts`. Regenerate via `supabase gen types` once CLI is installed (deferred to CI slice) | The CLI is not installed; the user must run the migration manually; types cannot be regenerated before the schema exists. Hand-rolled types are short (3 tables) and `pnpm typecheck` catches drift. | exploration §Type Generation |
| 6 | **Seed data = idempotent `supabase/seed.sql`**: 5 `materias_primas` (azúcar, harina, mantequilla, huevo, chocolate) + 2 `recetas` (galleta de chocolate, pan básico) + 5 `receta_ingredientes` | First-run UX needs data; idempotent `ON CONFLICT DO NOTHING` is safe to re-run. | exploration §Database Setup |
| 7 | **Test strategy = strict TDD (RED-GREEN-REFACTOR)**, ~60 tests (15 unit + 20 integration + 25 component). Chainable Supabase mock in `tests/setup.ts` | Foundation `strict_tdd: ENABLED` per engram `sdd/kilo-lima/testing-capabilities`. Specs land BEFORE implementation in each PR. | exploration §Test Strategy |
| 8 | **Delivery = 4 chained PRs stacked-to-main**: PR1 (schema+types+utils+calculator+mock), PR2 (ingredients service+store+view+specs), PR3 (recipes service+store+views+specs), PR4 (router+config+docs+verify) | Catalog forecast ~2,085 lines (largest slice so far). 400-line budget is HARD; chained PRs are MANDATORY, not optional. | exploration §Chained PRs Forecast |

---

## 4. Scope

### 4.1 In-scope (concrete deliverables with SRP justification)

| Deliverable | Single Responsibility (SRP) |
|---|---|
| `supabase/migrations/20260616120000_catalog_inicial.sql` | Owns the schema, indexes, RLS policies, and `updated_at` trigger for the 3 catalog tables. One change, one migration. |
| `supabase/seed.sql` | Owns the demo data for first-run UX. Idempotent. |
| `docs/catalog-setup.md` | Owns the user-facing one-time setup instructions (Dashboard SQL editor copy/paste). |
| `src/types/catalog.types.ts` | Owns the Spanish domain types (`MateriaPrima`, `Receta`, `IngredienteReceta`, plus `*Input` variants). |
| `src/types/database.types.ts` (modified) | Owns the typed `Database` interface that flows through `supabase.from(...)`. Hand-rolled for catalog. |
| `src/services/ingredients.service.ts` | Owns Supabase CRUD for `materias_primas`. Factory takes a `SupabaseClient<Database>` via DI. |
| `src/services/recipes.service.ts` | Owns Supabase CRUD for `recetas` + `receta_ingredientes` (joined inserts, transactional). |
| `src/stores/ingredients.store.ts` | Owns the Pinia state for `materias_primas` (state + loading + error + actions). |
| `src/stores/recipes.store.ts` | Owns the Pinia state for `recetas`; exposes `costoPorReceta(id)` derived getter. |
| `src/composables/useIngredients.ts` | Thin view-layer wrapper around `ingredients.store` (container / presentational seam). |
| `src/composables/useRecipes.ts` | Thin view-layer wrapper around `recipes.store` + the calculator. |
| `src/composables/useCalculoReceta.ts` | Owns the reactive cost computation; **also exports** the pure function `calcularCostoReceta` so unit tests skip Vue. |
| `src/utils/moneda.ts` | Owns pure rounding helpers (`redondearCentavos`, `redondearParaMermas`). |
| `src/utils/format.ts` (modified) | Owns `formatearUnidad(cantidad, unidad)` rendering ("1.5 kg"). |
| `src/components/business/MateriaPrimaForm.vue` | Owns the create/edit form for one materia prima. Emits `submit` with typed input. |
| `src/components/business/MateriaPrimaListItem.vue` | Owns one row in the list. |
| `src/components/business/SelectorMateriaPrima.vue` | Owns the autocomplete for picking a materia prima inside a recipe form. |
| `src/components/business/RecetaForm.vue` | Owns the create/edit form for a recipe (with N `SelectorMateriaPrima` instances). |
| `src/components/business/RecetaCostoDesglose.vue` | Owns the cost-breakdown card (item 9's centerpiece). |
| `src/views/MateriasPrimasView.vue` | Owns the list + create/edit dialog page for materias primas. |
| `src/views/RecetasView.vue` | Owns the list + create/edit dialog page for recetas. |
| `src/views/RecetaDetalleView.vue` | Owns the single recipe view with cost breakdown (item 9). |
| `src/router/routes.ts` (modified) | Appends 3 lazy routes: `/materias-primas`, `/recetas`, `/recetas/:id`. |
| `src/router/routes.spec.ts` | Tests the router registry has the new routes. |
| **~10 spec files** (one per source file) | Owns the test surface — strict TDD order. |
| `tests/setup.ts` (modified) | Adds a chainable `vi.mock('@supabase/supabase-js')` factory + `__resetSupabaseMock()` helper. |
| `openspec/config.yaml` (modified) | Flips `testing.strict_tdd: true`, `apply.tdd: true`; adds `test_command: "pnpm test"` and `verify.test_command: "pnpm test"`. **See §14 Config drift.** |

### 4.2 Out-of-scope (explicit non-goals)

- **No stock / inventory tracking** — `stock_actual` is not a column on `materias_primas`. Stock belongs to a Phase 3 slice.
- **No unit conversion engine** — `cantidad` is stored in the materia prima's own `unidad`. A future slice may add kg↔g, l↔ml conversion. The form shows the unit beside the name; the calculator trusts the numeric value.
- **No recipe versioning / snapshot semantics** — when a `materia_prima.costo_por_unidad` changes, historical recipe costs are not preserved. The calculator shows the current price.
- **No multi-recipe yield** — `rendimiento_unidades` is a single number. A recipe yielding "24 cookies AND 12 mini-cupcakes" cannot be modelled.
- **No export / print** — jsPDF is in the stack but not used in catalog. The recipe view is a screen, not a PDF. Exports belong to the `reports` slice.
- **No bulk import** — no CSV / Excel import. The seed covers the demo case.
- **No image attachment** — no `foto_url` on `materias_primas`. Supabase Storage is available later.
- **No `costo_por_unidad` history** — the cost breakdown is a snapshot of NOW.
- **No offline sync** — `sync.queue.store.ts`, `sync.service.ts`, custom SW `sync` handler, `useSyncStatus` are all `offline-sync`-slice concerns.
- **No auth UI** — login, sign-up, password recovery, session UI are `auth-flow` slice concerns. Catalog works against the anon key with `dev_bypass_rls.sql` removed in `auth-flow`.
- **No merma surcharge** — the brief's cost calculator (§8) is a pure sum. The `redondearParaMermas` helper ships for future use; the merma toggle UI is `planning`-slice (Phase 3, item 12).
- **No CI** — GitHub Actions, Playwright, `supabase` CLI, Docker, `gen:types` prebuild hook all deferred.
- **No i18n** — Spanish UI text hardcoded.

---

## 5. Stack (zero new dependencies)

Catalog adds **zero new entries to `package.json`**. Verification against exploration §1 + foundation archive:

| Concern | Package | Pin (from foundation) | Catalog use |
|---|---|---|---|
| UI | `vue@^3.5.38` + `vuetify@^3.12.8` | foundation | forms, tables, dialogs, alerts |
| State | `pinia@^3.0.4` | foundation | `useIngredientsStore`, `useRecipesStore` |
| Backend | `@supabase/supabase-js@^2.108.2` | foundation | service layer |
| Routing | `vue-router@^4.6.4` | foundation | 3 new lazy routes |
| Types | `zod@^4.4.3` | foundation | `env.ts` unchanged; catalog may use Zod for input validation in `RecetaForm` |
| Testing | `vitest@^2.1.9` + `@vue/test-utils@^2.4.11` | foundation | ~60 tests |
| Build | `vite@^5.4.21` + `vue-tsc@^3.3.5` | foundation | typecheck |
| Lint/Format | `eslint@^9.39.4` + `prettier@^3.8.4` | foundation | unchanged |
| Offline (used later) | `localforage@^1.10.0` | foundation | not touched in catalog |

**Optional future dep (NOT in this slice)**: `supabase` CLI (devDep) — to regenerate `Database` types. Deferred to the CI slice.

---

## 6. File Structure (new files marked `NEW`, modified `MOD`)

```
kilo-lima/
├── supabase/                                          NEW (dir)
│   ├── migrations/
│   │   └── 20260616120000_catalog_inicial.sql         NEW
│   └── seed.sql                                       NEW
├── docs/
│   └── catalog-setup.md                               NEW
├── openspec/
│   ├── changes/catalog/
│   │   ├── exploration.md                             (existing)
│   │   ├── proposal.md                                NEW (this file)
│   │   ├── specs/                                     (sdd-spec writes here)
│   │   ├── design.md                                  (sdd-design writes here)
│   │   └── tasks.md                                   (sdd-tasks writes here)
│   └── config.yaml                                    MOD (flip strict_tdd)
├── src/
│   ├── types/
│   │   ├── catalog.types.ts                           NEW
│   │   ├── database.types.ts                          MOD (hand-rolled Database)
│   │   └── index.ts                                   MOD (re-export)
│   ├── services/
│   │   ├── ingredients.service.ts                     NEW (+ .spec.ts)
│   │   └── recipes.service.ts                         NEW (+ .spec.ts)
│   ├── stores/
│   │   ├── ingredients.store.ts                       NEW (+ .spec.ts)
│   │   └── recipes.store.ts                           NEW (+ .spec.ts)
│   ├── composables/
│   │   ├── useIngredients.ts                          NEW
│   │   ├── useRecipes.ts                              NEW
│   │   └── useCalculoReceta.ts                        NEW (+ .spec.ts)
│   ├── utils/
│   │   ├── moneda.ts                                  NEW (+ .spec.ts)
│   │   └── format.ts                                  MOD (+ formatearUnidad)
│   ├── components/business/
│   │   ├── MateriaPrimaForm.vue                       NEW (+ .spec.ts)
│   │   ├── MateriaPrimaListItem.vue                   NEW
│   │   ├── SelectorMateriaPrima.vue                   NEW
│   │   ├── RecetaForm.vue                             NEW (+ .spec.ts)
│   │   └── RecetaCostoDesglose.vue                    NEW (+ .spec.ts)
│   ├── views/
│   │   ├── MateriasPrimasView.vue                     NEW (+ .spec.ts)
│   │   ├── RecetasView.vue                            NEW (+ .spec.ts)
│   │   └── RecetaDetalleView.vue                      NEW (+ .spec.ts)
│   └── router/
│       └── routes.ts                                  MOD (+ .spec.ts)
├── tests/
│   └── setup.ts                                       MOD (chainable supabase mock)
```

**Untouched foundation files** (proof of additive change): `App.vue`, `main.ts`, `App.spec.ts`, `utils/env.ts`, `plugins/vuetify.ts`, `plugins/services.ts`, `services/supabase.client.ts`, `localforage.client.ts`, `storage.interface.ts`, `storage.service.ts`, `composables/useAuth.ts`, `useOnlineStatus.ts`, `usePwaUpdate.ts`, `stores/app.store.ts`, `views/HomeView.vue`.

---

## 7. Data Model (3 Supabase tables)

### `public.materias_primas`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `nombre` | `text` | NOT NULL, CHECK `length(nombre) > 0` | Spanish display name. |
| `unidad` | `text` | NOT NULL, CHECK `unidad in ('kg','g','l','ml','unidad')` | Locked 5-value enum (KISS). |
| `costo_por_unidad` | `numeric(10,4)` | NOT NULL, CHECK `costo_por_unidad >= 0` | USD, 4 decimals so unit-conversion stays sane. |
| `notas` | `text` | NULL | Optional. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | Trigger updates on UPDATE. |

**Indexes**: `idx_materias_primas_nombre_lower` on `(lower(nombre))` (typeahead), `idx_materias_primas_created_at` on `(created_at desc)` (default ordering).

### `public.recetas`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `nombre` | `text` | NOT NULL, CHECK `length(nombre) > 0` | |
| `descripcion` | `text` | NULL | Optional. |
| `rendimiento_unidades` | `numeric(10,4)` | NOT NULL, CHECK `> 0` | Batch yield. |
| `notas` | `text` | NULL | Optional. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | |

**Indexes**: `idx_recetas_nombre_lower`, `idx_recetas_created_at`.

**No `costo_total` column**: cost is computed at read time (see §8).

### `public.receta_ingredientes`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `receta_id` | `uuid` | NOT NULL, FK → `recetas(id) ON DELETE CASCADE` | |
| `materia_prima_id` | `uuid` | NOT NULL, FK → `materias_primas(id) ON DELETE RESTRICT` | Cannot delete a materia prima that is in use. |
| `cantidad` | `numeric(12,6)` | NOT NULL, CHECK `cantidad > 0` | Amount in the materia prima's own `unidad`. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Indexes**: `idx_receta_ingredientes_receta_id` (hot path for calculator), `idx_receta_ingredientes_materia_prima_id` (reverse lookup), `uq_receta_ingredientes_receta_materia` UNIQUE on `(receta_id, materia_prima_id)` (a recipe cannot list the same materia prima twice).

### RLS policies

```sql
alter table public.materias_primas       enable row level security;
alter table public.recetas               enable row level security;
alter table public.receta_ingredientes   enable row level security;

-- Permissive for authenticated; auth.uid() referenced so policies stay correct
-- when the auth-flow slice wires real Supabase Auth.
create policy "materias_primas_select_authenticated" on public.materias_primas     for select to authenticated using (true);
create policy "materias_primas_write_authenticated"   on public.materias_primas     for all    to authenticated using (true) with check (true);
-- Same shape for recetas and receta_ingredientes.
```

**Anon role is NOT granted access.** Dev bypass (`supabase/dev_bypass_rls.sql`) is a temporary script that grants the anon role table access — clearly marked dev-only and **removed in the `auth-flow` slice**.

### Migration ordering

Single file `supabase/migrations/20260616120000_catalog_inicial.sql` containing: (1) `pgcrypto` extension (idempotent), (2) `materias_primas` + indexes + RLS, (3) `recetas` + indexes + RLS, (4) `receta_ingredientes` + indexes + RLS, (5) `updated_at` trigger function reused for all three tables, (6) idempotent seed insert.

---

## 8. Cost Calculator Approach

### Location: composable that also exports a pure function

```ts
// src/composables/useCalculoReceta.ts
export function calcularCostoReceta(           // pure function — unit-tested
  receta: Receta,
  materiasPrimas: MateriaPrima[],
): CalculoReceta {
  const mapa = new Map(materiasPrimas.map(mp => [mp.id, mp]))
  const lineas: LineaCalculo[] = receta.ingredientes.map(ing => {
    const mp = mapa.get(ing.materia_prima_id)
    if (!mp) {
      return { ingrediente: ing, materiaPrima: null, subtotal: 0, advertencia: 'MATERIA_PRIMA_FALTANTE' }
    }
    return { ingrediente: ing, materiaPrima: mp, subtotal: ing.cantidad * mp.costo_por_unidad }
  })
  const costoTotal    = redondearCentavos(lineas.reduce((acc, l) => acc + l.subtotal, 0))
  const costoPorUnidad = receta.rendimiento_unidades > 0
    ? redondearCentavos(costoTotal / receta.rendimiento_unidades)
    : 0
  return { ingredientes: lineas, costoTotal, costoPorUnidad }
}

export function useCalculoReceta(receta: Ref<Receta>, materiasPrimas: Ref<MateriaPrima[]>) {
  return computed(() => calcularCostoReceta(receta.value, materiasPrimas.value))
}
```

### Why on-the-fly (no pre-calculated column)

- Single-user, <10k rows; query is O(N) per recipe and returns in <5 ms.
- A pre-calculated column needs a trigger to update whenever `materias_primas.costo_por_unidad` changes — hidden coupling + sync-bug source for `offline-sync`.
- A reactive `computed` gives free memoization in the view; UI is never stale.

### Edge cases (each MUST have a unit test)

| # | Case | Expected |
|---|---|---|
| 1 | Empty recipe (no ingredients) | `costoTotal = 0`, `costoPorUnidad = 0`, `ingredientes = []` |
| 2 | Missing materia prima (FK prevents, but defensive) | line: `{ materiaPrima: null, subtotal: 0, advertencia: 'MATERIA_PRIMA_FALTANTE' }`; `RecetaDetalleView` shows yellow `v-alert` |
| 3 | Unit mismatch (e.g. recipe "1 kg", materia prima in 'g') | Calculator trusts the numeric value; `SelectorMateriaPrima` shows the unit beside the name |
| 4 | `rendimiento_unidades = 0` | `costoPorUnidad = 0` (no division by zero). Form blocks zero, but calc is defensive. |
| 5 | Floating-point noise (e.g. 0.1 + 0.2) | `redondearCentavos` uses `Math.round(x * 100 + Number.EPSILON) / 100` once at the end (NOT per-line). |
| 6 | 20+ ingredient lines | Single sum-then-round avoids per-line drift. Per-line `subtotal` is float; totals are cents. |

### Rounding policy

- 2 decimals for `costoTotal` and `costoPorUnidad` (USD cents).
- 4-decimal `numeric(10,4)` storage preserves precision; rounding happens at display time.
- `redondearParaMermas` exists for future `planning`-slice use but is NOT wired into the v1 calculator.

---

## 9. Offline Strategy (online-only in catalog)

### Behavior

- **Reads**: store fetches from Supabase on mount. If unreachable, `error.value = 'Sin conexión...'`. No fallback to localforage.
- **Writes**: store calls Supabase directly. On failure, surfaces a toast: "No se pudo guardar — sin conexión. Reintentá cuando vuelvas a estar en línea." Change is rejected (NOT queued).
- **Catalog-internal use of localforage**: NONE in v1. `IStorageService` is in the dependency tree but the catalog store / service pair never calls it.

### Why deferred

- Brief's offline promise is Phase 5 (item 20), explicitly deferred by foundation (`docs/offline-sync.md` documents the WAL + queue architecture but ships no implementation).
- A partial offline-cache in catalog invites stale reads, inconsistent ordering, and "what is the source of truth?" questions.
- The `offline-sync` slice is the integration point: `ingredients.service.ts`'s `crear(...)` becomes "1. push to localforage WAL, 2. push to Supabase, 3. on Supabase failure, leave in queue and surface as 'pending'". **Zero changes** to store, composable, view, or component are required when this swap happens.

---

## 10. Database Setup Workflow

### One-time manual steps (documented in `docs/catalog-setup.md`)

1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste `supabase/migrations/20260616120000_catalog_inicial.sql` → Run. Idempotent.
3. Paste `supabase/seed.sql` → Run. Idempotent (`ON CONFLICT DO NOTHING`).
4. Paste `supabase/dev_bypass_rls.sql` (dev-only) → Run. Grants anon role table access.
5. Restart `pnpm dev`. The Vite app now reads + writes through the anon key.

### `dev_bypass_rls.sql` lifecycle

- **Present**: in catalog dev to make the app functional without `auth-flow` having shipped.
- **Marker**: file header comment is loud about being dev-only.
- **Removal**: the `auth-flow` slice's PR removes it as part of the auth wiring.

### Why no `supabase` CLI

- Not installed; `supabase login` + `supabase link` are interactive.
- The migration must exist in the user's Supabase project BEFORE `supabase gen types` can run — chicken-and-egg with CI.
- SQL checked into git + manual run via Dashboard is the lowest-friction path for a single-user app.

---

## 11. Type Strategy

### Catalog: hand-rolled `Database`

Replace the `Record<string, never>` stub in `src/types/database.types.ts` with a hand-rolled, hand-checked `Database` interface that mirrors the migration SQL exactly:

```ts
export interface Database {
  public: {
    Tables: {
      materias_primas: {
        Row:       { id: string; nombre: string; unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'; costo_por_unidad: number; notas: string | null; created_at: string; updated_at: string }
        Insert:    { id?: string; nombre: string; unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'; costo_por_unidad: number; notas?: string | null; created_at?: string; updated_at?: string }
        Update:    Partial<Database['public']['Tables']['materias_primas']['Insert']>
        Relationships: []
      }
      // ... recetas, receta_ingredientes — same shape
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
```

The interface is short (3 tables, no functions, no views, no enums). A header comment block explains the regeneration command:

```ts
// TO REGENERATE FROM SUPABASE (deferred to CI slice):
// npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts
```

`pnpm typecheck` MUST pass. `pnpm test` covers at least one `supabase.from('materias_primas')` integration test to catch column-name mismatches at runtime.

### Long-term

Add `gen:types` npm script + prebuild hook in the CI slice. For catalog: hand-rolled + TODO marker.

---

## 12. Test Strategy (strict TDD — RED-GREEN-REFACTOR)

### Forecast: ~60 tests

| Layer | Count | Examples |
|---|---|---|
| Unit (no Vue / Pinia / Supabase) | ~15 | `useCalculoReceta.spec.ts`: happy path + 6 edge cases. `moneda.spec.ts`: rounding edge cases. `format.spec.ts`: unit rendering. |
| Integration (services + Pinia + mocked Supabase) | ~20 | `ingredients.service.spec.ts` + `recipes.service.spec.ts` + 2 store specs (real Pinia, mocked supabase via the chainable mock). |
| Component (`mount` + real Pinia + real Vuetify + mocked service) | ~25 | 3 form specs, 1 list-item spec, 1 breakdown spec, 3 view specs, 1 routes spec. |
| **Total** | **~60** | Foundation adds 4 → cumulative ~64. `pnpm test` runtime target ≤5 s. |

### Chainable Supabase mock pattern (added to `tests/setup.ts`)

```ts
function crearSupabaseMock() {
  const llamadas: { metodo: string; args: unknown[] }[] = []
  const respuesta = { data: [], error: null }
  const builder: any = {
    from: (tabla: string) => { llamadas.push({ metodo: 'from', args: [tabla] }); return builder },
    select: (...args) => { llamadas.push({ metodo: 'select', args }); return builder },
    insert: (...args) => { llamadas.push({ metodo: 'insert', args }); return builder },
    update: (...args) => { llamadas.push({ metodo: 'update', args }); return builder },
    delete: (...args) => { llamadas.push({ metodo: 'delete', args }); return builder },
    eq: (...args) => { llamadas.push({ metodo: 'eq', args }); return builder },
    single: async () => respuesta,
    maybeSingle: async () => respuesta,
    then: (resolve: (v: unknown) => void) => resolve(respuesta),
  }
  return { supabase: builder, llamadas }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => crearSupabaseMock().supabase }))
```

A `__resetSupabaseMock()` helper is exported so each test starts from a clean call log.

### TDD discipline

- For every new file, the spec file is the **first commit of the PR**, the implementation is the second commit.
- PR reviewer's diff shows: (1) failing test, (2) passing implementation.
- `pnpm test` MUST be in the verify gate (added to `openspec/config.yaml` in PR1 — see §14).

---

## 13. Delivery Plan (4 chained PRs, stacked-to-main)

`chain_strategy`: stacked-to-main (matches foundation). `delivery_strategy`: ask-always (preflight default). Total forecast: ~2,085 lines — exceeds 400-line budget; chained PRs are MANDATORY.

| PR | Scope | Approx lines | Budget risk |
|---|---|---|---|
| **PR1 — Schema + foundation of catalog** | SQL migration + seed + `dev_bypass_rls.sql` + `docs/catalog-setup.md` + hand-rolled `Database` types + `catalog.types.ts` + `moneda.ts` + `format.ts` modification + `useCalculoReceta.ts` (composable + pure function) + `tests/setup.ts` supabase mock + 4 specs (useCalculoReceta, moneda, format, supabase mock). **Also includes `openspec/config.yaml` flip** (see §14). | ~450 | Medium (just over — `sdd-tasks` may need an F2 split here) |
| **PR2 — Materias Primas domain** | `ingredients.service.ts` + `ingredients.store.ts` + `useIngredients.ts` + `MateriaPrimaForm.vue` + `MateriaPrimaListItem.vue` + `MateriasPrimasView.vue` + 5 specs (service, store, form, list-item, view). | ~470 | Medium |
| **PR3 — Recetas domain + cost breakdown** | `recipes.service.ts` + `recipes.store.ts` + `useRecipes.ts` + `SelectorMateriaPrima.vue` + `RecetaForm.vue` + `RecetaCostoDesglose.vue` + `RecetasView.vue` + `RecetaDetalleView.vue` + 6 specs. **Likely needs F2 split** into PR3a (service+store+views) and PR3b (forms+breakdown component) — `sdd-tasks` decides. | ~580 (raw) / ~300 + ~300 (split) | High raw / Medium split |
| **PR4 — Wire-up + config + docs + verify** | Router modifications (3 lazy routes) + `routes.spec.ts` + `openspec/config.yaml` `test_command` + `apply.tdd: true` + final `verify-report.md`. | ~85 | Low |

**`sdd-tasks` MUST**:
- Structure PR1 / PR2 to stay under 400 lines.
- Proactively apply the F2 split to PR3 (matches the foundation precedent where an F2 split saved reviewer time even when the line count was borderline).

**Per-PR acceptance**: each PR has a clear start, clear finish, autonomous scope, verification (`pnpm typecheck && pnpm lint && pnpm test`), and reasonable rollback (`git revert <sha>` or `git reset --hard HEAD~1` before push).

---

## 14. Config Drift (action required in PR1)

`openspec/config.yaml` currently has:

```yaml
apply:
  tdd: false                    # ← DRIFT
  test_command: ""              # ← DRIFT (must be "pnpm test")

testing:
  strict_tdd: false             # ← DRIFT (engram says ENABLED)
  runner: none                  # ← DRIFT (foundation installed vitest)
  framework: none               # ← DRIFT (foundation installed vitest + @vue/test-utils)
```

But the foundation archive report and engram observation `sdd/kilo-lima/testing-capabilities` both confirm `strict_tdd: ENABLED`, `pnpm test` exits 0 with 4 passing tests, and Vitest 2.1 + @vue/test-utils 2.4 are installed.

**Resolution (committed in PR1's first commit, BEFORE the catalog work)**:
- `testing.strict_tdd: true`
- `apply.tdd: true`
- `apply.test_command: "pnpm test"`
- `verify.test_command: "pnpm test"`
- `verify.build_command: "pnpm build"`
- `testing.runner: vitest`
- `testing.framework: vitest + @vue/test-utils`

**Why PR1 not a separate chore**: the config flip is a precondition for the catalog test strategy to function correctly. Bundling it into PR1 means the catalog work ships with a coherent config from day one. **The orchestrator must NOT let any catalog work start before this flip is committed.**

---

## 15. Risks (from exploration, prioritized)

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Config drift** — `openspec/config.yaml` still has `strict_tdd: false`; gates reading the YAML will silently re-disable TDD | High | PR1 first commit flips both YAML fields to `true` (see §14). |
| 2 | **Hand-rolled `Database` drift** — SQL has 3 tables, ~17 columns, 5 indexes, 3 RLS policies; a typo breaks the whole slice | Medium | `pnpm typecheck` must pass AND `pnpm test` covers at least one `supabase.from('materias_primas')` integration test. |
| 3 | **RLS strict in dev** — anon role has no policy; catalog will not work over the anon key without the bypass | Medium | `dev_bypass_rls.sql` ships in PR1 with a loud dev-only header comment; `auth-flow` slice removes it. |
| 4 | **`costoPorReceta` not reactive across stores** — `recipes.store.costoPorReceta(id)` depends on `ingredients.store.materiasPrimas` | Low | The getter reads `useIngredientsStore().materiasPrimas` inside a `computed` so reactivity flows correctly. |
| 5 | **Vuetify `v-data-table` types are loose** (upstream limitation) | Low | Acceptable; the store types are strict; a follow-up can wrap the table in a typed component. |
| 6 | **Cost calculator rounding across many ingredients** — accumulating float noise | Low | `calcularCostoReceta` uses a single `Math.round(sum * 100 + EPSILON) / 100` at the end, NOT per-line. |
| 7 | **400-line review budget** — ~2,085 lines total | High | 4 chained PRs, MANDATORY. PR3 likely needs F2 split (see §13). |
| 8 | **Service-role-key temptation** — anon-key failure tempts a service-role-keyed client | Medium | Documented as a security regression in exploration; the apply phase MUST NOT introduce a service-role-keyed client. The `dev_bypass_rls.sql` path is the right call. |

---

## 16. Gaps from Brief (locked decisions)

| # | Gap | Decision |
|---|---|---|
| 1 | No unit-conversion support (kg ↔ g, l ↔ ml) | Lock to "recipe uses materia prima's native unit". Form tooltip explains. Conversion engine deferred. |
| 2 | No stock / inventory tracking | `stock_actual` is NOT a column. Stock belongs to Phase 3. |
| 3 | No recipe versioning / snapshot semantics | v1 shows current price only; flag in spec's "Out of Scope". |
| 4 | No multi-recipe yield | `rendimiento_unidades` is a single number. |
| 5 | No export / print | Out of scope; `reports` slice owns jsPDF. |
| 6 | No bulk import | Out of scope; seed covers the demo. |
| 7 | No image attachment | Out of scope; Supabase Storage available later. |
| 8 | No `costo_por_unidad` history | v1 shows current price; flag in spec's "Out of Scope". |

---

## 17. Acceptance Criteria (checkable list — "done" for catalog)

- [ ] All 4 chained PRs merged to `main`, in order, stacked.
- [ ] `pnpm install` completes without peer-dep errors.
- [ ] `pnpm dev` renders the home view AND `/materias-primas`, `/recetas`, `/recetas/:id`.
- [ ] `pnpm typecheck` passes with `strict: true`.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` runs ~60 tests (foundation 4 + catalog ~60) and ALL pass. `__resetSupabaseMock()` is exported from `tests/setup.ts`.
- [ ] `pnpm build` produces `dist/` with PWA artifacts.
- [ ] The migration SQL + seed + `dev_bypass_rls.sql` run successfully in a fresh Supabase project via the Dashboard SQL editor.
- [ ] CRUD lifecycle works end-to-end on a fresh project: create a materia prima → create a receta using it → see the cost breakdown → edit and see the breakdown recompute.
- [ ] Friendly error messages on Supabase failures (toast in Spanish).
- [ ] `dev_bypass_rls.sql` has a loud dev-only header comment naming the `auth-flow` slice as its removal point.
- [ ] **Config drift reconciled**: `openspec/config.yaml` has `testing.strict_tdd: true`, `apply.tdd: true`, `apply.test_command: "pnpm test"`, `verify.test_command: "pnpm test"`.
- [ ] All `.vue` files ≤ 200 lines; all functions ≤ 30 lines.
- [ ] All comments are "why" only, never "what".
- [ ] Spanish identifiers for business terms; English for infrastructure.
- [ ] All UI text in Spanish.
- [ ] No Options API, no Vuex, no Axios, no Bootstrap, no jQuery.
- [ ] No new entries in `package.json` (verifiable via `git diff main -- package.json`).
- [ ] `src/types/database.types.ts` has a hand-rolled `Database` interface and a TODO comment block explaining CLI regeneration.
- [ ] No `localforage` calls in catalog code (`grep -r storageService src/{services,stores,composables,views,components}/` returns no catalog-specific hits).
- [ ] No `costo_total` column on `recetas`.
- [ ] Total PR diff budget honored via chained PRs.

---

## 18. Non-Goals (scope-creep guard)

- No login UI, no sign-up, no password recovery, no session UI.
- No multi-user support.
- No stock / inventory column.
- No unit-conversion engine.
- No recipe versioning or price history.
- No multi-recipe yield modelling.
- No export to PDF.
- No bulk import (CSV / Excel).
- No image attachments.
- No offline sync, no queue, no custom service worker `sync` handler.
- No merma surcharge in v1 (`redondearParaMermas` ships as utility but is not wired).
- No CI/CD, no Playwright, no `supabase` CLI, no Docker.
- No i18n (Spanish hardcoded).
- No dark theme.
- No `gen:types` prebuild hook.
- No service-role-keyed Supabase client.

---

## 19. Future Work (depends on catalog)

| Slice | What it consumes from catalog | What it adds |
|---|---|---|
| **`auth-flow`** | RLS-enabled tables, `dev_bypass_rls.sql` to remove, `useAuth` stub to fill in | Login UI, Supabase Auth wiring, real session, removal of dev bypass |
| **`offline-sync`** | Service factory pattern (`crearIngredientsService(supabase)`), `IStorageService` LSP | WAL in localforage, `sync.queue.store.ts`, `sync.service.ts`, custom SW `sync` handler, `useSyncStatus` |
| **`events`** (Phase 3, item 10) | Recetas + materias primas | `Event` table, evento CRUD, integration with recetas |
| **`planning`** (Phase 3, items 11-13) | `recetas`, `rendimiento_unidades`, cost calculator, `redondearParaMermas` | Fixed costs per event, production planning, merma toggle UI, total cost projection |
| **`pos`** (Phase 4, items 14-17) | Recetas, cost breakdown | Sales grid, cart, daily close, unexpected expenses |
| **`analytics`** (Phase 5, items 18-19) | Cost breakdown | Dashboard with chart.js + vue-chartjs |
| **`reports`** (Phase 5, items 18-19) | Recetas, cost breakdown | PDF export with jsPDF |
| **`ci-setup`** | `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm build` | GitHub Actions workflow, `supabase` CLI install, `gen:types` prebuild hook |

---

## 20. References

- **`brief.md`** — source PRD (locked, 469 lines). §7 Phase 2 items 6–9 define catalog scope.
- **`openspec/changes/catalog/exploration.md`** — exploration artifact. **Every locked decision above is sourced from this file** — read it before questioning a decision.
- **`openspec/changes/archive/2026-06-16-foundation/`** — foundation proposal/spec/design/tasks/archive-report (the patterns catalog follows).
- **`openspec/specs/foundation/spec.md`** — source of truth for the foundation API surface that catalog inherits.
- **`openspec/config.yaml`** — project SDD config (see §14 Config drift).
- **Engram observations**:
  - `sdd/foundation/explore`, `sdd/foundation/proposal`, `sdd/foundation/design`, `sdd/foundation/spec`, `sdd/foundation/tasks`, `sdd/foundation/apply-progress`, `sdd/foundation/archive-report` — full foundation context.
  - `sdd/kilo-lima/testing-capabilities` — strict TDD ENABLED (conflicts with current YAML, see §14).
  - `conventions/kilo-lima` — locked naming conventions, file structure, line limits.
  - `sdd/catalog/explore` — exploration summary for cross-session recovery.
- **Skill files**:
  - `~/.config/opencode/skills/sdd-propose/SKILL.md` — this phase.
  - `~/.config/opencode/skills/sdd-spec/SKILL.md` — next phase (reads this proposal's Capabilities).
  - `~/.config/opencode/skills/sdd-design/SKILL.md` — next phase (reads this proposal's Approach + Data Model).
  - `~/.config/opencode/skills/sdd-tasks/SKILL.md` — next phase (refines the PR split in §13).
  - `~/.config/opencode/skills/chained-pr/SKILL.md` — chained-PR strategy.
  - `~/.config/opencode/skills/work-unit-commits/SKILL.md` — commit splitting for the chained PRs.
  - `~/.config/opencode/skills/judgment-day/SKILL.md` — dual review of spec + design.

---

## Capabilities (CONTRACT for sdd-spec)

The sdd-spec phase creates delta specs for each capability below. New capabilities → `openspec/changes/catalog/specs/<name>/spec.md`. Modified capabilities → delta spec against `openspec/specs/<name>/spec.md`.

### New Capabilities
- **`catalog-materias-primas`**: CRUD + list + validation for `materias_primas`. Bounded by the 5-unit enum (`kg`, `g`, `l`, `ml`, `unidad`).
- **`catalog-recetas`**: CRUD + list + validation for `recetas` with N `receta_ingredientes` rows joined in a single transaction.
- **`catalog-costo-calculadora`**: Pure function `calcularCostoReceta` + reactive `useCalculoReceta` composable. Edge cases: empty recipe, missing materia prima, unit mismatch (display-only), zero yield, float drift, large N ingredients.
- **`catalog-vista-receta`**: Recipe-detail view rendering the cost breakdown (item 9). Yellow `v-alert` for `MATERIA_PRIMA_FALTANTE` warning.

### Modified Capabilities
- **None.** The foundation spec is untouched. Catalog is purely additive — no foundation requirement is modified.

---

## Rollback Plan

Catalog is 4 chained PRs merged to `main`. Each PR is independently revertable via `git revert <sha>` (if pushed) or `git reset --hard HEAD~1` (if not yet pushed). The `supabase` migration is reversible: the apply phase documents a one-shot `down` SQL (`drop table receta_ingredientes, recetas, materias_primas cascade;`) the user runs manually if needed. The seed and `dev_bypass_rls.sql` are forward-only adds and can be left in place or removed via the Dashboard SQL editor.

---

## Key Learnings

- **Chained PRs are MANDATORY, not optional.** ~2,085 lines for a single change comfortably exceeds the 400-line review budget; foundation's precedent (F2 split for Vuetify plugin in PR2) is the template for preemptive task splits in the catalog tasks phase.
- **Config drift is the #1 risk.** `openspec/config.yaml` still says `strict_tdd: false` despite the foundation archive and engram `sdd/kilo-lima/testing-capabilities` confirming `ENABLED`. The proposal's §14 commits to flipping both YAML fields (`strict_tdd` and `apply.tdd`) in PR1's first commit — before any catalog work lands.
- **The 3-table schema is the integration point for 4 future slices** (auth-flow consumes RLS + bypass, offline-sync consumes the service factory pattern, events + planning consume recetas+materias_primas). The cost-calculator location (composable that exports a pure function) is the second load-bearing decision — Vue's `computed` gives reactive memoization for the view; the pure-function export lets unit tests skip Vue setup entirely.
- **Spanish for domain, English for infra** is honored throughout: `MateriaPrima` (Spanish), `ingredients.service.ts` (English), `redondearCentavos` (Spanish function name, "feriante language"), `src/services/supabase.client.ts` (English). All UI text is Spanish; comments are "why" only.