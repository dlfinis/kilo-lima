# Home Context — Specification

> **Source**: `ux-improvements` delta (REQ-UX-9 through REQ-UX-19, REQ-UX-25 through REQ-UX-27)
> **Type**: Additive — zero foundation/catalog/events/POS requirements modified

---

## Purpose

The home context delivers a rich landing experience: counter cards aggregated from 6 existing stores (`useResumen()`), a business-state banner (`BannerEventoActivo`) that reactively shows/hides based on `ventasStore.eventoEnCurso`, and a next-step CTA (`SiguientePasoCta`) that guides the user through a locked 6-branch decision hierarchy (`obtenerSiguientePaso`). All UI text is in Spanish; strict TDD applies.

---

## ADDED Requirements

### 1. Home Counters

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

### 2. Business State Banner

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

### 3. Next-Step CTA

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

### 4. Cross-cutting

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

## Key Learnings

- The `useResumen()` composable is the single aggregation point for 6 existing stores. Its `Promise.allSettled` design ensures one store's failure doesn't blank the entire home.
- `obtenerSiguientePaso` is a pure function (no Vue/Pinia/async) — trivially unit-testable with 6 branches + null.
- `ventasStore.eventoEnCurso` is reused verbatim — zero new queries or state for the business-state banner.
