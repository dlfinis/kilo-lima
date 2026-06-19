# Proposal: `ux-improvements` — Navigation Shell + Home Context + FAB Pass

> **Change**: `ux-improvements` | **Phase**: `sdd-propose` → feeds `sdd-spec` and `sdd-design`
> **Source PRD**: `brief.md` §2.1 (Progressive Disclosure) + §2.2 (Top Bar pattern) + §6.1 (mobile-first)
> **Source analysis**: `openspec/changes/ux-improvements/exploration.md` (READ FIRST — 10 locked decisions live in §3)
> **User-reported problems (in scope, 2)**: (A) no back button / persistent navigation; (B) home "sigue floja — no me da opciones para dirigirme"
> **Artifact store mode**: `both` (filesystem + Engram)
> **Delivery**: **3 chained PRs, stacked-to-main** (mandatory — ~520 prod lines exceed the 400-line review budget)

---

## 1. Title and Executive Summary

**Title**: `ux-improvements` — global app bar with back button + breadcrumb, a data-driven home with counters / business-state banner / next-step CTA, and a per-view FAB pass on the three CRUD list views.

**Executive summary**: This is a **pure UX slice** — zero new Supabase tables, zero migrations, zero new dependencies, zero new business state. It is **strictly additive** to foundation + catalog + events + POS, and touches ~27 files (~520 production lines + ~800 test lines). It delivers the user's two reported pain points by introducing: (1) a global `<v-app-bar>` mounted once in `App.vue` with a back button (`router.go(-1)` guarded by `puedeRetroceder`) and a data-driven breadcrumb sourced from `route.meta.breadcrumb`; (2) a redesigned home with three horizontal sections — live counters (5 chips via the new `useResumen` composable that aggregates existing stores), a yellow "EVENTO ACTIVO" banner (reuses `ventasStore.eventoEnCurso` — zero new queries), and a single contextual CTA card (pure function `obtenerSiguientePaso(contadores)`); plus (3) three per-view `<v-fab>` components replacing the inline `+ Nuevo X` buttons on `/eventos`, `/materias-primas`, `/recetas`. Local "Volver" buttons on `EventoDetalleView` and `RecetaDetalleView` are removed because the global app-bar back button replaces them. Strict TDD applies — ~30 new tests land before the implementation. PR1 (navigation) lands first, PR2 (home) depends on PR1 only for tests, PR3 (FABs) depends on PR1 only for visual consistency.

---

## 2. Context and Motivation

- **Foundation, catalog, events, and POS are ARCHIVED** (all green, all `strict_tdd: ENABLED`, all `<script setup lang="ts">`).
- **The user has two concrete complaints** that map to brief §2.2 (Top Bar) and §2.1.4 (Primary actions via FAB): (A) "No hay forma de retroceder" — once they enter `/materias-primas`, browser back discards SPA state; (B) "la pantalla principal sigue floja — no me da opciones para dirigirme" — the home has 3 disabled phase cards and 4 outlined "Accesos rápidos" with **no live data** (the user does not know how many ingredientes, recetas, eventos, ventas, or cierres exist until they navigate to each view).
- **Why a separate slice** (not absorbed into a future "dashboard" slice): the home's missing context is a **navigation problem** (the user cannot see *what they have* and *what to do next*), not a new domain. The fix is read-only data already aggregated by the existing stores; we add no schema and no state.
- **Why 3 chained PRs** (mandatory): PR1 alone is ~200 prod + ~250 test lines; PR2 alone is ~250 prod + ~350 test lines; PR3 alone is ~70 prod + ~200 test lines. Combined they breach the 400-line review budget. Each PR is autonomous (no cross-PR runtime dependency) and can be reviewed independently.
- **Business framing**: brief §3.1 says "flujo guiado, sin pantallas muertas". This slice makes the home the **operational dashboard** (counters + banner + next-step CTA) and gives the user a single mental model for navigation (top bar = back + breadcrumb + title; FAB = primary action).

---

## 3. Decisions (LOCKED — 10 decisions, sourced from exploration)

| # | Decision | One-line rationale | Source |
|---|---|---|---|
| 1 | **AppBar lives globally in `App.vue`** (not per-view) | Brief §2.2 specifies a global top bar; user's #1 complaint is solved by **always-visible** navigation, not per-view headers. | exploration §App Bar Architecture |
| 2 | **Back button + breadcrumb logic in `useNavegacion()` composable** | SRP — AppBar is presentational; navigation history guard belongs in a testable composable. | exploration §App Bar Architecture |
| 3 | **Breadcrumb is data-driven from `route.meta.breadcrumb`** | One source of truth; views never wire breadcrumb logic. The home has `meta: { breadcrumb: ['Home'] }` — no parent, no back button. | exploration §App Bar Architecture |
| 4 | **Counters via new `useResumen()` composable** (aggregates existing stores; no new state) | SRP — counters is a "dashboard" concern, not an app-shell concern. `useResumen` lives next to `useEvents`, follows the same `storeToRefs` pattern. | exploration §Counters Data Model |
| 5 | **Business state via reused `ventasStore.eventoEnCurso`** (zero new queries) | It's already a `computed` that reads `eventsStore.eventos.find(e => e.estado === 'en_curso')`. The banner calls `useVentas().eventoEnCurso` — done. | exploration §Business State Detection |
| 6 | **Next-step CTA via pure function `obtenerSiguientePaso(contadores)`** in `src/utils/siguientePaso.ts` | Trivially unit-testable (no Vue, no Pinia, no async). Returns `null` when the user is "in motion" (Progressive Disclosure). | exploration §Next-Step CTA Logic |
| 7 | **FAB per-view** (each view renders its own `<FabNuevo>`) | Matches the existing per-view dialog-owner pattern. `<FabNuevo>` is a tiny presentational wrapper around `<v-fab>`. | exploration §FAB Integration |
| 8 | **Zero new dependencies** (all in Vuetify 3) | No entries in `package.json`. Verification: `<v-app-bar>`, `<v-breadcrumbs>`, `<v-fab>`, `<v-chip>`, `<v-alert>` are all in `vuetify@^3.12.8`. | exploration §Stack (no changes) |
| 9 | **3 chained PRs, stacked-to-main**: PR1 navigation (~200), PR2 home context (~250), PR3 FABs (~70) | Total ~520 prod + ~800 test lines exceeds the 400-line review budget; PRs are autonomous at runtime. | exploration §Chained PR Plan |
| 10 | **Strict TDD, 400-line budget, real-browser verification** | `strict_tdd: ENABLED` (foundation) is the project invariant. Every new `.ts` ships a `.spec.ts` first; every new `.vue` ships a `.spec.ts`. PRs verified in a real browser (manual smoke). | `openspec/config.yaml` `rules.apply.tdd: true` |

---

## 4. Scope

### 4.1 In-scope (concrete deliverables)

| Deliverable | Single Responsibility (SRP) |
|---|---|
| `src/components/business/AppBar.vue` (+ spec) | Global `<v-app-bar app>`: title + back button + breadcrumb + spacer. Pure presentational. |
| `src/components/business/BreadcrumbNav.vue` (+ spec) | `<v-breadcrumbs>` driven by `useNavegacion().breadcrumbActual`. Last item disabled. |
| `src/components/business/ContadoresHome.vue` (+ spec) | Grid of 5 counter chips (materias primas, recetas, eventos, ventas, cierres). Skeleton while `cargado === false`. |
| `src/components/business/BannerEventoActivo.vue` (+ spec) | Yellow/green banner when `ventasStore.eventoEnCurso !== null`. "IR A CAJA" button → `/pos`. Hidden when null. |
| `src/components/business/SiguientePasoCta.vue` (+ spec) | Contextual CTA card: text + button → `obtenerSiguientePaso(contadores).ruta`. Renders nothing when the function returns `null`. |
| `src/components/business/FabNuevo.vue` (+ spec) | Tiny `<v-fab>` wrapper: `icon`, `color`, `testid`, `@click` props. `app` so it floats over scroll content. |
| `src/composables/useNavegacion.ts` (+ spec) | `puedeRetroceder` (computed, history guard), `retroceder()` (calls `router.back()` guarded), `breadcrumbActual` (computed from `route.meta.breadcrumb`). |
| `src/composables/useResumen.ts` (+ spec) | `contadores` (computed over 6 stores) + `cargar()` (`Promise.allSettled` for 4 stores: ingredients, recipes, events, productos; ventas + cierres load lazily). |
| `src/utils/siguientePaso.ts` (+ spec) | Pure function `obtenerSiguientePaso(c: Contadores): PasoRecomendado \| null`. 5 branches + null. |
| `src/utils/breadcrumb.ts` (+ spec) | Pure formatters: `formatearEtiquetaBreadcrumb` (kebab → Title Case) + `resolverBreadcrumbDeMeta` (root vs nested vs missing). |
| `src/App.vue` (modified) | Mount `<AppBar>` above `<router-view>` inside `<v-app>`. |
| `src/router/routes.ts` (modified) | Add `meta: { breadcrumb: [...] }` to every route. |
| `src/views/HomeView.vue` (modified) | Replace static phase-card data with `<ContadoresHome>` + `<BannerEventoActivo>` + `<SiguientePasoCta>`. Keep the 3 phase cards as a secondary "flujo" section. |
| `src/views/EventosView.vue` (modified) | Remove inline `+ Nuevo evento` button; render `<FabNuevo>` instead. Dialog state stays. |
| `src/views/MateriasPrimasView.vue` (modified) | Same — inline button → `<FabNuevo>`. |
| `src/views/RecetasView.vue` (modified) | Same — inline button → `<FabNuevo>`. |
| `src/views/EventoDetalleView.vue` (modified) | Remove local "Volver" `<v-btn>` (app-bar back replaces it). Header stays. |
| `src/views/RecetaDetalleView.vue` (modified) | Same as EventoDetalleView. |
| `tests/setup.ts` (no changes) | Chainable Supabase mock is generic; no setup work needed. |

### 4.2 Out-of-scope (explicit non-goals)

- **No multi-day events** — `fecha_inicio` + `fecha_fin`. Deferred to the `eventos-multidia` slice.
- **No future event planning** — "planifica un evento que ocurre el próximo mes". Deferred to `eventos-multidia`.
- **No real auth** — `useAuth()` stays stubbed. Single-user. The `auth-flow` slice owns it.
- **No analytics** — no profit-per-evento dashboard, no "ventas del mes" chart. The post-evento phase card on the home stays `disabled`. The `analytics` slice owns it.
- **No settings page** — no theme toggle, no currency selector, no profile. Out of scope.
- **No `/productos` FAB** — products are auto-created from recetas via the existing `RecetaDetalleView` "Vender esta receta" button. A `+ Nuevo producto` FAB creates two parallel creation paths and confuses the user.
- **No offline-sync** — no WAL, no service worker changes, no `IStorageService` writes. POS already places a `// TODO(offline-sync):` marker; the `offline-sync` slice owns the queue.
- **No bottom navigation bar** — brief §6.1 mentions "top bar OR bottom nav". We pick **top bar only** for v1. Bottom-nav is a future slice when we add 4+ top-level destinations (catalog/events/POS/analytics — analytics not yet built).
- **No dynamic breadcrumb labels** — `/eventos/:id` shows the placeholder `"Detalle"` instead of the evento name. A future `meta.breadcrumbResolver` (a function that receives the loaded record) is a v2 enhancement.
- **No new "Reintentar" button on the home** — if a store's `cargar()` fails, the counter shows `0` until the next `cargar()`. A manual retry button is a v2 improvement.
- **No new schemas / no migrations** — the slice is read-only against existing Supabase tables.
- **No new `package.json` entries**.

---

## 5. Stack (zero new dependencies)

This slice adds **zero new entries to `package.json`**. Verification against exploration §Stack + foundation + catalog + events + POS archives:

| Concern | Package | Pin | UX use |
|---|---|---|---|
| UI shell | `vue@^3.5.38` + `vuetify@^3.12.8` | foundation (unchanged) | `<v-app-bar>`, `<v-breadcrumbs>`, `<v-fab>`, `<v-chip>`, `<v-alert>`, `<v-card>`, `<v-btn>` |
| State | `pinia@^3.0.4` | foundation (unchanged) | `useResumen()` reads 6 existing stores |
| Routing | `vue-router@^4.6.4` | foundation (unchanged) | `route.meta.breadcrumb`, `router.back()` |
| Math | `Math.round(x * 100 + Number.EPSILON) / 100` | vanilla JS | not used here (this slice has no money math) |
| Date | `dayjs@^1.11.13` | foundation (unchanged) | not used here (this slice has no time math; banner reuses `ventasStore.eventoEnCurso` directly) |
| Format | `formatearUSD`, `formatearUnidad` | `src/utils/format.ts` (foundation) | counter chip labels (e.g. "5 ingredientes", "$1,234.56 ventas") |
| Guards | `estadoEsEditable` | `src/utils/estado.ts` (events) | FAB visibility rule |
| Testing | `vitest@^2.1.9` + `@vue/test-utils@^2.4.11` | foundation (unchanged) | ~30 new tests + ~10 modified tests |
| Build | `vite@^5.4.21` + `vue-tsc@^3.3.5` | foundation (unchanged) | typecheck |
| Lint/Format | `eslint@^9.39.4` + `prettier@^3.8.4` | foundation (unchanged) | unchanged |

---

## 6. File Structure (NEW vs MOD)

```
kilo-lima/
├── openspec/
│   ├── changes/ux-improvements/
│   │   ├── exploration.md                              (existing)
│   │   ├── proposal.md                                 NEW (this file)
│   │   ├── specs/                                      (sdd-spec writes here)
│   │   ├── design.md                                   (sdd-design writes here)
│   │   └── tasks.md                                    (sdd-tasks writes here)
│   └── config.yaml                                     (no changes)
├── src/
│   ├── App.vue                                         MOD (mount <AppBar>)
│   ├── App.spec.ts                                     MOD
│   ├── components/business/
│   │   ├── AppBar.vue                                  NEW (+ spec)
│   │   ├── BreadcrumbNav.vue                           NEW (+ spec)
│   │   ├── ContadoresHome.vue                          NEW (+ spec)
│   │   ├── BannerEventoActivo.vue                      NEW (+ spec)
│   │   ├── SiguientePasoCta.vue                        NEW (+ spec)
│   │   └── FabNuevo.vue                                NEW (+ spec)
│   ├── composables/
│   │   ├── useResumen.ts                               NEW (+ spec)
│   │   └── useNavegacion.ts                            NEW (+ spec)
│   ├── router/
│   │   ├── routes.ts                                   MOD (+meta.breadcrumb)
│   │   └── routes.spec.ts                              MOD
│   ├── utils/
│   │   ├── breadcrumb.ts                               NEW (+ spec)
│   │   └── siguientePaso.ts                            NEW (+ spec)
│   └── views/
│       ├── HomeView.vue                                MOD (+3 components)
│       ├── HomeView.spec.ts                            MOD
│       ├── EventosView.vue                             MOD (+ FabNuevo)
│       ├── EventosView.spec.ts                         MOD
│       ├── MateriasPrimasView.vue                      MOD (+ FabNuevo)
│       ├── MateriasPrimasView.spec.ts                  MOD
│       ├── RecetasView.vue                             MOD (+ FabNuevo)
│       ├── RecetasView.spec.ts                         MOD
│       ├── EventoDetalleView.vue                       MOD (- Volver btn)
│       ├── EventoDetalleView.spec.ts                   MOD
│       ├── RecetaDetalleView.vue                       MOD (- Volver btn)
│       └── RecetaDetalleView.spec.ts                   MOD
└── tests/setup.ts                                      (no changes)
```

**Counts**: 14 new source files (8 `.vue` + 6 `.ts`) + 14 new spec files + 13 modified files = **41 files touched** (27 source + 14 spec; per the original exploration, the `.spec.ts` files come paired with their source).

**Untouched foundation + catalog + events + POS files** (proof of additive change): `main.ts`, `plugins/vuetify.ts`, `plugins/services.ts`, `services/supabase.client.ts`, `localforage.client.ts`, `storage.interface.ts`, `storage.service.ts`, `composables/useAuth.ts`, `useOnlineStatus.ts`, `usePwaUpdate.ts`, all of `src/services/{ingredients,recipes,events,plans,gastosFijos,productos,ventas,gastosImprevistos,cierres}.service.ts`, all of `src/stores/{ingredients,recipes,events,plans,gastosFijos,productos,ventas,gastosImprevistos,cierres,app}.store.ts`, all of `src/composables/{useCalculoReceta,useEvents,useGastosFijos,useIngredients,usePlans,useProyeccionCostos,useRecipes,useProductos,useVentas,useGastosImprevistos,useCierreCaja}.ts`, all of `src/types/*`, all of `src/utils/{moneda,format,cierre,estado,merma}.ts` (untouched), all business forms (`EventoForm`, `MateriaPrimaForm`, `RecetaForm`, `ProductoForm`, `GastoFijoForm`, `GastoImprevistoForm`, `CierreResumenCard`), `views/PosView.vue`, `views/PosCierreView.vue`, all Supabase migrations, all `docs/*.md`.

---

## 7. AppBar Architecture (locked)

### Why global, in `App.vue`

Brief §2.2 explicitly describes a "Top Bar (desktop)" + "Bottom Navigation Bar (móvil/tablet)". For v1 we pick the **top bar only** (bottom-nav is gated on 4+ top-level destinations; analytics is not yet built). The bar is mounted once in `App.vue` so every view inherits it — no per-view wiring, no duplication.

### AppBar.vue shape

```vue
<v-app-bar app color="surface" density="comfortable">
  <v-btn
    v-if="puedeRetroceder"
    icon="mdi-arrow-left"
    variant="text"
    data-testid="appbar-volver"
    @click="retroceder"
  />
  <BreadcrumbNav :items="breadcrumbActual" />
  <v-spacer />
  <v-app-bar-title>{{ appTitle }}</v-app-bar-title>
</v-app-bar>
```

`appTitle` defaults to the last breadcrumb item (current page label). On `/` (home, no parent) `puedeRetroceder` is `false` so the back button does not render.

### `useNavegacion()` shape

```ts
// src/composables/useNavegacion.ts
export interface BreadcrumbItem { label: string; to: string | null; disabled: boolean }

export function useNavegacion() {
  const router = useRouter()
  const route = useRoute()

  const puedeRetroceder = computed<boolean>(() => {
    const stack = router.options.history.state?.back ?? null
    if (!stack) return false
    const meta = route.meta as { breadcrumb?: string[] }
    return (meta.breadcrumb?.length ?? 0) > 1
  })

  function retroceder() {
    if (puedeRetroceder.value) router.back()
  }

  const breadcrumbActual = computed<BreadcrumbItem[]>(() => {
    const meta = route.meta as { breadcrumb?: string[] }
    const items = meta.breadcrumb ?? ['Home']
    return items.map((label, idx) => ({
      label,
      to: idx === 0 ? '/' : null,
      disabled: idx === items.length - 1,
    }))
  })

  return { puedeRetroceder, retroceder, breadcrumbActual }
}
```

### `route.meta.breadcrumb` shape (data-driven)

| Route | `meta.breadcrumb` |
|---|---|
| `/` | `['Home']` |
| `/materias-primas` | `['Home', 'Materias primas']` |
| `/materias-primas/:id` | `['Home', 'Materias primas', 'Detalle']` |
| `/recetas` | `['Home', 'Recetas']` |
| `/recetas/:id` | `['Home', 'Recetas', 'Detalle']` |
| `/eventos` | `['Home', 'Eventos']` |
| `/eventos/:id` | `['Home', 'Eventos', 'Detalle']` |
| `/pos` | `['Home', 'Caja']` |
| `/pos/cierre/:eventoId` | `['Home', 'Caja', 'Cierre']` |

The home route has `meta: { breadcrumb: ['Home'] }` — no parent, no back button. Dynamic labels (evento name) are v2 via `meta.breadcrumbResolver`.

---

## 8. Counters Data Model (locked)

### `useResumen()` shape

```ts
// src/composables/useResumen.ts
export interface Contadores {
  materiasPrimas: number
  recetas: number
  eventosPlanificacion: number
  eventosEnCurso: number
  eventosCerrados: number
  productos: number
  ventasHoy: number       // starts at 0; updates when POS loads
  cierresCaja: number     // 0 or 1
  cargado: boolean
}

export function useResumen() {
  const ingredients = useIngredientsStore()
  const recipes = useRecipesStore()
  const events = useEventsStore()
  const productos = useProductosStore()
  const ventas = useVentasStore()
  const cierres = useCierresCajaStore()

  const cargado = ref(false)

  async function cargar() {
    await Promise.allSettled([
      ingredients.cargarTodas(),
      recipes.cargarTodas(),
      events.cargarTodas(),
      productos.cargarTodas(),
      // ventas loads lazily on /pos; cierres is per-evento
    ])
    cargado.value = true
  }

  const contadores = computed<Contadores>(() => ({
    materiasPrimas: ingredients.materiasPrimas.length,
    recetas: recipes.recetas.length,
    eventosPlanificacion: events.eventos.filter((e) => e.estado === 'planificacion').length,
    eventosEnCurso: events.eventos.filter((e) => e.estado === 'en_curso').length,
    eventosCerrados: events.eventos.filter((e) => e.estado === 'cerrado').length,
    productos: productos.productos.length,
    ventasHoy: ventas.ventas.length,
    cierresCaja: cierres.cierre ? 1 : 0,
    cargado: cargado.value,
  }))

  return { contadores, cargar }
}
```

**Why `Promise.allSettled` not `Promise.all`**: one store failing (e.g., Supabase 500 on `/materias-primas`) should not blank out the entire home. `allSettled` lets each store set its own `error.value` independently; counters render with whatever loaded.

**Why no global ventas/cierres fetch on mount**: those stores load lazily when the user navigates to `/pos` / `/pos/cierre`. Pulling them eagerly on every home visit is unnecessary I/O.

**Why `eventos` is split into 3 estados in the counter**: the user wants "Planificación / En curso / Cerrado" at a glance, not a single opaque total.

### Counter chips rendered on the home

The home renders 5 chips: `Materias primas`, `Recetas`, `Eventos planificados`, `Eventos en curso`, `Productos`. Each chip is a `<v-chip>` with an icon, count, and click handler that navigates to the corresponding route. Sales + cierres are shown in the banner (when applicable) and in the CTA text, not as separate chips (KISS — 5 chips is the upper bound for v1).

---

## 9. Business State Detection (locked)

### Reuse `ventasStore.eventoEnCurso` (zero new queries)

`ventas.store.ts:81` already has:

```ts
const eventsStore = useEventsStore()
const eventoEnCurso = computed<Evento | null>(
  () => eventsStore.eventos.find((e) => e.estado === 'en_curso') ?? null,
)
```

`BannerEventoActivo.vue` calls `useVentas()` and reads `eventoEnCurso` — done. The banner shows: evento name + fecha + `IR A CAJA` button → `/pos`. If `eventoEnCurso` is `null`, the banner is hidden.

The home view calls `events.cargarTodas()` via `useResumen().cargar()` on mount so `eventoEnCurso` is populated even on a direct deep-link to `/`. If `events.eventos.length === 0` (just-installed app), the banner simply does not render — no special "no events" state needed.

---

## 10. Next-Step CTA Logic (locked)

### `obtenerSiguientePaso(contadores): PasoRecomendado | null`

```ts
// src/utils/siguientePaso.ts
export interface PasoRecomendado {
  texto: string
  ruta: string
  textoBoton: string
  colorBoton: 'primary' | 'success' | 'warning'
  testid: string
}

export function obtenerSiguientePaso(c: Contadores): PasoRecomendado | null {
  if (c.materiasPrimas === 0) {
    return { texto: 'Empezá por acá: cargá tu primera materia prima (harina, azúcar, etc.).',
             ruta: '/materias-primas', textoBoton: 'CREAR MATERIA PRIMA',
             colorBoton: 'primary', testid: 'home-cta-materia-prima' }
  }
  if (c.recetas === 0) {
    return { texto: 'Ahora creá recetas que usen tus materias primas — así podés calcular costos.',
             ruta: '/recetas', textoBoton: 'CREAR RECETA',
             colorBoton: 'primary', testid: 'home-cta-receta' }
  }
  if (c.eventosPlanificacion + c.eventosEnCurso + c.eventosCerrados === 0) {
    return { texto: 'Planificá tu primer evento — definí nombre, fecha y dónde se hace.',
             ruta: '/eventos', textoBoton: 'PLANIFICAR EVENTO',
             colorBoton: 'primary', testid: 'home-cta-evento' }
  }
  if (c.eventosEnCurso === 0) {
    return { texto: 'Tenés eventos planificados. Activá uno para empezar a registrar ventas.',
             ruta: '/eventos', textoBoton: 'IR A EVENTOS',
             colorBoton: 'warning', testid: 'home-cta-activar-evento' }
  }
  if (c.ventasHoy === 0) {
    return { texto: 'El POS está listo — registrá tu primera venta del evento en curso.',
             ruta: '/pos', textoBoton: 'IR A CAJA',
             colorBoton: 'success', testid: 'home-cta-ir-caja' }
  }
  return null  // The user is "in motion" — no CTA needed.
}
```

### Why this exact ordering (locked)

The user's mental model is **sequential**: you cannot make a receta without ingredients; you cannot have an evento without production plans; you cannot sell without an evento `en_curso`. The function reflects that progression. The wording comes from the user's own prompt; no engineer jargon.

### Why `null` when everything is in motion

When all counters are non-zero, the CTA is noise. Hiding it is the Progressive Disclosure principle from brief §2.1. The 3 phase cards remain visible as orientation.

---

## 11. FAB Integration (locked)

### Per-view `<FabNuevo>`

Each list view (`EventosView`, `MateriasPrimasView`, `RecetasView`) renders its own `<FabNuevo>` at the bottom-right. The FAB replaces the existing inline `<v-btn color="primary" prepend-icon="mdi-plus">` in the header row. The dialog state (`dialogo`, `abrirCrear`) stays in the view — the FAB is a trigger, not a dialog owner.

```vue
<!-- src/components/business/FabNuevo.vue -->
<v-fab
  icon="mdi-plus"
  :color="color"
  :aria-label="ariaLabel"
  :data-testid="testid"
  @click="$emit('click')"
/>
```

### FAB visibility rule (matches current logic)

Each view today hides the `+ Nuevo X` button while loading (`v-if="eventos.length > 0 || !cargando"`). The FAB inherits the same rule. Once at least one item exists OR the initial load finished, the FAB appears. Prevents a "create" trigger on a screen that's still empty.

### `/productos` is intentionally NOT in the FAB pass

Products are auto-created from recetas (the `RecetaDetalleView` "Vender esta receta" button). A `+ Nuevo producto` FAB creates two parallel creation paths. **Out of scope for this slice.**

### Bottom-end FAB placement

Vuetify 3 `<v-fab>` defaults to `bottom-end` (bottom-right). We add `app` so the FAB floats over scrolling content. Standard Material pattern.

---

## 12. Home View Redesign

### Before (current)

```
<h1>Kilo-Lima</h1>
[ Pre-evento card (tonal) ]
[ Durante-evento card (tonal) ]
[ Post-evento card (tonal, disabled) ]
[ Accesos rápidos: Materias primas | Recetas | Eventos | Productos ]
```

### After (PR2)

```
<h1>Kilo-Lima</h1>
<ContadoresHome :contadores="contadores" />            <!-- 5 chips, skeleton until cargado -->
<BannerEventoActivo v-if="eventoEnCurso" ... />        <!-- hidden when null -->
<SiguientePasoCta :contadores="contadores" ... />      <!-- hidden when function returns null -->
<v-divider class="my-6" />
<h2 class="text-h6">Flujo del negocio</h2>            <!-- orientation only -->
[ Pre-evento card (tonal) ]
[ Durante-evento card (tonal) ]
[ Post-evento card (tonal, disabled — analytics v2) ]
```

**3 horizontal sections** (counters, banner, CTA), then the existing 3 phase cards as a secondary orientation block. On mobile, the chips wrap into 2-3 rows. The phase cards stay muted (`variant="tonal"`, `disabled` on post-evento). Total: 4 vertical zones, all in one column on mobile. KISS — no carousel, no tabs.

---

## 13. Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/App.vue` | Modified | Mount `<AppBar>` above `<router-view>` inside `<v-app>`. |
| `src/components/business/AppBar.vue` | New | Global `<v-app-bar app>` with back button + breadcrumb + title. |
| `src/components/business/BreadcrumbNav.vue` | New | `<v-breadcrumbs>` driven by `useNavegacion`. |
| `src/components/business/ContadoresHome.vue` | New | 5 counter chips with skeleton state. |
| `src/components/business/BannerEventoActivo.vue` | New | Yellow/green banner using `ventasStore.eventoEnCurso`. |
| `src/components/business/SiguientePasoCta.vue` | New | Contextual CTA card using `obtenerSiguientePaso`. |
| `src/components/business/FabNuevo.vue` | New | `<v-fab>` wrapper component. |
| `src/composables/useNavegacion.ts` | New | `puedeRetroceder`, `retroceder`, `breadcrumbActual`. |
| `src/composables/useResumen.ts` | New | Aggregates counters from 6 stores. |
| `src/utils/siguientePaso.ts` | New | Pure `obtenerSiguientePaso(contadores)`. |
| `src/utils/breadcrumb.ts` | New | Pure `formatearEtiquetaBreadcrumb` + `resolverBreadcrumbDeMeta`. |
| `src/router/routes.ts` | Modified | `meta: { breadcrumb: [...] }` on every route. |
| `src/views/HomeView.vue` | Modified | Replace static phase-card data with 3 new components. |
| `src/views/EventosView.vue` | Modified | Inline `+ Nuevo evento` button → `<FabNuevo>`. |
| `src/views/MateriasPrimasView.vue` | Modified | Same. |
| `src/views/RecetasView.vue` | Modified | Same. |
| `src/views/EventoDetalleView.vue` | Modified | Remove local "Volver" `<v-btn>`. |
| `src/views/RecetaDetalleView.vue` | Modified | Remove local "Volver" `<v-btn>`. |
| `src/App.spec.ts` | Modified | AppBar mounts; root route has no back button. |
| `src/router/routes.spec.ts` | Modified | One assertion per route for `meta.breadcrumb`. |
| All modified `*.spec.ts` (5 views) | Modified | Update selectors (`evento-nuevo` → `evento-fab-nuevo`; remove `*-volver`). |

---

## 14. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **400-line PR budget blown** if HomeView + AppBar + breadcrumb land in one PR. | High | Chained PRs are MANDATORY — see §16. PR1 = navigation, PR2 = home, PR3 = FABs. |
| 2 | **`breadcrumb` meta is wrong on a future dynamic route** (e.g., `/eventos/:id` shows "Detalle" instead of the evento name). | Medium | Locked for v1: dynamic labels are a future slice (add `meta.breadcrumbResolver`). v1 shows the placeholder. |
| 3 | **`ventasStore.eventoEnCurso` is `null` when the home is the first screen** because `eventsStore.eventos` hasn't been loaded yet. | Medium | `useResumen().cargar()` calls `events.cargarTodas()` in parallel. Banner renders once the fetch resolves (skeleton shows first). |
| 4 | **FAB on mobile covers content** (the floating button hides the last list item on small screens). | Low | `<v-fab>` has `app` so it floats over scroll content; standard Material pattern. Users are used to it. |
| 5 | **Removing the local "Volver" buttons feels like a regression** to a user used to them. | Low | The app-bar back button is *always visible*, so the affordance is at least as prominent. Documented in PR1 description. |
| 6 | **`Promise.allSettled` lets one store's error leave counters stale** (e.g., a `materias_primas` 500 leaves the counter at 0 forever on this load). | Low | The store's own `error.value` surfaces; counters recompute on the next `cargar()`. A manual "Reintentar" button is a v2 improvement. |
| 7 | **KISS-violation if we add too many home components** (5 chips + banner + CTA + 3 phase cards = a busy home). | Medium | Phase cards stay muted. Counters are 5 small chips, not a dashboard. Banner is one line. CTA is one card. 4 vertical zones, all in one column on mobile. |
| 8 | **Existing tests that query `evento-nuevo` etc. break.** | High (mechanical) | We update each spec to query the new testid. Each modification is a 1-line find/replace; PR1 + PR3 each touch the relevant specs. |

---

## 15. Rollback Plan

This slice is **purely additive** and reuses existing patterns. The rollback plan is:

1. **PR1 (navigation)**: revert the commit(s) in `App.vue`, `AppBar.vue`, `BreadcrumbNav.vue`, `useNavegacion.ts`, `breadcrumb.ts`, `routes.ts`, and the two `*DetalleView.vue` files. The local "Volver" buttons return. The home is unchanged.
2. **PR2 (home)**: revert the commit(s) in `useResumen.ts`, `siguientePaso.ts`, `ContadoresHome.vue`, `BannerEventoActivo.vue`, `SiguientePasoCta.vue`, and `HomeView.vue`. The home returns to its static phase-card layout.
3. **PR3 (FAB)**: revert the commit(s) in `FabNuevo.vue` and the 3 list views. The inline `+ Nuevo X` buttons return.

**Why rollback is safe**:
- No schema changes (no migrations to revert).
- No `package.json` changes (no `pnpm install` revert).
- No store changes (no Pinia state to migrate).
- No service changes (no Supabase queries to undo).
- Each PR is reviewable in isolation; a revert of one PR does not break the others at runtime (PR2 does not depend on PR3 at runtime; PR3 does not depend on PR2 at runtime; both depend on PR1 only for visual consistency).

---

## 16. Delivery: 3 Chained PRs (mandatory, stacked-to-main)

| PR | Scope | Approx prod lines | Approx test lines | Branch |
|---|---|---|---|---|
| **PR1 — Foundation: app-bar + back + breadcrumb** | `App.vue`, `AppBar.vue`, `BreadcrumbNav.vue`, `useNavegacion.ts`, `breadcrumb.ts`, `routes.ts` (+meta), `EventoDetalleView` (remove Volver), `RecetaDetalleView` (remove Volver), tests | ~200 | ~250 | `feat/ux-appbar` |
| **PR2 — Home context: counters + banner + CTA** | `useResumen.ts`, `siguientePaso.ts`, `ContadoresHome.vue`, `BannerEventoActivo.vue`, `SiguientePasoCta.vue`, `HomeView.vue` modifications, tests | ~250 | ~350 | `feat/ux-home-context` (stacked on PR1) |
| **PR3 — FAB pass** | `FabNuevo.vue`, swap inline buttons in `EventosView` / `MateriasPrimasView` / `RecetasView`, tests | ~70 | ~200 | `feat/ux-fabs` (stacked on PR1) |

**Total**: ~520 production + ~800 test = ~1,320 lines. The 400-line review budget is respected per PR.

**PR1 is the prerequisite** for PR2 + PR3 because both depend on AppBar being present in `App.vue` for visual consistency. **PR2 and PR3 are parallel-safe** (no runtime dependency between them) — the orchestrator can stack them on PR1 in either order.

**Strategy**: stacked-to-main per `openspec/config.yaml` `preflight.delivery_strategy: ask-always` (default for this project is stacked). Each PR merges to main after review; no long-lived feature branches.

**Real-browser verification per PR**: each PR includes a manual smoke checklist in its description (open the app, navigate, click back, click breadcrumb, click FAB, confirm dialog opens, etc.) per the strict-TDD + real-browser verification invariant from `config.yaml` `testing.strict_tdd: true`.

---

## 17. Test Strategy

### Unit tests (no Vue / Pinia / Supabase)

| File | # tests | What it covers |
|---|---|---|
| `src/composables/useResumen.spec.ts` | 7 | Returns 0s when stores are empty; sums by estado; ignores errors via `Promise.allSettled`; `cargado` flips after fetch. |
| `src/composables/useNavegacion.spec.ts` | 5 | `puedeRetroceder` false on `/`; true on `/materias-primas`; `retroceder` calls `router.back`; `breadcrumbActual` reads meta; placeholder labels. |
| `src/utils/siguientePaso.spec.ts` | 6 | One test per branch + null when everything is set. |
| `src/utils/breadcrumb.spec.ts` | 4 | `formatearEtiquetaBreadcrumb` (kebab → Title Case); `resolverBreadcrumbDeMeta` (root vs nested vs missing meta). |

### Component tests (`mount` + real Pinia + real Vuetify + mocked services)

| File | # tests | What it covers |
|---|---|---|
| `src/components/business/AppBar.spec.ts` | 4 | Renders title; back button hidden on root; back button visible on nested routes; breadcrumb items render. |
| `src/components/business/BreadcrumbNav.spec.ts` | 3 | Renders items list; last item is disabled; first item links to `/`. |
| `src/components/business/ContadoresHome.spec.ts` | 3 | Renders all 5 chips when `cargado`; shows skeleton when not; each chip links to the right route. |
| `src/components/business/BannerEventoActivo.spec.ts` | 3 | Hidden when `eventoEnCurso` is null; shows name + fecha + IR A CAJA button; CTA navigates to `/pos`. |
| `src/components/business/SiguientePasoCta.spec.ts` | 3 | Renders the right CTA per counter state; renders nothing when function returns null; button navigates. |
| `src/components/business/FabNuevo.spec.ts` | 2 | Renders with icon + color + testid; emits `click`. |

### Modified tests

| File | What changes |
|---|---|
| `src/App.spec.ts` | Assert AppBar mounts; root route has no back button. |
| `src/router/routes.spec.ts` | One new assertion per route for `meta.breadcrumb`. |
| `src/views/HomeView.spec.ts` | Replace/extend phase-card tests with counter + banner + CTA tests. |
| `src/views/EventosView.spec.ts` | Replace `evento-nuevo` query with `evento-fab-nuevo`. |
| `src/views/MateriasPrimasView.spec.ts` | Same. |
| `src/views/RecetasView.spec.ts` | Same. |
| `src/views/EventoDetalleView.spec.ts` | Remove the `evento-detalle-volver` assertion. |
| `src/views/RecetaDetalleView.spec.ts` | Same. |

**Forecast**: ~30 new tests + ~10 modified. Cumulative kilo-lima test count: ~440 → ~470.

---

## 18. Acceptance Criteria

The change is **DONE** when **all** of the following are true. Each is checkable via a unit test, a component test, a manual browser test, or `pnpm test` / `pnpm build` / `pnpm lint` / `pnpm typecheck`.

- [ ] **AC-1**: `<v-app-bar>` mounts in `App.vue` and is visible on every route (8 routes verified).
- [ ] **AC-2**: Back button is **hidden** on `/` (the home route) and **visible** on every other route when `route.meta.breadcrumb.length > 1`.
- [ ] **AC-3**: Clicking the back button calls `router.back()` (or no-op if `puedeRetroceder` is false).
- [ ] **AC-4**: Breadcrumb renders the items from `route.meta.breadcrumb`, the first item links to `/`, and the last item is `disabled` (no link).
- [ ] **AC-5**: Every route in `src/router/routes.ts` has a `meta.breadcrumb` array of at least 1 element.
- [ ] **AC-6**: `useResumen().contadores` returns 0s when all stores are empty; correct counts after `cargar()` resolves.
- [ ] **AC-7**: `useResumen().cargar()` uses `Promise.allSettled` — one store's failure does not blank the others.
- [ ] **AC-8**: Home shows 5 counter chips (materias primas, recetas, eventos planificados, eventos en curso, productos) with a skeleton while `cargado === false`.
- [ ] **AC-9**: Home shows the yellow/green `BannerEventoActivo` when `ventasStore.eventoEnCurso !== null`, and hides it when null.
- [ ] **AC-10**: Home shows `SiguientePasoCta` for each of the 5 branches of `obtenerSiguientePaso(contadores)` (one test per branch) and hides it when the function returns `null`.
- [ ] **AC-11**: `obtenerSiguientePaso` is a **pure function** (no Vue, no Pinia, no async) — verified by import + invocation in a unit test with no setup.
- [ ] **AC-12**: Each of `EventosView`, `MateriasPrimasView`, `RecetasView` renders a `<FabNuevo>` (testid `evento-fab-nuevo`, `materia-prima-fab-nuevo`, `receta-fab-nuevo` respectively) instead of the inline `+ Nuevo X` button.
- [ ] **AC-13**: Clicking the FAB opens the existing creation dialog (the dialog state stays in the view; the FAB is a trigger, not a dialog owner).
- [ ] **AC-14**: FAB inherits the existing visibility rule (`v-if="items.length > 0 || !cargando"`).
- [ ] **AC-15**: The local "Volver" buttons on `EventoDetalleView` and `RecetaDetalleView` are removed; the global app-bar back button replaces them.
- [ ] **AC-16**: `/productos` does **not** render a FAB (out of scope; verified by absence of `producto-fab-nuevo` testid).
- [ ] **AC-17**: All new and modified files respect the 200-line `.vue` cap and the 30-line function cap from `openspec/config.yaml` `rules.apply`.
- [ ] **AC-18**: `pnpm test` passes (all new + existing tests green). `pnpm build` succeeds. `pnpm lint` clean. `pnpm typecheck` clean.
- [ ] **AC-19**: Zero new entries in `package.json` (verified by `git diff main -- package.json` returning empty).
- [ ] **AC-20**: Each of the 3 PRs is independently reviewable in under 400 prod lines and lands cleanly on `main` after review. Real-browser smoke (navigate, click back, click breadcrumb, click FAB, confirm dialog opens) is included in each PR description.

---

## 19. Open Questions (none — all decisions are locked)

All 10 decisions are locked from exploration. The proposal does not re-litigate them. If the user wants to revisit any decision, they should escalate before `sdd-spec` begins.

---

## 20. Ready for Specs

**Yes.** The orchestrator should proceed with `sdd-spec ux-improvements` to write the formal delta specs (one per modified domain: `foundation` for AppBar + breadcrumb + `useNavegacion`; `home-context` as a NEW domain for `useResumen` + `obtenerSiguientePaso` + the 3 home components; FAB modifications fold into the existing `catalog` (materias-primas + recetas) and `events` (eventos) domains). The 10 architectural decisions in this proposal are locked (no need to re-litigate them in the specs).

The specs phase must:
1. Create a new `home-context` capability (since `useResumen`, `obtenerSiguientePaso`, and the 3 home components are not in `foundation`, `catalog`, `events`, or `pos`).
2. Add delta requirements to `foundation` for `AppBar`, `BreadcrumbNav`, `useNavegacion`, and `route.meta.breadcrumb`.
3. Add delta requirements to `catalog` for `FabNuevo` on `MateriasPrimasView` + `RecetasView` (and removal of the Volver button on `RecetaDetalleView`).
4. Add delta requirements to `events` for `FabNuevo` on `EventosView` (and removal of the Volver button on `EventoDetalleView`).
5. Add delta requirements to `pos` (optional) for the `BannerEventoActivo` re-using `ventasStore.eventoEnCurso` — or fold this into `home-context` (preferred; the banner is a home concern, not a POS concern).

---

## 21. References

- `openspec/changes/ux-improvements/exploration.md` — full analysis (10 decisions, file inventory, test forecast, risks).
- `openspec/changes/ux-improvements/proposal.md` — this file.
- `openspec/config.yaml` — `strict_tdd: true`, `test_command: "pnpm test"`, `review_budget_lines: 400`, `preflight.delivery_strategy: ask-always`.
- `openspec/specs/foundation/spec.md` — REQ-FOUNDATION-* (composables, stores, services shape).
- `openspec/specs/catalog/spec.md` — REQ-CATALOG-* (recetas, ingredientes, FAB modification target).
- `openspec/specs/events/spec.md` — REQ-EVENTS-* (eventos, Volver removal target, `estadoEsEditable` reuse).
- `openspec/specs/pos/spec.md` — REQ-POS-* (`ventasStore.eventoEnCurso` is the banner source).
- `brief.md` §2.1 (Progressive Disclosure), §2.2 (Top Bar pattern), §6.1 (mobile-first).
