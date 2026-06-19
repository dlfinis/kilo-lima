# Design: ux-improvements

> **Change**: `ux-improvements` | **Phase**: `sdd-design`
> **Proposal**: `openspec/changes/ux-improvements/proposal.md` (10 locked decisions)
> **Spec**: `openspec/changes/ux-improvements/spec.md` (29 REQ-IDs, 20 scenarios)
> **Source**: exploration §3 + foundation design patterns
> **Artifact store**: both (filesystem + Engram)
> **Delivery**: 3 chained PRs, stacked-to-main (PR1 nav → PR2 home → PR3 FABs)

---

## 1. Architecture Overview

Pure UX additive change. Global `<v-app-bar>` mounts once in `App.vue` above `<router-view>`. Two composables (`useNavegacion`, `useResumen`) follow the existing `storeToRefs` wrapper pattern from `useEvents`. One pure utility (`obtenerSiguientePaso` in `src/utils/`) is trivially testable with plain objects. Six new presentational components in `src/components/business/`. Three list views swap inline `+ Nuevo X` buttons for `<FabNuevo>`. Two detail views remove local "Volver" buttons. Zero new dependencies, zero schema changes, zero store mutations.

    App.vue
    ├─ <v-app>
    │   ├─ <AppBar>          ← reads route.meta.breadcrumb + appStore.appName
    │   │   ├─ <v-btn back>  ← useNavegacion().puedeVolver
    │   │   ├─ <HomeIcon>    ← always visible, links /
    │   │   ├─ <BreadcrumbNav> ← useNavegacion().breadcrumbs
    │   │   └─ <v-app-bar-title>
    │   └─ <router-view>
    │       ├─ HomeView       ← ContadoresHome + BannerEventoActivo + SiguientePasoCta
    │       ├─ EventosView    ← FabNuevo replaces inline button
    │       ├─ MateriasPrimasView ← FabNuevo
    │       ├─ RecetasView    ← FabNuevo
    │       ├─ EventoDetalleView ← "Volver" removed
    │       └─ RecetaDetalleView ← "Volver" removed

---

## 2. Architecture Decisions

| # | Decision | Option | Tradeoff | Rationale |
|---|----------|--------|----------|-----------|
| 1 | AppBar global in App.vue | Global vs per-view header | Single point of failure vs duplication | Brief §2.2 specifies global top bar; solves "no hay forma de retroceder" |
| 2 | Breadcrumb from route.meta | Data-driven meta vs per-view wiring | Dynamic labels need resolver (v2) vs flexible | Single source of truth; views never wire breadcrumb logic |
| 3 | `useNavegacion()` composable | Composable vs AppBar internal | Testable in isolation vs simpler | SRP — AppBar is presentational; guard logic unit-testable without mount |
| 4 | `useResumen()` aggregates 6 stores | New composable vs per-store selectors in HomeView | One new file vs duplicated wiring | Follows `useEvents()` pattern; `Promise.allSettled` isolates failures |
| 5 | `obtenerSiguientePaso` pure function | `src/utils/` vs inline computed | No Vue/Pinia mocks needed vs coupled | 6 branches testable with plain objects; no async, no mocks |
| 6 | Per-view FabNuevo | Per-view FAB vs global FAB via route | Slightly more code vs global event bus | Matches existing dialog-owner pattern; dialog state stays in view |
| 7 | FAB replaces inline button | Swap vs add-both | Regression risk for keyboard users vs more affordances | Material guideline: primary action = FAB; inline button is clutter on mobile |

---

## 3. Data Flow

```
HomeView.onMounted()
  → useResumen().cargar()
    → Promise.allSettled([ ingredients.cargarTodas(), recipes.cargarTodas(),
                           events.cargarTodas(), productos.cargarTodas() ])
      → each store sets its own reactive arrays
  → contadores (computed) aggregates lengths + estado filters
      → ContadoresHome receives :contadores prop
      → obtenerSiguientePaso(contadores) → SiguientePasoCta

BannerEventoActivo
  → useVentasStore().eventoEnCurso (REQ-POS-51 computed, zero new queries)
  → v-if="eventoEnCurso !== null" → renders name + fecha + "IR A CAJA →" button

AppBar
  → useNavegacion() reads route.meta.breadcrumb + router.options.history.state
  → breadcrumbs computed → BreadcrumbNav :items
  → puedeVolver computed → v-if on back button
```

---

## 4. File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/business/AppBar.vue` | Create | Global `<v-app-bar app>`: back button + HomeIcon + BreadcrumbNav + title |
| `src/components/business/BreadcrumbNav.vue` | Create | `<v-breadcrumbs>` driven by `:items` prop |
| `src/components/business/ContadoresHome.vue` | Create | 5 counter chips (materias primas, recetas, eventos planificados/en_curso, productos) with skeleton state |
| `src/components/business/BannerEventoActivo.vue` | Create | `<v-alert color="warning">` when `eventoEnCurso !== null`; hidden otherwise |
| `src/components/business/SiguientePasoCta.vue` | Create | `<v-card>` with text + color-coded button; renders nothing when `obtenerSiguientePaso` returns null |
| `src/components/business/FabNuevo.vue` | Create | Thin `<v-fab>` wrapper: props `icon`, `color`, `ariaLabel`, `testid` + `@click` emit |
| `src/composables/useNavegacion.ts` | Create | `puedeVolver`, `irAtras()`, `breadcrumbs` — reads `route.meta.breadcrumb` + `router.options.history` |
| `src/composables/useResumen.ts` | Create | `contadores` (computed over 6 stores) + `cargar()` (Promise.allSettled over 4 stores) |
| `src/utils/siguientePaso.ts` | Create | Pure `obtenerSiguientePaso(c: Contadores): PasoRecomendado \| null` — 6 branches |
| `src/utils/breadcrumb.ts` | Create | Pure formatters: `formatearEtiquetaBreadcrumb` + `resolverBreadcrumbDeMeta` |
| `src/App.vue` | Modify | Mount `<AppBar>` above `<router-view>`; remove inline `<h1>` + `<div id="app-root">` |
| `src/router/routes.ts` | Modify | Add `meta: { breadcrumb: [...] }` to all 11 routes |
| `src/views/HomeView.vue` | Modify | Replace static cards with ContadoresHome + BannerEventoActivo + SiguientePasoCta; keep 3 phase cards as secondary section |
| `src/views/EventosView.vue` | Modify | Inline `+ Nuevo evento` → `<FabNuevo @click="abrirCrear">` |
| `src/views/MateriasPrimasView.vue` | Modify | Same swap: `+ Nueva materia prima` → `<FabNuevo>` |
| `src/views/RecetasView.vue` | Modify | Same swap: `+ Nueva receta` → `<FabNuevo>` |
| `src/views/EventoDetalleView.vue` | Modify | Remove local "Volver" `<v-btn>` (lines 113-116) |
| `src/views/RecetaDetalleView.vue` | Modify | Remove local "Volver" `<v-btn>` (lines 75-84) |
| `*.spec.ts` (14 new + 8 modified) | Create/Modify | TDD: specs land before implementation |

**Counts**: 10 new source + 10 new spec + 8 modified = 28 files touched. ~520 prod lines + ~800 test lines.

---

## 5. Interfaces / Contracts

```ts
// useNavegacion.ts
interface BreadcrumbItem { title: string; to?: string }
function useNavegacion(): {
  breadcrumbs: ComputedRef<BreadcrumbItem[]>
  puedeVolver: ComputedRef<boolean>
  irAtras: () => void
}

// useResumen.ts
interface Contadores {
  materiasPrimas: number; recetas: number
  eventosPlanificacion: number; eventosEnCurso: number; eventosCerrados: number
  productos: number; ventasHoy: number; cierresCaja: number
  cargado: boolean
}
function useResumen(): { contadores: ComputedRef<Contadores>; cargar: () => Promise<void> }

// siguientePaso.ts
interface PasoRecomendado { texto: string; ruta: string; textoBoton: string; colorBoton: 'primary'|'warning'|'success'; testid: string }
function obtenerSiguientePaso(c: Contadores): PasoRecomendado | null

// FabNuevo.vue props
// { to: string; icon?: string; color?: string; ariaLabel: string }
// emits: ['click']

// route.meta.breadcrumb shape
// Array<{ title: string; to?: string }> — last item is current page (no link)
```

**Non-obvious pattern** — `useNavegacion().puedeVolver` guard:

```ts
const puedeVolver = computed(() => {
  const stack = router.options.history.state?.back ?? null
  if (!stack) return false
  return (route.meta.breadcrumb?.length ?? 0) > 1
})
```

Two conditions: history stack exists AND breadcrumb depth > 1. Prevents orphaned back button on direct deep-links.

---

## 6. Testing Strategy

| Layer | Count | Approach |
|-------|-------|----------|
| Pure utils | 14 | `obtenerSiguientePaso` (8 cases: 6 branches + null + edge), `breadcrumb` (4: format + resolve + root + missing) |
| Composables | 13 | `useNavegacion` (5: puedeVolver on /, deep, irAtras calls router.back, breadcrumb from meta, no-meta fallback), `useResumen` (8: empty stores, populated, allSettled isolation, cargado flip, evento filtering, errores array) |
| Components | 19 | AppBar (4), BreadcrumbNav (3), ContadoresHome (3), BannerEventoActivo (3), SiguientePasoCta (3), FabNuevo (3) — all mount with local Vuetify instance per `EventoStatusChip.spec.ts` pattern |
| Modified specs | 8 | App.spec.ts, routes.spec.ts, HomeView.spec.ts, 3 list view specs (swap testids), 2 detail view specs (remove volver assertions) |

**Total**: ~54 new/modified tests. All follow existing `mount(Component, { global: { plugins: [vuetify] } })` pattern. Chainable Supabase mock from `tests/setup.ts` reused — no setup changes.

---

## 7. File → Requirement Traceability

| PR | REQ-IDs | Files |
|----|---------|-------|
| PR1 (nav) | UX-1..8, UX-25..29 | AppBar.vue, BreadcrumbNav.vue, useNavegacion.ts, breadcrumb.ts, App.vue, routes.ts, EventoDetalleView.vue, RecetaDetalleView.vue, App.spec.ts, routes.spec.ts, + specs |
| PR2 (home) | UX-9..19, UX-25..27 | useResumen.ts, siguientePaso.ts, ContadoresHome.vue, BannerEventoActivo.vue, SiguientePasoCta.vue, HomeView.vue, + specs |
| PR3 (FABs) | UX-20..24, UX-26..27 | FabNuevo.vue, EventosView.vue, MateriasPrimasView.vue, RecetasView.vue, + specs |

---

## 8. Real Browser Verification

`scripts/verify-ux.mjs` (Puppeteer, not Playwright — the project has no E2E framework):

1. Navigate `/` → assert AppBar present, breadcrumb = "Inicio", back button absent
2. Click "Materias Primas" → URL `/materias-primas` → back button visible, breadcrumb = "Inicio / Materias Primas"
3. Click back button → URL returns to `/`
4. Navigate `/materias-primas` → assert FAB visible with `data-testid="materia-prima-fab-nuevo"`
5. Click FAB → creation dialog opens
6. Assert 5 counter chips on home with real numbers

---

## 9. Rollback

No schema, no migrations, no package.json changes. Revert the 3 PRs in reverse order (PR3→PR2→PR1). Each PR reverts independently — PR2 home components do not depend on PR3 FABs at runtime. Local "Volver" buttons return when PR1 is reverted.

---

## Open Questions

None — all 10 architecture decisions are locked from exploration §3. The 29 REQ-IDs map cleanly to 3 autonomous PRs. No unresolved technical dependency blocks `sdd-tasks`.
