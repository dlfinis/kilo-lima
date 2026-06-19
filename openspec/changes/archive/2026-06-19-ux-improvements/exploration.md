# Exploration: `ux-improvements` (Navigation + Home Context)

> **Change**: `ux-improvements` | **Phase**: `sdd-explore`
> **Scope** (locked from the orchestrator prompt):
> - **A. App bar with back button + breadcrumbs** — global, always visible
> - **B. Home with real context** — counters, business state banner, next-step CTA
> - **C. FAB (Floating Action Button)** on `/eventos`, `/materias-primas`, `/recetas`
>
> **Deferred** (separate slice `eventos-multidia`):
> - Multi-day events (`fecha_inicio` + `fecha_fin`)
> - Future event planning ("planifica un evento que ocurre el próximo mes")
>
> **Out of scope** (later slices): auth, analytics, offline-sync.

---

## Current State

The app currently ships 8 views behind a minimal `App.vue` shell
(`<v-app><v-main><div id="app-root"><h1>Kilo-Lima</h1></div><router-view /></v-main></v-app>` — 16 lines). There is
**no persistent navigation**: no app-bar, no breadcrumbs, no back button. Once the
user enters `/materias-primas` they can only return via the browser back button,
which discards SPA state.

`HomeView.vue` is a static hub of three phase cards (Pre-evento / Durante-evento /
Post-evento) plus four "Accesos rápidos" outlined buttons. The cards are tonal
and disabled (`disabled` on the post-evento card) but **carry no live data**:
the user has no idea how many ingredientes, recetas, eventos, ventas, or cierres
exist until they navigate to each view. That is exactly the user's complaint:
"la pantalla principal sigue floja — no me da opciones para dirigirme".

The "Nuevo X" button on the three CRUD list views
(`MateriasPrimasView`, `RecetasView`, `EventosView`, `ProductosView`) sits in the
header row next to the page title. The user reports it gets lost — and on
mobile/tablet the row gets crowded when the title is long.

### Inventory of existing assets we will reuse

| Asset | Where | How we reuse it |
|-------|-------|-----------------|
| `eventoEnCurso: ComputedRef<Evento \| null>` | `src/stores/ventas.store.ts:81` | Reuse verbatim for the "EVENTO ACTIVO" banner. It's already a cross-store READ inside a `computed`, derived from `eventsStore.eventos.find(e => e.estado === 'en_curso')`. **Zero new state.** |
| All domain stores | `src/stores/*.store.ts` | Read `.length` and filter by estado. No store mutation, no schema change. |
| `useEvents`, `useIngredients`, `useRecipes`, `useProductos`, `useVentas` | `src/composables/*.ts` | Each one exposes a `cargarTodas` we can call from a new `useResumen()` if the home is the first screen the user opens. |
| `estadoEsEditable(estado)` | `src/utils/estado.ts` | Reuse for "should the FAB / inline button render". `en_curso` keeps the FAB active; `cerrado` disables it. |
| `formatearUSD`, `formatearUnidad` | `src/utils/format.ts` | Reuse for the counter chips ("5 ingredientes", "$1,234.56 ventas"). |
| `EventosView`, `MateriasPrimasView`, `RecetasView` "Nuevo X" button | each view | Replace with `<v-fab>` (per-view, see §6). The dialog stays untouched — we only swap the trigger. |
| "Volver" buttons | `EventoDetalleView.vue:113`, `RecetaDetalleView.vue:75` | **Remove** — the global app-bar back button replaces them. Reduces per-view code and enforces a single mental model. |
| Routes meta | `src/router/routes.ts` | Extend each route with `meta: { breadcrumb: ('Home' \| parentLabel)[] }`. Breadcrumb is data-driven from meta. |

### No DB changes

`ux-improvements` is a pure UX slice. No Supabase migration, no `Database` interface change, no RLS change. All state is read from stores the catalog/events/POS slices already hydrate.

### Inherited patterns (do not change)

- `<script setup lang="ts">` Composition API + 200/30 line caps.
- Setup-style Pinia, one store per domain.
- Service never-throw contract `{ data, error: ServiceError | null }` (not directly relevant here, but no view throws either).
- Spanish UI copy, English identifiers.
- `strict_tdd: ENABLED` — every new `.ts` ships a `.spec.ts` first; every new `.vue` ships a `.spec.ts`.

---

## Affected Areas

### New files

| Path | Why it appears |
|------|----------------|
| `src/components/business/AppBar.vue` | Global `<v-app-bar>` mounted in `App.vue`. Title (route meta) + breadcrumb + back button slot. |
| `src/components/business/BreadcrumbNav.vue` | Reusable `<v-breadcrumbs>` driven by `route.meta.breadcrumb`. |
| `src/components/business/ContadoresHome.vue` | Grid of counter chips on the home view (ingredientes, recetas, eventos, ventas, cierres). |
| `src/components/business/BannerEventoActivo.vue` | Yellow/green banner on home when an evento is `en_curso` (reuses `useVentas().eventoEnCurso`). |
| `src/components/business/SiguientePasoCta.vue` | The contextual CTA card on home (text + button → relevant route). |
| `src/components/business/FabNuevo.vue` | Reusable `<v-fab>` wrapper with `icon`, `color`, `testid`, `@click` props. |
| `src/composables/useResumen.ts` | Aggregates counters from all domain stores; exposes `cargar()` and computed `contadores`. |
| `src/composables/useResumen.spec.ts` | 6–8 unit tests. |
| `src/composables/useNavegacion.ts` | Exposes `puedeRetroceder`, `retroceder()` (uses `router.go(-1)` guarded), and a `breadcrumbActual` computed. |
| `src/composables/useNavegacion.spec.ts` | 4–6 unit tests. |
| `src/utils/siguientePaso.ts` | Pure function `obtenerSiguientePaso(contadores): PasoRecomendado \| null`. |
| `src/utils/siguientePaso.spec.ts` | 6 tests (one per branch in §5). |
| `src/utils/breadcrumb.ts` | Pure formatters: `formatearEtiquetaBreadcrumb`, `resolverBreadcrumbDeMeta`. |
| `src/utils/breadcrumb.spec.ts` | 4 tests. |

### Modified files

| Path | Why |
|------|-----|
| `src/App.vue` | Mount `<AppBar>` above `<router-view>` inside `<v-app>`. |
| `src/router/routes.ts` | Add `meta: { breadcrumb: [...] }` to every route. |
| `src/router/routes.spec.ts` | Extend the registry test with one assertion per new `meta.breadcrumb` value. |
| `src/App.spec.ts` | Assert the app-bar renders and the root route has no back button. |
| `src/views/HomeView.vue` | Replace the static phase cards' data with `<ContadoresHome>` + `<BannerEventoActivo>` + `<SiguientePasoCta>`. Keep the 3 phase cards as a secondary "flujo" section (they orient the user about the business, not the data). |
| `src/views/HomeView.spec.ts` | Add tests for counter rendering, banner visibility, CTA text per state. |
| `src/views/EventosView.vue` | Remove the inline `+ Nuevo evento` button; render `<FabNuevo>` instead. Keep the dialog unchanged. |
| `src/views/EventosView.spec.ts` | Replace the `evento-nuevo` assertion with `evento-fab-nuevo`. |
| `src/views/MateriasPrimasView.vue` | Same — inline button → `<FabNuevo>`. |
| `src/views/MateriasPrimasView.spec.ts` | Replace assertion. |
| `src/views/RecetasView.vue` | Same — inline button → `<FabNuevo>`. |
| `src/views/RecetasView.spec.ts` | Replace assertion. |
| `src/views/EventoDetalleView.vue` | Remove the local "Volver" `<v-btn>` (app-bar back button replaces it). Header stays the same. |
| `src/views/EventoDetalleView.spec.ts` | Update assertion (the volver button no longer exists; back is at the app-bar level). |
| `src/views/RecetaDetalleView.vue` | Same as EventoDetalleView. |
| `src/views/RecetaDetalleView.spec.ts` | Same. |

### Untouched (proof of additive change)

All other archived slices stay untouched: `src/services/*`, all other stores, `src/types/*`, `src/composables/useEvents.ts` / `useIngredients.ts` / `useRecipes.ts` (we add `useResumen` next to them, not in place of them), `src/plugins/*`, `src/utils/cierre.ts` / `moneda.ts`, all `ProyeccionCostosCard` / `RecetaCostoDesglose` / business forms. The Post-evento analytics card stays `disabled` — that's a future slice.

---

## Decision: App Bar Architecture

### Decision: **Global, in `App.vue`**

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **A. Global `<AppBar>` in `App.vue`** (selected) | Single source of navigation truth; consistent across all views; brief §2.2 explicitly describes "Top Bar (desktop)" + "Bottom Navigation Bar (móvil/tablet)"; isolates the navigation concern from individual views. | Hides the navigation in one place — if it breaks, every page is affected. | Low |
| B. Per-view header | Each view owns its own header; easy to specialize. | Duplicates the back/breadcrumb logic in every view; brief §2.2 is explicit about a global top bar; mobile needs persistent navigation. | Medium |
| C. Hybrid — global app-bar + per-view sub-header | Most flexible. | KISS-violation for a personal-use app; per-view sub-header adds a second row of chrome that hurts mobile real-estate. | High |

**Why A wins**: brief §2.2 specifies a global top bar explicitly. The user's #1 complaint
("No hay forma de retroceder") is solved by **always-visible** navigation, not
per-view headers. The global bar is a Vuetify `<v-app-bar app>` mounted once
in `App.vue`. Its props come from `route.meta.breadcrumb` (data-driven) — no
view imports or wires navigation logic.

### AppBar.vue shape (locked)

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

`appTitle` defaults to the last breadcrumb item (current page label). On `/`
(home, no parent) `puedeRetroceder` is `false` so the back button doesn't render.

### Back-button logic — where it lives

Inside `useNavegacion()` (composable), **not** in AppBar.vue. Reasons:
- SRP — AppBar is presentational; the navigation history guard belongs in a composable.
- Reusable from any future "cancel" button that wants the same semantics.
- Unit-testable without mounting the component.

```ts
// src/composables/useNavegacion.ts
export function useNavegacion() {
  const router = useRouter()
  const route = useRoute()

  const puedeRetroceder = computed<boolean>(() => {
    const stack = router.options.history.state?.back ?? null
    // Hide on root entry (no history) and on direct nav that landed here
    // without a prior same-app route.
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

### Breadcrumb — data-driven from `route.meta`

We extend every route in `src/router/routes.ts` with:

```ts
{
  path: '/materias-primas',
  name: 'materias-primas',
  component: () => import('@/views/MateriasPrimasView.vue'),
  meta: { breadcrumb: ['Home', 'Materias primas'] },
},
{
  path: '/eventos/:id',
  name: 'evento-detalle',
  component: () => import('@/views/EventoDetalleView.vue'),
  meta: { breadcrumb: ['Home', 'Eventos', 'Detalle'] }, // dynamic label is "Detalle" placeholder
},
```

**Why placeholder labels**: the dynamic part (the evento name) is only available
*inside* the view, after `cargarPorId` resolves. Showing "Eventos / Detalle"
until the evento loads is acceptable for v1 (matches the catalog/events
acceptance pattern of "title appears after data loads"). A future slice can
add `route.meta.breadcrumbResolver` (a function that receives the loaded
record) — out of scope for ux-improvements.

The home route has `meta: { breadcrumb: ['Home'] }` — no parent, no back button.

---

## Decision: Counters Data Model

### Decision: **New `useResumen()` composable** (Option A)

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **A. New `useResumen()` composable** (selected) | SRP — counters is a "dashboard" concern, not an app-shell concern. Reuses existing stores (no duplication). Easy to test in isolation. Returns a single `contadores` computed + a `cargar()` action. | One new composable. | Low |
| B. Add `contadores` state to `app.store.ts` | Centralizes all global UI state in one store. | Mixes the "app name" (which is already there) with cross-domain aggregates — `app.store` would have to `useEventsStore()`, `useIngredientsStore()`, etc., turning the app store into a god-object. Violates SRP. | Medium |
| C. Per-store selectors aggregated in `HomeView.vue` itself | Zero new files. | Each counter requires a separate `useStore()` call inside `HomeView`, which duplicates that wiring for any future place that wants counters. | Low |

**Why A wins**: `useResumen()` is the canonical "dashboard" composable.
It lives next to `useEvents()`, follows the same `storeToRefs` pattern, and
returns one `contadores` computed. `HomeView` mounts it once on `onMounted`
(calling `cargar()` to lazy-fetch stores the user hasn't visited yet) and
binds the value to `<ContadoresHome>`.

### `useResumen()` shape (locked)

```ts
// src/composables/useResumen.ts
export interface Contadores {
  materiasPrimas: number
  recetas: number
  eventosPlanificacion: number
  eventosEnCurso: number
  eventosCerrados: number
  productos: number
  ventasHoy: number        // TODO: derive from ventas.eventoEnCurso once POS loads
  cierresCaja: number
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
      // ventas only loads when a user navigates to /pos — we leave
      // it out of the home aggregator to avoid surprise fetches.
      // cierresCaja is per-evento, also out of the global counter.
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

**Why `Promise.allSettled` not `Promise.all`**: one store failing (e.g., Supabase 500 on `/materias-primas`) should not blank out the entire home. `allSettled` lets each store set its own `error.value` independently; the counters render with whatever loaded.

**Why no global ventas/cierres fetch on mount**: those stores load lazily when
the user navigates to `/pos` / `/pos/cierre`. Pulling them eagerly on every
home visit is unnecessary I/O. `ventasHoy` starts at 0 and updates naturally
when the user opens POS — acceptable for v1 (a future analytics slice can
backfill this from a focused query).

**Why `eventos` is split into 3 estados in the counter**: the user wants to
see "Planificación / En curso / Cerrado" at a glance, not a single opaque
total. The home renders three numbers (e.g., "2 planificados · 1 en curso · 3 cerrados") so the user can quickly pick the right action.

---

## Decision: Business State Detection

### Decision: **Reuse `ventasStore.eventoEnCurso` (zero new queries)**

The `ventas.store.ts` already has:

```ts
const eventsStore = useEventsStore()
const eventoEnCurso = computed<Evento | null>(
  () => eventsStore.eventos.find((e) => e.estado === 'en_curso') ?? null,
)
```

**That is exactly the business state we need.** We don't add a new query, a
new store field, a Supabase view, or a function. `BannerEventoActivo.vue`
calls `useVentas()` and reads `eventoEnCurso` — done.

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **A. Reuse `ventasStore.eventoEnCurso`** (selected) | Zero new code; already a `computed`; already cross-store READ inside a `computed` (REQ-POS-51 pattern). | None. | None |
| B. Add a Supabase view / function | Server-side filtering. | Overkill — `events` table has <100 rows; client-side `find` is O(n) on a tiny array. | High |
| C. Cache `ultimoEnCurso` in `events.store` | Same as A but with extra state. | Adds state for no reason (the computed already exists). | Low |

The home view calls `events.cargarTodas()` via `useResumen().cargar()` on mount
so `eventoEnCurso` is populated even on a direct deep-link to `/`.

If `events.eventos.length === 0` (the user just installed the app), the banner
just doesn't render — `eventoEnCurso` is `null`. No special "no events" state
needed.

---

## Decision: Next-Step CTA Logic

### Decision: **Pure function `obtenerSiguientePaso(contadores)`**

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
    return {
      texto: 'Empezá por acá: cargá tu primera materia prima (harina, azúcar, etc.).',
      ruta: '/materias-primas',
      textoBoton: 'CREAR MATERIA PRIMA',
      colorBoton: 'primary',
      testid: 'home-cta-materia-prima',
    }
  }
  if (c.recetas === 0) {
    return {
      texto: 'Ahora creá recetas que usen tus materias primas — así podés calcular costos.',
      ruta: '/recetas',
      textoBoton: 'CREAR RECETA',
      colorBoton: 'primary',
      testid: 'home-cta-receta',
    }
  }
  if (c.eventosPlanificacion + c.eventosEnCurso + c.eventosCerrados === 0) {
    return {
      texto: 'Planificá tu primer evento — definí nombre, fecha y dónde se hace.',
      ruta: '/eventos',
      textoBoton: 'PLANIFICAR EVENTO',
      colorBoton: 'primary',
      testid: 'home-cta-evento',
    }
  }
  if (c.eventosEnCurso === 0) {
    return {
      texto: 'Tenés eventos planificados. Activá uno para empezar a registrar ventas.',
      ruta: '/eventos',
      textoBoton: 'IR A EVENTOS',
      colorBoton: 'warning',
      testid: 'home-cta-activar-evento',
    }
  }
  if (c.ventasHoy === 0) {
    return {
      texto: 'El POS está listo — registrá tu primera venta del evento en curso.',
      ruta: '/pos',
      textoBoton: 'IR A CAJA',
      colorBoton: 'success',
      testid: 'home-cta-ir-caja',
    }
  }
  return null  // The user is "in motion" — no CTA needed.
}
```

This is a **pure function** — no Vue, no Pinia, no async — so it's trivially
unit-testable. `SiguientePasoCta.vue` calls `computed(() => obtenerSiguientePaso(contadores.value))`
and renders `null` when the function returns `null`.

### Why this exact ordering (locked)

The user's mental model is **sequential**: you can't make a receta without
ingredients, you can't have an evento without production plans, you can't
sell without an evento en_curso. The function reflects that progression.
We picked the wording from the user's own prompt; no engineer jargon.

### Why `ventasHoy` instead of `ventasTotales`

The home should nudge the user toward *their next action*, not display a
retrospective dashboard. "Registrá tu primera venta del evento en curso" is
the right message when `ventasHoy === 0`. A future analytics slice can add
totals.

### Why `null` when everything is in motion

When all counters are non-zero (the user already has ingredientes, recetas,
eventos, ventas), the CTA is noise. Hiding it is the Progressive Disclosure
principle from brief §2.1. The 3 phase cards remain visible as orientation.

---

## Decision: FAB Integration

### Decision: **Per-view FAB** (each view renders its own `<FabNuevo>`)

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **A. Per-view `<FabNuevo>`** (selected) | Matches existing per-view pattern (each view owns its "+ Nuevo X" logic). The dialog stays in the same view. No global event bus. | Slightly more code per view. | Low |
| B. Global FAB whose target depends on `route.name` | Single FAB for the whole app. | Requires a route-name → action map. Cross-cutting concerns: dialogs live in views, the FAB triggers them from outside. Hard to test. | High |

**Why A wins**: each view already owns its create dialog
(`EventoForm`, `MateriaPrimaForm`, `RecetaForm`). The FAB is a trigger, not a
dialog owner. The view mounts `<FabNuevo>` at the bottom-right of its
container; `<FabNuevo>` is a tiny presentational wrapper:

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

We **replace** the existing inline `<v-btn color="primary" prepend-icon="mdi-plus">` in the three views with the FAB. The dialog state (`dialogo`, `abrirCrear`) stays in the view. The trigger just changes.

### FAB visibility rule (matches current logic)

Each view today hides the "+ Nuevo X" button while loading (`v-if="eventos.length > 0 || !cargando"`). The FAB inherits the same rule. Once at least one item exists OR the initial load finished, the FAB appears. Prevents a "create" trigger on a screen that's still empty (the user might not yet know what the screen is for).

### `/productos` is intentionally NOT in the FAB pass

The user complaint scopes the FAB to `/eventos`, `/materias-primas`, `/recetas`. Productos is auto-created from a receta (the `RecetaDetalleView` "Vender esta receta" button), so a "+ Nuevo producto" FAB adds noise. **Out of scope for this slice.** We'll mention this as a gap in §9.

### Bottom-end FAB placement

Vuetify 3 `<v-fab>` defaults to `bottom-end` (bottom-right). On the catalog/events list views, this is exactly where the existing inline button sits conceptually. We add `app` so the FAB floats over scrolling content.

---

## File Structure Summary

```
src/
├── App.vue                                                MOD (mount AppBar)
├── App.spec.ts                                            MOD
├── components/
│   └── business/
│       ├── AppBar.vue                                     NEW (+ spec)
│       ├── BreadcrumbNav.vue                              NEW (+ spec)
│       ├── ContadoresHome.vue                             NEW (+ spec)
│       ├── BannerEventoActivo.vue                         NEW (+ spec)
│       ├── SiguientePasoCta.vue                           NEW (+ spec)
│       └── FabNuevo.vue                                   NEW (+ spec)
├── composables/
│   ├── useResumen.ts                                      NEW (+ spec)
│   └── useNavegacion.ts                                   NEW (+ spec)
├── router/
│   ├── routes.ts                                          MOD (+ meta.breadcrumb)
│   └── routes.spec.ts                                     MOD
├── utils/
│   ├── breadcrumb.ts                                      NEW (+ spec)
│   └── siguientePaso.ts                                   NEW (+ spec)
└── views/
    ├── HomeView.vue                                       MOD (+ 3 components)
    ├── HomeView.spec.ts                                   MOD
    ├── EventosView.vue                                    MOD (+ FabNuevo)
    ├── EventosView.spec.ts                                MOD
    ├── MateriasPrimasView.vue                             MOD (+ FabNuevo)
    ├── MateriasPrimasView.spec.ts                         MOD
    ├── RecetasView.vue                                    MOD (+ FabNuevo)
    ├── RecetasView.spec.ts                                MOD
    ├── EventoDetalleView.vue                              MOD (remove Volver)
    ├── EventoDetalleView.spec.ts                          MOD
    ├── RecetaDetalleView.vue                              MOD (remove Volver)
    └── RecetaDetalleView.spec.ts                          MOD
```

**Counts**:
- New source files: 14 (8 `.vue` + 6 `.ts`, each with a `.spec.ts` companion → 14 specs)
- Modified files: 13
- Total: 27 files touched

---

## Estimated Code Lines

| Surface | Estimated lines |
|---------|-----------------|
| `AppBar.vue` | ~60 (template-heavy) |
| `BreadcrumbNav.vue` | ~25 |
| `ContadoresHome.vue` | ~90 (5 chips + grid) |
| `BannerEventoActivo.vue` | ~45 |
| `SiguientePasoCta.vue` | ~70 (text + button + computed) |
| `FabNuevo.vue` | ~20 |
| `useResumen.ts` | ~55 |
| `useNavegacion.ts` | ~40 |
| `breadcrumb.ts` | ~25 |
| `siguientePaso.ts` | ~55 (the function + interface + 6 branches) |
| `App.vue` modifications | ~5 |
| `HomeView.vue` modifications | ~30 (replace 3 sections) |
| `EventosView.vue` modifications | ~-5 to ~+5 (swap inline button for FAB) |
| `MateriasPrimasView.vue` modifications | ~±0 (swap button for FAB) |
| `RecetasView.vue` modifications | ~±0 (swap button for FAB) |
| `EventoDetalleView.vue` modifications | ~-8 (remove Volver btn) |
| `RecetaDetalleView.vue` modifications | ~-8 (remove Volver btn) |
| `router/routes.ts` modifications | ~10 (one meta line per route) |
| **Production total** | **~520 lines** |

Plus ~22 new spec files (~30-40 lines each) → +~800 lines of tests.

---

## Test Strategy

### Unit tests (no Vue / Pinia / Supabase)

| File | # tests | What it covers |
|------|---------|---------------|
| `src/composables/useResumen.spec.ts` | 7 | Returns 0s when stores are empty; sums by estado; ignores errors via `Promise.allSettled`; `cargado` flips after fetch. |
| `src/composables/useNavegacion.spec.ts` | 5 | `puedeRetroceder` false on `/`; true on `/materias-primas`; `retroceder` calls `router.back`; `breadcrumbActual` reads meta; placeholder labels. |
| `src/utils/siguientePaso.spec.ts` | 6 | One test per branch + null when everything is set. |
| `src/utils/breadcrumb.spec.ts` | 4 | `formatearEtiquetaBreadcrumb` (kebab → Title Case); `resolverBreadcrumbDeMeta` (root vs nested vs missing meta). |

### Component tests (`mount` + real Pinia + real Vuetify + mocked services)

| File | # tests | What it covers |
|------|---------|---------------|
| `src/components/business/AppBar.spec.ts` | 4 | Renders title; back button hidden on root; back button visible on nested routes; breadcrumb items render. |
| `src/components/business/BreadcrumbNav.spec.ts` | 3 | Renders items list; last item is disabled; first item links to `/`. |
| `src/components/business/ContadoresHome.spec.ts` | 3 | Renders all 5 counter chips when cargado; shows skeleton when not; each chip links to the right route. |
| `src/components/business/BannerEventoActivo.spec.ts` | 3 | Hidden when `eventoEnCurso` is null; shows name + fecha + IR A CAJA button when present; CTA navigates to `/pos`. |
| `src/components/business/SiguientePasoCta.spec.ts` | 3 | Renders the right CTA per counter state; renders nothing when everything is set; button navigates to the right route. |
| `src/components/business/FabNuevo.spec.ts` | 2 | Renders with icon + color + testid; emits `click`. |

### Modified tests

| File | What changes |
|------|-------------|
| `src/App.spec.ts` | Assert the AppBar mounts and the root route has no back button. |
| `src/router/routes.spec.ts` | One new assertion per route for `meta.breadcrumb`. |
| `src/views/HomeView.spec.ts` | Replace/extend the phase-card tests with counter + banner + CTA tests. |
| `src/views/EventosView.spec.ts` | Replace `evento-nuevo` query with `evento-fab-nuevo`. |
| `src/views/MateriasPrimasView.spec.ts` | Same. |
| `src/views/RecetasView.spec.ts` | Same. |
| `src/views/EventoDetalleView.spec.ts` | Remove the `evento-detalle-volver` assertion. |
| `src/views/RecetaDetalleView.spec.ts` | Same. |

### Forecast

- New unit tests: ~22
- New component tests: ~18
- Modified tests: ~10
- **Total new tests: ~30**, **Total modified: ~10**
- Cumulative kilo-lima test count goes from ~440 to ~470 (forecast).

---

## Risks and Gaps

### Risks

| # | Risk | Likelihood | Mitigation |
|---|------|-----------|------------|
| 1 | **400-line PR budget blown by HomeView + AppBar + breadcrumb in one PR.** | High | Chained PRs are mandatory — see §10. |
| 2 | **`breadcrumb` meta is wrong on a future dynamic route** (e.g., `/eventos/:id` shows "Detalle" instead of the evento name). | Medium | Locked: dynamic labels are a future-slice enhancement (add `meta.breadcrumbResolver`). v1 shows the placeholder. Document in proposal. |
| 3 | **`useVentas().eventoEnCurso` is `null` when the home is the first screen the user opens**, because `eventsStore.eventos` hasn't been loaded yet. | Medium | `useResumen().cargar()` calls `events.cargarTodas()` in parallel. The banner renders once that fetch resolves (loading skeleton shows first). |
| 4 | **FAB on mobile covers content** (the floating button hides the last list item on small screens). | Low | `<v-fab>` has `app` so it floats over scroll content; standard Material pattern. Users are used to it. |
| 5 | **Removing the local "Volver" buttons feels like a regression** to a user who's used to them. | Low | The app-bar back button is *always visible*, so the affordance is at least as prominent. Document in proposal as a deliberate consolidation. |
| 6 | **`Promise.allSettled` lets one store's error leave counters stale** (e.g., a `materias_primas` 500 leaves the counter at 0 forever on this load). | Low | The store's own `error.value` surfaces; counters recompute on the next `cargar()`. Adding a manual "Reintentar" button on the home is a v2 improvement. |
| 7 | **KISS-violation if we add too many home components** (5+ counter chips + banner + CTA + 3 phase cards = a busy home). | Medium | The phase cards stay muted (`variant="tonal"`, `disabled` on post-evento). Counters are 5 small chips, not a dashboard. Banner is one line. CTA is one card. Total: 3 horizontal sections, all in one column on mobile. |
| 8 | **Existing tests that query `evento-nuevo` etc. break.** | High (mechanical) | We update each spec to query the new testid. Each modification is a 1-line find/replace. |

### Gaps from brief (locked decisions)

| # | Gap | Decision |
|---|-----|---------|
| 1 | Brief doesn't explicitly mention "back button" or "FAB". | **Interpretation**: brief §2.2 mentions "Top Bar (desktop)" and §2.1.4 says "Acciones principales a la derecha o abajo (FAB)". We infer both: top bar carries the back button (most prominent) and the FAB carries the create action (Material standard). |
| 2 | Brief §6.1 says "Mobile-first with bottom navigation or top bar" — we picked top bar only. | Locked for v1: single global `<v-app-bar>`. Bottom-nav is a future slice when we add 4+ top-level destinations (catalog/events/POS/analytics — analytics not yet built). |
| 3 | `/productos` does not get a FAB. | Locked: products are auto-created from recetas (see `RecetaDetalleView` "Vender esta receta"). Adding a "+ Nuevo producto" FAB creates two parallel creation paths and confuses the user. |
| 4 | The post-evento card on Home stays disabled. | Locked: analytics is a future slice. The home renders the card greyed out as a placeholder, matching today's behavior. |
| 5 | Breadcrumb labels for dynamic routes (e.g., evento name) are placeholders ("Detalle"). | Locked for v1; `meta.breadcrumbResolver` is a future enhancement. |
| 6 | Multi-day events and future event planning. | **OUT OF SCOPE** — separate `eventos-multidia` slice. |

---

## Chained PR Plan (mandatory)

The estimated ~520 production lines + ~800 test lines exceeds the 400-line
review budget on a single PR. The orchestrator should plan **3 chained PRs**:

| PR | Scope | Approx prod lines | Approx test lines |
|----|-------|-------------------|-------------------|
| **PR1 — Foundation: app-bar + back + breadcrumb** | `App.vue`, `AppBar.vue`, `BreadcrumbNav.vue`, `useNavegacion.ts`, `breadcrumb.ts`, `routes.ts` (+meta), `EventoDetalleView` (remove Volver), `RecetaDetalleView` (remove Volver), tests | ~200 | ~250 |
| **PR2 — Home context: counters + banner + CTA** | `useResumen.ts`, `siguientePaso.ts`, `ContadoresHome.vue`, `BannerEventoActivo.vue`, `SiguientePasoCta.vue`, `HomeView.vue` modifications, tests | ~250 | ~350 |
| **PR3 — FAB pass** | `FabNuevo.vue`, swap inline buttons in `EventosView` / `MateriasPrimasView` / `RecetasView`, tests | ~70 | ~200 |

**Decision needed before apply: Yes** (the orchestrator must split into 3 PRs).
**Chained PRs recommended: Yes.**
**400-line budget risk: High** (without the split).

Each PR is autonomous:
- PR1 lands the navigation shell; no business logic changes.
- PR2 lands the dashboard; depends on PR1's meta.breadcrumb only for tests, not for runtime (the home view doesn't use breadcrumb).
- PR3 lands the FAB; depends on PR1's AppBar (they share the visual chrome), but the FAB is a separate trigger.

Stacked or feature-branch chain — the orchestrator decides based on
`openspec/config.yaml` `preflight.delivery_strategy`.

---

## Ready for Proposal

**Yes.** The orchestrator should proceed with `/sdd-propose ux-improvements`
to write the formal proposal. All architectural decisions in this exploration
are locked (no need to re-litigate them in the proposal). The proposal just
needs to:
1. Reference this exploration.
2. Lock the scope (A, B, C) and the explicit out-of-scope list.
3. Lock the chained-PR plan (3 PRs, ~520 prod lines total).
4. Reference brief §2.1 (Progressive Disclosure) and §2.2 (Top Bar pattern).
5. Mention `eventos-multidia` as the next change for the deferred UX items.