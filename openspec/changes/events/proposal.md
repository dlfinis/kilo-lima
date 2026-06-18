# Proposal: `events` — CRUD Eventos, Gastos Fijos, Planificación y Proyección de Costos

> **Change**: `events` | **Phase**: `sdd-propose` → feeds `sdd-spec` and `sdd-design`
> **Source PRD**: `brief.md` §7 Phase 3 (items 10–13, locked scope).
> **Source analysis**: `openspec/changes/events/exploration.md` (READ FIRST — every decision below is sourced from it).
> **Artifact store mode**: `both` (filesystem + Engram).
> **Delivery**: chained PRs (4 slices, with an F2 split on PR2), stacked-to-main, ~1,800 total lines — exceeds 400-line review budget, chained PRs are MANDATORY.

---

## 1. Title and Executive Summary

**Title**: `events` — CRUD Eventos + Gastos Fijos por Evento + Planificación de Producción (manual) + Proyección de Costos (pure function).

**Executive summary**: The `events` slice delivers brief Phase 3 items 10–13 in one cohesive change: full create/read/update/delete over `eventos` with a 3-state machine (`planificacion` → `en_curso` → `cerrado`), per-event `gastos_fijos` rows in 6 locked categories, a manual `plan_produccion` grid (one row per `(receta, unidades_a_producir)`), and an on-the-fly `calcularProyeccion` pure function that reuses the catalog's `calcularCostoReceta` to produce a `costosFijos + costosVariables = costoTotal` breakdown. It is the **first slice with a state machine** and the **first slice that composes multi-store data** (events + gastos + plan + recipes + ingredients) inside a single `computed` projection. Events is **strictly additive** to the foundation + catalog API surfaces (`inject('supabase')`, factory services, never-throw contract, hand-rolled `Database` interface, chainable Supabase mock) and **introduces zero new dependencies** to `package.json`. It blocks `pos` (which drives `en_curso → cerrado` and consumes the projection), `analytics` (which reads historical closed eventos), and `reports` (which exports the projection). Strict TDD applies — ~60 new tests land before the implementation in 4 chained PRs (PR2 likely needs an F2 split).

---

## 2. Context and Motivation

- **PRD scope** (`brief.md` §7 Phase 3, items 10–13): CRUD Eventos → Gastos fijos por evento → Planificación de producción → Proyección de costos totales. Locked; no extensions.
- **Foundation is ARCHIVED**, **catalog is ARCHIVED**: foundation shipped the API surface (54/54 REQ-IDs), catalog shipped the domain primitives (46/46 REQ-IDs, 3 tables, `calcularCostoReceta` pure function, hand-rolled `Database` interface, chainable Supabase mock, `dev_bypass_rls.sql` active). Events inherits both verbatim and adds the first multi-table join (`gastos_fijos.evento_id`, `plan_produccion.evento_id`, `plan_produccion.receta_id`), the first domain state machine (`estado` enum), and the first derived business view (the cost projection, computed in pure functions).
- **Why now**: `pos` cannot run without eventos to attach sales to; `analytics` cannot compute profit without the projection; `reports` cannot export without a structured cost breakdown. Without this change, no Phase 4 or Phase 5 slice can be specified, designed, or implemented.
- **Why a separate slice** (not absorbed into catalog): catalog was sized for "primitives + cost math" (3 tables, 1 pure function). Events is the first slice that needs a state machine, multi-table composition, and bulk-save semantics for a grid. Mixing these concerns into catalog would have blown the 400-line PR budget and diluted the SRP line that catalog intentionally established.
- **Business framing**: the brief's 3-phase flow (pre-evento / durante-evento / post-evento) maps 1:1 to the 3-state machine. `planificacion` is pre-evento (gastos + plan can be edited); `en_curso` is durante-evento (POS records sales against this evento); `cerrado` is post-evento (read-only historical record consumed by analytics and reports).

---

## 3. Decisions (LOCKED — immutable, sourced from exploration)

| # | Decision | One-line rationale | Source |
|---|---|---|---|
| 1 | **Data model = 3 Supabase tables**: `eventos`, `gastos_fijos`, `plan_produccion`. `proyeccion` is a derived view (NOT a table). | Normalized 3NF; FK + UNIQUE enforce business invariants (`(evento_id, receta_id)` UNIQUE prevents duplicate plan rows); `RECETA_FALTANTE` is a defensive case, not a schema case. | exploration §Data Model |
| 2 | **DB setup = SQL migration file + Dashboard SQL editor** (no supabase CLI installed); RLS permissive for authenticated, strict for anon; `dev_bypass_rls.sql` extended for events dev, removed in `auth-flow` slice | Lowest friction for a single-user app; auditable from git; CLI install deferred to CI slice. | exploration §Database Setup, §10 |
| 3 | **State machine = `planificacion` → `en_curso` → `cerrado`** with `planificacion` → `cerrado` shortcut. No backward transitions. Frozen-on-`cerrado` enforced via `estadoEsEditable()` helper at 3 enforcement points. | Matches the brief's 3-phase flow; one source of truth (`src/utils/estado.ts`); unit-testable 9-combo truth table for `transicionEstadoValida` + 3-value table for `estadoEsEditable`. | exploration §5, §8 |
| 4 | **Production planning = manual units in v1**. User enters `unidades_a_producir` per `(receta, unidades)` row. Stock-aware and demand-aware suggestions are deferred. | Stock column is a catalog gap (`stock_actual` not on `materias_primas`); demand forecast (`expected_units_sold`) is a `pos` slice concern. Both unavailable in v1. | exploration §4 Production Planning, §9 |
| 5 | **Cost projection = pure function `calcularProyeccion` + composable `useProyeccionCostos`**. The composable is a `computed` that reads from 4 stores (events, plans, recipes, ingredients). Reuses catalog's `calcularCostoReceta` verbatim. | Same rationale as the catalog's `recetas` table: reactive + unit-testable; no denormalized `costo_total` column to drift when `materia_prima.costo_por_unidad` changes; free memoization via `computed`. | exploration §Cost Projection Algorithm, §10 |
| 6 | **Single-day eventos** — `fecha` is a `date` column, not a `timestamptz range`. Multi-day eventos (`fecha_inicio` + `fecha_fin`) are deferred. | Brief says "fecha del evento" without specifying duration. The "feria de varios días" use case is a future slice. KISS — one date column. | exploration §Data Model, §12 gap #1 |
| 7 | **Delivery = 4 chained PRs stacked-to-main**: PR1 (schema+state-machine+projection-math), PR2 (events+gastos CRUD+views, F2 split likely: PR2a services+stores, PR2b components+views), PR3 (planning UI+projection card), PR4 (router+config+docs+verify). | ~1,800 lines (smaller than catalog's ~2,085 but still >400 budget). Foundation + catalog precedents (F2 split for Vuetify plugin and for `RecetaDetalleView`) make the proactive PR2 split the recommended path. | exploration §13 Chained PRs Forecast, §14 |
| 8 | **Test strategy = strict TDD (RED-GREEN-REFACTOR)** — ~60 new tests (unit + integration + component). Chainable Supabase mock in `tests/setup.ts` is reused as-is. | Foundation `strict_tdd: ENABLED` per engram `sdd/kilo-lima/testing-capabilities`; catalog PR1 flipped `openspec/config.yaml`; events inherits config verbatim. Specs land BEFORE implementation in each PR. | exploration §Test Strategy, §13 |

---

## 4. Scope

### 4.1 In-scope (concrete deliverables with SRP justification)

| Deliverable | Single Responsibility (SRP) |
|---|---|
| `supabase/migrations/20260618000000_events_inicial.sql` | Owns the schema, indexes, RLS policies, and `updated_at` trigger for `eventos` (the two child tables only need `created_at`). One change, one migration. |
| `supabase/dev_bypass_rls.sql` (modified) | Extends the existing catalog dev bypass with `grant select, insert, update, delete` for the 3 new tables. Loud dev-only header comment names `auth-flow` as the removal slice. |
| `docs/events-setup.md` | User-facing one-time setup instructions (paste the new migration + re-run the extended bypass). |
| `src/types/events.types.ts` | Spanish domain types (`Evento`, `GastoFijo`, `PlanProduccion`, `EstadoEvento`, `CategoriaGasto`), `*Input` variants, plus the pure-function output shapes (`LineaProyeccion`, `ProyeccionCostos`). |
| `src/types/database.types.ts` (modified) | Adds 3 new tables to the hand-rolled `Database` interface (`eventos`, `gastos_fijos`, `plan_produccion`). |
| `src/types/index.ts` (modified) | Re-exports events types. |
| `src/services/events.service.ts` | Owns Supabase CRUD for `eventos` + `gastos_fijos` (joined — they share `listarPorEvento` UX). Factory takes `SupabaseClient<Database>` via DI. |
| `src/services/plans.service.ts` | Owns Supabase CRUD for `plan_produccion` (separate service — different domain, different read pattern). Includes `reemplazarTodos(eventoId, filas)` for the "save plan" button (delete-then-insert, mirrors `recipes.service.actualizar`). |
| `src/stores/events.store.ts` | Owns Pinia state for `eventos` + `gastosFijos` (event-scoped state lives here, mirroring catalog's "receta + receta_ingredientes in one store" precedent). Exposes `cambiarEstado` (gated by `transicionEstadoValida`) and gasto actions (gated by `estadoEsEditable`). |
| `src/stores/plans.store.ts` | Owns Pinia state for `plan_produccion` rows keyed by `eventoId`. Exposes `guardarPlan` calling `reemplazarTodos`. |
| `src/composables/useEvents.ts` | Thin view-layer wrapper around `events.store`. |
| `src/composables/usePlans.ts` | Thin view-layer wrapper around `plans.store`. |
| `src/composables/useProyeccionCostos.ts` | Composable that exposes the `computed` projection; **also exports** the pure function `calcularProyeccion(evento, gastosFijos, plan, recetas, materiasPrimas)` so unit tests skip Vue/Pinia entirely. |
| `src/utils/estado.ts` | Owns the pure helpers `transicionEstadoValida(desde, hacia)` and `estadoEsEditable(estado)` — the single source of truth for the state machine and the frozen-on-`cerrado` check. |
| `src/components/business/EventoStatusChip.vue` | Reusable Vuetify chip rendering color + label per `estado` (`planificacion`=blue, `en_curso`=orange, `cerrado`=grey). |
| `src/components/business/EventoListItem.vue` | Row in `EventosView` list: name, formatted date, `EventoStatusChip`, total cost (live via `useProyeccionCostos`). |
| `src/components/business/EventoForm.vue` | Create/edit form for an `evento`. Includes the "Cambiar estado" section that calls `cambiarEstado` post-submit. Locks the form when `estado === 'cerrado'`. |
| `src/components/business/GastoFijoForm.vue` | Create/edit form for a `gasto_fijo` row. Validates `monto >= 0` and `categoria` is one of the 6 enum values. |
| `src/components/business/GastoFijoListItem.vue` | Row in the gastos list: categoria, monto (USD), descripcion, delete button. |
| `src/components/business/SelectorReceta.vue` | Autocomplete for picking a `receta` inside the plan grid. **New component, not a reuse of `SelectorMateriaPrima`** — same prop/emit shape, separate file keeps ISP clean. |
| `src/components/business/PlanProduccionRow.vue` | One row in the grid: `SelectorReceta` + `unidades_a_producir` input + live "× $X" cost display + delete button. |
| `src/components/business/PlanProduccionGrid.vue` | Grid container owning the `PlanProduccionInput[]` v-model, "Agregar fila" button, and "Guardar plan" button (disabled when `estado === 'cerrado'`). |
| `src/components/business/ProyeccionCostosCard.vue` | The card with 3 sections (fijos, variables, total). Renders a yellow `v-alert` when any `linea.advertencia` is set. |
| `src/views/EventosView.vue` | List page. Top: "+ Nuevo evento" button (opens `EventoForm` dialog). Below: `EventoListItem` rows. |
| `src/views/EventoDetalleView.vue` | Single evento detail page: header (name, date, status, "Editar" + "Eliminar" + "Cambiar estado" buttons), tabs ("Gastos fijos" with form+list, "Plan de producción" with link to `/eventos/:id/planificar`), bottom: live `ProyeccionCostosCard`. |
| `src/views/PlanificarEventoView.vue` | Dedicated planning page: header with evento name + status, body `PlanProduccionGrid`, right rail (or below on mobile) `ProyeccionCostosCard`, single "Guardar plan" button. |
| `src/router/routes.ts` (modified) | Appends 3 lazy routes: `/eventos`, `/eventos/:id`, `/eventos/:id/planificar`. |
| `src/router/routes.spec.ts` (modified) | Adds 3 `expect` assertions for the new routes (mirrors catalog's pattern). |
| **~13 spec files** (one per source file, strict TDD order) | Unit tests for `useProyeccionCostos` (8 edge cases) + `estado.spec` (9+3 truth tables) + 2 service specs + 2 store specs + 7 component specs + 3 view specs. |
| `tests/setup.ts` | **No changes needed** — the chainable Supabase mock is generic. |

### 4.2 Out-of-scope (explicit non-goals)

- **No stock / inventory tracking** — no `stock_actual` column on `materias_primas`, no stock-aware plan suggestions, no stock-vs-plan validation. The plan answers "how much to make", not "how much is in stock".
- **No multi-day eventos** — `fecha` is a single `date` column, not a `fecha_inicio` + `fecha_fin` range. Multi-day "feria de varios días" is a future slice.
- **No `expected_units_sold` and no `costo_por_unidad` projection** — the per-unit projection requires a demand forecast, which is a `pos` slice concern (Phase 4). v1 shows fixed + variable + total only; the `ProyeccionCostosCard` includes a "(por unidad: pendiente)" placeholder documenting the gap.
- **No profit calculation per unit** — pricing (sale price − cost = margin) is a `pos` slice concern. v1 has no price column on any table.
- **No transacciones** — `plans.service.reemplazarTodos` is `delete` then `insert` in two separate calls. On `insert` failure, the plan is shown as empty and the user must retry. A proper `BEGIN`/`COMMIT` block is a `pos` slice concern.
- **No notifications / reminders** — no toast on `en_curso` start, no email/SMS, no browser notification. v1 surfaces state changes in the UI only.
- **No export** — no jsPDF, no CSV, no share link. `reports` slice owns exports.
- **No bulk import** — no CSV / Excel import of eventos or gastos. Single-event creation only.
- **No image attachments** — no `foto_url`, no `portada_url`, no Supabase Storage use in events.
- **No merma surcharge (5%)** — `redondearParaMermas` exists in `src/utils/moneda.ts` from catalog but is NOT wired into the v1 projection. The toggle is a `pos` or `analytics` slice concern.
- **No auth UI** — `useAuth` remains stubbed. Events is single-user; the `auth-flow` slice ships real auth.
- **No offline sync** — events is online-only, same as catalog. The `offline-sync` slice (Phase 5, item 20) wires the WAL + queue.
- **No drag-to-reorder on plan rows** — rows are ordered by `created_at asc`. Reorder UI is a `pos` slice concern.
- **No rich metadata on `eventos`** — only `nombre`, `fecha`, `ubicacion` (optional), `notas` (optional), `estado`. No `url`, no `contact_email`, no `address` (separate columns). All free text goes into `notas`.
- **No CI / `gen:types`** — deferred to the CI slice. Hand-rolled `Database` extension stays.
- **No i18n** — Spanish UI text hardcoded.
- **No new dependencies** — zero entries in `package.json`.

---

## 5. Stack (zero new dependencies)

Events adds **zero new entries to `package.json`**. Verification against exploration §1 + foundation + catalog archives:

| Concern | Package | Pin | Events use |
|---|---|---|---|
| UI | `vue@^3.5.38` + `vuetify@^3.12.8` | foundation (unchanged) | forms, dialogs, chips, alerts, tabs, autocomplete, data tables |
| State | `pinia@^3.0.4` | foundation (unchanged) | `useEventsStore`, `usePlansStore` |
| Backend | `@supabase/supabase-js@^2.108.2` | foundation (unchanged) | service layer for 3 new tables |
| Routing | `vue-router@^4.6.4` | foundation (unchanged) | 3 new lazy routes |
| Math | `Math.round(x * 100 + Number.EPSILON) / 100` | vanilla JS | `redondearCentavos` is reused from catalog's `src/utils/moneda.ts` |
| Date | `dayjs@^1.11.13` | foundation (unchanged) | `formatearFecha(fecha)` rendering in list items + detail view |
| Testing | `vitest@^2.1.9` + `@vue/test-utils@^2.4.11` | foundation (unchanged) | ~60 new tests |
| Build | `vite@^5.4.21` + `vue-tsc@^3.3.5` | foundation (unchanged) | typecheck |
| Lint/Format | `eslint@^9.39.4` + `prettier@^3.8.4` | foundation (unchanged) | unchanged |

**Optional future dep (NOT in this slice)**: `supabase` CLI (devDep) — to regenerate `Database` types. Deferred to the CI slice.

**No `zod` for form validation** — events forms use native HTML5 + Vuetify field validation, same as catalog. A future slice may introduce Zod for shared schema validation.

---

## 6. File Structure (new files marked `NEW`, modified `MOD`)

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
│   │   ├── exploration.md                              (existing)
│   │   ├── proposal.md                                 NEW (this file)
│   │   ├── specs/                                      (sdd-spec writes here)
│   │   ├── design.md                                   (sdd-design writes here)
│   │   └── tasks.md                                    (sdd-tasks writes here)
│   └── config.yaml                                     (no changes — already aligned by catalog)
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
├── tests/
│   └── setup.ts                                        (no changes — chainable mock is generic)
```

**Untouched foundation + catalog files** (proof of additive change): `App.vue`, `main.ts`, `App.spec.ts`, `utils/env.ts`, `plugins/vuetify.ts`, `plugins/services.ts`, `services/supabase.client.ts`, `localforage.client.ts`, `storage.interface.ts`, `storage.service.ts`, `composables/useAuth.ts`, `useOnlineStatus.ts`, `usePwaUpdate.ts`, `composables/useCalculoReceta.ts` (reused verbatim), `stores/app.store.ts`, `views/HomeView.vue`, all of `src/services/{ingredients,recipes}.service.ts`, all of `src/stores/{ingredients,recipes}.store.ts`, all of `src/composables/{useIngredients,useRecipes}.ts`, all of `src/types/catalog.types.ts`, all of `src/utils/moneda.ts` (reused), and the catalog migration `supabase/migrations/20260616120000_catalog_inicial.sql`.

**Counts**: 26 new source files + 13 new spec files + 5 modified files = 44 files touched.

---

## 7. Data Model (3 new Supabase tables)

All three tables follow the catalog convention: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`. `eventos` also has `updated_at` with a trigger (it mutates); the two child tables only have `created_at` (no per-row updates in v1 — `reemplazarTodos` is delete-then-insert).

### `public.eventos`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `nombre` | `text` | NOT NULL, CHECK `length(nombre) > 0` | Display name. |
| `fecha` | `date` | NOT NULL | **Single-day v1** (locked — multi-day deferred to §18 Non-Goals). |
| `ubicacion` | `text` | NULL | Optional free text. |
| `estado` | `text` | NOT NULL, CHECK `estado in ('planificacion','en_curso','cerrado')`, default `'planificacion'` | State machine — see §8. |
| `notas` | `text` | NULL | Optional free text. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | Trigger updates on UPDATE. |

**Indexes**:
- `idx_eventos_fecha` on `(fecha desc)` — default "most recent first" ordering.
- `idx_eventos_estado` on `(estado)` — filter by estado ("active eventos in planificacion").
- `idx_eventos_nombre_lower` on `(lower(nombre))` — typeahead search.

**No `costo_total` column**: same rationale as the catalog's `recetas` table — a denormalized `costo_total` would invite stale data when an ingredient's price changes mid-day. The projection is a derived view that lives in a composable.

### `public.gastos_fijos`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE CASCADE` | Cascade: deleting an evento removes its gastos. |
| `categoria` | `text` | NOT NULL, CHECK `categoria in ('renta','transporte','permisos','publicidad','servicios','otro')` | Locked 6-value enum (KISS — covers the brief's "rent, transport, permits, etc."). |
| `monto` | `numeric(10,2)` | NOT NULL, CHECK `monto >= 0` | USD, 2 decimals. |
| `descripcion` | `text` | NULL | Optional free text. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Foreign keys**:
- `gastos_fijos_evento_id_fkey`: `evento_id` → `eventos.id` (CASCADE on delete).

**Indexes**:
- `idx_gastos_fijos_evento_id` on `(evento_id)` — hot path for `listarPorEvento(eventoId)`.

**Frozen on `cerrado`**: the `GastoFijoForm` and the store's gasto actions check the parent evento's `estado` before allowing any mutation. The `cerrado` estado short-circuits all gasto mutations.

### `public.plan_produccion`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `evento_id` | `uuid` | NOT NULL, FK → `eventos(id) ON DELETE CASCADE` | |
| `receta_id` | `uuid` | NOT NULL, FK → `recetas(id) ON DELETE RESTRICT` | RESTRICT: cannot delete a receta that is in a plan. |
| `unidades_a_producir` | `numeric(10,4)` | NOT NULL, CHECK `unidades_a_producir > 0` | How many units of this receta to make. |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |

**Foreign keys**:
- `plan_produccion_evento_id_fkey`: `evento_id` → `eventos.id` (CASCADE on delete).
- `plan_produccion_receta_id_fkey`: `receta_id` → `recetas.id` (RESTRICT on delete).

**Indexes**:
- `idx_plan_produccion_evento_id` on `(evento_id)` — hot path for `listarPorEvento(eventoId)`.
- `idx_plan_produccion_receta_id` on `(receta_id)` — reverse lookup "which eventos plan this receta?" (used in delete-restriction error message and future analytics).
- `uq_plan_produccion_evento_receta` UNIQUE on `(evento_id, receta_id)` — a plan cannot list the same receta twice. UX in the form prevents duplicates client-side, but the constraint is the source of truth.

**No `costo_total` column**: same rationale as `eventos` and `recetas`.

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

**Anon role is NOT granted access.** `dev_bypass_rls.sql` is extended to grant the anon role access to the 3 new tables; the `auth-flow` slice removes the bypass.

### Migration ordering and atomicity

Single file `supabase/migrations/20260618000000_events_inicial.sql` containing (in this order):
1. `eventos` table + indexes + RLS + `updated_at` trigger.
2. `gastos_fijos` table + indexes + RLS.
3. `plan_produccion` table + indexes + RLS.
4. Idempotent (`create table if not exists`, `drop policy if exists`) so re-runs are safe.

**No new migration for `dev_bypass_rls.sql`** — the existing file is patched in the events PR1 (3 new `grant` lines appended). The `auth-flow` slice removes the entire bypass.

**Why single migration file**: events is one logical change. Splitting it across migrations is premature; the `pos` slice (Phase 4) can add a new migration later if it needs to alter the schema (e.g., add a `unidades_vendidas` column for stock tracking).

---

## 8. State Machine (`planificacion` → `en_curso` → `cerrado`)

### Transitions

```
        ┌──────────────┐
        │ planificacion│
        │  (default)   │
        └──────┬───────┘
               │  cambiarEstado('en_curso')   [also: 'cerrado' to cancel]
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

**No backward transitions**: once `cerrado`, you cannot reopen. This matches the brief's "Post-evento: análisis" phase — closed events become read-only historical records.

### "Frozen on `cerrado`" enforcement

Three enforcement points, all reading the same `estadoEsEditable(estado)` helper from `src/utils/estado.ts`:

1. **`events.service.cambiarEstado`** — calls `transicionEstadoValida(desde, hacia)` before the Supabase update. Returns `TRANSICION_INVALIDA` if not allowed.
2. **`events.store` gasto actions** (`crearGasto`, `actualizarGasto`, `eliminarGasto`) — call `estadoEsEditable(eventoActual.estado)` before any mutation. Return `EVENTO_CERRADO` if frozen.
3. **`plans.store.guardarPlan`** — same check via the composable. Returns `EVENTO_CERRADO` if frozen.
4. **View layer** (`EventoDetalleView`, `PlanificarEventoView`) — reads the same `estado` ref to disable buttons ("Agregar gasto", "Editar plan", "Cambiar estado") when the evento is `cerrado`. Declarative: the state is the source of truth.

The pure helper `estadoEsEditable(estado: EstadoEvento): boolean` is the single source of truth for the frozen check (mirrors `transicionEstadoValida` for transitions). Unit tests cover the full 9-combo truth table for `transicionEstadoValida` and the 3-value table for `estadoEsEditable`.

### Why a `cerrado` freeze

The brief's 3-phase flow (pre-evento / durante / post-evento) is the user-facing framing. `cerrado` is the technical marker that the plan and gastos are locked. Post-evento analytics consume the historical record; the `pos` slice is the one that drives `en_curso → cerrado` (when the user closes the daily register).

### Where the state machine lives

- `src/utils/estado.ts` — `transicionEstadoValida(desde, hacia): boolean` and `estadoEsEditable(estado): boolean`. Pure, unit-tested.
- `events.service.cambiarEstado` — validates via `transicionEstadoValida`; returns `TRANSICION_INVALIDA` error if not allowed.
- `events.store.crearGasto` etc. — guard via `estadoEsEditable(eventoActual.estado)`; returns `EVENTO_CERRADO` error if frozen.

---

## 9. Production Planning (brief item 12) — manual units in v1

### Decision: hybrid-deferred

The brief is ambiguous on the "how much to produce" question. Three candidate approaches:

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| **A. Manual units per recipe** (user types `unidades_a_producir`) | Simplest UI; matches brief item 12's "selects N recipes and specifies units to produce". User stays in control. | No stock-aware suggestions; user can over- or under-plan. | **Selected for v1.** |
| **B. Suggested by stock** (system reads `materias_primas.stock_actual` and suggests `unidades_a_producir`) | Smart; "produce what you have". | Requires `stock_actual` column on `materias_primas` (catalog gap REQ-CATALOG §Gaps #2). Out of scope. | **Deferred to a future slice.** |
| **C. Hybrid — user enters, system validates against expected demand + stock** | Best UX. | Requires both `expected_units_sold` (POS slice, out of scope) and `stock_actual` (deferred). | **Deferred.** |

### v1 behavior

`PlanProduccionGrid` is a flat editable grid with one row per `(receta, unidades_a_producir)`. The form:
- Shows a `SelectorReceta` (autocomplete) for each row.
- Has a numeric input for `unidades_a_producir` (`> 0`).
- Shows a live-computed "× unidades = $X" beside the input (uses `useProyeccionCostos`'s derived `costoLinea`).
- Has an "Agregar fila" button and a per-row "Eliminar" button.
- Has a single "Guardar plan" button at the bottom that calls `usePlans().guardarPlan(eventoId, filasFiltradas)`.

### What "validates against stock" means in v1: zero

The grid trusts the user. Stock-aware validation is a future slice (probably Phase 4 or 5).

### Why a new `SelectorReceta` (not a reuse of `SelectorMateriaPrima`)

Both are Vuetify `v-autocomplete` wrappers with the same prop/emit shape (`modelValue` + `update:modelValue`). The ISP decision is to keep them as **separate components** so the events spec doesn't have to know about `materias_primas` (and vice versa). This matches the catalog precedent of `SelectorMateriaPrima` as its own file.

### Reorder of plan rows: not supported in v1

Rows are ordered by `created_at asc`. Drag-to-reorder is a `pos` slice concern.

---

## 10. Cost Projection Algorithm (brief item 13)

### Pure function + composable

The math lives in `calcularProyeccion(evento, gastosFijos, plan, recetas, materiasPrimas)`, exported from `src/composables/useProyeccionCostos.ts`. The composable `useProyeccionCostos(eventoId)` wraps it in a `computed` that reads from the four stores (`events`, `plans`, `recipes`, `ingredients`).

```ts
// src/composables/useProyeccionCostos.ts (sketch)
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import type { Evento, GastoFijo, PlanProduccion, Receta, MateriaPrima, ProyeccionCostos } from '@/types'
import { calcularCostoReceta } from '@/composables/useCalculoReceta'

export function calcularProyeccion(
  evento: Evento,
  gastosFijos: GastoFijo[],
  plan: PlanProduccion[],
  recetas: Receta[],
  materiasPrimas: MateriaPrima[],
): ProyeccionCostos {
  const mapaRecetas = new Map(recetas.map((r) => [r.id, r]))
  const mapaMaterias = new Map(materiasPrimas.map((m) => [m.id, m]))

  const lineas = plan.map((fila) => {
    const receta = mapaRecetas.get(fila.receta_id)
    if (!receta) {
      return {
        receta_id: fila.receta_id,
        nombre: 'Receta no disponible',
        unidades: fila.unidades_a_producir,
        costoLinea: 0,
        advertencia: 'RECETA_FALTANTE' as const,
      }
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
      eventsStore.eventoActual as unknown as Evento,
      eventsStore.gastosFijos,
      plansStore.plan,
      recipesStore.recetas,
      ingredientsStore.materiasPrimas,
    )
  })
}
```

### Formula

```
costosFijos      = Σ(gastos_fijos.monto)                                  for evento_id = X
linea.i.costo    = plan.unidades_a_producir × calcularCostoReceta(receta, materias).costoPorUnidad   (per plan row)
costosVariables  = Σ(linea.costo)                                          (rounded once at the end)
costoTotal       = costosFijos + costosVariables                          (rounded once at the end)
costoPorUnidad   = OUT OF SCOPE v1 (requires expected_units_sold from POS slice)
```

### Why per-line + end-of-function rounding

Catalog's `calcularCostoReceta` uses a single `redondearCentavos` at the end (REQ-CATALOG-20). Events follows the same pattern: per-line `costoLinea` is full float precision inside the loop, but the three top-level totals (`costosFijos`, `costosVariables`, `costoTotal`) are each rounded exactly once via `Math.round(x * 100 + Number.EPSILON) / 100`. This avoids cumulative float drift across many plan rows and matches the catalog's `redondearCentavos` helper verbatim.

### Edge cases (each MUST have a unit test)

| # | Case | Expected |
|---|---|---|
| 1 | Empty plan, no gastos | `{ costosFijos: 0, costosVariables: 0, costoTotal: 0, lineas: [] }` |
| 2 | Empty plan, with gastos | `costosFijos` = sum of gastos, `costosVariables` = 0, `costoTotal` = `costosFijos` |
| 3 | Plan with rows, no gastos | `costosFijos` = 0, `costosVariables` = sum, `costoTotal` = `costosVariables` |
| 4 | Plan row references a deleted receta (FK prevents, defensive) | line: `{ advertencia: 'RECETA_FALTANTE', costoLinea: 0 }`; UI shows a yellow `v-alert` "Esta receta ya no existe. Quitá la fila del plan." |
| 5 | Plan row references a receta whose materia prima was deleted (catalog's `MATERIA_PRIMA_FALTANTE` propagates) | `calcularCostoReceta` returns 0 for that line's subtotal; `costoPorUnidad` reflects the partial total. The card shows a yellow `v-alert`. |
| 6 | `unidades_a_producir = 0` | Form blocks submission; the pure function returns `costoLinea: 0` defensively. |
| 7 | Floating-point noise (e.g. 0.1 + 0.2) | Single `Math.round(sum * 100 + EPSILON) / 100` at each total. |
| 8 | Merma surcharge (5%) | **OUT OF SCOPE v1**. `redondearParaMermas` exists in catalog utils but is not wired. The composable's `linea.costoLinea` does NOT multiply by 1.05 in v1. Documented gap — see §16 gap #5. |

### UI: `ProyeccionCostosCard`

The card renders three sections:
1. **Costos fijos** — sum + line breakdown (description + monto per gasto).
2. **Costos variables** — sum + line breakdown (receta name + unidades × costoPorUnidad).
3. **Total** — single bold number.

If any line carries an `advertencia`, a yellow `v-alert` shows at the top of the card with the count: "Hay 2 líneas con problemas — revisá el plan".

### `costoPorUnidad` projection (item 13's "expected_units_sold" half) — OUT OF SCOPE v1

The brief mentions "expected_units_sold" implicitly through the per-unit projection. Implementing it requires:
- A new `expected_units_sold` field on `eventos` (or a separate `pronostico_ventas` table), AND
- A decision on whether it's per-receta or per-evento.

Both are POS-slice concerns (Phase 4, items 14–17). v1 shows the total; the per-unit field is a v2 enhancement. The `ProyeccionCostosCard` includes a "(por unidad: pendiente — disponible en slice POS)" placeholder to make the gap explicit to the user.

### Why on-the-fly (no `costo_total` column on `eventos`)

Same rationale as the catalog's `recetas` table:
- Single-user, <10k rows; the math is O(plan rows + receta ingredients) — sub-millisecond.
- A denormalized column invites drift when a `materia_prima.costo_por_unidad` changes mid-day.
- The reactive `computed` in the view gives free memoization; the projection is never stale.

---

## 11. Database Setup Workflow

### One-time manual steps (documented in `docs/events-setup.md`)

1. Open Supabase Dashboard → SQL Editor → New query.
2. Paste `supabase/migrations/20260618000000_events_inicial.sql` → Run. Idempotent (`create table if not exists`, `drop policy if exists`).
3. **NEW STEP**: re-run `supabase/dev_bypass_rls.sql` (the events PR extends it with 3 new `grant` lines). The extended file is checked into the repo.
4. Restart `pnpm dev`. The Vite app now reads + writes through the anon key.

### `dev_bypass_rls.sql` lifecycle (unchanged from catalog)

Present in events dev; `auth-flow` slice removes it. The events PR extends the file (or appends a new `dev_bypass_rls.events.sql` that supersedes the catalog one — `sdd-tasks` decides which is cleaner). The header comment is loud about being dev-only.

---

## 12. Types Extension (hand-rolled `Database` + Spanish domain types)

### `src/types/database.types.ts` (modified)

Add 3 new entries under `Database['public']['Tables']`:
- `eventos` — `id`, `nombre`, `fecha` (date string), `ubicacion`, `estado`, `notas`, `created_at`, `updated_at`.
- `gastos_fijos` — `id`, `evento_id`, `categoria`, `monto`, `descripcion`, `created_at`.
- `plan_produccion` — `id`, `evento_id`, `receta_id`, `unidades_a_producir`, `created_at`.

Each table gets `Row`, `Insert`, `Update` (partial of Insert), and `Relationships` (foreign keys). The hand-rolled pattern matches the catalog's 3-table shape.

A header comment block explains the regeneration command (deferred to CI slice):

```ts
// TO REGENERATE FROM SUPABASE (deferred to CI slice):
// npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts
```

`pnpm typecheck` MUST pass. `pnpm test` covers at least one `supabase.from('eventos')` integration test to catch column-name mismatches at runtime. The hand-rolled types stay until the CI slice adds `gen:types`.

### `src/types/events.types.ts` (new)

Spanish domain types that mirror the SQL columns 1:1 (same convention as `catalog.types.ts`):

```ts
export type EstadoEvento = 'planificacion' | 'en_curso' | 'cerrado'
export type CategoriaGasto =
  | 'renta' | 'transporte' | 'permisos' | 'publicidad' | 'servicios' | 'otro'

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

// Pure-function output shapes (NOT SQL rows)
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

`ServiceError` is reused from `catalog.types.ts` (already exported via `src/types/index.ts`).

---

## 13. Test Strategy (strict TDD — RED-GREEN-REFACTOR)

### Forecast: ~60 new tests

| Layer | Count | Examples |
|---|---|---|
| Unit (no Vue / Pinia / Supabase) | ~22 | `useProyeccionCostos.spec.ts`: 8 edge cases. `estado.spec.ts`: 9-combo `transicionEstadoValida` + 3-value `estadoEsEditable` = 12. `events.service.spec.ts`: 6. `plans.service.spec.ts`: 4 (incl. `reemplazarTodos`). |
| Integration (services + Pinia + mocked Supabase) | ~12 | `events.store.spec.ts` (real `createPinia()`, mock service, frozen-on-`cerrado`). `plans.store.spec.ts` (incl. `guardarPlan`). |
| Component (`mount` + real Pinia + real Vuetify + mocked service) | ~26 | 7 form/chip/selector/row/grid/card specs + 3 view specs + 1 routes spec delta. |
| **Total** | **~60** | Catalog 60 + events 60 = cumulative ~124. `pnpm test` runtime target stays ≤8 s (catalog is ~5 s; +60 tests should fit in +3 s with jsdom). |

### Chainable Supabase mock pattern (no changes to `tests/setup.ts`)

The chainable mock is already generic (it doesn't care about table names). Events tests import `__resetSupabaseMock` and `__pushSupabaseResponse` from `tests/setup.ts` exactly like the catalog tests do.

### TDD discipline (same as catalog)

- For every new file, the spec file is the **first commit of the PR**, the implementation is the second commit.
- PR reviewer's diff shows: (1) failing test, (2) passing implementation.
- `pnpm test` MUST be in the verify gate (already in `openspec/config.yaml` after catalog PR1).
- New test fixtures: a tiny `src/__fixtures__/eventos.ts` (or co-located factory functions in each spec file) that builds `Evento`, `GastoFijo`, `PlanProduccion` instances. The chainable Supabase mock receives the fixtures via `__pushSupabaseResponse`.

---

## 14. Delivery Plan (4 chained PRs, stacked-to-main)

`chain_strategy`: stacked-to-main (matches foundation + catalog). `delivery_strategy`: ask-always (preflight default). Total forecast: ~1,800 lines — exceeds 400-line review budget; chained PRs are MANDATORY.

| PR | Scope | Approx lines | Budget risk |
|---|---|---|---|
| **PR1 — Schema + state machine + projection math** | SQL migration + `dev_bypass_rls.sql` extension + `docs/events-setup.md` + `events.types.ts` + hand-rolled `Database` extension + `src/utils/estado.ts` + `src/composables/useProyeccionCostos.ts` (composable + pure function) + 4 specs (useProyeccionCostos, estado, types snapshot, supabase mock reuse). | ~430 | Medium (just over) |
| **PR2 — Events CRUD + gastos domain (F2 split recommended)** | `events.service.ts` + `events.store.ts` + `useEvents.ts` + `EventoForm.vue` + `EventoListItem.vue` + `EventoStatusChip.vue` + `EventosView.vue` + `GastoFijoForm.vue` + `GastoFijoListItem.vue` + `EventoDetalleView.vue` + 7 specs. | ~580 raw | High raw / Medium split |
| **PR2a** (if F2 split applied) | `events.service.ts` + `events.store.ts` + `useEvents.ts` + 3 specs. | ~200 | Low |
| **PR2b** (if F2 split applied) | `EventoForm.vue` + `EventoListItem.vue` + `EventoStatusChip.vue` + `EventosView.vue` + `GastoFijoForm.vue` + `GastoFijoListItem.vue` + `EventoDetalleView.vue` + 4 specs. | ~380 | Medium |
| **PR3 — Planning + projection UI** | `plans.service.ts` + `plans.store.ts` + `usePlans.ts` + `SelectorReceta.vue` + `PlanProduccionRow.vue` + `PlanProduccionGrid.vue` + `ProyeccionCostosCard.vue` + `PlanificarEventoView.vue` + 6 specs. | ~480 | Medium |
| **PR4 — Wire-up + config + docs + verify** | Router modifications (3 lazy routes) + `routes.spec.ts` update + final `verify-report.md` + final docs polish. | ~80 | Low |

**Recommendation for `sdd-tasks`**: structure PR1 and PR3 to stay under 400 lines. Proactively apply the F2 split to PR2 (PR2a: services+stores ~200 lines; PR2b: components+views ~380 lines). The foundation's F2 precedent (splitting Vuetify plugin from PR1 into PR2) and the catalog's F2 precedent (splitting `RecetaDetalleView` from PR3) are the templates.

**Per-PR acceptance**: each PR has a clear start, clear finish, autonomous scope, verification (`pnpm typecheck && pnpm lint && pnpm test`), and reasonable rollback (`git revert <sha>` or `git reset --hard HEAD~1` before push).

---

## 15. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Frozen-on-`cerrado` enforcement drift** — the `cerrado` check is duplicated in 3 places (form disable, store guard, UI button). A typo in one path lets a closed evento get edited. | Medium | `estadoEsEditable()` is the single source of truth in `src/utils/estado.ts`; every guard and UI bind goes through it. Unit test: `estado.spec.ts` covers `cerrado` → all 3 actions return `EVENTO_CERRADO`. |
| 2 | **`costoPorUnidad` projection confusion** — brief item 13 mentions "expected_units_sold" implicitly. Users will ask "¿cuánto tengo que cobrar por unidad?" | High | v1 documents the gap explicitly in `docs/events-setup.md` and in the `ProyeccionCostosCard` ("Por unidad: pendiente — disponible en slice POS"). The `pos` slice owns it. |
| 3 | **`reemplazarTodos` plan save is destructive** — a save failure mid-transaction leaves the evento with an empty plan. | Medium | The plans service does `delete` then `insert` in two calls; on `insert` failure, the store surfaces the error and the plan is shown as empty. The `pos` slice can introduce a proper transaction later. v1 keeps the simple delete-then-insert (matches `recipes.service.actualizar`). |
| 4 | **Hand-rolled `Database` drift** — the SQL has 3 new tables, ~20 columns, 5 indexes, 6 RLS policies. | Medium | `pnpm typecheck` must pass AND `pnpm test` covers at least one `supabase.from('eventos')` integration test. |
| 5 | **Cross-store reactivity in `useProyeccionCostos`** — the composable reads from 4 stores (`events`, `plans`, `recipes`, `ingredients`). A change in any one must trigger a recompute. | Low | The composable reads each store's ref inside the `computed`; Vue's dep tracking handles it. Verified in `useProyeccionCostos.spec.ts`. |
| 6 | **400-line review budget** — events forecast ~1,800 production lines. | High | 4 chained PRs are MANDATORY; PR2 likely needs F2 split (see §14). |
| 7 | **`SelectorReceta` autocomplete with 100+ recetas** — Vuetify's `v-autocomplete` filters client-side; that's fine for <10k items. | Low | Brief says single-user with <100 recetas realistically. No server-side search needed in v1. |
| 8 | **`fecha` is a single `date`, not a `timestamptz` range** — a multi-day event can't be modeled. | Locked out of v1 | See §16 gap #1. Multi-day is a future "feria de varios días" slice. |

---

## 16. Gaps from Brief (locked decisions)

| # | Gap | Decision |
|---|---|---|
| 1 | Brief says "fecha del evento" but is it single-day or multi-day? | **Single-day v1.** `fecha` is a `date` column. A multi-day evento is a future "feria de varios días" slice. |
| 2 | Brief implies `expected_units_sold` (item 13's "costo por unidad vendido"). | **OUT OF SCOPE v1.** The projection shows fixed + variable + total. Per-unit and pricing live in the `pos` slice. |
| 3 | Brief does not define production-planning automation. | **Manual v1.** User enters `unidades_a_producir` per row. Stock-aware suggestions are a future slice. |
| 4 | Stock tracking is a known catalog gap (REQ-CATALOG §Gaps #2). Does events need it? | **No for v1.** The plan is "how much to make", not "how much is in stock". Stock can land in a Phase 3.5 or Phase 4 slice. |
| 5 | Merma surcharge (5%) — brief implies it for production. | **OUT OF SCOPE v1.** `redondearParaMermas` exists in `src/utils/moneda.ts` but is not wired. The `pos` slice or `analytics` slice can add an `aplicar_merma` toggle. |
| 6 | Brief says "notas" on the evento; what about richer metadata (URL, contact, address)? | **v1: only `notas` (free text).** URL, address, contact are deferred. |
| 7 | Reorder of plan rows? | **v1: not supported.** Rows are ordered by `created_at asc`. The `pos` slice can introduce drag-to-reorder. |
| 8 | Are `gastos_fijos` and `plan_produccion` editable in `en_curso`? | **Yes.** The freeze applies ONLY to `cerrado`. The brief's durante-evento phase is meant to allow last-minute additions (e.g., "we bought more ice during the event, add a gasto"). `pos` may introduce an `en_curso`-only lock for plan rows if business feedback demands it. |

---

## 17. Acceptance Criteria (checkable list — "done" for events)

- [ ] All 4 chained PRs (or 5 if PR2 F2-splits) merged to `main`, in order, stacked.
- [ ] `pnpm install` completes without peer-dep errors.
- [ ] `pnpm dev` renders the home view AND `/eventos`, `/eventos/:id`, `/eventos/:id/planificar`.
- [ ] `pnpm typecheck` passes with `strict: true`.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` runs ~60 new tests (foundation 4 + catalog ~60 + events ~60 = cumulative ~124) and ALL pass. The chainable Supabase mock is reused as-is from `tests/setup.ts`.
- [ ] `pnpm build` produces `dist/` with PWA artifacts.
- [ ] The events migration SQL + extended `dev_bypass_rls.sql` run successfully in a fresh Supabase project via the Dashboard SQL editor.
- [ ] CRUD lifecycle works end-to-end on a fresh project: create an evento → add 2-3 gastos fijos → add 2-3 plan rows → see the live `ProyeccionCostosCard` update → change estado to `en_curso` → change to `cerrado` → confirm gastos and plan forms are now disabled and the store rejects mutations with `EVENTO_CERRADO`.
- [ ] State machine: invalid transitions (e.g. `en_curso → planificacion`, `cerrado → en_curso`) return `ServiceError { code: 'TRANSICION_INVALIDA' }` and the DB row is not updated.
- [ ] `calcularProyeccion` covers all 8 edge cases from §10: empty plan, empty gastos, deleted receta, deleted materia prima, zero unidades, float drift, large N, merma placeholder (no surcharge applied).
- [ ] `calcularCostoReceta` from catalog is reused VERBATIM — no duplicate cost math in the events slice.
- [ ] No `costo_total` column on `eventos` (verifiable via `git diff main -- supabase/migrations/`).
- [ ] Friendly error messages on Supabase failures (toast in Spanish).
- [ ] `dev_bypass_rls.sql` has a loud dev-only header comment naming the `auth-flow` slice as its removal point, AND the events PR extends it with 3 new `grant` lines.
- [ ] All `.vue` files ≤ 200 lines; all functions ≤ 30 lines; all comments are "why" only.
- [ ] Spanish identifiers for business terms (`Evento`, `GastoFijo`, `PlanProduccion`, `EstadoEvento`, `CategoriaGasto`, `calcularProyeccion`, `estadoEsEditable`, `transicionEstadoValida`); English for infrastructure (`events.service.ts`, `plans.service.ts`, `useEvents`, `usePlans`); all UI text in Spanish.
- [ ] No Options API, no Vuex, no Axios, no Bootstrap, no jQuery; no new entries in `package.json` (verifiable via `git diff main -- package.json`).
- [ ] `src/types/database.types.ts` has the 3 new tables (`eventos`, `gastos_fijos`, `plan_produccion`) in the hand-rolled `Database` interface and a TODO comment block explaining CLI regeneration.
- [ ] `SelectorReceta.vue` is a separate component from `SelectorMateriaPrima.vue` (ISP respected).
- [ ] `redondearParaMermas` is NOT wired into the projection (no `aplicar_merma` toggle in v1); no `localforage` calls in events code.
- [ ] Total PR diff budget honored via chained PRs; PR2 likely needs an F2 split per §14.

---

## 18. Non-Goals (scope-creep guard)

- No login UI, no sign-up, no password recovery, no session UI.
- No multi-user support.
- **No stock / inventory column** (no `stock_actual`, no stock-aware suggestions).
- **No multi-day eventos** (single `fecha date` only).
- **No `expected_units_sold`** and no `costo_por_unidad` projection (per-unit is a `pos` slice concern).
- **No profit per unit** (no price column, no margin calculation).
- **No transacciones** for `reemplazarTodos` (delete-then-insert is two separate calls; on failure the plan may be empty).
- **No notifications / reminders / toasts on state transitions** (state changes are visible in the UI only).
- **No export** (no jsPDF, no CSV, no share link; `reports` slice owns exports).
- No bulk import (CSV / Excel).
- No image attachments (no `foto_url`, no `portada_url`).
- No rich metadata on `eventos` (only `nombre`, `fecha`, `ubicacion`, `notas`, `estado`).
- No offline sync, no queue, no custom service worker `sync` handler.
- No merma surcharge in v1 (`redondearParaMermas` ships as utility but is not wired).
- No drag-to-reorder on plan rows.
- No CI/CD, no Playwright, no `supabase` CLI, no Docker.
- No i18n (Spanish hardcoded).
- No dark theme.
- No `gen:types` prebuild hook.
- No service-role-keyed Supabase client.
- No new entries in `package.json`.

---

## 19. Future Work (depends on events)

| Slice | What it consumes from events | What it adds |
|---|---|---|
| **`pos`** (Phase 4, items 14–17) | `eventos` table + state machine; `plan_produccion` rows; `calcularProyeccion` output. Drives `en_curso → cerrado` (daily close). | Sales grid against `evento_id`, cart, daily close, `unidades_vendidas` column on `plan_produccion`, `expected_units_sold` per evento, `costoPorUnidad` projection, proper transaction for plan save. |
| **`analytics`** (Phase 5, items 18–19) | `costoTotal`, `costosFijos`, `costosVariables` per evento; `estado` for "active vs closed" filter. | Dashboard with chart.js + vue-chartjs, profit-vs-cost comparison, per-receta cost heatmap. |
| **`reports`** (Phase 5, items 18–19) | `ProyeccionCostos` per evento; closed `eventos` for historical export. | PDF export of the projection with jsPDF, CSV export of the gastos table. |
| **`auth-flow`** | RLS-enabled tables, extended `dev_bypass_rls.sql` to remove. | Login UI, Supabase Auth wiring, real session, removal of dev bypass. |
| **`offline-sync`** | Service factory pattern (`crearEventsService(supabase)`); `IStorageService` LSP. | WAL in localforage, `sync.queue.store.ts`, `sync.service.ts`, custom SW `sync` handler, `useSyncStatus`. |
| **`ci-setup`** | `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm build`. | GitHub Actions workflow, `supabase` CLI install, `gen:types` prebuild hook. |
| **Multi-day eventos (future)** | `eventos` schema + state machine. | `fecha_inicio date` + `fecha_fin date` columns, migration to add them, per-day plan rows. |

---

## 20. References

- **`brief.md`** — source PRD (locked, 469 lines). §7 Phase 3 items 10–13 define events scope.
- **`openspec/changes/events/exploration.md`** — exploration artifact. **Every locked decision above is sourced from this file** — read it before questioning a decision.
- **`openspec/changes/archive/2026-06-17-catalog/`** — catalog proposal/spec/design/tasks/archive-report (the patterns events follow, plus the `calcularCostoReceta` pure function the projection reuses).
- **`openspec/changes/archive/2026-06-16-foundation/`** — foundation proposal/spec/design/tasks/archive-report (the DI + types + supabase mock patterns events inherit).
- **`openspec/specs/catalog/spec.md`** — source of truth for the catalog primitives the events projection depends on.
- **`openspec/specs/foundation/spec.md`** — source of truth for the foundation API surface that events inherits.
- **`openspec/config.yaml`** — project SDD config (no changes needed for events; catalog PR1 already aligned `strict_tdd`, `apply.tdd`, `test_command`).
- **Engram observations**:
  - `sdd/catalog/explore`, `sdd/catalog/proposal`, `sdd/catalog/design`, `sdd/catalog/spec`, `sdd/catalog/tasks`, `sdd/catalog/apply-progress`, `sdd/catalog/archive-report` — full catalog context.
  - `sdd/foundation/*` — full foundation context.
  - `sdd/kilo-lima/testing-capabilities` — strict TDD ENABLED (catalog PR1 already flipped the YAML).
  - `conventions/kilo-lima` — locked naming conventions, file structure, line limits.
  - `sdd/events/explore` — exploration summary for cross-session recovery.
- **Skill files**:
  - `~/.config/opencode/skills/sdd-propose/SKILL.md` — this phase.
  - `~/.config/opencode/skills/sdd-spec/SKILL.md` — next phase (reads this proposal's Capabilities).
  - `~/.config/opencode/skills/sdd-design/SKILL.md` — next phase (reads this proposal's Approach + Data Model).
  - `~/.config/opencode/skills/sdd-tasks/SKILL.md` — next phase (refines the PR split in §14, decides on the F2 split for PR2).
  - `~/.config/opencode/skills/chained-pr/SKILL.md` — chained-PR strategy.
  - `~/.config/opencode/skills/work-unit-commits/SKILL.md` — commit splitting for the chained PRs.
  - `~/.config/opencode/skills/judgment-day/SKILL.md` — dual review of spec + design.

---

## Capabilities (CONTRACT for sdd-spec)

The sdd-spec phase creates delta specs for each capability below. New capabilities → `openspec/changes/events/specs/<name>/spec.md`. Modified capabilities → delta spec against `openspec/specs/<name>/spec.md`.

### New Capabilities

- **`events-crud`**: CRUD + list + detail + delete for `eventos` with the 3-state machine (`planificacion` / `en_curso` / `cerrado`). Bounded by the 6 `categoria_gasto` enum and the locked single-day `fecha`. Includes `cambiarEstado` with `transicionEstadoValida` enforcement.
- **`events-gastos-fijos`**: Per-event `gastos_fijos` rows. Sub-resource of `eventos` (shared service). CRUD + list, 6-value `categoria` enum (`renta` / `transporte` / `permisos` / `publicidad` / `servicios` / `otro`), `monto >= 0` validation. Frozen on `cerrado` via `estadoEsEditable`.
- **`events-planificacion`**: Production planning grid. Per-event `plan_produccion` rows: `(receta_id, unidades_a_producir)` with `unidades_a_producir > 0`. UNIQUE `(evento_id, receta_id)` prevents duplicate plan rows. `reemplazarTodos` for bulk save. Frozen on `cerrado`.
- **`events-proyeccion-costos`**: Pure function `calcularProyeccion` + reactive `useProyeccionCostos` composable. Reuses catalog's `calcularCostoReceta` verbatim for the variable-cost side. Output: `{ costosFijos, costosVariables, costoTotal, lineas[] }`. Edge cases: empty plan, empty gastos, deleted receta (`RECETA_FALTANTE`), deleted materia prima (propagates `MATERIA_PRIMA_FALTANTE`), zero unidades, float drift, large N, merma placeholder (no surcharge in v1).
- **`events-estado-maquina`**: State machine helpers (`transicionEstadoValida`, `estadoEsEditable`) as the single source of truth for the `planificacion` → `en_curso` → `cerrado` flow and the frozen-on-`cerrado` enforcement. 9-combo truth table for transitions + 3-value table for `estadoEsEditable`.

### Modified Capabilities

- **None.** The foundation spec is untouched, the catalog spec is untouched. Events is purely additive — no foundation or catalog requirement is modified. `calcularCostoReceta` is consumed as a black box; if the catalog later changes its signature, the events projection breaks and the catalog team owns the fix.

---

## Rollback Plan

Events is 4 chained PRs (5 with the F2 split on PR2) merged to `main`. Each PR is independently revertable via `git revert <sha>` (if pushed) or `git reset --hard HEAD~1` (if not yet pushed). The `supabase` migration is reversible: the apply phase documents a one-shot `down` SQL (`drop table plan_produccion, gastos_fijos, eventos cascade;`) the user runs manually via the Dashboard SQL editor if needed. The `dev_bypass_rls.sql` extension is a forward-only add and can be left in place (the `auth-flow` slice removes the entire bypass later) or removed via the Dashboard. The 3 new lazy routes are additive; removing them is a one-line edit per route.

---

## Key Learnings

- **The events slice is a 3-table + 1-composable addition that consumes the catalog's `calcularCostoReceta` verbatim.** The variable-cost side of the projection is `Σ(unidades_a_producir × costo_por_unidad_receta)` — the same `costoPorUnidad` from `calcularCostoReceta(receta, materias)`. No duplication, no drift; a single source of truth for the cost math lives in the catalog.
- **State machine + freeze-on-`cerrado` is the single most important new architectural decision.** Three enforcement points (form disable, store guard, UI button) all read `estadoEsEditable(estado)` from `src/utils/estado.ts`. The brief's 3-phase flow (pre-evento / durante / post-evento) is the user-facing framing; the `cerrado` enum value is the technical freeze. Unit tests for `estado.spec.ts` cover the full 9-combo truth table for `transicionEstadoValida` and the 3-value table for `estadoEsEditable`.
- **Production planning is manual in v1, hybrid is deferred.** The brief's "how much to produce" question is resolved by shipping a flat editable grid with `SelectorReceta` + `unidades_a_producir` input + live cost display. Stock-aware and demand-aware suggestions are out of scope because both `stock_actual` (catalog gap) and `expected_units_sold` (POS slice) are unavailable in v1.
- **Cost projection is computed, never stored.** Same rationale as the catalog's `recetas` table: a denormalized `costo_total` on `eventos` invites stale data when an ingredient's price changes mid-day. The `computed()` in `useProyeccionCostos` gives free memoization; the pure function `calcularProyeccion(...)` is the unit-testable core.
- **The 1,800-line forecast still exceeds the 400-line review budget.** Chained PRs are MANDATORY (4 PRs, with a likely F2 split in PR2). This matches the foundation (F2 split for Vuetify) and catalog (F2 split for `RecetaDetalleView`) precedents — preemptive task splits save reviewer time.
- **`SelectorReceta` is a new component, not a reuse of `SelectorMateriaPrima`.** Both are Vuetify `v-autocomplete` wrappers; both share the same prop/emit shape; but the ISP decision is to keep them separate so the events slice's component spec doesn't have to know about materias primas. The catalog precedent (separate `SelectorMateriaPrima` and the new `SelectorReceta`) is the template.
- **`costoPorUnidad` projection is explicitly OUT OF SCOPE v1.** Brief item 13 mentions it implicitly through "expected_units_sold". The v1 `ProyeccionCostosCard` shows fixed + variable + total; a "(por unidad: pendiente)" placeholder documents the gap and the `pos` slice owns the resolution. This is a deliberate v1 boundary, not a forgotten requirement.
- **`reemplazarTodos` is destructive by design in v1.** The plan save path is `delete` then `insert` in two separate calls. A proper `BEGIN`/`COMMIT` block is a `pos` slice concern; v1 matches `recipes.service.actualizar`'s pattern. The user must retry on insert failure; the error surfaces in Spanish.
