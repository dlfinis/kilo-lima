# App Shell — Specification

> **Source**: `ux-improvements` delta (REQ-UX-1 through REQ-UX-8)
> **Type**: Additive — zero foundation/catalog/events/POS requirements modified

---

## Purpose

The app shell delivers a persistent navigation layer: a global `<v-app-bar>` with a back button, home icon, app-name title, and `route.meta.breadcrumb`-driven breadcrumb navigation. Every route registers breadcrumb metadata and the `useNavegacion()` composable exposes `breadcrumbs` and `puedeVolver` to the view layer. This replaces all local "Volver" buttons with a single navigation source of truth.

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

## Key Learnings

- All 8 requirements are ADDITIVE — zero existing spec requirements modified.
- `route.meta.breadcrumb` is the single source of truth for navigation context. Views never wire breadcrumb logic.
- `useNavegacion()` is the single composable that owns navigation logic; AppBar is purely presentational.
