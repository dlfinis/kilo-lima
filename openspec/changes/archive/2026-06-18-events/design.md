# Design: Events

> **Change**: `events` | **Phase**: `sdd-design`
> **Proposal**: `openspec/changes/events/proposal.md` (8 locked decisions)
> **Spec**: `openspec/changes/events/specs/events/spec.md` (46 REQ-IDs, 88 scenarios)
> **Exploration**: `openspec/changes/events/exploration.md`
> **Foundation**: `openspec/changes/archive/2026-06-16-foundation/design.md` (inherit all patterns)
> **Catalog**: `openspec/changes/archive/2026-06-17-catalog/design.md` (inherit: factory service, chainable mock, never-throw, inject, cost calculator pure function)
> **Delivery**: 4 chained PRs, stacked-to-main, ~1,800 total lines

---

## 1. Architecture Overview

Events is an **additive layer** on catalog + foundation. It introduces the first multi-table domain (3 tables), the first state machine, and the first derived business view (cost projection computed from 4 stores). Zero new dependencies in `package.json`. Frozen contracts consumed: `inject('supabase')` → `SupabaseClient<Database>`, `calcularCostoReceta` (pure function, reused verbatim), chainable Supabase mock. New: 3 stores, 2 service factories, 3 composables, 1 utility module, 9 business components, 3 views, 3 lazy routes, 1 SQL migration, and ~13 spec files (spec-first per strict TDD).

```
View Layer                         Store Layer              Service Layer          Backend
──────────                         ───────────             ──────────────         ───────
EventosView.vue ──────────→ useEvents() ──────→ events.store ──→ crearEventsService(supabase) ──→ Supabase
EventoDetalleView.vue ────→ useEvents() ──────→ events.store ──→ (same service)
PlanificarEventoView.vue ──→ usePlans() ───────→ plans.store  ──→ crearPlansService(supabase)   ──→ Supabase
                               │                      │
                               │   useProyeccionCostos(eventoId)
                               │        │              │
                               │   reads from 4 stores (events + plans + recipes + ingredients)
                               │        │
                               └────────┴──→ calcularProyeccion()  [pure function — testable without Vue]
```

**Key invariant**: events touches zero foundation or catalog files except `routes.ts` (additive), `database.types.ts` (additive), `types/index.ts` (additive re-export), and `dev_bypass_rls.sql` (additive grant lines).

---

## 2. Service Layer (Factory Pattern, Never-Throw)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Module singleton | Hard to mock per-test | Rejected |
| Class with DI | Overkill for 6-method services | Rejected |
| **Factory function** `crearXService(supabase)` | Test injects mock; OCP clean | **Chosen** |

### `src/services/events.service.ts`

Factory `crearEventsService(supabase: SupabaseClient<Database>)` returns the `EventsService` interface: `listar`, `obtener`, `crear`, `actualizar`, `cambiarEstado`, `eliminar` (eventos) + `listarGastos`, `crearGasto`, `actualizarGasto`, `eliminarGasto` (gastos_fijos sub-resource, scoped to evento). `cambiarEstado` calls `transicionEstadoValida(desde, hacia)` before the Supabase update and returns `{ error: { code: 'TRANSICION_INVALIDA' } }` for invalid transitions (REQ-EVENTS-6). Every method returns `{ data: T | null, error: ServiceError | null }` — never throws (REQ-EVENTS-42).

**Why events + gastos share one service**: `EventoDetalleView` always loads both together (evento detail + its gastos). The catalog precedent is `recipes.service` (recetas + receta_ingredientes joined). The service returns structured results; the store owns reactive state.

### `src/services/plans.service.ts`

Factory `crearPlansService(supabase)` returns: `listarPorEvento`, `crear`, `actualizar` (only `unidades_a_producir` field), `eliminar`, `reemplazarTodos(eventoId, filas)`. `reemplazarTodos` is the save-plan strategy: delete all existing rows for the evento, then insert the new list — two separate calls, no transaction (v1 simplicity, matches `recipes.service.actualizar`'s delete-then-reinsert pattern, REQ-EVENTS-19). On insert failure the store surfaces the error and the plan shows empty; user retries.

---

## 3. Pinia Stores

### `src/stores/events.store.ts`

Setup-style (`defineStore('events', () => { ... })`). State: `eventos: Ref<Evento[]>`, `eventoActual: Ref<Evento | null>`, `gastosFijos: Ref<GastoFijo[]>`, `cargando: Ref<boolean>`, `error: Ref<string | null>`. Receives the supabase client via `inject<SupabaseClient<Database>>('supabase')` (DIP, REQ-EVENTS-44), constructs `crearEventsService(supabase)` at store creation time. Actions: `cargarTodas`, `cargarDetalle(id)` (loads evento + its gastos in parallel or sequentially), `crear`, `actualizar`, `cambiarEstado`, `eliminar`, `crearGasto`, `actualizarGasto`, `eliminarGasto`.

**Estado freeze enforcement** (REQ-EVENTS-26): gasto actions (`crearGasto`, `actualizarGasto`, `eliminarGasto`) call `estadoEsEditable(eventoActual.value.estado)` before any mutation. If `false`, return `{ data: null, error: { code: 'EVENTO_CERRADO' } }` immediately — no Supabase call. `actualizar` (evento edit) also gates on `estadoEsEditable`.

### `src/stores/plans.store.ts`

Setup-style. State: `plan: Ref<PlanProduccion[]>`, `cargando`, `error`. Actions: `cargarPara(eventoId)`, `guardarPlan(eventoId, filas)`. `guardarPlan` calls `servicio.reemplazarTodos(eventoId, filas)` and updates `plan` on success. Also gates on `estadoEsEditable` (reads `useEventsStore().eventoActual.estado` inside the guard, NOT a cross-store write — read-only access to another store's state is the allowed pattern, matching `recipes.store.costoPorReceta` reading `useIngredientsStore().materiasPrimas`, REQ-EVENTS-40).

---

## 4. Composables (View Layer)

### `src/composables/useEvents.ts`

Thin `storeToRefs` wrapper around `events.store`. Exposes: `{ eventos, eventoActual, gastosFijos, cargando, error, cargarTodas, cargarDetalle, crear, actualizar, cambiarEstado, eliminar, crearGasto, actualizarGasto, eliminarGasto }`. No local state — the store is the single source of truth.

### `src/composables/usePlans.ts`

Same pattern: `storeToRefs` wrapper around `plans.store`. Exposes: `{ plan, cargando, error, cargarPara, guardarPlan }`.

### `src/composables/useProyeccionCostos.ts`

**Dual export**: (a) pure function `calcularProyeccion(evento, gastosFijos, plan, recetas, materiasPrimas): ProyeccionCostos` — unit-testable with zero setup, and (b) reactive composable `useProyeccionCostos(eventoId: MaybeRefOrGetter<string | null>): ComputedRef<ProyeccionCostos | null>` — `computed` that reads from 4 stores (events, plans, recipes, ingredients). Returns `null` when `eventoId` is null/falsy. Cross-store reads inside the `computed` are tracked by Vue's dependency system — any store change triggers recompute (REQ-EVENTS-21, mitigates risk #5).

**Why pure function in composable file** (not a store, not a service): matches catalog's `useCalculoReceta.ts` precedent — the pure export is separately testable (~8 edge-case tests); the composable needs ~3 reactive-integration tests.

---

## 5. Pure Logic

### `src/utils/estado.ts`

Two pure helpers, unit-testable with zero deps:

| Function | Signature | Purpose | Tests |
|----------|-----------|---------|-------|
| `transicionEstadoValida` | `(desde: EstadoEvento, hacia: EstadoEvento): boolean` | Gates `cambiarEstado`. Valid: `planificacion→en_curso`, `en_curso→cerrado`, `planificacion→cerrado`. Invalid: all others (including idempotent same→same). | 9-combo truth table |
| `estadoEsEditable` | `(estado: EstadoEvento): boolean` | Single source of truth for freeze-on-cerrado. Returns `true` unless `estado === 'cerrado'`. | 3-value table |

**Why a single source function**: eliminates enforcement drift across 3 layers (store guards, UI disable, form lock). If the rule changes in a future slice (e.g., `en_curso` also freezes for plan rows), only one function changes (REQ-EVENTS-25, REQ-EVENTS-46).

### `calcularProyeccion` algorithm

```
Input:  evento, gastosFijos[], plan[], recetas[], materiasPrimas[]
Output: ProyeccionCostos

1. Build lookup maps: recetaMap, materiaMap
2. For each plan row:
   a. Look up receta. If missing → { advertencia: 'RECETA_FALTANTE', costoLinea: 0 }
   b. Build lineasInput = receta.ingredientes.map(ing → { ingrediente, materiaPrima })
   c. Call calcularCostoReceta(lineasInput, receta.rendimiento_unidades) [reused verbatim]
   d. costoLinea = Math.round(unidades × calc.costoPorUnidad × 100 + EPSILON) / 100
3. costosFijos = Math.round(sum(gastos.map(g → g.monto)) × 100 + EPSILON) / 100
4. costosVariables = Math.round(sum(lineas.map(l → l.costoLinea)) × 100 + EPSILON) / 100
5. costoTotal = Math.round((costosFijos + costosVariables) * 100 + EPSILON) / 100
6. Return { costosFijos, costosVariables, costoTotal, lineas, desgloseFijos, desgloseVariables }
```

**Rounding**: per-line `costoLinea` uses full float; three top-level totals each rounded once (`Math.round(x * 100 + Number.EPSILON) / 100`). This matches catalog's `redondearCentavos` approach and avoids cumulative ±$0.01 drift (REQ-EVENTS-20).

**8 edge cases tested**: empty plan+no gastos → zeros; gastos only; plan only; missing receta (RECETA_FALTANTE); missing materia prima (propagates from catalog); unidades=0 (defensive); float noise; large N (>20 rows). Plus per-unit projection OUT OF SCOPE v1 (REQ-EVENTS-23/24).

---

## 6. Component Tree

| Component | Props | Emits | Spec | Role |
|-----------|-------|-------|------|------|
| `EventoStatusChip.vue` | `estado: EstadoEvento` | — | yes | Blue/orange/grey chip |
| `EventoListItem.vue` | `evento: Evento`, `costoTotal: number` | `click`, `eliminar` | no | List row (name, date, chip, cost) |
| `EventoForm.vue` | `valoresIniciales: EventoInput \| null` | `submit`, `cancel` | yes | Create/edit form + estado transition section |
| `GastoFijoForm.vue` | `valoresIniciales: GastoFijoInput \| null`, `categorias: CategoriaGasto[]` | `submit`, `cancel` | yes | Create/edit gasto form |
| `GastoFijoListItem.vue` | `gasto: GastoFijo` | `edit`, `eliminar` | no | Row: categoria, monto, desc, delete |
| `SelectorReceta.vue` | `modelValue: string \| null` | `update:modelValue` | yes | `v-autocomplete` for receta (mirrors `SelectorMateriaPrima` shape) |
| `PlanProduccionRow.vue` | `fila: PlanProduccionInput`, `costoLinea: number` | `update`, `eliminar` | yes | One grid row: selector + unidades + live cost |
| `PlanProduccionGrid.vue` | `modelValue: PlanProduccionInput[]`, `eventoId: string`, `esEditable: boolean` | — | yes | Grid container + add/save buttons |
| `ProyeccionCostosCard.vue` | `proyeccion: ProyeccionCostos \| null` | — | yes | 3-section card (fijos, variables, total) + yellow alert |

**Data flow contract**: `View → Composable → Store → Service → Supabase`. Reactive state flows back the same chain. Components receive typed `*Input` (not full domain models with `id`, `created_at`) per ISP (REQ-EVENTS-43).

---

## 7. Views

| View | Route | Consumes | Children |
|------|-------|----------|----------|
| `EventosView.vue` | `/eventos` | `useEvents()`, `useProyeccionCostos()` | `EventoForm` (dialog), `EventoListItem` rows |
| `EventoDetalleView.vue` | `/eventos/:id` | `useEvents()` (detail), `useProyeccionCostos(id)` | `EventoStatusChip`, `EventoForm`, `GastoFijoForm`, `GastoFijoListItem`, `ProyeccionCostosCard` |
| `PlanificarEventoView.vue` | `/eventos/:id/planificar` | `useEvents()`, `usePlans()`, `useProyeccionCostos(id)` | `PlanProduccionGrid`, `ProyeccionCostosCard` |

All views handle 4 states: loading (`v-progress-linear`), error (`v-alert` + "Reintentar"), empty (friendly message + CTA), populated (data). Same pattern as catalog REQ-CATALOG-6/7/8 (REQ-EVENTS-7, REQ-EVENTS-38).

---

## 8. Database Schema

Single migration `supabase/migrations/20260618000000_events_inicial.sql` (idempotent: `IF NOT EXISTS`, `DROP POLICY IF EXISTS`):

### `public.eventos`
8 columns: `id` (uuid PK), `nombre` (text, CHECK length>0), `fecha` (date, NOT NULL, single-day v1), `ubicacion` (text, NULL), `estado` (text, CHECK in ('planificacion','en_curso','cerrado'), default 'planificacion'), `notas` (text, NULL), `created_at`, `updated_at`. Indexes: `idx_eventos_fecha` (desc), `idx_eventos_estado`, `idx_eventos_nombre_lower`. Trigger: `tg__set_updated_at` on UPDATE.

### `public.gastos_fijos`
6 columns: `id` (uuid PK), `evento_id` (FK→eventos ON DELETE CASCADE), `categoria` (text, CHECK in 6 values), `monto` (numeric(10,2), CHECK ≥ 0), `descripcion` (text, NULL), `created_at`. Index: `idx_gastos_fijos_evento_id`.

### `public.plan_produccion`
5 columns: `id` (uuid PK), `evento_id` (FK→eventos ON DELETE CASCADE), `receta_id` (FK→recetas ON DELETE RESTRICT), `unidades_a_producir` (numeric(10,4), CHECK > 0), `created_at`. Indexes: `idx_plan_produccion_evento_id`, `idx_plan_produccion_receta_id`. UNIQUE: `uq_plan_produccion_evento_receta` on `(evento_id, receta_id)` (REQ-EVENTS-17).

### RLS
6 policies (select + write for authenticated on all 3 tables). Anon role NOT granted access via RLS; `dev_bypass_rls.sql` is extended with 3 new `GRANT` lines for dev (REQ-EVENTS-29). Reuses the existing `tg__set_updated_at()` trigger function from catalog (REQ-EVENTS-28).

---

## 9. Types (`src/types/`)

### `src/types/events.types.ts` (new)
Spanish domain types: `EstadoEvento`, `CategoriaGasto`, `Evento`, `EventoInput`, `GastoFijo`, `GastoFijoInput`, `PlanProduccion`, `PlanProduccionInput`, `LineaProyeccion`, `ProyeccionCostos`, `DesgloseFijo`, `DesgloseVariable`. `*Input` variants exclude `id`, `created_at`, `updated_at`. `ServiceError` reused from `catalog.types.ts` (REQ-EVENTS-31, REQ-EVENTS-32).

### `src/types/database.types.ts` (modified)
Add 3 table entries under `Database['public']['Tables']`: `eventos`, `gastos_fijos`, `plan_produccion`. Each with `Row`, `Insert`, `Update` (partial), `Relationships` (FKs). Header comment documents `gen:types` command (deferred to CI slice). Matches catalog's hand-rolled pattern (REQ-EVENTS-30).

### `src/types/index.ts` (modified)
Re-export all events types.

---

## 10. State Machine

```
planificacion ──→ en_curso ──→ cerrado
      │                            ↑
      └──────── cancel ────────────┘
```

**Valid**: `planificacion→en_curso`, `en_curso→cerrado`, `planificacion→cerrado`. **Invalid**: all others (including idempotent same→same). No backward transitions. `transicionEstadoValida()` is the single gate for `cambiarEstado`. Freeze-on-`cerrado` via `estadoEsEditable()` at 3 enforcement points (store guards, UI disable, form lock). Both pure helpers in `src/utils/estado.ts` (REQ-EVENTS-5, REQ-EVENTS-6, REQ-EVENTS-25/26/27).

---

## 11. Cost Projection Algorithm

Pure function `calcularProyeccion` (exported from `useProyeccionCostos.ts`) reuses catalog's `calcularCostoReceta` verbatim. Formula: `costosFijos = sum(gastos.monto)`, `costosVariables = sum(plan.unidades × receta.costoPorUnidad)`, `costoTotal = fixed + variable`. Per-line `costoLinea` uses full float; tops rounded once via `Math.round(x * 100 + EPSILON) / 100`. `costoPorUnidad` (per-unit projection) is OUT OF SCOPE v1 — deferred to `pos` slice (REQ-EVENTS-20/21/22/23/24).

---

## 12. Router

3 lazy routes appended to `src/router/routes.ts` (before catch-all, additive):
- `/eventos` → `EventosView.vue` (name: `'eventos'`)
- `/eventos/:id` → `EventoDetalleView.vue` (name: `'evento-detalle'`)
- `/eventos/:id/planificar` → `PlanificarEventoView.vue` (name: `'planificar-evento'`)

If `estado === 'cerrado'`, `PlanificarEventoView` redirects to `/eventos/:id?mensaje=evento-cerrado` (REQ-EVENTS-35). `routes.spec.ts` gets 3 new `expect` assertions (REQ-EVENTS-33/34/35).

---

## 13. Supabase Mock Reuse

Zero changes to `tests/setup.ts`. The chainable Supabase mock is generic (table-name agnostic). Events tests import `__resetSupabaseMock` and `__pushSupabaseResponse` exactly like catalog tests. `beforeEach` calls `__resetSupabaseMock({ data: [...fixtures], error: null })` for test isolation (REQ-EVENTS-45).

---

## 14. Test Architecture (Strict TDD Order)

| Phase | Layer | Files | Tests | Order rationale |
|-------|-------|-------|-------|-----------------|
| 1 | Pure logic | `estado.spec.ts`, `useProyeccionCostos.spec.ts` (pure export) | ~16 | Zero deps — can fail meaningfully from first line |
| 2 | Services | `events.service.spec.ts`, `plans.service.spec.ts` | ~10 | Mock supabase — depends only on Phase 1 types |
| 3 | Stores | `events.store.spec.ts`, `plans.store.spec.ts` | ~12 | Real Pinia, mock services — depends on Phase 2 |
| 4 | Components | 6 `.spec.ts` (EventoForm, EventoStatusChip, GastoFijoForm, SelectorReceta, PlanProduccionRow, ProyeccionCostosCard) | ~18 | Mount + mock stores |
| 5 | Views | `EventosView.spec.ts`, `EventoDetalleView.spec.ts`, `PlanificarEventoView.spec.ts` | ~10 | Full mount + router + stores |
| 6 | Router | `routes.spec.ts` (delta) | 3 | Assert routes registered |

**~60 new tests**. `pnpm test` target ≤8 s (catalog ~5 s + events ~3 s). Cumulative: foundation 4 + catalog 60 + events 60 = ~124 passing (REQ-EVENTS-45). Every spec file committed BEFORE its implementation (RED→GREEN).

---

## 15. File → Requirement Traceability (46 REQ-IDs)

### PR1 — Schema + types + utils + projection (~430 lines)
| REQ-ID | Files |
|--------|-------|
| REQ-EVENTS-5,6,25,26,27,46 | `src/utils/estado.ts` |
| REQ-EVENTS-20,21,22,23,24 | `src/composables/useProyeccionCostos.ts` |
| REQ-EVENTS-28,29 | `supabase/migrations/20260618000000_events_inicial.sql`, `supabase/dev_bypass_rls.sql` |
| REQ-EVENTS-30 | `src/types/database.types.ts` |
| REQ-EVENTS-31,32 | `src/types/events.types.ts`, `src/types/index.ts` |
| REQ-EVENTS-45 | All spec files (metadata), `tests/setup.ts` |

### PR2 — Events + gastos domain (~580 lines → F2 split: PR2a services+stores ~200, PR2b components+views ~380)
| REQ-ID | Files |
|--------|-------|
| REQ-EVENTS-40,41,42,43,44 | `src/services/events.service.ts`, `src/stores/events.store.ts`, `src/composables/useEvents.ts` |
| REQ-EVENTS-1,2,3,4,7,8,9 | `src/views/EventosView.vue`, `src/components/business/EventoForm.vue`, `src/components/business/EventoListItem.vue` |
| REQ-EVENTS-10,11,12,13,14 | `src/components/business/GastoFijoForm.vue`, `src/components/business/GastoFijoListItem.vue` |
| REQ-EVENTS-36,37,38,39 | `src/views/EventosView.vue`, `src/views/EventoDetalleView.vue`, `src/components/business/EventoStatusChip.vue` |

### PR3 — Planning + projection UI (~480 lines)
| REQ-ID | Files |
|--------|-------|
| REQ-EVENTS-15,16,17,18,19 | `src/services/plans.service.ts`, `src/stores/plans.store.ts`, `src/composables/usePlans.ts` |
| REQ-EVENTS-15,16,17,18,19 (UI) | `src/components/business/SelectorReceta.vue`, `src/components/business/PlanProduccionRow.vue`, `src/components/business/PlanProduccionGrid.vue`, `src/components/business/ProyeccionCostosCard.vue` |
| REQ-EVENTS-15,16,35 | `src/views/PlanificarEventoView.vue` |

### PR4 — Router + docs + verify (~80 lines)
| REQ-ID | Files |
|--------|-------|
| REQ-EVENTS-33,34,35 | `src/router/routes.ts`, `src/router/routes.spec.ts` |
| REQ-EVENTS-28,29 (docs) | `docs/events-setup.md` |

**46/46 REQ-IDs traced.** Every requirement maps to at least one file. No requirement is homeless.

---

## 16. Risks & Mitigations (Architecture-Level)

| # | Risk | Likelihood | Mitigation |
|---|------|------------|------------|
| 1 | **Freeze drift** — `cerrado` check duplicated across 3 layers | Medium | `estadoEsEditable()` single source; unit tests cover all 3 estados × every guard |
| 2 | **`costoPorUnidad` user confusion** — users expect per-unit projection from brief item 13 | High | Explicit "(por unidad: pendiente)" placeholder in card; `pos` slice owns resolution |
| 3 | **`reemplazarTodos` destructive** — insert failure after delete → empty plan | Medium | Store surfaces error; user retries; `pos` adds proper transaction later |
| 4 | **Hand-rolled `Database` drift** — TS ↔ SQL mismatch | Medium | `pnpm typecheck` + one integration test hitting `supabase.from('eventos')` |
| 5 | **Cross-store reactivity** — 4 stores read in one `computed` | Low | Vue dep tracking inside `computed()` handles it; verified in spec |
| 6 | **400-line review budget** — ~1,800 total lines | High | 4 chained PRs MANDATORY; PR2 proactively F2-split (matching foundation+catalog precedents) |
| 7 | **`SelectorReceta` with 100+ recetas** — client-side filtering | Low | Single-user, <100 recetas; `v-autocomplete` handles it |
| 8 | **Single `date` column** — no multi-day eventos | Locked out | Explicit v1 boundary; future "feria de varios días" slice |

---

## Key Learnings

- **`calcularCostoReceta` is the single source of truth for cost math.** Events reuses it verbatim for the variable-cost side of the projection. No duplication, no drift — if catalog's cost algorithm changes, events gets the update for free through the composable's dependency.
- **State machine + freeze-on-`cerrado` uses two pure helpers as the single source of truth.** `transicionEstadoValida` (9-combo truth table) and `estadoEsEditable` (3-value table) live in `src/utils/estado.ts`. Every store guard and UI disable calls them — no hardcoded `estado === 'cerrado'` strings elsewhere.
- **Cross-store READ is clean; cross-store WRITE is forbidden.** `useProyeccionCostos` reads from 4 stores inside a `computed()` — Vue's dependency tracking handles reactivity. `plans.store` reads `useEventsStore().eventoActual.estado` for the freeze guard but never writes to another store's state. This matches `recipes.store.costoPorReceta` reading `useIngredientsStore().materiasPrimas`.
- **Cost projection is computed, never stored.** No `costo_total` column on `eventos`. Same rationale as catalog's `recetas` table — reactive `computed` with free memoization; denormalized column would drift when ingredient prices change mid-day.
- **Production planning is manual v1.** User enters `unidades_a_producir` per recipe. Stock-aware and demand-aware suggestions are deferred because both `stock_actual` (catalog gap) and `expected_units_sold` (POS slice) are unavailable in v1.
- **The `{ data, error }` never-throw contract is the LSP surface for future slices.** The `offline-sync` slice can wrap the service factories — on network failure, silently queue in localforage and return optimistic data. Consumers see the SAME return shape — no try/catch migration needed.
- **All 46 REQ-IDs map to concrete files and PR slices.** Every requirement has at least one file satisfying it. The 4-PR delivery plan (with F2 split on PR2) respects the 400-line review budget. `sdd-tasks` receives a complete file inventory with line estimates per PR.
