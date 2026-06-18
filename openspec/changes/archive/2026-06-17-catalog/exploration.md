# Exploration: catalog (Phase 2 — Materias Primas, Recetas, Cost Calculator)

> **Change**: `catalog` | **Phase**: `sdd-explore`
> **Scope** (locked from `brief.md` §7 Phase 2): items 6-9 only
>   6. CRUD de Materias Primas
>   7. CRUD de Recetas
>   8. Calculadora de costos por receta
>   9. Vista de recetas con desglose de costos
> **Foundation status**: ARCHIVED — 54/54 REQ-IDs satisfied, `strict_tdd: ENABLED`
> **Stack baseline** (from `sdd-init/kilo-lima` + `conventions/kilo-lima`):
> Vue 3.5 + Vite 5.4 + TS 5.6 + Vuetify 3.12 + Pinia 3.0 + Vue Router 4.6 +
> Supabase JS 2.108 + localforage 1.10 + Zod 4.4 + Vitest 2.1 + @vue/test-utils 2.4
> **Delivery context**: stacked-to-main, 400-line review budget, chained PRs likely

---

## Current State (foundation invariants the catalog slice must respect)

The foundation slice locked the API surface every later slice depends on. The
catalog slice inherits all of them verbatim:

- **DI entry point** (`src/plugins/services.ts`): `inject('supabase')` returns
  the typed `SupabaseClient<Database>` singleton from
  `src/services/supabase.client.ts`; `inject('storageService')` returns the
  `IStorageService` LSP implementation. Call sites never import the modules
  directly.
- **Store pattern proof** (`src/stores/app.store.ts`): setup-style Pinia, state
  via `ref`, actions as plain functions, return the public surface. Catalog
  follows the same template.
- **Database type stub** (`src/types/database.types.ts`): `Database` interface
  with empty `Tables` / `Views` / `Functions` / `Enums`. The `createClient<Database>`
  in `supabase.client.ts` compiles today because every table call is `any`-ish,
  but the catalog slice needs the real types to flow through `supabase.from(...)`.
- **Routing surface** (`src/router/routes.ts`): one lazy `/` route + catch-all
  redirect. Catalog adds new routes for `/materias-primas` and `/recetas`.
- **Offline primitives** (`src/services/storage.interface.ts`,
  `localforage.client.ts`, `storage.service.ts`): `IStorageService` Spanish-named
  contract is ready. `docs/offline-sync.md` documents the WAL + queue
  architecture that is **deferred** to the `offline-sync` slice.
- **Auth stub** (`src/composables/useAuth.ts`): stubbed composable; throws
  `NO_IMPLEMENTADO` on call. Catalog is single-user and does not need auth to
  work — but the schema MUST be auth-ready (RLS uses `auth.uid()` once the
  `auth-flow` slice lands).
- **Tests setup** (`tests/setup.ts`): matchMedia + ResizeObserver stubs +
  in-memory localforage Map mock. Vuetify is inlined via `server.deps.inline`
  in `vitest.config.ts`. Catalog tests reuse this setup.
- **Vuetify palette** (`src/plugins/vuetify.ts`): light theme only, with
  `accent: '#FF6B35'` for sales and `success: '#4CAF50'` — the cost calculator
  and recipe view use these to color totals.

### Config drift to flag for `sdd-propose`

`openspec/config.yaml` still has `testing.strict_tdd: false` AND
`apply.tdd: false` at the repo root, but the foundation archive report
(`sdd/foundation/archive-report`) and the engram record `sdd/kilo-lima/testing-capabilities`
both confirm `strict_tdd` is ENABLED. **The proposal phase must reconcile this
by flipping both YAML fields to `true` in the same commit that opens the
catalog change**, or every gate that depends on `config.yaml.strict_tdd` will
silently re-disable TDD.

---

## Affected Areas

### New files (catalog slice creates)

| Path | Why it appears |
|------|----------------|
| `supabase/migrations/20260616120000_catalog_inicial.sql` | Schema for `materias_primas`, `recetas`, `receta_ingredientes` + RLS policies + indexes. |
| `supabase/seed.sql` *(optional, recommended)* | 5 sample `materias_primas` + 2 `recetas` for first-run UX. |
| `src/types/catalog.types.ts` | Spanish domain types: `MateriaPrima`, `Receta`, `IngredienteReceta`, `MateriaPrimaInput`, `RecetaInput`, `IngredienteRecetaInput`. |
| `src/types/database.types.ts` *(modified)* | Replace `Record<string, never>` stub with the real generated `Database` interface (or with a hand-rolled, hand-checked version until CLI is added). |
| `src/services/ingredients.service.ts` | Supabase CRUD for `materias_primas`. |
| `src/services/recipes.service.ts` | Supabase CRUD for `recetas` + `receta_ingredientes` (joined). |
| `src/stores/ingredients.store.ts` | Pinia store: `materiasPrimas`, `cargando`, `error`, actions `cargarMateriasPrimas`, `crearMateriaPrima`, `actualizarMateriaPrima`, `eliminarMateriaPrima`. |
| `src/stores/recipes.store.ts` | Pinia store: same shape for `recetas`; plus a derived `costoPorReceta(id)` getter. |
| `src/composables/useIngredients.ts` | View-layer wrapper around the store. |
| `src/composables/useRecipes.ts` | View-layer wrapper around the store + calculator. |
| `src/composables/useCalculoReceta.ts` | Pure cost-calculator composable (also exported as a plain function so unit tests bypass the reactive wrapper). |
| `src/utils/moneda.ts` | Number-rounding helpers used by the calculator (`redondear centavos`, `redondear hacia arriba para mermas`). |
| `src/views/MateriasPrimasView.vue` | List + form for CRUD. |
| `src/views/RecetasView.vue` | List + form for CRUD. |
| `src/views/RecetaDetalleView.vue` | Single recipe view with cost breakdown (item 9). |
| `src/components/business/MateriaPrimaForm.vue` | Form for create/edit. |
| `src/components/business/MateriaPrimaListItem.vue` | Row in the list. |
| `src/components/business/RecetaForm.vue` | Form for create/edit (ingredient picker). |
| `src/components/business/RecetaCostoDesglose.vue` | The cost-breakdown card (item 9's centerpiece). |
| `src/components/business/SelectorMateriaPrima.vue` | Autocomplete for picking a `materia_prima` in a recipe. |
| `src/router/routes.ts` *(modified)* | Append `/materias-primas`, `/recetas`, `/recetas/:id` lazy routes. |
| `src/router/routes.spec.ts` | Route registry test (matches the foundation HomeView spec pattern). |
| `src/services/ingredients.service.spec.ts` | Unit test for the service (with vi.mock of `@supabase/supabase-js`). |
| `src/services/recipes.service.spec.ts` | Unit test for the recipe service. |
| `src/composables/useCalculoReceta.spec.ts` | Pure-logic tests for the calculator (happy path + edge cases). |
| `src/stores/ingredients.store.spec.ts` | Pinia store test (mock service, real Pinia). |
| `src/stores/recipes.store.spec.ts` | Pinia store test. |
| `src/views/MateriasPrimasView.spec.ts` | Component test (mount, fill form, assert list updates). |
| `src/views/RecetasView.spec.ts` | Component test. |
| `src/views/RecetaDetalleView.spec.ts` | Component test for the cost breakdown. |

### Modified files

- `src/router/routes.ts` — new lazy routes.
- `src/types/database.types.ts` — replace stub with real types.
- `src/types/index.ts` — re-export catalog types.
- `openspec/config.yaml` — flip `strict_tdd: true`, `apply.tdd: true`, add
  `test_command: "pnpm test"`, add `verify.test_command: "pnpm test"`.
- `tests/setup.ts` — extend the supabase mock helper (the localforage Map mock
  is reusable as-is; new helper goes beside it).
- `package.json` — none expected (Supabase + Vitest + test-utils all in place).
  Optional dev dep: `supabase` CLI for the type-generation precommit (see §6).

### Untouched foundation files (proof that catalog is additive)

`App.vue`, `main.ts`, `App.spec.ts`, `App.vue`, `App.spec.ts`,
`utils/env.ts`, `utils/format.ts`, `plugins/vuetify.ts`, `plugins/services.ts`,
`services/supabase.client.ts`, `services/localforage.client.ts`,
`services/storage.interface.ts`, `services/storage.service.ts`,
`composables/useAuth.ts`, `composables/useOnlineStatus.ts`,
`composables/usePwaUpdate.ts`, `stores/app.store.ts`, `views/HomeView.vue`,
`views/HomeView.spec.ts` — all stay as-is. The catalog slice is a pure
**additive** layer on top of the foundation's frozen API surface.

---

## Data Model (Supabase schema proposal)

All three tables use the convention: `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
This is the standard Supabase pattern and matches what the generated
`Database` interface will produce.

### `public.materias_primas`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `nombre` | `text` | NOT NULL, CHECK `length(nombre) > 0` | Spanish display name. |
| `unidad` | `text` | NOT NULL, CHECK `unidad in ('kg','g','l','ml','unidad')` | Locked enum — solo 5 unidades (KISS). |
| `costo_por_unidad` | `numeric(10,4)` | NOT NULL, CHECK `costo_por_unidad >= 0` | USD, 4 decimals so unit-conversion stays sane. |
| `notas` | `text` | NULL | Optional. Free text. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | Trigger updates on UPDATE. |

**Indexes**:
- `idx_materias_primas_nombre_lower` on `(lower(nombre))` — supports the
  typeahead search in `SelectorMateriaPrima`.
- `idx_materias_primas_created_at` on `(created_at desc)` — supports the
  default "most recent first" list ordering.

**Why `numeric(10,4)`**: 4 decimals is enough precision for USD per
gram / per millilitre without going to arbitrary precision. The 10-digit
total cap covers realistic costs (e.g. $999,999.9999 per kg).

### `public.recetas`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `nombre` | `text` | NOT NULL, CHECK `length(nombre) > 0` | |
| `descripcion` | `text` | NULL | Optional. |
| `rendimiento_unidades` | `numeric(10,4)` | NOT NULL, CHECK `> 0` | How many units this recipe yields. Brief calls it "producción" — a `Receta` is a *batch* with a yield. |
| `notas` | `text` | NULL | Optional. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | |

**Indexes**:
- `idx_recetas_nombre_lower` on `(lower(nombre))` — list search.
- `idx_recetas_created_at` on `(created_at desc)` — default ordering.

**Note on `costo_total`**: a *denormalized* `costo_total numeric(10,4)` column
is **intentionally NOT** in the schema. The cost is computed at read time
from `receta_ingredientes` joined with `materias_primas.costo_por_unidad`.
This avoids stale data when an ingredient's price changes, and it removes a
class of sync bugs the offline-sync slice would otherwise need to reconcile.
A materialised view is overkill for a single-user, < 10k-row table.

### `public.receta_ingredientes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `receta_id` | `uuid` | NOT NULL, FK → `recetas(id) ON DELETE CASCADE` | Cascade: deleting a receta removes its ingredients. |
| `materia_prima_id` | `uuid` | NOT NULL, FK → `materias_primas(id) ON DELETE RESTRICT` | RESTRICT: cannot delete a materia prima that is referenced. (See edge case in §3.) |
| `cantidad` | `numeric(12,6)` | NOT NULL, CHECK `cantidad > 0` | Amount in the ingredient's own `unidad`. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Foreign keys**:
- `receta_ingredientes_receta_id_fkey`: `receta_id` → `recetas.id` (CASCADE on delete).
- `receta_ingredientes_materia_prima_id_fkey`: `materia_prima_id` → `materias_primas.id` (RESTRICT on delete).

**Indexes**:
- `idx_receta_ingredientes_receta_id` on `(receta_id)` — primary access path
  for "load all ingredients for a recipe" (the cost calculator's hot path).
- `idx_receta_ingredientes_materia_prima_id` on `(materia_prima_id)` — for the
  reverse lookup "which recipes use this materia prima?" (used in the
  "no se puede eliminar" error message and in the analytics slice later).
- `uq_receta_ingredientes_receta_materia` UNIQUE on `(receta_id, materia_prima_id)` —
  a recipe cannot list the same materia prima twice. UX in the form prevents
  duplicates client-side, but the constraint is the source of truth.

### RLS policies (single-user, auth-ready)

```sql
-- All three tables: enable RLS
alter table public.materias_primas enable row level security;
alter table public.recetas enable row level security;
alter table public.receta_ingredientes enable row level security;

-- Permissive policies: every authenticated user can do everything.
-- The brief is "single user", but auth.uid() is referenced so the policies
-- stay correct when the auth-flow slice wires real Supabase Auth.
create policy "materias_primas_select_authenticated"
  on public.materias_primas for select
  to authenticated using (true);

create policy "materias_primas_write_authenticated"
  on public.materias_primas for all
  to authenticated using (true) with check (true);

-- Same shape for recetas + receta_ingredientes
```

**Anonym role is NOT granted access.** The Vite app uses the anon key to
authenticate, but unauthenticated requests are rejected at the policy layer.
This is correct for the brief's single-user model where the `auth-flow` slice
will gate everything behind email/password.

### Migration order and atomicity

Single migration file `20260616120000_catalog_inicial.sql` containing:
1. Extension (`pgcrypto` for `gen_random_uuid()` — Supabase has it pre-installed
   on pgsql 13+, but the CREATE is idempotent and self-documenting).
2. `materias_primas` table + indexes + RLS.
3. `recetas` table + indexes + RLS.
4. `receta_ingredientes` table + indexes + RLS.
5. `updated_at` trigger function reused for all three tables.
6. Seed insert (idempotent, wrapped in `ON CONFLICT DO NOTHING`).

**Why single file**: catalog is one logical change. Splitting it across
migrations is premature; the offline-sync slice can add a new migration
later if it needs to alter the schema.

---

## CRUD Patterns (mapping to foundation's stack)

### Service layer

Each service module exposes pure async functions. The service consumes the
supabase client via DI (`inject('supabase')`) — never imports the singleton
directly. This keeps the test setup symmetric with the foundation's pattern.

```ts
// src/services/ingredients.service.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, MateriaPrima, MateriaPrimaInput } from '@/types'

export function crearIngredientsService(supabase: SupabaseClient<Database>) {
  return {
    async listar(): Promise<MateriaPrima[]> { /* ... */ },
    async crear(input: MateriaPrimaInput): Promise<MateriaPrima> { /* ... */ },
    async actualizar(id: string, cambios: Partial<MateriaPrimaInput>): Promise<MateriaPrima> { /* ... */ },
    async eliminar(id: string): Promise<void> { /* ... */ },
  }
}

export type IngredientsService = ReturnType<typeof crearIngredientsService>
```

**Why a factory** instead of a module-level const: tests can construct a
service with a mocked supabase client. The factory takes the client as a
parameter; the store does the `inject` and passes the resolved value in.
This is the same DIP pattern as the foundation's `storageService` and
`supabase` providers.

**Error surface**: services throw on failure with a normalized
`ServiceError` (custom class with `code: 'NOT_FOUND' | 'CONFLICT' | 'UNKNOWN'`).
Pinia stores catch and re-throw into a `Ref<string | null>` `error` ref
the views can render. The foundation's `env.ts` proves ZodError-throwing
is the right pattern; services follow the same fail-fast-but-friendly style.

### Pinia store

```ts
// src/stores/ingredients.store.ts
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { inject } from 'vue'
import { crearIngredientsService } from '@/services/ingredients.service'

export const useIngredientsStore = defineStore('ingredients', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')!
  const servicio = crearIngredientsService(supabase)

  const materiasPrimas = ref<MateriaPrima[]>([])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  async function cargarMateriasPrimas() { /* ... */ }
  async function crearMateriaPrima(input: MateriaPrimaInput) { /* ... */ }
  async function actualizarMateriaPrima(id: string, cambios: Partial<MateriaPrimaInput>) { /* ... */ }
  async function eliminarMateriaPrima(id: string) { /* ... */ }

  return { materiasPrimas, cargando, error, /* actions */ }
})
```

`recipes.store.ts` mirrors this shape but additionally exposes a derived
`costoPorReceta(id)` computed that calls `useCalculoReceta` (see §3). The
derived getter means views never import the composable directly — they
just read `store.costoPorReceta(id)`.

### Composable layer (view → store)

```ts
// src/composables/useIngredients.ts
import { storeToRefs } from 'pinia'
import { useIngredientsStore } from '@/stores/ingredients.store'

export function useIngredients() {
  const store = useIngredientsStore()
  const { materiasPrimas, cargando, error } = storeToRefs(store)
  return {
    materiasPrimas,
    cargando,
    error,
    cargar: store.cargarMateriasPrimas,
    crear: store.crearMateriaPrima,
    actualizar: store.actualizarMateriaPrima,
    eliminar: store.eliminarMateriaPrima,
  }
}
```

The composable is a thin wrapper that exposes `storeToRefs` for the view.
The brief calls this pattern "container / presentational"; the composable
is the container and the `.vue` file is the presentational layer.

### View layer

`MateriasPrimasView.vue` mounts with `useIngredients()`, renders a
`v-data-table` (Vuetify) bound to `materiasPrimas`, and includes
`MateriaPrimaForm.vue` inside a `v-dialog` for create / edit. The form
emits `submit` with the typed input; the view calls `store.crear(...)`.
`RecetasView.vue` and `RecetaDetalleView.vue` follow the same shape with
the recipe domain.

**Strict TDD reality**: every one of these files is preceded by a spec file
(`.spec.ts`) that fails first, then passes after the implementation lands.
The foundation's 4-test pattern (`App.spec.ts`, `HomeView.spec.ts`) is the
template.

---

## Cost Calculator

### Pure utility + thin composable

The calculation lives in **two places by design**:

1. `src/utils/moneda.ts` — pure rounding helpers (e.g. `redondearCentavos`,
   `redondearParaMermas`). These are 100% pure functions with no Vue / Pinia
   dependencies and are unit-tested in isolation.
2. `src/composables/useCalculoReceta.ts` — composable that takes a
   `Receta` plus a `Ref<MateriaPrima[]>` and returns a `ComputedRef<CalculoReceta>`
   where `CalculoReceta = { ingredientes: LineaCalculo[], costoTotal: number,
   costoPorUnidad: number }`. The composable uses Vue's `computed` for
   memoization so re-renders are cheap.

```ts
// Pure function form (also exported) — used by the unit test
export function calcularCostoReceta(
  receta: Receta,
  materiasPrimas: MateriaPrima[],
): CalculoReceta {
  const mapa = new Map(materiasPrimas.map(mp => [mp.id, mp]))
  const lineas: LineaCalculo[] = receta.ingredientes.map(ing => {
    const mp = mapa.get(ing.materia_prima_id)
    if (!mp) {
      // Edge case: materia prima was deleted (RESTRICT should prevent, but
      // be defensive in the calc). Skip the line and surface in the UI.
      return { ingrediente: ing, materiaPrima: null, subtotal: 0, advertencia: 'MATERIA_PRIMA_FALTANTE' }
    }
    return {
      ingrediente: ing,
      materiaPrima: mp,
      subtotal: redondearCentavos(ing.cantidad * mp.costo_por_unidad),
    }
  })
  const costoTotal = redondearCentavos(lineas.reduce((acc, l) => acc + l.subtotal, 0))
  const costoPorUnidad = receta.rendimiento_unidades > 0
    ? redondearCentavos(costoTotal / receta.rendimiento_unidades)
    : 0
  return { ingredientes: lineas, costoTotal, costoPorUnidad }
}
```

### Pre-calculated vs. computed on the fly

**Computed on the fly.** Rationale:
- Single-user, < 10k rows. The query is O(N) ingredients per recipe and
  returns in <5 ms — there is no performance justification for caching.
- The pre-calculated column would need a trigger to update whenever
  `materias_primas.costo_por_unidad` changes. That is a hidden coupling
  and a sync-bug source for the offline-sync slice.
- A denormalised `costo_total` on `recetas` invites UI bugs ("why is the
  total stale?") that the reactive composable eliminates by definition.

### Edge cases (unit tests required for each)

1. **Empty recipe** (no ingredients): `costoTotal = 0`, `costoPorUnidad = 0`,
   `ingredientes = []`. The form blocks "save with zero ingredients" but the
   calculator must be defensive.
2. **Missing materia prima** (FK should prevent, but defensive): line gets
   `materiaPrima: null`, `subtotal: 0`, `advertencia: 'MATERIA_PRIMA_FALTANTE'`,
   and `RecetaDetalleView` renders a yellow `v-alert` "Esta receta usa una
   materia prima que ya no existe. Editá la receta para corregirla."
3. **Unit mismatch** (e.g. recipe says 1 kg but materia prima is in 'g'):
   the schema stores `cantidad` in the **materia prima's** unit, not the
   recipe's. The form's `SelectorMateriaPrima` shows the unit beside the
   name so the user sees the unit context. The calculator trusts the
   numeric value. This keeps the schema simple at the cost of trusting
   the UI — acceptable for a single-user app.
4. **`rendimiento_unidades = 0`**: guarded `costoPorUnidad = 0`. The form
   blocks zero, but the calculator must not divide by zero.
5. **Rounding policy**: 2 decimal places for `costoTotal` and `costoPorUnidad`
   (USD cents). The 4-decimal `numeric(10,4)` storage preserves precision;
   rounding happens at display time. `redondearCentavos` uses
   `Math.round(x * 100) / 100` with a `Number.EPSILON` adjustment to avoid
   `0.1 + 0.2 = 0.30000000000000004` artifacts.
6. **Merma surcharge** (business rationale: brief says production loses ~5%
   of input material): implemented as an OPTIONAL toggle in `RecetaForm`
   that multiplies `costoPorUnidad` by 1.05. **NOT** in the v1 calculator —
   the brief's cost calculator (§8) is a pure sum, not a margin calculation.
   `RecetaDetalleView` shows the raw total; the merma toggle is a separate
   task for the `planning` slice (Phase 3, item 12).

### Location recommendation

**Composable that exposes a pure-function form.** Concretely:

- `useCalculoReceta(receta, materiasPrimas)` returns `ComputedRef<CalculoReceta>`.
- The pure function `calcularCostoReceta(receta, materiasPrimas)` is also
  exported from the same file so unit tests can call it without `vue` setup.
- `recipes.store.ts` uses the pure function in a `computed` getter to expose
  `costoPorReceta(id)`.

This dual export matches the foundation's `formatearUSD` (single-purpose
utility) and `useAuth` (composable with surface contract) pattern.

---

## Database Setup

### Method: SQL migration checked into `supabase/migrations/`

- The repo has **no `supabase/` folder yet** and **no Supabase CLI installed**.
  Installing the CLI and running `supabase init` is out of scope (foundation
  deferred CI / Docker / supabase-cli to a later slice).
- The user has a real Supabase project (anon key in `.env.local`).
- **Chosen approach**: write a single SQL file checked into
  `supabase/migrations/20260616120000_catalog_inicial.sql`. The user runs
  the file once via the Supabase Dashboard SQL editor (one click, copy
  paste). This is the lowest-friction path for a single-user app and is
  auditable from git.
- The SQL is idempotent (`create table if not exists`, `drop policy if exists`,
  `create policy ...`). Re-running the migration is safe.
- A `supabase/seed.sql` file with 5 sample `materias_primas` (azúcar,
  harina, mantequilla, huevo, chocolate) and 2 sample `recetas` (galleta
  de chocolate, pan básico) is committed alongside the migration. Seed
  is also idempotent (`on conflict do nothing` on `nombre` for `materias_primas`
  and on `(receta_id, materia_prima_id)` for `receta_ingredientes`).
- The apply phase documents the **one-time manual step** in
  `docs/catalog-setup.md` with screenshots-in-prose: "1. Open Supabase
  Dashboard → SQL Editor → New query. 2. Paste the migration. 3. Run. 4.
  Repeat with seed.sql."

### RLS

Permissive for authenticated users (see §Data Model). Anon role gets nothing.
This is forward-compatible with the `auth-flow` slice; until that lands,
the user authenticates manually and we use the `anon` key, but RLS still
rejects the request — the apply phase will need to either (a) use a
service-role key in `.env.local` for catalog dev, (b) bypass RLS with a
temporary `using (true)` policy, or (c) wait for `auth-flow`.

**Recommendation (a)**: keep RLS strict; for the catalog dev environment,
add a `service_role` key to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` and
create a server-side CRUD shim in a future slice. The catalog apply phase
should NOT introduce a service-role-keyed client — that is a security
regression for a PWA. **The right call is (c)**: the catalog slice runs
in "RLS strict" mode but ships a temporary development-time SQL script
(`dev_bypass_rls.sql`) that grants the anon role table access, **clearly
marked as dev-only and removed in the auth-flow slice**.

### Seed script

Yes, `supabase/seed.sql` is recommended. Without it, the first-run UX
("empty list, click + to add") is fine for a developer but poor for a
"floating around the app demo" loop. 5 ingredients + 2 recipes give the
cost calculator something to show.

---

## Type Generation

### Decision: hand-rolled `Database` for the catalog slice, defer the CLI

- The supabase CLI is not installed. Installing it is a one-time step but
  the user has to log in (`supabase login`) and link a project
  (`supabase link`) — these are interactive and out of scope for the
  apply phase.
- `supabase gen types typescript` requires the schema to exist in the
  user's Supabase project. Since the catalog apply phase depends on the
  user running the migration SQL manually, the types cannot be regenerated
  in CI before the schema exists.
- **For the catalog change**: replace the stub `Database` in
  `src/types/database.types.ts` with a hand-rolled, hand-checked
  `Database` interface that mirrors the SQL exactly. The interface is
  short (3 tables, no functions, no views, no enums) and the apply phase
  adds a comment block explaining how to regenerate via the CLI once
  it is installed.
- The apply phase MUST run `pnpm typecheck` to confirm the hand-rolled
  types are correct. If the supabase CLI is added later, the comment
  block tells the next developer to run `pnpm gen:types` to overwrite
  the hand-rolled file.

### Long-term recommendation

Add a `gen:types` npm script and a pre-commit hook in the CI slice
(deferred per foundation archive). For catalog: hand-rolled types, with
a TODO marker pointing to the future CLI command.

---

## Offline Strategy for catalog

### Approach: online-first with localforage read-cache

The brief's offline strategy (`docs/offline-sync.md`) is **explicitly
deferred** to the `offline-sync` slice. The foundation ships the
`IStorageService` primitives, but the sync queue, the WAL, and the
`useSyncStatus` composable are not built. The catalog slice inherits
the same constraint.

**Catalog's offline behaviour (per brief + foundation)**:
- **Reads**: the store fetches from Supabase on mount. If Supabase is
  unreachable, the store surfaces `error.value = 'Sin conexión...'`. No
  fallback to localforage in v1.
- **Writes**: the store optimistically updates the local array and calls
  Supabase. If Supabase is unreachable, the change is **rejected** with
  a toast "No se pudo guardar — sin conexión. Reintentá cuando vuelvas
  a estar en línea." The change is NOT queued. The brief's
  "guardar primero en IndexedDB" promise is the offline-sync slice's
  job, not catalog's.

**Why this is the right call**:
- The brief's offline promise is a Phase 5 (item 20) deliverable, not a
  Phase 2 (catalog) deliverable. The foundation explicitly deferred the
  queue, the sync service, and the custom service worker.
- Building a partial offline-cache in catalog creates a footgun: stale
  reads, inconsistent ordering, and a "what is the source of truth?"
  question. The KISS principle says: do the work in the slice that owns
  it.
- The catalog slice still gets the benefit of `IStorageService` for the
  *future* cache layer — the service factory pattern means
  `ingredientsService.listar()` can be swapped for a localforage-first
  implementation in the offline-sync slice without touching the store
  or the view.

**Catalog-internal use of localforage**: NONE in v1. The store / service
never calls `storageService.guardar(...)`. The dependency exists in
`package.json` and `services/storage.service.ts` is importable, but
catalog code stays in the "online with friendly error" lane.

### Future slice alignment

When the `offline-sync` slice lands, the catalog store / service pair
is exactly the integration point: `ingredients.service.ts`'s `crear(...)`
becomes "1. push to localforage WAL, 2. push to Supabase, 3. on
Supabase failure, leave in queue and surface as 'pending'". No view
or composable changes are required.

---

## Recommended Project Structure

### New files (full inventory)

**Migrations & seed** (3 files):
- `supabase/migrations/20260616120000_catalog_inicial.sql` — schema + RLS + indexes.
- `supabase/seed.sql` — 5 sample `materias_primas` + 2 sample `recetas` + 5
  `receta_ingredientes` lines (idempotent).
- `docs/catalog-setup.md` — user-facing one-time setup instructions.

**Types** (2 files):
- `src/types/catalog.types.ts` — Spanish domain types.
- `src/types/database.types.ts` — *modified*: hand-rolled `Database`.

**Services** (2 files):
- `src/services/ingredients.service.ts` — `crearIngredientsService(supabase)`.
- `src/services/recipes.service.ts` — `crearRecipesService(supabase)`.

**Stores** (2 files):
- `src/stores/ingredients.store.ts` — `useIngredientsStore`.
- `src/stores/recipes.store.ts` — `useRecipesStore` (with `costoPorReceta` getter).

**Composables** (3 files):
- `src/composables/useIngredients.ts` — view-layer wrapper.
- `src/composables/useRecipes.ts` — view-layer wrapper.
- `src/composables/useCalculoReceta.ts` — composable + pure function export.

**Utils** (1 new + 1 modified):
- `src/utils/moneda.ts` — `redondearCentavos`, `redondearParaMermas`.
- `src/utils/format.ts` — *modified*: add `formatearUnidad(cantidad, unidad)`
  helper for "1.5 kg" rendering.

**Components** (4 files):
- `src/components/business/MateriaPrimaForm.vue` — create/edit form.
- `src/components/business/MateriaPrimaListItem.vue` — list row.
- `src/components/business/RecetaForm.vue` — recipe create/edit with
  ingredient picker (multiple `SelectorMateriaPrima` instances).
- `src/components/business/RecetaCostoDesglose.vue` — the cost breakdown card.
- `src/components/business/SelectorMateriaPrima.vue` — autocomplete for picking
  a materia prima inside a recipe form.

**Views** (3 files):
- `src/views/MateriasPrimasView.vue` — list + create/edit dialog.
- `src/views/RecetasView.vue` — list + create/edit dialog.
- `src/views/RecetaDetalleView.vue` — single recipe with cost breakdown (item 9).

**Router** (1 modified):
- `src/router/routes.ts` — append 3 lazy routes.

**Specs** (10 files, written BEFORE the implementation per strict TDD):
- `src/services/ingredients.service.spec.ts`
- `src/services/recipes.service.spec.ts`
- `src/composables/useCalculoReceta.spec.ts`
- `src/stores/ingredients.store.spec.ts`
- `src/stores/recipes.store.spec.ts`
- `src/components/business/MateriaPrimaForm.spec.ts`
- `src/components/business/RecetaForm.spec.ts`
- `src/components/business/RecetaCostoDesglose.spec.ts`
- `src/views/MateriasPrimasView.spec.ts`
- `src/views/RecetasView.spec.ts`
- `src/views/RecetaDetalleView.spec.ts`
- `src/router/routes.spec.ts`

**Config** (1 modified):
- `openspec/config.yaml` — flip `testing.strict_tdd: true`, `apply.tdd: true`.

**Test setup** (1 modified):
- `tests/setup.ts` — add a `vi.mock('@supabase/supabase-js', ...)` factory
  helper. The localforage Map mock is reusable as-is.

**Files NOT created** (explicitly out of scope for this slice):
- `src/stores/sync.queue.store.ts` — `offline-sync` slice.
- `src/services/sync.service.ts` — `offline-sync` slice.
- `src/composables/useSyncStatus.ts` — `offline-sync` slice.
- `custom-sw.ts` — `offline-sync` slice.
- `tests/e2e/*` — Playwright, deferred to CI slice.

---

## Test Strategy (strict TDD = RED-GREEN-REFACTOR)

### Test layers (per foundation conventions)

**Unit tests** — pure functions, no Vue, no Pinia, no Supabase:
- `useCalculoReceta.spec.ts` — happy path + 5 edge cases (empty, missing
  materia prima, unit mismatch display, zero yield, rounding precision,
  merma toggle if implemented in v1).
- `moneda.spec.ts` — `redondearCentavos` happy path + 3 rounding edge cases
  (0.1 + 0.2, 1.005 banker's rounding, very large numbers).
- `format.spec.ts` — `formatearUnidad` happy path + 3 unit labels.

**Integration tests** — services + Pinia + mocked Supabase:
- `ingredients.service.spec.ts` — uses `vi.mock('@supabase/supabase-js')`
  with a chainable mock (`.from().select().eq()`) and asserts the right
  method was called with the right args. 5 tests: list, create, update,
  delete, NOT_FOUND error path.
- `recipes.service.spec.ts` — same shape + a test for the joined insert
  (receta + N ingredientes in a single transaction via a Supabase RPC or
  a `Promise.all`).
- `ingredients.store.spec.ts` — sets up a real `createPinia()`, injects
  a mock supabase + a mock service, and asserts state transitions
  (`materiasPrimas` populated, `cargando` toggles, `error` populates on
  failure).
- `recipes.store.spec.ts` — same shape + `costoPorReceta(id)` getter test.

**Component tests** — `mount` with real Pinia + real Vuetify + mocked service:
- `MateriaPrimaForm.spec.ts` — fill form, submit, assert event payload.
- `RecetaForm.spec.ts` — add 2 ingredients, submit, assert event payload.
- `RecetaCostoDesglose.spec.ts` — render with a fixture `CalculoReceta`,
  assert lines + totals.
- `MateriasPrimasView.spec.ts` — mount, click "Nueva", fill form, submit,
  assert list grows. Click delete, assert confirmation, assert list shrinks.
- `RecetasView.spec.ts` — same shape.
- `RecetaDetalleView.spec.ts` — mount with route param, assert cost breakdown
  renders. Toggle a missing-materia-prima case, assert warning card.

### Supabase mock pattern

The foundation mocks `localforage` in `tests/setup.ts`. The catalog slice
adds a `vi.mock('@supabase/supabase-js')` factory. The factory returns a
chainable builder that records every call:

```ts
// tests/setup.ts (additive)
function crearSupabaseMock() {
  const llamadas: { metodo: string; args: unknown[] }[] = []
  const respuesta = { data: [], error: null }
  const builder: any = {
    from: (tabla: string) => {
      llamadas.push({ metodo: 'from', args: [tabla] })
      return builder
    },
    select: (...args: unknown[]) => { llamadas.push({ metodo: 'select', args }); return builder },
    insert: (...args: unknown[]) => { llamadas.push({ metodo: 'insert', args }); return builder },
    update: (...args: unknown[]) => { llamadas.push({ metodo: 'update', args }); return builder },
    delete: (...args: unknown[]) => { llamadas.push({ metodo: 'delete', args }); return builder },
    eq: (...args: unknown[]) => { llamadas.push({ metodo: 'eq', args }); return builder },
    single: async () => respuesta,
    maybeSingle: async () => respuesta,
    then: (resolve: (v: unknown) => void) => resolve(respuesta),
  }
  return { supabase: builder, llamadas }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => crearSupabaseMock().supabase,
}))
```

A `__resetSupabaseMock()` helper is exported from `tests/setup.ts` so
each test starts from a clean call log.

### Setup file changes

`tests/setup.ts` grows from 54 to ~95 lines. It stays a single setup
file (matching foundation's pattern) and the helper is exportable so
tests can assert against `llamadas`. No second setup file is created.

### Test count forecast

- Unit: ~15 tests
- Integration: ~20 tests
- Component: ~25 tests
- **Total: ~60 tests** (foundation ships 4 → catalog ~60 → cumulative 64).

The `pnpm test` runtime target stays under 5 seconds (the 4 foundation
tests run in <1 s; the 60 new tests should fit in 4 s with jsdom).

### TDD discipline

For every new file, the spec file is committed in the same PR as the
implementation, but the **spec test is the first commit of the PR**. The
PR reviewer's diff shows: (1) failing test, (2) passing implementation.
This matches the foundation's "smoke test lands last" pattern, reversed
for slices with strict TDD: tests land first.

---

## Risks and Gaps

### Risks

1. **Hand-rolled `Database` drift** — the SQL has 3 tables, ~17 columns,
   5 indexes, 3 RLS policies. A typo in either the SQL or the TS interface
   breaks the whole slice. Mitigation: `pnpm typecheck` MUST pass AND
   `pnpm test` MUST cover at least one `supabase.from('materias_primas')`
   integration test to catch column-name mismatches at runtime.

2. **RLS strict in dev** — the catalog slice will not work over the
   anon key if RLS rejects unauthenticated reads. Mitigation: the apply
   phase documents the `dev_bypass_rls.sql` workaround and the
   `auth-flow` slice's PR removes it.

3. **`costoPorReceta` not reactive across stores** — the `recipes.store`
   getter depends on `materias_primas` from `ingredients.store`. A change
   in the ingredients store does NOT trigger a recompute unless
   `recipes.store` reads it through a Pinia getter. Mitigation: the
   `costoPorReceta` getter in `recipes.store.ts` does
   `useIngredientsStore().materiasPrimas` inside a `computed` so reactivity
   flows correctly.

4. **Vuetify `v-data-table` types are loose** — the `v-data-table` slot
   props are typed as `any` upstream, which is a known Vuetify limitation.
   The store types ARE strict; the view's wrapper types ARE loose. This
   is acceptable; a follow-up can wrap the table in a typed `MateriaPrimaTable.vue`
   if the team wants strict end-to-end typing.

5. **Cost calculator rounding across many ingredients** — adding 20 lines
   of `0.005 + 0.005` accumulates ~0.1 of floating-point noise. Mitigation:
   `calcularCostoReceta` uses a single `Math.round(sum * 100) / 100` at
   the end, not per-line. Per-line `subtotal` is a floating-point
   intermediate; only the totals are rounded.

6. **400-line review budget** — the catalog change will very likely
   exceed 400 lines. Foundation shows the same pattern: ~1,085 lines
   across 4 chained PRs. Catalog is bigger (3 views + 4 components +
   2 services + 2 stores + 3 composables + 10+ specs). The apply phase
   MUST use chained PRs stacked-to-main. Recommended split (rough):
   - PR1: schema + types + `useCalculoReceta` + tests (data + pure logic).
   - PR2: `ingredients.service` + `ingredients.store` +
     `MateriasPrimasView` + form + list item + tests.
   - PR3: `recipes.service` + `recipes.store` + `RecetasView` +
     `RecetaDetalleView` + recipe form + cost breakdown + tests.
   - PR4: routes wire-up + integration smoke + verify.

### Gaps from the brief (must be addressed in proposal / spec phase)

1. **No unit-conversion support** — the brief says materia prima has a
   `unidad` (kg, g, l, ml, unidad) but a recipe's `cantidad` is stored
   in the materia prima's unit. The brief does NOT address whether a
   recipe can mix "0.5 kg" of one ingredient and "200 g" of another.
   **Recommendation**: lock the calculator to "the recipe uses the
   materia prima's native unit" and surface a tooltip in the recipe
   form "La cantidad está en la unidad de la materia prima". Adding a
   full unit-conversion engine is out of scope for Phase 2.

2. **No "stock" or "inventory" tracking** — the brief's item 6 is CRUD
   on `materias_primas` with no stock column. Stock belongs to a later
   slice (probably Phase 3, items 11-12). The schema does NOT include
   a `stock_actual` column on `materias_primas`.

3. **No recipe versioning** — when an ingredient's price changes, old
   recipes' historical costs are lost. The brief does not require
   snapshot semantics. **Recommendation**: ship v1 with no versioning;
   flag the gap in the spec's "Out of Scope" section.

4. **No multi-recipe yield** — `rendimiento_unidades` is a single
   number. A "receta de brownie" that yields 24 cookies AND 12
   mini-cupcakes cannot be modelled. **Recommendation**: leave to a
   future "production planning" slice.

5. **No export / print** — jsPDF is in the stack but not used in
   catalog. The "Vista de recetas con desglose de costos" is a screen,
   not a PDF. **Recommendation**: out of scope; the analytics slice
   owns exports.

6. **No bulk import** — no CSV / Excel import for `materias_primas`.
   The seed script covers the demo case. **Recommendation**: out of
   scope for v1.

7. **No image attachment** — `materias_primas` could plausibly have a
   `foto_url` (Supabase Storage). The brief does not mention it.
   **Recommendation**: out of scope.

8. **No `costo_por_unidad` history** — the calculator shows the
   current price. The brief's "desglose" (item 9) is a snapshot of
   NOW, not "what was the cost last week". **Recommendation**: ship
   v1 with current-price-only; flag the gap.

### Conflicts with the foundation

None. The foundation API surface is consumed verbatim. The only
config drift is the `strict_tdd: false` in `openspec/config.yaml`
that must flip to `true` in the catalog PR1 (or earlier, as a
preflight chore).

---

## Estimated Code Lines

| Bucket | Lines (approx) |
|--------|----------------|
| SQL migration + seed | ~120 |
| Types (catalog + hand-rolled Database) | ~100 |
| Services (2 files) | ~140 |
| Stores (2 files) | ~180 |
| Composables (3 files) | ~120 |
| Utils (1 new + 1 modified) | ~40 |
| Components (4 files) | ~360 |
| Views (3 files) | ~330 |
| Router modification | ~25 |
| Config + setup file changes | ~30 |
| Specs (10 files, ~15 lines each average) | ~600 |
| Docs (`docs/catalog-setup.md`) | ~40 |
| **Total new + modified** | **~2,085** |

This is the largest slice so far (foundation was ~1,085). **Chained PRs
are MANDATORY, not just likely.** The 400-line review budget is a hard
constraint, not a guideline.

---

## Chained PRs Forecast

| PR | Scope | Approx lines | 400-line risk |
|----|-------|--------------|----------------|
| PR1 | SQL migration + seed + types + utils + `useCalculoReceta` + setup.ts supabase mock | ~450 | Medium (just over) |
| PR2 | `ingredients.service` + `ingredients.store` + `MateriasPrimasView` + form + list item + 4 specs | ~470 | Medium |
| PR3 | `recipes.service` + `recipes.store` + `RecetasView` + `RecetaDetalleView` + recipe form + cost breakdown + specs | ~580 | High (will need F2-style split) |
| PR4 | Router wire-up + routes.spec + config.yaml tdd flag + docs + verify | ~85 | Low |

**Recommendation for `sdd-tasks`**: structure PR1 / PR2 to be under
400 lines and proactively apply the F2 split to PR3 (move the cost
breakdown component to its own PR or move the recipe view into a 4th
chained PR). The foundation precedent shows that an F2-style split
saves reviewer time even when the line count is borderline.

`chain_strategy`: stacked-to-main (matches foundation).
`delivery_strategy`: ask-always (preflight default).

---

## Ready for Proposal

**Yes.** The proposal phase has everything it needs:

- Data model with full column lists, FKs, indexes, RLS.
- Service / store / composable / view mapping to the foundation's
  existing pattern.
- Cost calculator approach (composable + pure function) with 6
  documented edge cases.
- Database setup method (SQL checked in, manual run via Dashboard) +
  seed script.
- Type-generation decision (hand-rolled for v1, CLI deferred).
- Offline strategy (online-first, friendly error, offline-sync slice
  is the integration point).
- File inventory (every new + modified file).
- Test strategy (unit / integration / component breakdown with
  ~60 tests forecast).
- Chained-PR forecast (4 PRs, ~2,085 total lines, stacked-to-main).

The proposal phase MUST also:
1. Flip `openspec/config.yaml.strict_tdd` and `apply.tdd` to `true`.
2. Document the `dev_bypass_rls.sql` workflow (with the explicit
   "removed in the auth-flow slice" marker).
3. Propose a delivery-strategy ask for the user (chained vs single-PR
   is not a default for this slice — the diff is too large).
4. Decide on the unit-conversion policy (recommendation: defer to a
   later slice, document in spec's "Out of Scope").

---

## Key Learnings

- **The foundation's `IStorageService` and `useAuth` are load-bearing for every future slice.** Catalog inherits both verbatim and adds zero new dependencies; the
  only modified file outside `src/views|stores|services|composables|components|types`
  is `tests/setup.ts` and `openspec/config.yaml`.
- **Config drift between `openspec/config.yaml` and the engram `sdd/kilo-lima/testing-capabilities` observation** is a real bug: `strict_tdd: false` in the YAML vs.
  `strict_tdd: ENABLED` in engram. The catalog PR1 must reconcile this or every
  downstream gate that reads the YAML will silently re-disable TDD.
- **The 2,085-line forecast is the largest slice so far** — chained PRs are MANDATORY, not just recommended. The foundation's F2 split (moving the Vuetify plugin
  to PR2) is the template for preemptive task splits in the catalog tasks phase.
- **Cost calculator location = composable that exports a pure function.** Vue's `computed` gives reactive memoization for the view; the pure-function export
  lets unit tests skip the Vue setup entirely. The brief's "Lenguaje del feriante" guidance means the calculator's output UI text is Spanish, but the function
  names are Spanish too (`calcularCostoReceta`, `redondearCentavos`).
- **Offline-first in v1 is a footgun.** The brief's "Todas las operaciones se guardan primero en IndexedDB" promise is Phase 5 (item 20) per the brief's own
  timeline, and the foundation's `docs/offline-sync.md` explicitly defers the
  sync queue. Catalog stays online-first with friendly errors and lets the
  offline-sync slice be the integration point.
