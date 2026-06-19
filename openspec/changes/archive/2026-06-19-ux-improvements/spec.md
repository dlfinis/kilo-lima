# Delta Spec: ux-improvements

> **Change**: `ux-improvements` | **Type**: Additive
> **Source**: `openspec/changes/ux-improvements/proposal.md` (10 locked decisions, 20 AC)
> **Target domains**: foundation (AppBar + breadcrumb + useNavegacion), catalog (FabNuevo + Volver removal), events (FabNuevo + Volver removal), new home-context (useResumen + obtenerSiguientePaso + home components)

---

## ADDED Requirements

### 1. AppBar Global

| ID | Requirement (SHALL) | Rationale |
|----|--------------------|-----------|
| REQ-UX-1 | Mount global `<v-app-bar>` in `App.vue`, persistent across all routes. | Brief §2.2 top bar pattern; single navigation source of truth. |
| REQ-UX-2 | Back button renders when `route.meta.breadcrumb.length > 1`, hidden on `/`. Click calls `router.back()`. | User complaint: "no hay forma de retroceder." |
| REQ-UX-3 | Home icon always visible, navigates to `/`. | Quick-return affordance on every route. |
| REQ-UX-4 | AppBar shows `appStore.appName` in `<v-app-bar-title>`. | Brand consistency; reinforces identity. |

#### Scenario: AppBar renders on every route (REQ-UX-1)
- GIVEN the app is mounted
- WHEN navigating to `/`, `/materias-primas`, `/eventos`, `/recetas`, `/pos`
- THEN a `<v-app-bar>` element is present in the DOM on every route

#### Scenario: Back button hidden on home, visible elsewhere (REQ-UX-2)
- GIVEN route `/` has `meta.breadcrumb: ['Home']`
- WHEN AppBar mounts
- THEN the back button is NOT rendered (`puedeRetroceder` is false)
- AND on `/materias-primas` (`breadcrumb.length=2`) the back button IS rendered
- AND clicking it calls `router.back()`

#### Scenario: Home icon navigates to root (REQ-UX-3)
- GIVEN user is on `/eventos`
- WHEN clicking the home icon in AppBar
- THEN `router.push('/')` is triggered

#### Scenario: App name displayed (REQ-UX-4)
- GIVEN `appStore.appName = 'Kilo-Lima'`
- WHEN any route renders
- THEN the AppBar title text is `'Kilo-Lima'`

---

### 2. Breadcrumb Navigation

| ID | Requirement (SHALL) | Rationale |
|----|--------------------|-----------|
| REQ-UX-5 | Breadcrumb rendered from `route.meta.breadcrumb: {title, to?}[]`. | Data-driven; views never wire breadcrumb logic. |
| REQ-UX-6 | Each crumb is a link except the last (current page, `disabled`). | Users can jump to ancestor routes. |
| REQ-UX-7 | Every route in `routes.ts` registers `meta.breadcrumb`. | Single source of truth per the route table in proposal §7. |
| REQ-UX-8 | `useNavegacion()` exposes `breadcrumbs: ComputedRef<BreadcrumbItem[]>` and `puedeVolver: ComputedRef<boolean>`. | SRP — composable owns navigation logic; AppBar is presentational. |

#### Scenario: Breadcrumb renders route meta (REQ-UX-5, REQ-UX-6)
- GIVEN route `/materias-primas/:id` has `meta.breadcrumb: ['Home', 'Materias primas', 'Detalle']`
- WHEN the view renders
- THEN breadcrumb shows: `Home → Materias primas → Detalle`
- AND `Home` is a clickable link to `/`
- AND `Detalle` is disabled (no link, current page)

#### Scenario: Routes register breadcrumb meta (REQ-UX-7)
- GIVEN `src/router/routes.ts`
- WHEN inspecting each route definition
- THEN `/` has `meta.breadcrumb: ['Home']`
- AND `/materias-primas` has `['Home', 'Materias primas']`
- AND `/recetas/:id` has `['Home', 'Recetas', 'Detalle']`
- AND `/eventos/:id` has `['Home', 'Eventos', 'Detalle']`
- AND `/pos` has `['Home', 'Caja']`

#### Scenario: useNavegacion returns breadcrumb and guard (REQ-UX-8)
- GIVEN `useNavegacion()` is called in a component
- WHEN `route.meta.breadcrumb = ['Home', 'Eventos']`
- THEN `breadcrumbs.value` is `[{label:'Home', to:'/', disabled:false}, {label:'Eventos', to:null, disabled:true}]`
- AND `puedeVolver.value` is `true`

---

### 3. Home Counters

| ID | Requirement (SHALL) | Rationale |
|----|--------------------|-----------|
| REQ-UX-9 | `useResumen()` returns `contadores: { materiasPrimas, recetas, eventosTotal, eventosEnCurso, eventosCerrados, productos, ventasHoy }`. | Aggregates existing stores — zero new state. |
| REQ-UX-10 | Counters load from existing stores: ingredients, recipes, events, productos, ventas. | Reuses `storeToRefs` pattern; no duplicate fetches. |
| REQ-UX-11 | `ContadoresHome` displays counters as clickable cards linking to each route. | User complaint: home "no me da opciones para dirigirme." |
| REQ-UX-12 | Loading state: skeleton placeholders while stores are fetching (`cargado === false`). | Prevents flash-of-empty in first-run experience. |

#### Scenario: Counters read from stores (REQ-UX-9, REQ-UX-10)
- GIVEN stores have: 5 materiasPrimas, 3 recetas, 2 eventos (1 en_curso, 1 cerrado), 4 productos, 0 ventas
- WHEN `useResumen().contadores` is read
- THEN `materiasPrimas=5`, `recetas=3`, `eventosTotal=2`, `eventosEnCurso=1`, `eventosCerrados=1`, `productos=4`, `ventasHoy=0`

#### Scenario: Counter cards link to routes (REQ-UX-11)
- GIVEN `ContadoresHome` renders with contadores
- WHEN the user clicks the "Materias primas" counter card
- THEN navigation goes to `/materias-primas`
- AND each card links to its domain route

#### Scenario: Skeleton during loading (REQ-UX-12)
- GIVEN `cargado` is `false` (stores still fetching)
- WHEN `ContadoresHome` renders
- THEN skeleton placeholders are displayed
- AND counter values are NOT shown until `cargado` becomes `true`

---

### 4. Business State Banner

| ID | Requirement (SHALL) | Rationale |
|----|--------------------|-----------|
| REQ-UX-13 | `BannerEventoActivo` shows when `ventasStore.eventoEnCurso !== null`. | Reuses existing `computed` — zero new queries. |
| REQ-UX-14 | Banner displays evento name, fecha, and "IR A CAJA →" CTA linking to `/pos`. | Directs user to active POS session. |
| REQ-UX-15 | Banner dismissed reactively when evento transitions to `cerrado`. | `eventoEnCurso` becomes `null` → banner hides automatically. |
| REQ-UX-16 | When no evento `en_curso`, banner is hidden. | Clean home when no active business state. |

#### Scenario: Banner visible during active evento (REQ-UX-13, REQ-UX-14)
- GIVEN `ventasStore.eventoEnCurso` returns `{ nombre:'Feria del Sol', fecha:'2026-07-15' }`
- WHEN HomeView renders
- THEN a banner displays "Feria del Sol · 15 jul 2026"
- AND an "IR A CAJA →" button links to `/pos`

#### Scenario: Banner hidden when no active evento (REQ-UX-15, REQ-UX-16)
- GIVEN `ventasStore.eventoEnCurso` is `null`
- WHEN HomeView renders
- THEN `BannerEventoActivo` is not in the DOM
- AND when an evento transitions to `cerrado`, the banner disappears reactively

---

### 5. Next-Step CTA

| ID | Requirement (SHALL) | Rationale |
|----|--------------------|-----------|
| REQ-UX-17 | Pure function `obtenerSiguientePaso(contadores): PasoRecomendado\|null` with locked hierarchy: 1) materiasPrimas===0→`/materias-primas`, 2) recetas===0→`/recetas`, 3) eventosTotal===0→`/eventos`, 4) eventosEnCurso===0 AND eventosTotal>0→`/eventos` (warning), 5) ventasHoy===0→`/pos` (success), 6) null. | Sequential mental model; trivially unit-testable. |
| REQ-UX-18 | `SiguientePasoCta` renders the recommended step with color-coded variant. | Progressive Disclosure — guides user to next logical action. |
| REQ-UX-19 | When `obtenerSiguientePaso()` returns null, component renders nothing. | CTA is noise when user is "in motion" (all counters non-zero). |

#### Scenario: CTA branches per counter state (REQ-UX-17)
- GIVEN `materiasPrimas=0`
- WHEN `obtenerSiguientePaso(contadores)` is called
- THEN returns `{ textoBoton:'CREAR MATERIA PRIMA', ruta:'/materias-primas', colorBoton:'primary' }`
- GIVEN `recetas=0, materiasPrimas=5`
- THEN returns `{ textoBoton:'CREAR RECETA', ruta:'/recetas' }`
- GIVEN `eventosTotal=0, materiasPrimas=5, recetas=3`
- THEN returns `{ textoBoton:'PLANIFICAR EVENTO', ruta:'/eventos' }`
- GIVEN `eventosEnCurso=0, eventosTotal=3`
- THEN returns `{ textoBoton:'IR A EVENTOS', ruta:'/eventos', colorBoton:'warning' }`
- GIVEN `ventasHoy=0, eventosEnCurso=1`
- THEN returns `{ textoBoton:'IR A CAJA', ruta:'/pos', colorBoton:'success' }`

#### Scenario: CTA hidden when all set (REQ-UX-19)
- GIVEN all counters are non-zero (materiasPrimas>0, recetas>0, eventosEnCurso>0, ventasHoy>0)
- WHEN `obtenerSiguientePaso(contadores)` is called
- THEN returns `null`
- AND `SiguientePasoCta` renders nothing (empty template)

---

### 6. FAB (Floating Action Button)

| ID | Requirement (SHALL) | Rationale |
|----|--------------------|-----------|
| REQ-UX-20 | `<FabNuevo>` component with `to`, `color`, `ariaLabel`, `testid` props and `@click` emit. | Per-view FAB; matches existing dialog-owner pattern. |
| REQ-UX-21 | `MateriasPrimasView` FAB: `testid="materia-prima-fab-nuevo"`, opens create dialog. | Replaces inline `+ Nueva materia prima` button. |
| REQ-UX-22 | `RecetasView` FAB: `testid="receta-fab-nuevo"`, opens create dialog. | Same pattern. |
| REQ-UX-23 | `EventosView` FAB: `testid="evento-fab-nuevo"`, opens create dialog. | Same pattern. |
| REQ-UX-24 | EventosView FAB only visible when `eventos.length < 5` OR `!cargando`; otherwise use inline button. | Avoids clutter on busy screens. |

#### Scenario: FAB opens creation dialog (REQ-UX-20, REQ-UX-21)
- GIVEN `MateriasPrimasView` renders with `<FabNuevo testid="materia-prima-fab-nuevo">`
- WHEN the user clicks the FAB
- THEN the `@click` handler opens the create-ingredient dialog
- AND the dialog state (`dialogo`) remains owned by the view

#### Scenario: FAB visibility rule (REQ-UX-24)
- GIVEN `eventos.length >= 5` AND `cargando` is false
- WHEN `EventosView` renders
- THEN `<FabNuevo>` is NOT rendered
- AND the inline `+ Nuevo evento` button is used instead
- GIVEN `eventos.length < 5`
- THEN `<FabNuevo>` IS rendered

---

### 7. Cross-cutting

| ID | Requirement (MUST) | Rationale |
|----|--------------------|-----------|
| REQ-UX-25 | Spanish UI throughout: all labels, CTAs, breadcrumb text, error messages. | Target user is Spanish-speaking fair vendor. |
| REQ-UX-26 | Strict TDD: every `.ts` gets spec FIRST; ≥25 new tests; `pnpm test` exits 0. | Project invariant from `config.yaml` `strict_tdd: true`. |
| REQ-UX-27 | Real browser verification: `scripts/verify-ux.mjs` with Puppeteer confirms back button, breadcrumb, FAB navigation, banner show/hide. | | 

#### Scenario: All UI text in Spanish (REQ-UX-25)
- GIVEN any view in the app
- WHEN inspecting rendered text
- THEN all visible strings are Spanish (e.g., "Materias primas", "CREAR RECETA", "IR A CAJA")
- AND no English UI labels exist

#### Scenario: pnpm test passes (REQ-UX-26)
- GIVEN all spec files are committed alongside their source files (TDD order)
- WHEN `pnpm test` runs in CI
- THEN exit code is 0 with ≥25 new tests passing
- AND zero failing or skipped tests

#### Scenario: Browser verification script (REQ-UX-27)
- GIVEN the app is running on `http://localhost:5173`
- WHEN `node scripts/verify-ux.mjs` executes
- THEN it confirms: back button hidden on `/`, visible on `/materias-primas`
- THEN breadcrumb renders correctly on each route
- THEN FAB on `/eventos` navigates to create dialog
- THEN banner shows when evento `en_curso`, hides when null

---

### 8. Remove Local Volver Buttons

| ID | Requirement (MUST) | Rationale |
|----|--------------------|-----------|
| REQ-UX-28 | `EventoDetalleView`: remove the local "Volver" `<v-btn>`. | Global AppBar back button replaces it; enforces single mental model. |
| REQ-UX-29 | `RecetaDetalleView`: remove the local "Volver" `<v-btn>`. | Same consolidation. |

#### Scenario: Volver buttons removed (REQ-UX-28, REQ-UX-29)
- GIVEN `EventoDetalleView` renders
- WHEN inspecting the DOM
- THEN no element with `data-testid="evento-detalle-volver"` exists
- AND the global AppBar back button is visible and functional
- GIVEN `RecetaDetalleView` renders
- THEN no element with `data-testid="receta-detalle-volver"` exists

---

## Key Learnings

- All 29 requirements are ADDITIVE — zero existing foundation/catalog/events/POS requirements are modified or removed. The local Volver button removal is a UI cleanup, not a spec modification.
- The `useResumen()` composable is the single aggregation point for 6 existing stores. Its `Promise.allSettled` design ensures one store's failure doesn't blank the entire home.
- `obtenerSiguientePaso` is a pure function (no Vue/Pinia/async) — trivially unit-testable with 6 branches + null.
- `route.meta.breadcrumb` is the single source of truth for navigation context. Views never wire breadcrumb logic.
- The 3-chained-PR delivery (bar→home→FAB) is reflected in the spec's grouped sections but requirements are PR-agnostic.
- `ventasStore.eventoEnCurso` is reused verbatim — zero new queries or state for the business-state banner.
- FAB visibility rule on EventosView (count<5) prevents clutter while keeping the primary action accessible for new users.
