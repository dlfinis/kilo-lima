# Tasks: ux-improvements — Navigation Shell + Home Context + FAB Pass

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520 prod + ~800 test (across 3 PRs) |
| 400-line budget risk | Low (per-PR: ~200/250/70 prod) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 Nav → PR2 Home → PR3 FABs (stacked-to-main) |
| Delivery strategy | ask-always (auto-pilot override: 3 chained PRs) |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Navigation infrastructure (AppBar + breadcrumb + composable + Volver removals) | PR 1 | base = main; ~200 prod, REQ-UX-1..8, UX-25..29 |
| 2 | Home context (counters + banner + CTA) | PR 2 | base = main; ~250 prod, REQ-UX-9..19, UX-25..27 |
| 3 | Per-view FAB swap (3 list views) | PR 3 | base = main; ~70 prod, REQ-UX-20..24, UX-26..27 |

---

## PR1 — Navigation Infrastructure (REQ-UX-1..8, UX-25..29)

TDD order: pure util → composable → component → AppBar mount → route meta → Volver removals.

- [x] **1.1** `src/utils/breadcrumb.ts` — pure `formatearEtiquetaBreadcrumb` + `resolverBreadcrumbDeMeta` w/ `src/utils/breadcrumb.spec.ts` (4 tests: kebab→Title, root, nested, missing meta)
- [x] **1.2** `src/composables/useNavegacion.ts` — `puedeVolver`, `irAtras`, `breadcrumbs` w/ `src/composables/useNavegacion.spec.ts` (5 tests: home hides back, nested shows, `router.back` call, breadcrumb from meta, no-meta fallback)
- [x] **1.3** `src/components/business/BreadcrumbNav.vue` — `<v-breadcrumbs>` driven by `:items` prop w/ `BreadcrumbNav.spec.ts` (3 tests: renders items, last disabled, first links `/`)
- [x] **1.4** `src/components/business/AppBar.vue` — global `<v-app-bar app>` w/ back button + HomeIcon + BreadcrumbNav + `appStore.appName` title w/ `AppBar.spec.ts` (4 tests: title renders, back hidden on root, back visible nested, breadcrumb renders)
- [x] **1.5** `src/App.vue` — mount `<AppBar>` above `<router-view>`; update `App.spec.ts`
- [x] **1.6** `src/router/routes.ts` — add `meta: { breadcrumb: [...] }` to all 11 routes (per proposal §7 table); update `routes.spec.ts`
- [x] **1.7** `src/views/EventoDetalleView.vue` — remove local "Volver" `<v-btn>` (`testid="evento-detalle-volver"`); update spec
- [x] **1.8** `src/views/RecetaDetalleView.vue` — remove local "Volver" `<v-btn>` (`testid="receta-detalle-volver"`); update spec

---

## PR2 — Home Context (REQ-UX-9..19, UX-25..27)

TDD order: pure util → composable → 3 components → HomeView mod.

- [ ] **2.1** `src/utils/siguientePaso.ts` — pure `obtenerSiguientePaso(c: Contadores): PasoRecomendado|null` w/ spec (8 tests: 6 branches + null + edge: empty counters, all flowing)
- [ ] **2.2** `src/composables/useResumen.ts` — `contadores` computed over 6 stores + `cargar()` via `Promise.allSettled` w/ spec (8 tests: empty stores, populated, allSettled isolation, cargado flip, evento filtering by estado, ventas lazy)
- [ ] **2.3** `src/components/business/ContadoresHome.vue` — 5 counter chips (materias primas, recetas, eventos planificados/en_curso, productos) w/ skeleton while `!cargado` w/ spec (3 tests: chips render, skeleton, each links to route)
- [ ] **2.4** `src/components/business/BannerEventoActivo.vue` — `<v-alert>` using `ventasStore.eventoEnCurso`, conditional render w/ spec (3 tests: hidden when null, shows name+fecha+CTA, CTA navigates `/pos`)
- [ ] **2.5** `src/components/business/SiguientePasoCta.vue` — `<v-card>` w/ color-coded button from `obtenerSiguientePaso` result, renders nothing on null w/ spec (3 tests: renders right CTA per counter state, renders nothing when null, button navigates)
- [ ] **2.6** `src/views/HomeView.vue` — rewrite: mount ContadoresHome + BannerEventoActivo + SiguientePasoCta above existing phase cards; update `HomeView.spec.ts`

---

## PR3 — Per-View FABs (REQ-UX-20..24, UX-26..27)

TDD order: component first, then per-view swap.

- [ ] **3.1** `src/components/business/FabNuevo.vue` — thin `<v-fab>` wrapper: props `icon`, `color`, `ariaLabel`, `testid` + `@click` emit w/ spec (3 tests: renders with props, emits click, `app` positioning)
- [ ] **3.2** `src/views/MateriasPrimasView.vue` — swap inline `+ Nueva materia prima` button → `<FabNuevo testid="materia-prima-fab-nuevo">`; update spec
- [ ] **3.3** `src/views/RecetasView.vue` — swap inline `+ Nueva receta` button → `<FabNuevo testid="receta-fab-nuevo">`; update spec
- [ ] **3.4** `src/views/EventosView.vue` — swap inline `+ Nuevo evento` button → `<FabNuevo testid="evento-fab-nuevo">` w/ visibility rule (`eventos.length < 5 || !cargando`); update spec

---

## Cross-cutting

- [ ] **C.1** `pnpm test` green, `pnpm build` succeeds, `pnpm lint` clean, `pnpm typecheck` clean after each PR
- [ ] **C.2** Verify zero new `package.json` entries per PR (`git diff main -- package.json`)
