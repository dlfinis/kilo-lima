# Exploration: `events` (Phase 3 — Eventos, Gastos Fijos, Planificación, Proyección de Costos)

> **Change**: `events` | **Phase**: `sdd-explore`
> **Scope** (locked from `brief.md` §7 Phase 3, items 10–13):
>   10. CRUD de Eventos
>   11. Gastos fijos por evento
>   12. Planificación de producción
>   13. Proyección de costos totales
> **Catalog status**: ARCHIVED — 46/46 REQ-IDs satisfied, 3 tables (`materias_primas`, `recetas`, `receta_ingredientes`), `calcularCostoReceta` pure function, hand-rolled `Database` interface, `dev_bypass_rls.sql` active.
> **Foundation status**: ARCHIVED — 54/54 REQ-IDs satisfied, `strict_tdd: ENABLED`, `IStorageService` LSP, `inject('supabase')` typed client.
> **Stack baseline**: Vue 3.5 + Vite 5.4 + TS 5.6 + Vuetify 3.12 + Pinia 3.0 + Vue Router 4.6 + Supabase JS 2.108 + Vitest 2.1 + @vue/test-utils 2.4 (all frozen).
> **Delivery context**: stacked-to-main, 400-line review budget, `strict_tdd: ENABLED`, chained PRs likely.

---

## Current State (catalog invariants the events slice must respect)

The catalog slice locked the first domain-specific API surface. The events
slice inherits every pattern verbatim and adds the first multi-table join
(`gastos_fijos.evento_id`, `plan_produccion.evento_id`, `plan_produccion.receta_id`),
the first domain state machine (`estado` enum on `eventos`), and the first
derived business view (the cost projection, computed in pure functions).

**Inherited patterns (do not change)**:

- **DI entry point** (`src/plugins/services.ts`): `inject('supabase')` returns
  the typed `SupabaseClient<Database>` singleton. Every new service uses the
  same factory pattern (`crearEventsService(supabase)`).
- **Hand-rolled `Database` interface** (`src/types/database.types.ts`): the
  catalog slice added 3 tables. Events extends the `Tables` map with 3 more
  (`eventos`, `gastos_fijos`, `plan_produccion`) — additive, no drift in
  catalog tables.
- **Service never-throw contract** (`{ data, error: ServiceError | null }`):
  inherited from REQ-CATALOG-44. `ServiceError = { code, message }`. Services
  catch Supabase errors and return them; the view throws if needed.
- **Store pattern** (`src/stores/<domain>.store.ts`): setup-style Pinia, one
  store per domain, `inject('supabase')` → factory service, three refs
  (`<entities>`, `cargando`, `error`) + actions. Cross-store reads happen
  inside `computed()` to keep reactivity flowing (see
  `recipes.store.costoPorReceta`).
- **Composable layer**: thin `storeToRefs` wrapper (`useEvents()` etc.) plus
  one or more pure-function utilities (`useProyeccionCostos` +
  `calcularProyeccion`).
- **Cost calculator** (`src/composables/useCalculoReceta.ts`): exports
  `calcularCostoReceta(lineas, rendimiento)` as a pure function. Events
  **reuses this verbatim** for the variable-cost side of the projection.
- **Form components** (`src/components/business/`): one per CRUD form, emits
  `submit` with the typed input. `<200` lines, `<30`-line functions.
- **Routes** (`src/router/routes.ts`): lazy-loaded `() => import(...)` per
  route. Catalog added 3 routes; events adds 3 more (`/eventos`,
  `/eventos/:id`, `/eventos/:id/planificar`).
- **Supabase chainable mock** (`tests/setup.ts`): exports
  `__resetSupabaseMock`, `__pushSupabaseResponse`, `__getSupabaseMockCalls`.
  Events tests reuse this — no new helper needed.
- **`dev_bypass_rls.sql`** (`supabase/dev_bypass_rls.sql`): must be extended
  in the events migration to grant the anon role access to the 3 new tables.
  The auth-flow slice will remove it.

### No config drift

`openspec/config.yaml` already has `testing.strict_tdd: true`,
`apply.tdd: true`, `apply.test_command: "pnpm test"`, etc. (catalog PR1
flipped it). Events reuses the existing config verbatim.

### Existing reusable assets

| Asset | Reused by events as… |
|-------|----------------------|
| `calcularCostoReceta(lineas, rendimiento)` (catalog PR1) | Per-recipe variable cost inside the projection calculator. |
| `redondearCentavos`, `redondearParaMermas` (catalog PR1) | The projection rounds `costoTotal` once at the end. `redondearParaMermas` is finally wired in the planning UI as a 5% surcharge toggle (locked decision, see §4). |
| `SelectorMateriaPrima` (catalog PR2) | Renamed/reused as `SelectorReceta` for picking a `receta` inside `plan_produccion` rows. (Or new component — see §5 Component structure.) |
| `RecetaConIngredientes` + `useCalculoReceta` | The planning view needs the recipe name + cost to render per-row "× unidades = $X". |
| `IStorageService` LSP | Online-only in v1; the same `dev_bypass_rls.sql` extension covers events. |
| `useAuth` stub | Still stubbed; events is single-user. |
| `__resetSupabaseMock` | New `*.spec.ts` files import and call it in `beforeEach`. |

---

## Affected Areas

### New files (events slice creates)

| Path | Why it appears |
|------|----------------|
| `supabase/migrations/20260618000000_events_inicial.sql` | Schema for `eventos`, `gastos_fijos`, `plan_produccion` + RLS + indexes + `dev_bypass_rls.sql` extension. |
| `docs/events-setup.md` | User-facing one-time setup (paste migration + extended `dev_bypass_rls.sql`). |
| `src/types/events.types.ts` | Spanish domain types: `Evento`, `GastoFijo`, `PlanProduccion`, `EstadoEvento`, `CategoriaGasto`, plus `*Input` variants and the projection output shape. |
| `src/types/database.types.ts` *(modified)* | Add `eventos`, `gastos_fijos`, `plan_produccion` table definitions (Row/Insert/Update/Relationships) to the hand-rolled `Database`. |
| `src/types/index.ts` *(modified)* | Re-export event types. |
| `src/services/events.service.ts` | Supabase CRUD for `eventos` + `gastos_fijos` (joined), since both share a `listarPorEvento` use case. Single service keeps the never-throw contract symmetric with catalog's `recipes.service.ts`. |
| `src/services/plans.service.ts` | Supabase CRUD for `plan_produccion` (separate service — different domain, different read patterns: "load all plan rows for this evento"). |
| `src/stores/events.store.ts` | Pinia store for `eventos` + `gastosFijos` (event-scoped state lives here, not in a separate `gastos.store.ts`, to mirror the catalog's "receta + receta_ingredientes in one store" precedent). |
| `src/stores/plans.store.ts` | Pinia store for `plan_produccion` rows, keyed by `eventoId`. |
| `src/composables/useEvents.ts` | Thin wrapper around `events.store`. |
| `src/composables/usePlans.ts` | Thin wrapper around `plans.store`. |
| `src/composables/useProyeccionCostos.ts` | Composable that exposes the `computed` projection; **also exports** the pure function `calcularProyeccion(evento, gastosFijos, planProduccion, recetas, materiasPrimas)` for unit tests. |
| `src/utils/estado.ts` | Tiny pure helpers: `transicionEstadoValida(desde, hacia)` and `estadoEsEditable(estado)`. |
| `src/components/business/EventoForm.vue` | Create/edit form for an `evento`. Locks `estado` transitions. |
| `src/components/business/EventoListItem.vue` | Row in the list (name, date, status chip, total cost). |
| `src/components/business/EventoStatusChip.vue` | Reusable Vuetify chip for the 3 estados. |
| `src/components/business/GastoFijoForm.vue` | Create/edit form for a `gasto_fijo` row. |
| `src/components/business/GastoFijoListItem.vue` | Row in the gastos list. |
| `src/components/business/SelectorReceta.vue` | Autocomplete for picking a `receta` inside the planning grid (mirrors `SelectorMateriaPrima` shape). |
| `src/components/business/PlanProduccionRow.vue` | One row in the planning grid: recipe picker, unidades input, computed line cost, delete button. |
| `src/components/business/ProyeccionCostosCard.vue` | The projection card (fixed + variable + total + per-unit). |
| `src/components/business/PlanProduccionGrid.vue` | The grid container that owns the `PlanProduccionRow[]` v-model and the add-row button. |
| `src/views/EventosView.vue` | List of eventos (page 1 of brief item 10). |
| `src/views/EventoDetalleView.vue` | Single evento detail page: header, gastos tab, plan tab, projection card. |
| `src/views/PlanificarEventoView.vue` | The dedicated production planning screen (brief item 12). |
| `src/router/routes.ts` *(modified)* | Append 3 lazy routes: `/eventos`, `/eventos/:id`, `/eventos/:id/planificar`. |
| `src/services/events.service.spec.ts` | Unit test for the events service (with chainable Supabase mock). |
| `src/services/plans.service.spec.ts` | Unit test for the plans service. |
| `src/stores/events.store.spec.ts` | Pinia store test (mock service, real Pinia). |
| `src/stores/plans.store.spec.ts` | Pinia store test. |
| `src/composables/useProyeccionCostos.spec.ts` | Pure-logic tests for the projection (happy path + edge cases). |
| `src/utils/estado.spec.ts` | Pure-logic tests for the state machine helpers. |
| `src/components/business/EventoForm.spec.ts` | Form test (fill, submit, status chip selection). |
| `src/components/business/EventoStatusChip.spec.ts` | Chip test (color + label per estado). |
| `src/components/business/GastoFijoForm.spec.ts` | Form test. |
| `src/components/business/SelectorReceta.spec.ts` | Autocomplete test (uses events fixtures). |
| `src/components/business/PlanProduccionRow.spec.ts` | Row test (qty edit → line cost recompute). |
| `src/components/business/ProyeccionCostosCard.spec.ts` | Card test (renders fixed + variable + total). |
| `src/components/business/PlanProduccionGrid.spec.ts` | Grid test (add/remove rows, v-model). |
| `src/views/EventosView.spec.ts` | Component test. |
| `src/views/EventoDetalleView.spec.ts` | Component test. |
| `src/views/PlanificarEventoView.spec.ts` | Component test. |
| `src/router/routes.spec.ts` *(modified)* | Add the 3 new routes to the registry test. |

### Modified files

- `src/router/routes.ts` — append 3 lazy routes.
- `src/types/database.types.ts` — add 3 new tables to the hand-rolled interface.
- `src/types/index.ts` — re-export events types.
- `supabase/dev_bypass_rls.sql` — extend with `grant select, insert, update, delete on eventos, gastos_fijos, plan_produccion to anon`.
- `tests/setup.ts` — no changes needed (chainable mock is generic).
- `openspec/config.yaml` — no changes needed (already aligned).
- `src/router/routes.spec.ts` — add 3 new route entries.

### Untouched foundation + catalog files (proof of additive change)

`App.vue`, `main.ts`, `App.spec.ts`, `utils/env.ts`, `plugins/vuetify.ts`,
`plugins/services.ts`, `services/supabase.client.ts`, `localforage.client.ts`,
`storage.interface.ts`, `storage.service.ts`, `composables/useAuth.ts`,
`useOnlineStatus.ts`, `usePwaUpdate.ts`, `stores/app.store.ts`,
`views/HomeView.vue`, all of `src/services/{ingredients,recipes}.service.ts`,
all of `src/stores/{ingredients,recipes}.store.ts`, all of
`src/composables/useCalculoReceta.ts`, `useIngredients.ts`, `useRecipes.ts`,
all of `src/types/catalog.types.ts` (unchanged), all of
`src/utils/moneda.ts` (unchanged), and the catalog migration
`supabase/migrations/20260616120000_catalog_inicial.sql` (unchanged).

---

## Data Model (3 new Supabase tables)

All three tables use the catalog convention:
`id uuid primary key default gen_random_uuid()`,
`created_at timestamptz not null default now()`,
`updated_at timestamptz not null default now()` (events + the two child
tables that mutate).

### `public.eventos`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `nombre` | `text` | NOT NULL, CHECK `length(nombre) > 0` | Display name. |
| `fecha` | `date` | NOT NULL | **Single-day v1** (locked — see §12 Risks). |
| `ubicacion` | `text` | NULL | Optional. |
| `estado` | `text` | NOT NULL, CHECK `estado in ('planificacion','en_curso','cerrado')`, default `'planificacion'` | State machine — see §5. |
| `notas` | `text` | NULL | Optional. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | Trigger updates on UPDATE. |

**Indexes**:
- `idx_eventos_fecha` on `(fecha desc)` — default "most recent first" ordering.
- `idx_eventos_estado` on `(estado)` — filter by estado (e.g., "active
  eventos in planificacion").
- `idx_eventos_nombre_lower` on `(lower(nombre))` — typeahead search.

**Why a single `fecha` and not `fecha_inicio` + `fecha_fin`**: the brief
ambiguity is resolved by §12 (single-day v1). A two-date multi-day model is
deferred to a future "feria de varios días" slice (out of scope).

**Why `numeric` is NOT in this table**: the projection is a derived view
that lives in a composable; the SQL table is the source of truth for *what
the user entered*, not *what the math says*. A `costo_total` denormalized
column would create the same drift problem catalog explicitly avoided in
REQ-CATALOG §"no `costo_total` column".

### `public.gastos_fijos`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE CASCADE` | Cascade: deleting an evento removes its gastos. |
| `categoria` | `text` | NOT NULL, CHECK `categoria in ('renta','transporte','permisos','publicidad','servicios','otro')` | Locked 6-value enum (KISS — covers the brief's "rent, transport, permits, etc."). |
| `monto` | `numeric(10,2)` | NOT NULL, CHECK `monto >= 0` | USD, 2 decimals (no per-unit cost here, just money). |
| `descripcion` | `text` | NULL | Optional free text. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Foreign keys**:
- `gastos_fijos_evento_id_fkey`: `evento_id` → `eventos.id` (CASCADE on delete).

**Indexes**:
- `idx_gastos_fijos_evento_id` on `(evento_id)` — hot path for
  `loadGastosPorEvento(eventoId)`.

**Frozen on `cerrado`**: the `EventoForm` and `GastoFijoForm` check the
parent evento's `estado` before allowing any mutation. The `cerrado`
estado short-circuits both. The DB has no `ON DELETE RESTRICT` here
because cascading delete is correct (a deleted evento removes its gastos).

### `public.plan_produccion`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE CASCADE` | |
| `receta_id` | `uuid` | NOT NULL, FK → `recetas(id) ON DELETE RESTRICT` | RESTRICT: cannot delete a receta that is in a plan. |
| `unidades_a_producir` | `numeric(10,4)` | NOT NULL, CHECK `unidades_a_producir > 0` | How many units of this receta to make. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Foreign keys**:
- `plan_produccion_evento_id_fkey`: `evento_id` → `eventos.id` (CASCADE on delete).
- `plan_produccion_receta_id_fkey`: `receta_id` → `recetas.id` (RESTRICT on delete).

**Indexes**:
- `idx_plan_produccion_evento_id` on `(evento_id)` — hot path for
  `loadPlanPorEvento(eventoId)`.
- `idx_plan_produccion_receta_id` on `(receta_id)` — reverse lookup
  "which eventos plan this receta?" (used in the delete-restriction error
  message and in the analytics slice later).
- `uq_plan_produccion_evento_receta` UNIQUE on `(evento_id, receta_id)` —
  a plan cannot list the same receta twice. UX in the form prevents
  duplicates client-side, but the constraint is the source of truth.

**No `costo_total` column**: same rationale as the catalog's `recetas`
table — the projection is derived. A denormalized column would invite
stale data when an ingredient's price changes.

**Frozen on `cerrado`**: same short-circuit as `gastos_fijos`.

### RLS policies (same shape as catalog)

```sql
alter table public.eventos          enable row level security;
alter table public.gastos_fijos     enable row level security;
alter table public.plan_produccion  enable row level security;

create policy "eventos_select_authenticated"          on public.eventos         for select to authenticated using (true);
create policy "eventos_write_authenticated"           on public.eventos         for all    to authenticated using (true) with check (true);
create policy "gastos_fijos_select_authenticated"     on public.gastos_fijos    for select to authenticated using (true);
create policy "gastos_fijos_write_authenticated"      on public.gastos_fijos    for all    to authenticated using (true) with check (true);
create policy "plan_produccion_select_authenticated"  on public.plan_produccion for select to authenticated using (true);
create policy "plan_produccion_write_authenticated"   on public.plan_produccion for all    to authenticated using (true) with check (true);
```

**Anon role is NOT granted access.** `dev_bypass_rls.sql` extends its
existing grant block to include the 3 new tables; the auth-flow slice
removes it.

### Migration ordering and atomicity

Single file `supabase/migrations/20260618000000_events_inicial.sql`
containing:
1. (a) `eventos` table + indexes + RLS, (b) `gastos_fijos` table + indexes
   + RLS, (c) `plan_produccion` table + indexes + RLS, (d) `updated_at`
   trigger for `eventos` (the two child tables only have `created_at`).

**No new migration for `dev_bypass_rls.sql`** — the file is patched in the
events PR1 (a separate small SQL or an edit to the existing file). The
catalog dev bypass file is the same artifact; the events PR1 extends it.

**Why single migration file**: events is one logical change. Splitting it
across migrations is premature; the `pos` slice (Phase 4) can add a new
migration later if it needs to alter the schema (e.g., add a
`unidades_vendidas` column for stock tracking).

---

## CRUD Patterns (mapping to catalog's locked shape)

### Service layer

Two services follow the catalog's factory pattern verbatim. Each method
returns `{ data, error: ServiceError | null }` and never throws:

```ts
// src/services/events.service.ts
export interface EventsService {
  listar(): Promise<{ data: Evento[] | null; error: ServiceError | null }>
  obtener(id: string): Promise<{ data: Evento | null; error: ServiceError | null }>
  crear(input: EventoInput): Promise<{ data: Evento | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: Partial<EventoInput>,
  ): Promise<{ data: Evento | null; error: ServiceError | null }>
  cambiarEstado(
    id: string,
    nuevoEstado: EstadoEvento,
  ): Promise<{ data: Evento | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>

  // gastos_fijos sub-resource
  listarGastos(eventoId: string): Promise<{ data: GastoFijo[] | null; error: ServiceError | null }>
  crearGasto(input: GastoFijoInput): Promise<{ data: GastoFijo | null; error: ServiceError | null }>
  actualizarGasto(
    id: string,
    cambios: Partial<GastoFijoInput>,
  ): Promise<{ data: GastoFijo | null; error: ServiceError | null }>
  eliminarGasto(id: string): Promise<{ data: null; error: ServiceError | null }>
}
```

```ts
// src/services/plans.service.ts
export interface PlansService {
  listarPorEvento(eventoId: string): Promise<{ data: PlanProduccion[] | null; error: ServiceError | null }>
  crear(input: PlanProduccionInput): Promise<{ data: PlanProduccion | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: Partial<Pick<PlanProduccionInput, 'unidades_a_producir'>>,
  ): Promise<{ data: PlanProduccion | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
  reemplazarTodos(
    eventoId: string,
    filas: PlanProduccionInput[],
  ): Promise<{ data: PlanProduccion[] | null; error: ServiceError | null }>  // for the "save plan" button
}
```

**Why `reemplazarTodos`**: the planning UI is a grid with add/remove rows;
the simplest save path is "delete all plan rows for this evento, then
insert the new list" — symmetric to `recipes.service.actualizar`'s
delete-then-reinsert pattern. This keeps the v1 grid simple; the
`pos` slice can introduce row-level diffing later if needed.

**Why events + gastos share one service**: the `EventoDetalleView`
always needs both. A `useEvents` composable that owns the `gastosFijos`
ref for the current evento is the same container/presentational seam the
catalog uses for `RecetaConIngredientes`. Two stores (`events.store` for
the list + detail, `plans.store` for the plan rows) keep the SRP line
clean because `plans` has a different write cadence (grid bulk-save).

### Pinia stores

```ts
// src/stores/events.store.ts
export const useEventsStore = defineStore('events', () => {
  // ...
  const eventos = ref<Evento[]>([])
  const eventoActual = ref<Evento | null>(null)  // for EventoDetalleView
  const gastosFijos = ref<GastoFijo[]>([])        // for the current evento
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  async function cargarTodas(): Promise<void> { /* ... */ }
  async function cargarDetalle(id: string): Promise<void> { /* loads evento + gastos */ }
  async function crear(input: EventoInput) { /* ... */ }
  async function actualizar(id: string, cambios: Partial<EventoInput>) { /* ... */ }
  async function cambiarEstado(id: string, nuevoEstado: EstadoEvento) { /* gated by transicionEstadoValida */ }
  async function eliminar(id: string) { /* ... */ }
  // gastos actions — gated by estado es-editable
  async function crearGasto(input: GastoFijoInput) { /* ... */ }
  async function actualizarGasto(id: string, cambios: Partial<GastoFijoInput>) { /* ... */ }
  async function eliminarGasto(id: string) { /* ... */ }

  return { /* ... */ }
})
```

```ts
// src/stores/plans.store.ts
export const usePlansStore = defineStore('plans', () => {
  // ...
  const plan = ref<PlanProduccion[]>([])  // rows for the current evento
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  async function cargarPara(eventoId: string): Promise<void> { /* ... */ }
  async function guardarPlan(eventoId: string, filas: PlanProduccionInput[]) {
    // calls servicio.reemplazarTodos(eventoId, filas)
  }

  return { plan, cargando, error, cargarPara, guardarPlan }
})
```

**Why two stores and not one "eventos" mega-store**: SRP (REQ-CATALOG-42).
`events.store` owns the `evento` lifecycle (CRUD + state machine);
`plans.store` owns the plan-grid lifecycle. They never read each other's
state directly — the view composes them.

### Composable layer

```ts
// src/composables/useEvents.ts — view-layer wrapper around events.store
export function useEvents() {
  const store = useEventsStore()
  const { eventos, eventoActual, gastosFijos, cargando, error } = storeToRefs(store)
  return {
    eventos,
    eventoActual,
    gastosFijos,
    cargando,
    error,
    cargarTodas: store.cargarTodas,
    cargarDetalle: store.cargarDetalle,
    crear: store.crear,
    actualizar: store.actualizar,
    cambiarEstado: store.cambiarEstado,
    eliminar: store.eliminar,
    crearGasto: store.crearGasto,
    actualizarGasto: store.actualizarGasto,
    eliminarGasto: store.eliminarGasto,
  }
}

// src/composables/usePlans.ts — view-layer wrapper around plans.store
export function usePlans() {
  // same pattern, returns { plan, cargando, error, cargarPara, guardarPlan }
}
```

```ts
// src/composables/useProyeccionCostos.ts
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import type { Evento, GastoFijo, PlanProduccion, RecetaConIngredientes, MateriaPrima, ProyeccionCostos } from '@/types'
import { calcularCostoReceta } from '@/composables/useCalculoReceta'

export function calcularProyeccion(
  evento: Evento,
  gastosFijos: GastoFijo[],
  plan: PlanProduccion[],
  recetas: RecetaConIngredientes[],
  materiasPrimas: MateriaPrima[],
): ProyeccionCostos {
  const mapaRecetas = new Map(recetas.map((r) => [r.id, r]))
  const mapaMaterias = new Map(materiasPrimas.map((m) => [m.id, m]))

  const lineas = plan.map((fila) => {
    const receta = mapaRecetas.get(fila.receta_id)
    if (!receta) {
      return { receta_id: fila.receta_id, nombre: 'Receta no disponible', unidades: fila.unidades_a_producir, costoLinea: 0, advertencia: 'RECETA_FALTANTE' as const }
    }
    const lineasInput = receta.ingredientes.map((ing) => ({
      ingrediente: ing,
      materiaPrima: mapaMaterias.get(ing.materia_prima_id) ?? null,
    }))
    const calc = calcularCostoReceta(lineasInput, receta.rendimiento_unidades)
    const costoLinea = Math.round(fila.unidades_a_producir * calc.costoPorUnidad * 100 + Number.EPSILON) / 100
    return { receta_id: fila.receta_id, nombre: receta.nombre, unidades: fila.unidades_a_producir, costoLinea }
  })

  const costosFijos = Math.round(gastosFijos.reduce((acc, g) => acc + g.monto, 0) * 100 + Number.EPSILON) / 100
  const costosVariables = Math.round(lineas.reduce((acc, l) => acc + l.costoLinea, 0) * 100 + Number.EPSILON) / 100
  const costoTotal = Math.round((costosFijos + costosVariables) * 100 + Number.EPSILON) / 100
  return { costosFijos, costosVariables, costoTotal, lineas }
}

export function useProyeccionCostos(
  eventoId: MaybeRefOrGetter<string | null>,
): ComputedRef<ProyeccionCostos | null> {
  const eventsStore = useEventsStore()
  const plansStore = usePlansStore()
  const ingredientsStore = useIngredientsStore()
  const recipesStore = useRecipesStore()
  return computed<ProyeccionCostos | null>(() => {
    const id = toValue(eventoId)
    if (!id) return null
    return calcularProyeccion(
      eventsStore.eventoActual as unknown as Evento,  // event is loaded; null check above handles route not yet resolved
      eventsStore.gastosFijos,
      plansStore.plan,
      recipesStore.recetas,
      ingredientsStore.materiasPrimas,
    )
  })
}
```

### Why on-the-fly (no `costo_total` column on `eventos`)

Same rationale as the catalog's `recetas` table:
- Single-user, <10k rows; the math is O(plan rows + receta ingredients) —
  sub-millisecond.
- A denormalized column invites drift when a `materia_prima.costo_por_unidad`
  changes mid-day.
- The reactive `computed` in the view gives free memoization; the
  projection is never stale.

---

## Production Planning Logic (brief item 12)

### Decision: hybrid — user enters units, system validates against stock-free plan rules

The brief is ambiguous on the "how much to produce" question. Three
candidate approaches were considered:

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **A. Manual units per recipe** (user types `unidades_a_producir`) | Simplest UI; matches brief item 12's "selects N recipes and specifies units to produce". User stays in control. | No stock-aware suggestions; user can over- or under-plan. | **Selected for v1.** |
| **B. Suggested by stock** (system reads `materias_primas.stock_actual` and suggests `unidades_a_producir`) | Smart; "produce what you have". | Requires a `stock_actual` column on `materias_primas` that catalog explicitly excluded (REQ-CATALOG §Gaps #2). Out of scope. | **Deferred to a future slice.** |
| **C. Hybrid — user enters, system validates against expected demand + stock** | Best UX. | Requires both `expected_units_sold` (POS slice, out of scope) and `stock_actual` (deferred). | **Deferred.** |

**v1 behavior**: `PlanProduccionGrid` is a flat editable grid with one
row per `(receta, unidades_a_producir)`. The form:
- shows a `SelectorReceta` (autocomplete) for each row,
- has a numeric input for `unidades_a_producir` (`> 0`),
- shows a live-computed "× unidades = $X" beside the input (uses
  `useProyeccionCostos`'s derived `costoLinea`),
- has an "Agregar fila" button and a per-row "Eliminar" button,
- a single "Guardar plan" button at the bottom calls
  `usePlans().guardarPlan(eventoId, filasFiltradas)`.

**What "validates against stock" means in v1**: zero. The grid trusts the
user. Stock-aware validation is a future slice (probably Phase 4 or 5).

---

## Cost Projection Algorithm (brief item 13)

### Pure function + composable

The math lives in `calcularProyeccion(evento, gastosFijos, plan, recetas, materiasPrimas)`,
exported from `src/composables/useProyeccionCostos.ts`. The composable
`useProyeccionCostos(eventoId)` wraps it in a `computed` that reads from
the four stores.

### Formula

```
costosFijos     = Σ(gastos_fijos.monto)
                            ↑ over all gastos where evento_id = X

linea.i.costo   = plan.unidades_a_producir × calcularCostoReceta(receta.ingredientes, receta.rendimiento_unidades).costoPorUnidad
                            ↑ per plan row, rounded to 2 decimals

costosVariables = Σ(linea.costo) over all plan rows
                            ↑ rounded to 2 decimals at the end (NOT per line)

costoTotal      = costosFijos + costosVariables
                            ↑ rounded to 2 decimals once at the end

costoPorUnidad  = OUT OF SCOPE v1 (requires expected_units_sold from POS slice)
```

### Why per-line + end-of-function rounding

Catalog's `calcularCostoReceta` uses a single `redondearCentavos` at the
end (REQ-CATALOG-20). Events follows the same pattern: per-line
`costoLinea` is full float precision inside the loop, but the three
top-level totals (`costosFijos`, `costosVariables`, `costoTotal`) are
each rounded exactly once via
`Math.round(x * 100 + Number.EPSILON) / 100`.

This avoids cumulative float drift across many plan rows and matches the
catalog's `redondearCentavos` helper verbatim.

### Edge cases (each MUST have a unit test)

| # | Case | Expected |
|---|------|----------|
| 1 | Empty plan, no gastos | `{ costosFijos: 0, costosVariables: 0, costoTotal: 0, lineas: [] }` |
| 2 | Empty plan, with gastos | `costosFijos` = sum of gastos, `costosVariables` = 0, `costoTotal` = `costosFijos` |
| 3 | Plan with rows, no gastos | `costosFijos` = 0, `costosVariables` = sum, `costoTotal` = `costosVariables` |
| 4 | Plan row references a deleted receta (FK prevents, defensive) | line: `{ advertencia: 'RECETA_FALTANTE', costoLinea: 0 }`; UI shows a yellow `v-alert` "Esta receta ya no existe. Quitá la fila del plan." |
| 5 | Plan row references a receta whose materia prima was deleted (catalog's `MATERIA_PRIMA_FALTANTE` propagates) | `calcularCostoReceta` returns 0 for that line's subtotal; `costoPorUnidad` reflects the partial total. The card shows a yellow `v-alert`. |
| 6 | `unidades_a_producir = 0` | Form blocks submission; the pure function returns `costoLinea: 0` defensively. |
| 7 | Floating-point noise (e.g. 0.1 + 0.2) | Single `Math.round(sum * 100 + EPSILON) / 100` at each total. |
| 8 | Merma surcharge (5%) | The brief's items 12-13 implicitly invoke the merma toggle. The composable's `linea.costoLinea` multiplies by 1.05 when the evento's `aplicar_merma = true`. **DECISION**: out of scope for v1 (the brief doesn't say "with 5% merma"); `redondearParaMermas` exists in the catalog utils but is not wired in v1. **Documented gap — see §12.** |

### UI: `ProyeccionCostosCard`

The card renders three sections:

1. **Costos fijos** — sum + line breakdown (description + monto per gasto).
2. **Costos variables** — sum + line breakdown (receta name + unidades × costoPorUnidad).
3. **Total** — single bold number.

If any line carries an `advertencia`, a yellow `v-alert` shows at the top
of the card with the count: "Hay 2 líneas con problemas — revisá el plan".

### `costoPorUnidad` projection (item 13's "expected_units_sold" half)

**OUT OF SCOPE v1.** The brief mentions "expected_units_sold" implicitly
through the per-unit projection. Implementing it requires:
- A new `expected_units_sold` field on `eventos` (or a separate
  `pronostico_ventas` table), AND
- A decision on whether it's per-receta or per-evento.

Both are POS-slice concerns (Phase 4, items 14–17). v1 shows the total;
the per-unit field is a v2 enhancement.

---

## Event Status State Machine (locked decision)

### Transitions

```
        ┌──────────────┐
        │ planificacion│
        │  (default)   │
        └──────┬───────┘
               │  cambiarEstado('en_curso')
               ▼
        ┌──────────────┐
        │  en_curso    │
        └──────┬───────┘
               │  cambiarEstado('cerrado')
               ▼
        ┌──────────────┐
        │   cerrado    │  (frozen — no edits to plan or gastos)
        └──────────────┘
```

**Valid transitions** (anything else returns `ServiceError { code: 'TRANSICION_INVALIDA' }`):
- `planificacion` → `en_curso`
- `en_curso` → `cerrado`
- `planificacion` → `cerrado` (cancel an event before it starts)

**No backward transitions**: once `cerrado`, you cannot reopen. This
matches the brief's "Post-evento: análisis" phase — closed events become
read-only historical records.

### "Frozen on `cerrado`" enforcement

The events store's `crearGasto`, `actualizarGasto`, `eliminarGasto`, and
the plans store's `guardarPlan` ALL check `eventsStore.eventoActual.estado`
before mutating. If `estado === 'cerrado'`, the action returns
`{ data: null, error: { code: 'EVENTO_CERRADO', message: 'El evento está cerrado — no se puede modificar' } }`.

The pure helper `estadoEsEditable(estado: EstadoEvento): boolean` lives in
`src/utils/estado.ts` and is the single source of truth for the frozen
check (mirrors `transicionEstadoValida` for transitions).

### Why a `cerrado` freeze

Brief says: "Estado (Planificación / En curso / Cerrado)". The brief's
3-phase flow (pre-evento / durante / post-evento) is the user-facing
framing; `cerrado` is the technical marker that the plan and gastos are
locked. Post-evento analytics consume the historical record; the
`pos` slice is the one that drives `en_curso → cerrado` (when the
user closes the daily register).

### Where the state machine lives

- `src/utils/estado.ts` — `transicionEstadoValida(desde, hacia): boolean`
  and `estadoEsEditable(estado): boolean`. Pure, unit-tested.
- `events.service.cambiarEstado` — calls `transicionEstadoValida` before
  the Supabase update; returns `TRANSICION_INVALIDA` error if not allowed.
- `events.store.crearGasto` etc. — call `estadoEsEditable(eventoActual.estado)`
  before any mutation; returns `EVENTO_CERRADO` error if frozen.

The view layer (`EventoDetalleView`) reads the same `estado` ref to
disable buttons ("Agregar gasto", "Editar plan", "Cambiar estado") when
the evento is `cerrado`. The state is the source of truth; the view is
declarative.

---

## Database Setup Workflow

### One-time manual steps (documented in `docs/events-setup.md`)

1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste `supabase/migrations/20260618000000_events_inicial.sql` → Run.
   Idempotent (`create table if not exists`, `drop policy if exists`).
3. **NEW STEP**: extend `supabase/dev_bypass_rls.sql` to grant the anon
   role access to the 3 new tables. The PR includes the extended file.
4. Restart `pnpm dev`. The Vite app now reads + writes through the anon
   key.

### `dev_bypass_rls.sql` lifecycle (unchanged from catalog)

Present in events dev; auth-flow slice removes it. The events PR extends
the file (or appends a new `dev_bypass_rls.events.sql` that supersedes
the catalog one — `sdd-tasks` decides which is cleaner).

---

## Type Generation

### Decision: hand-rolled `Database` extension, same as catalog

`src/types/database.types.ts` gains 3 new entries under
`Database['public']['Tables']`:
- `eventos` — `id`, `nombre`, `fecha`, `ubicacion`, `estado`,
  `notas`, `created_at`, `updated_at`
- `gastos_fijos` — `id`, `evento_id`, `categoria`, `monto`, `descripcion`,
  `created_at`
- `plan_produccion` — `id`, `evento_id`, `receta_id`, `unidades_a_producir`,
  `created_at`

Each table gets `Row`, `Insert`, `Update` (partial of Insert), and
`Relationships` (foreign keys). The hand-rolled pattern matches the
catalog's 3-table shape.

`pnpm typecheck` MUST pass. `pnpm test` covers at least one
`supabase.from('eventos')` integration test to catch column-name
mismatches at runtime. The hand-rolled types stay until the CI slice
adds `gen:types` (still deferred).

### `src/types/events.types.ts` (new)

Spanish domain types that mirror the SQL columns 1:1 (same convention as
`catalog.types.ts`):

```ts
export type EstadoEvento = 'planificacion' | 'en_curso' | 'cerrado'
export type CategoriaGasto = 'renta' | 'transporte' | 'permisos' | 'publicidad' | 'servicios' | 'otro'

export interface Evento {
  id: string
  nombre: string
  fecha: string                  // ISO date string from postgres date
  ubicacion: string | null
  estado: EstadoEvento
  notas: string | null
  created_at: string
  updated_at: string
}
export type EventoInput = Omit<Evento, 'id' | 'created_at' | 'updated_at' | 'estado'> & { estado?: EstadoEvento }

export interface GastoFijo {
  id: string
  evento_id: string
  categoria: CategoriaGasto
  monto: number
  descripcion: string | null
  created_at: string
}
export type GastoFijoInput = Omit<GastoFijo, 'id' | 'created_at'>

export interface PlanProduccion {
  id: string
  evento_id: string
  receta_id: string
  unidades_a_producir: number
  created_at: string
}
export type PlanProduccionInput = Omit<PlanProduccion, 'id' | 'created_at'>

// Pure-function output shape (NOT a SQL row)
export interface LineaProyeccion {
  receta_id: string
  nombre: string
  unidades: number
  costoLinea: number
  advertencia?: 'RECETA_FALTANTE'
}
export interface ProyeccionCostos {
  costosFijos: number
  costosVariables: number
  costoTotal: number
  lineas: LineaProyeccion[]
}
```

`ServiceError` is reused from `catalog.types.ts` (already exported via
`src/types/index.ts`).

---

## Routing (3 new lazy routes)

```ts
// src/router/routes.ts (additive)
{
  path: '/eventos',
  name: 'eventos',
  component: () => import('@/views/EventosView.vue'),
},
{
  path: '/eventos/:id',
  name: 'evento-detalle',
  component: () => import('@/views/EventoDetalleView.vue'),
},
{
  path: '/eventos/:id/planificar',
  name: 'planificar-evento',
  component: () => import('@/views/PlanificarEventoView.vue'),
},
```

`src/router/routes.spec.ts` is extended with 3 new entries (one
`expect` per route) — same pattern as the catalog PR4's `routes.spec.ts`.

---

## Component Structure (new files)

| File | Role | Spec |
|------|------|------|
| `EventoStatusChip.vue` | Reusable Vuetify chip with color + label per estado (`planificacion`=blue, `en_curso`=orange, `cerrado`=grey). Props: `estado: EstadoEvento`. | yes |
| `EventoListItem.vue` | Row in `EventosView` list: name, date (formatted via `formatearFecha` — Day.js), `EventoStatusChip`, total cost. Emits `click` (navigate) and `eliminar` (with confirmation). | no (covered by view spec) |
| `EventoForm.vue` | Create/edit form. Receives `valoresIniciales: EventoInput`. Emits `submit` with the validated input. Includes a status transition section ("Cambiar estado" select) that calls `cambiarEstado` after submit. | yes |
| `GastoFijoForm.vue` | Create/edit form. Props: `valoresIniciales: GastoFijoInput`, `categoriasDisponibles: CategoriaGasto[]`. Emits `submit`. | yes |
| `GastoFijoListItem.vue` | Row: categoria, monto (USD), descripcion, delete button. | no |
| `SelectorReceta.vue` | Autocomplete for picking a `receta` inside the plan grid. Mirrors `SelectorMateriaPrima` shape. Props: `modelValue: string | null`, emits `update:modelValue`. | yes |
| `PlanProduccionRow.vue` | One row in the grid: `SelectorReceta` + `unidades_a_producir` input + live "× $X" cost + delete button. Props: `fila: PlanProduccionInput`, emits `update`, `eliminar`. | yes |
| `PlanProduccionGrid.vue` | The grid container. Owns the `PlanProduccionInput[]` v-model. Renders N `PlanProduccionRow` + "Agregar fila" + "Guardar plan" button. | yes |
| `ProyeccionCostosCard.vue` | The card with 3 sections (fijos, variables, total). Props: `proyeccion: ProyeccionCostos`. Renders the yellow `v-alert` when any `linea.advertencia` is set. | yes |

### Views

| File | Role | Spec |
|------|------|------|
| `EventosView.vue` | List page. Top: "+ Nuevo evento" button (opens `EventoForm` dialog). Below: list of `EventoListItem` (click → `/eventos/:id`). | yes |
| `EventoDetalleView.vue` | Detail page. Reads `:id` from route. Header: name, date, status, "Editar" + "Eliminar" + "Cambiar estado" buttons. Tabs: "Gastos fijos" (form + list) and "Plan de producción" (link to `/eventos/:id/planificar` or inline grid). Bottom: `ProyeccionCostosCard` showing the live projection. | yes |
| `PlanificarEventoView.vue` | Dedicated planning page. Header: evento name + status. Body: `PlanProduccionGrid` (the editable grid). Right rail (or below on mobile): `ProyeccionCostosCard`. Single "Guardar plan" button at the bottom. | yes |

### Component patterns reused from catalog

- **`SelectorReceta` mirrors `SelectorMateriaPrima`**: same Vuetify
  `v-autocomplete` shape, same `modelValue` + `update:modelValue` props.
- **`EventoForm` mirrors `MateriaPrimaForm`**: same `valoresIniciales`
  prop + `submit` emit + Vuetify `v-text-field`/`v-select` field set.
- **`EventoListItem` mirrors `MateriaPrimaListItem`**: row in a
  `v-list`/`v-data-table`.
- **`ProyeccionCostosCard` mirrors `RecetaCostoDesglose`**: read-only
  breakdown card with a yellow `v-alert` for warnings.

---

## File Structure (new + modified)

```
kilo-lima/
├── supabase/
│   ├── migrations/
│   │   └── 20260618000000_events_inicial.sql          NEW
│   └── dev_bypass_rls.sql                              MOD (extend with 3 new tables)
├── docs/
│   └── events-setup.md                                 NEW
├── openspec/
│   ├── changes/events/
│   │   ├── exploration.md                              (this file)
│   │   ├── proposal.md                                 (sdd-propose writes)
│   │   ├── specs/                                      (sdd-spec writes)
│   │   ├── design.md                                   (sdd-design writes)
│   │   └── tasks.md                                    (sdd-tasks writes)
│   └── config.yaml                                     (no changes)
├── src/
│   ├── types/
│   │   ├── events.types.ts                             NEW
│   │   ├── database.types.ts                           MOD (+3 tables)
│   │   └── index.ts                                    MOD (re-export)
│   ├── services/
│   │   ├── events.service.ts                           NEW (+ .spec.ts)
│   │   └── plans.service.ts                            NEW (+ .spec.ts)
│   ├── stores/
│   │   ├── events.store.ts                             NEW (+ .spec.ts)
│   │   └── plans.store.ts                              NEW (+ .spec.ts)
│   ├── composables/
│   │   ├── useEvents.ts                                NEW
│   │   ├── usePlans.ts                                 NEW
│   │   └── useProyeccionCostos.ts                      NEW (+ .spec.ts)
│   ├── utils/
│   │   └── estado.ts                                   NEW (+ .spec.ts)
│   ├── components/business/
│   │   ├── EventoForm.vue                              NEW (+ .spec.ts)
│   │   ├── EventoListItem.vue                          NEW
│   │   ├── EventoStatusChip.vue                        NEW (+ .spec.ts)
│   │   ├── GastoFijoForm.vue                           NEW (+ .spec.ts)
│   │   ├── GastoFijoListItem.vue                       NEW
│   │   ├── SelectorReceta.vue                          NEW (+ .spec.ts)
│   │   ├── PlanProduccionRow.vue                       NEW (+ .spec.ts)
│   │   ├── PlanProduccionGrid.vue                      NEW (+ .spec.ts)
│   │   └── ProyeccionCostosCard.vue                    NEW (+ .spec.ts)
│   ├── views/
│   │   ├── EventosView.vue                             NEW (+ .spec.ts)
│   │   ├── EventoDetalleView.vue                       NEW (+ .spec.ts)
│   │   └── PlanificarEventoView.vue                    NEW (+ .spec.ts)
│   └── router/
│       ├── routes.ts                                   MOD (+3 routes)
│       └── routes.spec.ts                              MOD (+3 assertions)
└── tests/
    └── setup.ts                                        (no changes)
```

**Counts**:
- New source files: ~26
- New spec files: ~13
- Modified files: 5 (`database.types.ts`, `types/index.ts`,
  `dev_bypass_rls.sql`, `routes.ts`, `routes.spec.ts`)
- Total: ~44 files touched

---

## Test Strategy (strict TDD = RED-GREEN-REFACTOR)

### Test layers (per foundation + catalog conventions)

**Unit tests** (no Vue / Pinia / Supabase):
- `useProyeccionCostos.spec.ts` — happy path + 8 edge cases from §4
  (empty plan, empty gastos, deleted receta, deleted materia prima,
  zero unidades, float drift, merma placeholder, large N).
- `estado.spec.ts` — `transicionEstadoValida` truth table (9 combos) +
  `estadoEsEditable` per estado.
- `events.service.spec.ts` — uses the chainable Supabase mock; 6 tests
  (list, create, update, cambiarEstado, eliminar, +1 for gastos).
- `plans.service.spec.ts` — same shape + 2 tests for `reemplazarTodos`.

**Integration tests** (services + Pinia + mocked Supabase):
- `events.store.spec.ts` — real `createPinia()`, mock service, assert
  state transitions (eventos populated, eventoActual populated, gastos
  loaded on detail, error surfaces, frozen on `cerrado`).
- `plans.store.spec.ts` — same shape + `guardarPlan` test.

**Component tests** (`mount` + real Pinia + real Vuetify + mocked service):
- 8 component specs (form, chip, selector, row, grid, card, form, list).
- 3 view specs (EventosView, EventoDetalleView, PlanificarEventoView).
- 1 modified route spec (routes.spec.ts).

### Supabase mock pattern (no changes to `tests/setup.ts`)

The chainable mock is already generic (it doesn't care about table
names). Events tests import `__resetSupabaseMock` and
`__pushSupabaseResponse` from `tests/setup.ts` exactly like the catalog
tests do.

### Test count forecast

- Unit: ~22 tests
- Integration: ~12 tests
- Component: ~26 tests
- **Total: ~60 tests** (catalog 60 + events ~60 = cumulative ~124).
  Some sources estimate 60–80; the upper bound is achievable if each
  edge case from §4 gets 2–3 assertions.

`pnpm test` runtime target stays under 8 seconds (catalog is ~5s; +60
tests should fit in 3 more seconds with jsdom).

### TDD discipline (same as catalog)

- For every new file, the spec file is the **first commit of the PR**, the
  implementation is the second commit.
- PR reviewer's diff shows: (1) failing test, (2) passing implementation.
- `pnpm test` MUST be in the verify gate (already in
  `openspec/config.yaml` after catalog PR1).
- New test fixtures: a tiny `src/__fixtures__/eventos.ts` (or co-located
  factory functions in each spec file) that builds `Evento`,
  `GastoFijo`, `PlanProduccion` instances. The chainable Supabase mock
  receives the fixtures via `__pushSupabaseResponse`.

---

## Offline Strategy for events

**Online-only, identical to catalog.** Brief's offline promise is Phase 5
(item 20); foundation's `docs/offline-sync.md` defers the queue. Events
inherits the same constraint:

- **Reads**: store fetches from Supabase on mount. If unreachable, `error.value` surfaces in Spanish.
- **Writes**: store calls Supabase directly. On failure, a toast in Spanish.
- **No `IStorageService` calls** in events code (the `pos` slice may
  need it, but events is online-only).
- The `offline-sync` slice is the integration point. Zero changes to
  events code will be required when it lands (the service factory pattern
  lets `offline-sync` swap the implementation).

---

## Risks and Gaps

### Risks

| # | Risk | Likelihood | Mitigation |
|---|------|-----------|------------|
| 1 | **Frozen-on-`cerrado` enforcement drift** — the `cerrado` check is duplicated in 3 places (form disable, store guard, UI button). A typo in one path lets a closed evento get edited. | Medium | `estadoEsEditable()` is the single source of truth in `src/utils/estado.ts`; every guard and UI bind goes through it. Unit test: `estado.spec.ts` covers `cerrado` → all 3 actions return `EVENTO_CERRADO`. |
| 2 | **`costoPorUnidad` projection confusion** — brief item 13 mentions "expected_units_sold" implicitly. Users will ask "¿cuánto tengo que cobrar por unidad?" | High | v1 documents the gap explicitly in `docs/events-setup.md` and in the `ProyeccionCostosCard` ("Por unidad: pendiente — disponible en slice POS"). The `pos` slice owns it. |
| 3 | **`reemplazarTodos` plan save is destructive** — a save failure mid-transaction leaves the evento with an empty plan. | Medium | The plans service does `delete` then `insert` in two calls; on `insert` failure, the store surfaces the error and the plan is shown as empty. The `pos` slice can introduce a proper transaction later. v1 keeps the simple delete-then-insert (matches `recipes.service.actualizar`). |
| 4 | **Hand-rolled `Database` drift** — the SQL has 3 new tables, ~20 columns, 5 indexes, 6 RLS policies. | Medium | `pnpm typecheck` must pass; `pnpm test` covers at least one `supabase.from('eventos')` integration test. |
| 5 | **Cross-store reactivity in `useProyeccionCostos`** — the composable reads from 4 stores (`events`, `plans`, `recipes`, `ingredients`). A change in any one must trigger a recompute. | Low | The composable reads each store's ref inside the `computed`; Vue's dep tracking handles it. Verified in `useProyeccionCostos.spec.ts`. |
| 6 | **400-line review budget** — events forecast ~1,800 production lines, 3-4 chained PRs. | High | Chained PRs are MANDATORY; see §13. |
| 7 | **`SelectorReceta` autocomplete with 100+ recetas** — Vuetify's `v-autocomplete` filters client-side; that's fine for <10k items. | Low | Brief says single-user with <100 recetas realistically. No server-side search needed. |
| 8 | **`fecha` is a single `date`, not a `timestamptz`** — a multi-day event can't be modeled. | Locked out of v1 | See §12 gap #1. |

### Gaps from brief (locked decisions)

| # | Gap | Decision |
|---|-----|----------|
| 1 | Brief says "fecha del evento" but is it single-day or multi-day? | **Single-day v1.** `fecha` is a `date` column. A multi-day evento is a future "feria de varios días" slice. |
| 2 | Brief implies `expected_units_sold` (item 13's "costo por unidad vendido"). | **OUT OF SCOPE v1.** The projection shows fixed + variable + total. Per-unit and pricing live in the `pos` slice. |
| 3 | Brief does not define production-planning automation. | **Manual v1.** User enters `unidades_a_producir` per row. Stock-aware suggestions are a future slice. |
| 4 | Stock tracking is a known catalog gap (REQ-CATALOG §Gaps #2). Does events need it? | **No for v1.** The plan is "how much to make", not "how much is in stock". Stock can land in a Phase 3.5 or Phase 4 slice. |
| 5 | Merma surcharge (5%) — brief implies it for production. | **OUT OF SCOPE v1.** `redondearParaMermas` exists in `src/utils/moneda.ts` but is not wired. The pos slice or analytics slice can add a `aplicar_merma` toggle. |
| 6 | Brief says "notas" on the evento; what about richer metadata (URL, contact, address)? | **v1: only `notas` (free text).** URL, address, contact are deferred. |
| 7 | Reorder of plan rows? | **v1: not supported.** Rows are ordered by `created_at asc`. The `pos` slice can introduce drag-to-reorder. |

### Conflicts with foundation + catalog

**None.** The events slice consumes the foundation API surface
(`inject('supabase')`, `IStorageService`) and the catalog's
`calcularCostoReceta` verbatim. The only file modified outside
`src/{views,stores,services,composables,components,types,utils}` is
`src/router/routes.ts` (additive), `supabase/dev_bypass_rls.sql`
(additive), and the new migration SQL.

---

## Estimated Code Lines

| Bucket | Lines (approx) |
|--------|----------------|
| SQL migration + `dev_bypass_rls.sql` extension | ~140 |
| Types (`events.types.ts` + hand-rolled `Database` extension + index re-export) | ~150 |
| Services (2 files) | ~200 |
| Stores (2 files) | ~280 |
| Composables (3 files) | ~200 |
| Utils (1 new) | ~40 |
| Components (9 files) | ~620 |
| Views (3 files) | ~280 |
| Router modification + spec | ~50 |
| Specs (13 files, ~12 lines each average) | ~550 |
| Docs (`docs/events-setup.md`) | ~40 |
| **Total new + modified** | **~1,800** |

This is smaller than catalog (~2,085) but still exceeds the 400-line
review budget. **Chained PRs are MANDATORY**, not optional.

---

## Chained PRs Forecast

| PR | Scope | Approx lines | 400-line risk |
|----|-------|--------------|----------------|
| **PR1 — Schema + state machine + projection math** | SQL migration + `dev_bypass_rls.sql` extension + `docs/events-setup.md` + `events.types.ts` + hand-rolled `Database` extension + `src/utils/estado.ts` + `src/composables/useProyeccionCostos.ts` (composable + pure function) + 4 specs (useProyeccionCostos, estado, types snapshot, supabase mock reuse). | ~430 | Medium (just over) |
| **PR2 — Events CRUD + gastos domain** | `events.service.ts` + `events.store.ts` + `useEvents.ts` + `EventoForm.vue` + `EventoListItem.vue` + `EventoStatusChip.vue` + `EventosView.vue` + `GastoFijoForm.vue` + `GastoFijoListItem.vue` + `EventoDetalleView.vue` + 7 specs. | ~580 | High (will likely need F2 split: PR2a services+stores, PR2b components+views) |
| **PR3 — Planning + projection UI** | `plans.service.ts` + `plans.store.ts` + `usePlans.ts` + `SelectorReceta.vue` + `PlanProduccionRow.vue` + `PlanProduccionGrid.vue` + `ProyeccionCostosCard.vue` + `PlanificarEventoView.vue` + 6 specs. | ~480 | Medium |
| **PR4 — Wire-up + config + docs + verify** | Router modifications (3 lazy routes) + `routes.spec.ts` update + final `verify-report.md` + final docs polish. | ~80 | Low |

**Recommendation for `sdd-tasks`**: structure PR1 and PR3 to stay under
400 lines. Proactively apply the F2 split to PR2 (PR2a: services+stores
~200 lines; PR2b: components+views ~380 lines). The foundation's F2
precedent (splitting Vuetify plugin from PR1 into PR2) and the catalog's
F2 precedent (splitting RecetaDetalleView from PR3) are the templates.

`chain_strategy`: stacked-to-main (matches foundation + catalog).
`delivery_strategy`: ask-always (preflight default).

---

## Ready for Proposal

**Yes.** The proposal phase has everything it needs:

- Data model with full column lists, FKs, indexes, RLS for 3 new tables.
- Service / store / composable / view mapping to the catalog's existing
  pattern (one-store-per-domain, factory services, never-throw contract).
- Production planning approach (manual units, hybrid deferred).
- Cost projection algorithm (pure function + composable, formula, 8
  documented edge cases).
- State machine (`planificacion` → `en_curso` → `cerrado`) with the
  freeze-on-`cerrado` enforcement pattern.
- Database setup method (additive SQL migration, `dev_bypass_rls.sql`
  extension, manual Dashboard run).
- Type-generation decision (hand-rolled `Database` extension, deferred CLI).
- Routes, components, file inventory (44 files touched).
- Test strategy (unit / integration / component breakdown with ~60 tests
  forecast, strict TDD order).
- Chained-PR forecast (4 PRs, ~1,800 total lines, stacked-to-main).
- Risks and gaps documented (8 risks, 7 gaps, all with locked decisions).

The proposal phase MUST also:
1. Document the `dev_bypass_rls.sql` extension (with the explicit
   "removed in the auth-flow slice" marker — same as catalog).
2. Reaffirm the catalog's `costo_total`-on-`recetas` decision (no
   denormalized column on `eventos` either).
3. Decide on the `costoPorUnidad` (per-unit) projection: explicit
   OUT-OF-SCOPE for v1, ownership transferred to the `pos` slice.
4. Decide on the `SelectorReceta` reuse vs. new component: this
   exploration recommends a new `SelectorReceta.vue` (mirrors
   `SelectorMateriaPrima` exactly — same props/emits shape) so the
   spec's ISP is clean (no "this is a materia prima picker that
   happens to also pick recetas" coupling).

---

## Key Learnings

- **The events slice is a 3-table + 1-composable addition that consumes the catalog's `calcularCostoReceta` verbatim.** The variable-cost side of the projection is `Σ(unidades_a_producir × costo_por_unidad_receta)` — the same `costoPorUnidad` from `calcularCostoReceta(receta, materias)`. No duplication, no drift; a single source of truth for the cost math lives in the catalog.
- **State machine + freeze-on-`cerrado` is the single most important new architectural decision.** Three enforcement points (form disable, store guard, UI button) all read `estadoEsEditable(estado)` from `src/utils/estado.ts`. The brief's 3-phase flow (pre-evento / durante / post-evento) is the user-facing framing; the `cerrado` enum value is the technical freeze. Unit tests for `estado.spec.ts` cover the full 9-combo truth table for `transicionEstadoValida` and the 3-value table for `estadoEsEditable`.
- **Production planning is manual in v1, hybrid is deferred.** The brief's "how much to produce" question is resolved by shipping a flat editable grid with `SelectorReceta` + `unidades_a_producir` input + live cost display. Stock-aware and demand-aware suggestions are out of scope because both `stock_actual` (catalog gap) and `expected_units_sold` (POS slice) are unavailable in v1.
- **Cost projection is computed, never stored.** Same rationale as the catalog's `recetas` table: a denormalized `costo_total` on `eventos` invites stale data when an ingredient's price changes mid-day. The `computed()` in `useProyeccionCostos` gives free memoization; the pure function `calcularProyeccion(...)` is the unit-testable core.
- **The 1,800-line forecast still exceeds the 400-line review budget.** Chained PRs are MANDATORY (4 PRs, with a likely F2 split in PR2). This matches the foundation (F2 split for Vuetify) and catalog (F2 split for RecetaDetalleView) precedents — preemptive task splits save reviewer time.
- **`SelectorReceta` is a new component, not a reuse of `SelectorMateriaPrima`.** Both are Vuetify `v-autocomplete` wrappers; both share the same prop/emit shape; but the ISP decision is to keep them separate so the events slice's component spec doesn't have to know about materias primas. The catalog precedent (separate `SelectorMateriaPrima` and `SelectorReceta`-would-be) is the template.
- **`costoPorUnidad` projection is explicitly OUT OF SCOPE v1.** Brief item 13 mentions it implicitly through "expected_units_sold". The v1 `ProyeccionCostosCard` shows fixed + variable + total; a "(por unidad: pendiente)" placeholder documents the gap and the `pos` slice owns the resolution. This is a deliberate v1 boundary, not a forgotten requirement.
