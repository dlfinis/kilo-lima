# Design: Catalog

> **Change**: `catalog` | **Phase**: `sdd-design`
> **Proposal**: `openspec/changes/catalog/proposal.md` (8 locked decisions)
> **Spec**: `openspec/changes/catalog/specs/catalog/spec.md` (46 REQ-IDs, 83 scenarios)
> **Foundation**: `openspec/changes/archive/2026-06-16-foundation/design.md` (inherited patterns)
> **Delivery**: 4 chained PRs, stacked-to-main

---

## 1. Architecture Overview

Catalog is an **additive layer** on the foundation's frozen API surface. It introduces the first real domain schema (3 tables), CRUD UX, and business logic — all without modifying `package.json` or any foundation service/store/composable. The frozen contracts it consumes: `inject('supabase')` returns `SupabaseClient<Database>`, `inject('storageService')` returns `IStorageService` (LSP), `useAuth()` stub (throws), and `app.store` (proof-of-pattern). New catalog artifacts: 2 Pinia stores, 2 service factories (DIP/OCP), 3 composables, 2 utility modules, 5 business components, 3 views, 3 lazy router routes, 3 SQL files, and ~13 spec files (written FIRST per strict TDD). The 8 proposal decisions are IMMUTABLE — every design choice below is derived from them.

```
View Layer                    Store Layer              Service Layer          Backend
─────────────                ──────────────            ────────────────       ───────
MateriasPrimasView.vue ──→ useIngredients() ──→ ingredients.store ──→ crearIngredientsService(supabase) ──→ Supabase
RecetasView.vue        ──→ useRecipes()      ──→ recipes.store      ──→ crearRecipesService(supabase)      ──→ Supabase
RecetaDetalleView.vue  ──→ useCalculoReceta() ──→ recipes.store.costoPorReceta(id) ──→ (pure function, no IO)
                                │
                         calcularCostoReceta() [pure export — testable without Vue]
```

---

## 2. Service Layer (Factory Pattern)

**Decision**: Services as factories that accept `SupabaseClient<Database>` via parameter (OCP). No direct singleton import.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Module-level singleton (`export const svc = ...`) | Simplest; hard to mock per-test | Rejected — breaks test isolation |
| Class with constructor injection | Familiar OOP; verbose TS | Rejected — overkill for 4-method services |
| **Factory function** (`crearXService(supabase)`) | Test injects mock client; caller controls client | **Chosen** |

### `src/services/ingredients.service.ts`

```ts
export function crearIngredientsService(supabase: SupabaseClient<Database>) {
  return {
    async listar(): Promise<{ data: MateriaPrima[] | null; error: ServiceError | null }>,
    async crear(input: MateriaPrimaInput): Promise<{ data: MateriaPrima | null; error: ServiceError | null }>,
    async actualizar(id: string, cambios: Partial<MateriaPrimaInput>): Promise<{ data: MateriaPrima | null; error: ServiceError | null }>,
    async eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>,
  }
}
```

**Error contract** (REQ-CATALOG-44 LSP): Every method returns `{ data, error }` — never throws. `ServiceError` has `{ code: string; message: string }`. Consumers handle errors declaratively.

### `src/services/recipes.service.ts`

Same factory pattern. `crear()` handles the **joined insert**: creates the `recetas` row, then batch-inserts `receta_ingredientes` rows via `supabase.from('receta_ingredientes').insert(lineas)`. `actualizar()` follows a **delete-then-reinsert** strategy for ingredient lines: deletes all existing `receta_ingredientes` for the recipe, then inserts the new set — all within the caller's error boundary.

**Why factory pattern**: Testable (inject mock supabase), OCP (swap client without changing service), DIP (caller controls the client — the offline-sync slice can wrap it without touching the service).

---

## 3. Pinia Stores

### `src/stores/ingredients.store.ts`

Setup-style store. State: `materiasPrimas: Ref<MateriaPrima[]>` (single source of truth), `cargando: Ref<boolean>`, `error: Ref<string | null>`. Actions: `cargarTodas`, `crear`, `actualizar`, `eliminar`. Receives the supabase client via `inject('supabase')` and constructs `crearIngredientsService(supabase)` at store creation time. Actions call the service, update reactive state, and surface errors.

### `src/stores/recipes.store.ts`

Same pattern. Additional: `costoPorReceta(id)` is a **computed getter** that reads `useIngredientsStore().materiasPrimas` and calls `calcularCostoReceta()` (the pure function). This cross-store dependency is reactive because it lives inside a `computed()` — when `ingredients.store`'s `materiasPrimas` array changes, the getter recomputes (REQ-CATALOG-15, mitigates risk #4).

**Why stores intermediate between services and composables**: Cache layer (single fetch → shared state), reactive state (cross-component), stateless services (testable without Pinia). Stores are stateful; services are stateless; composables are view-layer.

---

## 4. Composables (View Layer)

### `src/composables/useIngredients.ts`

Thin wrapper around `useIngredientsStore()`. Uses `storeToRefs()` to destructure reactive state. Exposes: `{ materiasPrimas, cargando, error, cargar, crear, actualizar, eliminar }`. Also provides local form state (`nuevaMateriaPrima: Ref<MateriaPrimaInput>`) and validation logic.

### `src/composables/useRecipes.ts`

Same pattern for recipes. Manages recipe form state (multiple ingredients), ingredient selector interactions, and submission orchestration.

### `src/composables/useCalculoReceta.ts`

**Dual export**: (a) pure function `calcularCostoReceta(...)` — unit-testable without Vue/Pinia, and (b) reactive composable `useCalculoReceta(recetaId)` — thin `computed()` wrapper reading from stores. The pure function is separately testable (~15 unit tests); the composable needs ~3 reactive-integration tests.

**Why separate composable for calculator**: The pure function is the most unit-test-heavy module in catalog. Keeping it in a composable file (not a store, not a service) means tests can import it with zero setup — no Pinia, no mount, no supabase mock.

---

## 5. Component Tree

### Data flow contract

```
View ──reads──→ Composable ──calls──→ Store ──calls──→ Service ──calls──→ Supabase
  ↑                                                                           │
  └──────────────────── reactive state flows back ────────────────────────────┘
```

### `MateriasPrimasView.vue`
- **Consumes**: `useIngredients()` composable
- **Children**: `MateriaPrimaForm.vue` (in `v-dialog` for create/edit), `MateriaPrimaListItem.vue` (per-row in `v-data-table`)
- **State**: `cargando` → `v-progress-linear`, `error` → `v-alert`, empty → empty-state CTA (REQ-CATALOG-6)

### `MateriaPrimaForm.vue`
- **Props**: `valoresIniciales: MateriaPrimaInput | null` (null = create mode)
- **Emits**: `submit(input: MateriaPrimaInput)`, `cancel()`
- **Validation**: Inline Spanish errors before submission (REQ-CATALOG-2/3)
- **Consumes**: Nothing — pure form component, validation is self-contained

### `MateriaPrimaListItem.vue`
- **Props**: `materia: MateriaPrima`
- **Emits**: `edit(id: string)`, `delete(id: string)`

### `RecetasView.vue`
- **Consumes**: `useRecipes()` composable
- **Children**: `RecetaForm.vue` (in `v-dialog`), `RecetaListItem.vue` (list row)
- **State pattern**: Identical to `MateriasPrimasView` (loading/error/empty)

### `RecetaForm.vue`
- **Props**: `valoresIniciales: RecetaInput | null`
- **Emits**: `submit(input: RecetaInput & { ingredientes: IngredienteRecetaInput[] })`, `cancel()`
- **Dynamic children**: N instances of `SelectorMateriaPrima.vue` (one per ingredient line), add/remove buttons
- **Validation**: `nombre` non-empty, ≥ 1 ingredient, all `cantidad` > 0 (REQ-CATALOG-10)

### `SelectorMateriaPrima.vue`
- **Props**: `modelValue: string | null` (selected `materia_prima_id`), `materiasPrimas: MateriaPrima[]`
- **Emits**: `update:modelValue(id: string | null)`
- **Renders**: `v-autocomplete` showing `nombre (unidad)` — "Harina (kg)"

### `RecetaCostoDesglose.vue`
- **Props**: `calculo: CalculoReceta`
- **Emits**: None — display-only
- **Renders**: Table of per-ingredient lines (`nombre`, `cantidad`, `unidad`, `costo_por_unidad`, `subtotal`), totals row (`costoTotal`, `costoPorUnidad`). Yellow `v-alert` when `advertencia === 'MATERIA_PRIMA_FALTANTE'` (REQ-CATALOG-16).

### `RecetaDetalleView.vue`
- **Consumes**: `useRecipes()` composable + route param `:id`
- **Children**: `RecetaCostoDesglose.vue`
- **Error state**: "Receta no encontrada" when `id` resolves to no recipe (REQ-CATALOG-30)

---

## 6. Database Schema (exact SQL)

### Migration: `supabase/migrations/20260616120000_catalog_inicial.sql`

```sql
-- 1. Extension (idempotent)
create extension if not exists "pgcrypto" schema public;

-- 2. materias_primas
create table if not exists public.materias_primas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) > 0),
  unidad text not null check (unidad in ('kg','g','l','ml','unidad')),
  costo_por_unidad numeric(10,4) not null check (costo_por_unidad >= 0),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. recetas
create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) > 0),
  descripcion text,
  rendimiento_unidades numeric(10,4) not null check (rendimiento_unidades > 0),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. receta_ingredientes
create table if not exists public.receta_ingredientes (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  materia_prima_id uuid not null references public.materias_primas(id) on delete restrict,
  cantidad numeric(12,6) not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  unique (receta_id, materia_prima_id)
);

-- 5. Indexes
create index if not exists idx_materias_primas_nombre_lower on public.materias_primas (lower(nombre));
create index if not exists idx_materias_primas_created_at on public.materias_primas (created_at desc);
create index if not exists idx_recetas_nombre_lower on public.recetas (lower(nombre));
create index if not exists idx_recetas_created_at on public.recetas (created_at desc);
create index if not exists idx_receta_ingredientes_receta_id on public.receta_ingredientes (receta_id);
create index if not exists idx_receta_ingredientes_materia_prima_id on public.receta_ingredientes (materia_prima_id);

-- 6. updated_at trigger
create or replace function public.tg__set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger tg_materias_primas_set_updated_at
  before update on public.materias_primas
  for each row execute function public.tg__set_updated_at();

create or replace trigger tg_recetas_set_updated_at
  before update on public.recetas
  for each row execute function public.tg__set_updated_at();

-- 7. RLS
alter table public.materias_primas enable row level security;
alter table public.recetas enable row level security;
alter table public.receta_ingredientes enable row level security;

drop policy if exists "materias_primas_select_authenticated" on public.materias_primas;
create policy "materias_primas_select_authenticated" on public.materias_primas
  for select to authenticated using (true);

drop policy if exists "materias_primas_write_authenticated" on public.materias_primas;
create policy "materias_primas_write_authenticated" on public.materias_primas
  for all to authenticated using (true) with check (true);

drop policy if exists "recetas_select_authenticated" on public.recetas;
create policy "recetas_select_authenticated" on public.recetas
  for select to authenticated using (true);

drop policy if exists "recetas_write_authenticated" on public.recetas;
create policy "recetas_write_authenticated" on public.recetas
  for all to authenticated using (true) with check (true);

drop policy if exists "receta_ingredientes_select_authenticated" on public.receta_ingredientes;
create policy "receta_ingredientes_select_authenticated" on public.receta_ingredientes
  for select to authenticated using (true);

drop policy if exists "receta_ingredientes_write_authenticated" on public.receta_ingredientes;
create policy "receta_ingredientes_write_authenticated" on public.receta_ingredientes
  for all to authenticated using (true) with check (true);
```

### `supabase/dev_bypass_rls.sql`

```sql
-- ⚠️ DEV-ONLY — SOLO PARA DESARROLLO ⚠️
-- Este archivo será ELIMINADO en el slice auth-flow.
-- Otorga acceso total al rol anon sobre las 3 tablas del catálogo
-- para que el PWA funcione sin autenticación durante el desarrollo.

grant select, insert, update, delete on public.materias_primas to anon;
grant select, insert, update, delete on public.recetas to anon;
grant select, insert, update, delete on public.receta_ingredientes to anon;
```

### `supabase/seed.sql`

Idempotent (`ON CONFLICT DO NOTHING`): 5 `materias_primas` (azúcar/g/0.05, harina/kg/2.50, mantequilla/g/0.12, huevo/unidad/0.30, chocolate/kg/15.00), 2 `recetas` (galleta de chocolate/24, pan básico/2), 5 `receta_ingredientes` rows.

---

## 7. Type Definitions

### `src/types/catalog.types.ts`

```ts
export type UnidadMedida = 'kg' | 'g' | 'l' | 'ml' | 'unidad'

export interface MateriaPrima {
  id: string
  nombre: string
  unidad: UnidadMedida
  costo_por_unidad: number
  notas: string | null
  created_at: string
  updated_at: string
}

export type MateriaPrimaInput = Omit<MateriaPrima, 'id' | 'created_at' | 'updated_at'>

export interface Receta {
  id: string
  nombre: string
  descripcion: string | null
  rendimiento_unidades: number
  notas: string | null
  created_at: string
  updated_at: string
}

export type RecetaInput = Omit<Receta, 'id' | 'created_at' | 'updated_at'>

export interface IngredienteReceta {
  id: string
  receta_id: string
  materia_prima_id: string
  cantidad: number
  created_at: string
}

export interface IngredienteRecetaConCosto extends IngredienteReceta {
  nombre: string
  unidad: UnidadMedida
  costo_por_unidad: number
}

export interface LineaCalculo {
  ingrediente: IngredienteReceta
  materiaPrima: MateriaPrima | null
  subtotal: number
  advertencia?: 'MATERIA_PRIMA_FALTANTE'
}

export interface CalculoReceta {
  ingredientes: LineaCalculo[]
  costoTotal: number
  costoPorUnidad: number
}

export interface ServiceError {
  code: string
  message: string
}
```

### `src/types/database.types.ts` (modified — hand-rolled)

```ts
// TO REGENERATE FROM SUPABASE (deferred to CI slice):
//   npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts
// Hand-rolled for catalog (3 tables). pnpm typecheck catches drift.
export interface Database {
  public: {
    Tables: {
      materias_primas: {
        Row: { id: string; nombre: string; unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'; costo_por_unidad: number; notas: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; nombre: string; unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'; costo_por_unidad: number; notas?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['materias_primas']['Insert']>
        Relationships: []
      }
      recetas: {
        Row: { id: string; nombre: string; descripcion: string | null; rendimiento_unidades: number; notas: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; nombre: string; descripcion?: string | null; rendimiento_unidades: number; notas?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['recetas']['Insert']>
        Relationships: []
      }
      receta_ingredientes: {
        Row: { id: string; receta_id: string; materia_prima_id: string; cantidad: number; created_at: string }
        Insert: { id?: string; receta_id: string; materia_prima_id: string; cantidad: number; created_at?: string }
        Update: Partial<Database['public']['Tables']['receta_ingredientes']['Insert']>
        Relationships: [
          { foreignKeyName: 'receta_ingredientes_receta_id_fkey'; columns: ['receta_id']; referencedRelation: 'recetas'; referencedColumns: ['id'] },
          { foreignKeyName: 'receta_ingredientes_materia_prima_id_fkey'; columns: ['materia_prima_id']; referencedRelation: 'materias_primas'; referencedColumns: ['id'] },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
```

### `src/types/index.ts` (modified)

Add: `export type { MateriaPrima, MateriaPrimaInput, Receta, RecetaInput, IngredienteReceta, IngredienteRecetaConCosto, LineaCalculo, CalculoReceta, UnidadMedida, ServiceError } from './catalog.types'`

---

## 8. Cost Calculator Pure Logic

### `src/utils/moneda.ts`

```ts
export function redondearCentavos(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100
}
```

### `calcularCostoReceta` algorithm

```
Input:  ingredientes: IngredienteRecetaConCosto[], rendimiento: number
Output: CalculoReceta

1. For each ingrediente:
   a. subtotal = cantidad * costo_por_unidad        // full precision
2. costoTotal = redondearCentavos(sum(all subtotals))  // one round at end
3. costoPorUnidad = rendimiento > 0
     ? redondearCentavos(costoTotal / rendimiento)
     : 0                                           // zero guard
4. Return { ingredientes, costoTotal, costoPorUnidad }
```

**Edge cases** (REQ-CATALOG-18/19/20):

| # | Case | Expected |
|---|------|----------|
| 1 | Empty ingredients `[]` | `costoTotal: 0, costoPorUnidad: 0, ingredientes: []` |
| 2 | `rendimiento = 0` | `costoPorUnidad: 0` (no division by zero) |
| 3 | Missing materia prima (FK broken) | `materiaPrima: null, subtotal: 0, advertencia: 'MATERIA_PRIMA_FALTANTE'` |
| 4 | Floating-point noise (0.1+0.2) | `+ Number.EPSILON` guards against `0.30000000000000004` |
| 5 | 1.005 rounding | Rounds to 1.01 (standard `Math.round`, not banker's) |
| 6 | 20+ ingredients | Single `redondearCentavos` at end, per-line subtotals are full float |

**Rounding policy**: `subtotal` uses full floating-point precision. Only `costoTotal` and `costoPorUnidad` are rounded to 2 decimals. Per-line rounding would accumulate ±$0.01 per ingredient.

---

## 9. Router Integration

### `src/router/routes.ts` (modified)

Append 3 lazy routes BEFORE the catch-all. No modifications to `index.ts`.

```ts
{
  path: '/materias-primas',
  name: 'materias-primas',
  component: () => import('@/views/MateriasPrimasView.vue'),
},
{
  path: '/recetas',
  name: 'recetas',
  component: () => import('@/views/RecetasView.vue'),
},
{
  path: '/recetas/:id',
  name: 'receta-detalle',
  component: () => import('@/views/RecetaDetalleView.vue'),
},
```

**Navigation**: Recipe list row click → `router.push({ name: 'receta-detalle', params: { id } })`. Back via browser button or breadcrumb. The existing catch-all (`/:pathMatch(.*)*` redirect to `/`) remains untouched.

---

## 10. Supabase Mock

### `tests/setup.ts` (additive)

```ts
let __mockLlamadas: { metodo: string; args: unknown[] }[] = []
let __mockRespuesta = { data: [], error: null }

function crearSupabaseMock() {
  __mockLlamadas = []
  const builder: Record<string, unknown> = {
    from: (tabla: string) => { __mockLlamadas.push({ metodo: 'from', args: [tabla] }); return builder },
    select: (...args: unknown[]) => { __mockLlamadas.push({ metodo: 'select', args }); return builder },
    insert: (...args: unknown[]) => { __mockLlamadas.push({ metodo: 'insert', args }); return builder },
    update: (...args: unknown[]) => { __mockLlamadas.push({ metodo: 'update', args }); return builder },
    delete: (...args: unknown[]) => { __mockLlamadas.push({ metodo: 'delete', args }); return builder },
    eq: (...args: unknown[]) => { __mockLlamadas.push({ metodo: 'eq', args }); return builder },
    single: async () => __mockRespuesta,
    maybeSingle: async () => __mockRespuesta,
    then: (resolve: (v: unknown) => void) => resolve(__mockRespuesta),
  }
  return { supabase: builder as unknown as SupabaseClient<Database>, llamadas: __mockLlamadas }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => crearSupabaseMock().supabase }))

export function __resetSupabaseMock(respuesta = { data: [], error: null }) {
  __mockLlamadas = []
  __mockRespuesta = respuesta
}

export function __getSupabaseMockCalls() { return __mockLlamadas }
```

**Chainable design**: Every method returns `builder` for chaining (`.from('x').select().eq('id', v).single()`). The `then` method makes the chain thenable so services' `await supabase.from(...)...` works. `__resetSupabaseMock()` is called in `beforeEach` for test isolation (REQ-CATALOG-34). The mock does NOT call Supabase — no network.

---

## 11. Test Architecture (RED phase order)

Strict TDD: every spec file is committed BEFORE its implementation file. The test order below ensures every test fails with a meaningful error (not a missing import) when written first.

### Phase 1 — Utilities (no deps)
| # | Spec file | Tests | REQs covered |
|---|-----------|-------|--------------|
| 1 | `src/utils/moneda.spec.ts` | `redondearCentavos` happy + 4 edge (EPSILON, 1.005, 0.1+0.2, large) | REQ-CATALOG-20 |
| 2 | `src/utils/format.spec.ts` | `formatearUnidad` — "12.5 g", "3 unidad(es)", edge cases | REQ-CATALOG-21 |
| 3 | `src/composables/useCalculoReceta.spec.ts` | `calcularCostoReceta` — happy path + 6 edge cases (empty, zero yield, missing MP, float noise, rounding, 20+ ingredients) | REQ-CATALOG-17..20 |

### Phase 2 — Services (mock supabase)
| # | Spec file | Tests | REQs covered |
|---|-----------|-------|--------------|
| 4 | `src/services/ingredients.service.spec.ts` | `listar`, `crear`, `actualizar`, `eliminar`, error path | REQ-CATALOG-1..5, REQ-CATALOG-44 |
| 5 | `src/services/recipes.service.spec.ts` | `listar`, `crear` (joined insert), `actualizar` (delete-reinsert), `eliminar` (cascade), error path | REQ-CATALOG-9..12, REQ-CATALOG-44 |

### Phase 3 — Stores (real Pinia + mock services)
| # | Spec file | Tests | REQs covered |
|---|-----------|-------|--------------|
| 6 | `src/stores/ingredients.store.spec.ts` | State transitions, `cargarTodas`, `crear`, `actualizar`, `eliminar`, error handling | REQ-CATALOG-1..5, REQ-CATALOG-7/8 |
| 7 | `src/stores/recipes.store.spec.ts` | State transitions, `costoPorReceta` reactive getter, cross-store reactivity | REQ-CATALOG-9..12, REQ-CATALOG-15, REQ-CATALOG-42 |

### Phase 4 — Components (mount + mock stores)
| # | Spec file | Tests | REQs covered |
|---|-----------|-------|--------------|
| 8 | `src/components/business/MateriaPrimaForm.spec.ts` | Fill form, submit, validation errors (empty nombre, bad unidad, negative cost) | REQ-CATALOG-2, REQ-CATALOG-40, REQ-CATALOG-45 |
| 9 | `src/components/business/RecetaForm.spec.ts` | Add ingredients, remove, submit, validation (empty nombre, 0 ingredients, negative cantidad) | REQ-CATALOG-10, REQ-CATALOG-40 |
| 10 | `src/components/business/RecetaCostoDesglose.spec.ts` | Render with fixture `CalculoReceta`, assert lines + totals + MATERIA_PRIMA_FALTANTE warning | REQ-CATALOG-14, REQ-CATALOG-16 |

### Phase 5 — Views (full mount + router + stores)
| # | Spec file | Tests | REQs covered |
|---|-----------|-------|--------------|
| 11 | `src/views/MateriasPrimasView.spec.ts` | Mount, assert list renders, create flow, edit flow, delete with confirmation, empty/loading/error states | REQ-CATALOG-1..8 |
| 12 | `src/views/RecetasView.spec.ts` | Mount, list, create, edit, delete, empty/loading/error states | REQ-CATALOG-9..13 |
| 13 | `src/views/RecetaDetalleView.spec.ts` | Route param `:id`, cost breakdown renders, "not found" state, reactive recalculation | REQ-CATALOG-14..16, REQ-CATALOG-30 |

### Phase 6 — Router + config
| # | Spec file | Tests | REQs covered |
|---|-----------|-------|--------------|
| 14 | `src/router/routes.spec.ts` | 3 routes registered, `/materias-primas` resolves, `/recetas` resolves, `/recetas/:id` resolves | REQ-CATALOG-28..30 |

**Cumulative test count**: ~60 tests. `pnpm test` runtime target ≤ 5 s. `__resetSupabaseMock()` is called in `beforeEach` for every service/store test (REQ-CATALOG-34).

---

## 12. File → Requirement Traceability

### PR1 — Schema + types + utils + calculator + mock (~450 lines)

| REQ-ID | Files |
|--------|-------|
| REQ-CATALOG-17 | `src/composables/useCalculoReceta.ts` |
| REQ-CATALOG-18 | `src/composables/useCalculoReceta.ts` |
| REQ-CATALOG-19 | `src/composables/useCalculoReceta.ts` |
| REQ-CATALOG-20 | `src/utils/moneda.ts`, `src/composables/useCalculoReceta.ts` |
| REQ-CATALOG-21 | `src/utils/format.ts` |
| REQ-CATALOG-22 | `supabase/migrations/20260616120000_catalog_inicial.sql` |
| REQ-CATALOG-23 | `supabase/seed.sql` |
| REQ-CATALOG-24 | `supabase/dev_bypass_rls.sql` |
| REQ-CATALOG-25 | `docs/catalog-setup.md` |
| REQ-CATALOG-26 | `src/types/catalog.types.ts` |
| REQ-CATALOG-27 | `src/types/database.types.ts` |
| REQ-CATALOG-31 | `openspec/config.yaml` |
| REQ-CATALOG-34 | `tests/setup.ts` |
| REQ-CATALOG-36 | All new files (English filenames) |
| REQ-CATALOG-37 | `src/types/catalog.types.ts`, `src/utils/moneda.ts`, `src/composables/useCalculoReceta.ts` |

### PR2 — Ingredients domain (~470 lines)

| REQ-ID | Files |
|--------|-------|
| REQ-CATALOG-1 | `src/views/MateriasPrimasView.vue` |
| REQ-CATALOG-2 | `src/components/business/MateriaPrimaForm.vue`, `src/stores/ingredients.store.ts` |
| REQ-CATALOG-3 | `src/components/business/MateriaPrimaForm.vue`, `src/stores/ingredients.store.ts` |
| REQ-CATALOG-4 | `src/stores/ingredients.store.ts`, `src/services/ingredients.service.ts` |
| REQ-CATALOG-5 | `src/services/ingredients.service.ts` (duplicate check) |
| REQ-CATALOG-6 | `src/views/MateriasPrimasView.vue` (empty state) |
| REQ-CATALOG-7 | `src/views/MateriasPrimasView.vue` (loading state) |
| REQ-CATALOG-8 | `src/views/MateriasPrimasView.vue` (error state) |
| REQ-CATALOG-35 | `src/views/MateriasPrimasView.vue`, `src/components/business/MateriaPrimaForm.vue` |
| REQ-CATALOG-38 | `src/views/MateriasPrimasView.vue` |
| REQ-CATALOG-39 | `src/views/MateriasPrimasView.vue`, `src/stores/ingredients.store.ts` |
| REQ-CATALOG-40 | `src/components/business/MateriaPrimaForm.vue` |
| REQ-CATALOG-41 | `src/views/MateriasPrimasView.vue` (delete dialog) |
| REQ-CATALOG-42 | `src/stores/ingredients.store.ts` |
| REQ-CATALOG-43 | `src/services/ingredients.service.ts` |
| REQ-CATALOG-44 | `src/services/ingredients.service.ts` |
| REQ-CATALOG-45 | `src/components/business/MateriaPrimaForm.vue` |
| REQ-CATALOG-46 | `src/composables/useIngredients.ts`, `src/views/MateriasPrimasView.vue` |

### PR3 — Recipes domain (~580 lines → likely F2 split)

| REQ-ID | Files |
|--------|-------|
| REQ-CATALOG-9 | `src/views/RecetasView.vue` |
| REQ-CATALOG-10 | `src/components/business/RecetaForm.vue`, `src/stores/recipes.store.ts` |
| REQ-CATALOG-11 | `src/components/business/RecetaForm.vue`, `src/stores/recipes.store.ts` |
| REQ-CATALOG-12 | `src/stores/recipes.store.ts`, `src/services/recipes.service.ts` |
| REQ-CATALOG-13 | `src/views/RecetasView.vue` |
| REQ-CATALOG-14 | `src/views/RecetaDetalleView.vue`, `src/components/business/RecetaCostoDesglose.vue` |
| REQ-CATALOG-15 | `src/stores/recipes.store.ts` (reactive `costoPorReceta` getter) |
| REQ-CATALOG-16 | `src/composables/useCalculoReceta.ts`, `src/components/business/RecetaCostoDesglose.vue` |
| REQ-CATALOG-35 | `src/views/RecetasView.vue`, `src/views/RecetaDetalleView.vue` |
| REQ-CATALOG-38 | `src/views/RecetasView.vue` |
| REQ-CATALOG-39 | `src/views/RecetasView.vue` |
| REQ-CATALOG-40 | `src/components/business/RecetaForm.vue` |
| REQ-CATALOG-41 | `src/views/RecetasView.vue` (delete dialog) |
| REQ-CATALOG-42 | `src/stores/recipes.store.ts` |
| REQ-CATALOG-43 | `src/services/recipes.service.ts` |
| REQ-CATALOG-44 | `src/services/recipes.service.ts` |
| REQ-CATALOG-45 | `src/components/business/RecetaForm.vue`, `src/components/business/RecetaCostoDesglose.vue` |
| REQ-CATALOG-46 | `src/composables/useRecipes.ts`, `src/views/RecetasView.vue` |

### PR4 — Router + config + docs + verify (~85 lines)

| REQ-ID | Files |
|--------|-------|
| REQ-CATALOG-28 | `src/router/routes.ts` |
| REQ-CATALOG-29 | `src/router/routes.ts` |
| REQ-CATALOG-30 | `src/router/routes.ts` |
| REQ-CATALOG-31 | `openspec/config.yaml` (verify fields) |
| REQ-CATALOG-32 | All spec files (metadata — one-per-source check) |
| REQ-CATALOG-33 | `pnpm test` gate (cumulative ≥ 64 passing) |

**46/46 REQ-IDs traced.** Every requirement maps to exactly one set of files. No requirement is homeless.

---

## 13. Config Drift Resolution

`openspec/config.yaml` currently has `strict_tdd: false`, `apply.tdd: false`, and empty `test_command`. Foundation archive confirms `strict_tdd: ENABLED`. **Resolution (PR1 first commit, BEFORE catalog code)**:

| Field | Current (drifted) | Target |
|-------|-------------------|--------|
| `testing.strict_tdd` | `false` | `true` |
| `apply.tdd` | `false` | `true` |
| `apply.test_command` | `""` | `"pnpm test"` |
| `verify.test_command` | `""` | `"pnpm test"` |
| `verify.build_command` | `""` | `"pnpm build"` |
| `testing.runner` | `none` | `vitest` |
| `testing.framework` | `none` | `vitest + @vue/test-utils` |

**Why in PR1 not a separate chore**: The config flip is a precondition for TDD gates. Bundling it into PR1 means catalog ships with coherent config from day one. The orchestrator MUST NOT start any catalog work before this commit lands (proposal §14, REQ-CATALOG-31).

---

## 14. Risks & Mitigations

| # | Risk | Likelihood | Architecture-level Mitigation |
|---|------|------------|------------------------------|
| 1 | **Config drift** — YAML still says `strict_tdd: false` | **High** | PR1 first commit flips all fields. `sdd-apply` validates before any file write. |
| 2 | **Hand-rolled `Database` drift** — SQL ↔ TS mismatch | Medium | `pnpm typecheck` catches column-name drift. One service integration test hits `supabase.from('materias_primas')` at runtime. |
| 3 | **RLS strict in dev** — anon key rejected by policy layer | Medium | `dev_bypass_rls.sql` shipped in PR1 with loud dev-only header. `auth-flow` slice removes it. |
| 4 | **`costoPorReceta` not reactive** — stale cost after ingredient price change | Low | `recipes.store.costoPorReceta(id)` reads `useIngredientsStore().materiasPrimas` inside a `computed()` — Vue's dependency tracking propagates changes correctly. |
| 5 | **Vuetify `v-data-table` loose types** — upstream `any` slot props | Low | Store types are strict (`MateriaPrima[]`). View wrappers accept loose table slots. Acceptable trade-off per foundation precedent. |
| 6 | **Float drift across many ingredients** — 20+ lines accumulate noise | Low | Single `redondearCentavos(sum + EPSILON)` at the end, NOT per-line. Per-line `subtotal` is full float. |
| 7 | **400-line review budget** — ~2,085 lines total | **High** | 4 chained PRs (MANDATORY). PR3 likely needs F2 split (PR3a: service+store+views, PR3b: forms+breakdown component). `sdd-tasks` decides exact split. |
| 8 | **Service-role-key temptation** — bypass RLS with admin client | Medium | Documented as security regression. Architecture enforces factory pattern — if someone swaps the client, it's a one-line change to audit. `dev_bypass_rls.sql` is the approved path. |

---

## Key Learnings

- **The factory pattern (services) + pure-function export (calculator) is the two-punch testability strategy.** The service factory lets tests inject a chainable mock Supabase client with zero module-level mocking. The pure `calcularCostoReceta` export lets the 15 most complex unit tests skip Vue/Pinia/supabase entirely — they import a function, pass objects, assert the return value.
- **Cross-store reactivity works through Pinia's `computed()`**, not through manual watchers. `recipes.store.costoPorReceta(id)` calls `useIngredientsStore().materiasPrimas` inside a `computed()`. When an ingredient's `costo_por_unidad` changes, the ingredients store's `materiasPrimas` array is replaced reactively, and the recipes store's computed getter re-evaluates automatically — no event bus, no `watch`, no manual invalidation.
- **The `{ data, error }` contract (never-throw from services) is the LSP surface for future slices.** The offline-sync slice will wrap the service: on success, return `{ data, error: null }`; on network failure, silently queue in localforage WAL and return `{ data: optimisticData, error: null }`. Consumers (stores, composables, views) see the SAME return shape — no try/catch migration needed.
- **Config drift is the #1 gate-blocker.** `openspec/config.yaml` currently has `strict_tdd: false` AND `apply.tdd: false` despite the foundation archive confirming both are ENABLED. Every downstream SDD gate that reads `config.yaml` will silently re-disable TDD unless PR1's first commit flips these fields BEFORE any catalog code lands.
