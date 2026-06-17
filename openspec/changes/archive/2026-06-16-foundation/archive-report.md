# Archive Report: Foundation

> **Change**: `foundation`
> **Archived**: 2026-06-16
> **Phase**: `sdd-archive` (final step of the SDD cycle)
> **Artifact store mode**: `hybrid` (both)
> **Preflight**: `artifact_store.mode = both`
> **strict_tdd**: ENABLED (flipped after PR4 verify)

---

## 1. Change Metadata

| Field | Value |
|-------|-------|
| **Change name** | `foundation` |
| **Started** | 2026-06-16 13:55 (first planning commit `13d48f9`) |
| **First code commit** | 2026-06-16 14:04 (Task 1.1: `0ae19f3`) |
| **PR1 merged** | 2026-06-16 14:37 (PR #1 `fcfa9ff`) |
| **PR2 merged** | 2026-06-16 15:28 (PR #2 `8c095d2`) |
| **PR3 merged** | 2026-06-16 17:24 (PR #3 `4e4018d`) |
| **PR4 merged** | 2026-06-16 17:47 (PR #4 `4d51950`) |
| **Completed** | 2026-06-16 17:47 (PR4 merge) |
| **Authors** | Single author — `dlfinis` |
| **Repository** | `github.com/dlfinis/kilo-lima` |

### Pull Requests

| PR | Title | URL | Lines (code only) |
|----|-------|-----|-------------------|
| #1 | Bootable Shell | https://github.com/dlfinis/kilo-lima/pull/1 | ~385 |
| #2 | Vuetify + Router + Stores + Utils + Types | https://github.com/dlfinis/kilo-lima/pull/2 | ~255 |
| #3 | Services + Auth Stub | https://github.com/dlfinis/kilo-lima/pull/3 | ~195 |
| #4 | PWA + Offline + Smoke Test | https://github.com/dlfinis/kilo-lima/pull/4 | ~158 |
| **Total** | 4 PRs, stacked-to-main | — | **~1,085** |

---

## 2. What Was Built — Executive Summary

The foundation bootstraps the kilo-lima PWA from a greenfield state (only `brief.md`, `LICENSE`, `.gitignore`). The deliverable is a fully configured Vite 5.4 + Vue 3.5 + TypeScript 5.9 + Vuetify 3.12 + Pinia 3.0 + Vue Router 4.6 + Supabase JS 2.108 + vite-plugin-pwa 1.3 + localforage 1.10 project with ESLint 9 flat config, Prettier 3.8, Vitest 2.1, and Zod 4.4 env validation.

It ships:
1. **One home view** (`HomeView.vue`) with the app title, three-phase subtitle, PWA status card (online/offline detection), and store value display — all in Spanish.
2. **One minimal Pinia store** (`app.store.ts`) as a pattern proof for future domain stores.
3. **Four passing tests** (1 `App.spec.ts` + 3 `HomeView.spec.ts`) proving the full Vue+Vuetify+Pinia+jsdom+test-utils stack works end-to-end.
4. **A configured PWA shell** with auto-update service worker, manifest, placeholder icons, and 10-entry precache.
5. **A stubbed auth composable** (`useAuth()`) that returns reactive refs and throws on all methods — auth is prepared, not functional.
6. **Type contracts** for all deferred slices: `IStorageService` (LSP), `Database` stub (Supabase), `ImportMetaEnv` declarations.
7. **Offline-first architecture** documented in `docs/offline-sync.md` (optimistic UI + localforage WAL + Pinia sync queue + Background Sync API) — NOT implemented, deferred to the `offline-sync` slice.

The foundation intentionally does NOT include: login UI, business modules (ingredients, recipes, events, POS), CI/CD, Docker, dark theme, deferred dependencies (dayjs, chart.js, jsPDF), or real Supabase type generation.

### Architecture Stack

```
Vite 5.4.21 + Vue 3.5.38 + Vuetify 3.12.8 + Pinia 3.0.4
  + Vue Router 4.6.4 + Supabase JS 2.108.2 + vite-plugin-pwa 1.3.0
  + localforage 1.10.0 + Zod 4.4.3 + Vitest 2.1.9 + @vue/test-utils 2.4.11
  + ESLint 9.39.4 + TypeScript-ESLint 8.x + Prettier 3.8.4
```

### Plugin Registration Order (as-built)

```
plugins: vue() → vuetify()    (vite.config.ts — library-enforced by vite-plugin-vuetify@2.1.3)
app.use: Pinia → Vuetify → Router → servicesPlugin → mount   (src/main.ts)
```

---

## 3. Final Artifact Inventory

### Config / Root (15 files)

| Path | Purpose |
|------|---------|
| `.editorconfig` | UTF-8, LF, 2-space indent |
| `.env.example` | Documents VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY |
| `.npmrc` | `trust-policy=allow` for pnpm 10 + Vite 5.4.21+ provenance |
| `.prettierignore` | Ignores dist/, node_modules/, *.lock |
| `.prettierrc.json` | singleQuote, semi:false, printWidth:100 |
| `README.md` | Quickstart with all 9 commands |
| `env.d.ts` | ImportMetaEnv declaration for Supabase vars + vite-plugin-pwa refs |
| `eslint.config.js` | ESLint 9 flat config with vue + typescript-eslint |
| `index.html` | SPA mount point (#app), viewport, theme-color, manifest link |
| `package.json` | Pinned deps + all scripts (dev/build/preview/test/lint/format/typecheck) |
| `tsconfig.app.json` | Strict TS for src/ with path aliases |
| `tsconfig.json` | Solution config referencing app + node configs |
| `tsconfig.node.json` | TS config for Vite/ESLint config files |
| `vite.config.ts` | Vite + vue + vuetify + VitePWA plugins |
| `vitest.config.ts` | jsdom env, setupFiles, extends vite.config |

### Source — Plugins (2 files)

| Path | Purpose |
|------|---------|
| `src/plugins/vuetify.ts` | Vuetify instance with light theme palette (brief §6.4) |
| `src/plugins/services.ts` | provide('supabase') + provide('storageService') |

### Source — Services (4 files)

| Path | Purpose |
|------|---------|
| `src/services/supabase.client.ts` | Typed Supabase singleton via createClient<Database>() |
| `src/services/localforage.client.ts` | localforage instance (name: 'kilo-lima') |
| `src/services/storage.interface.ts` | IStorageService LSP contract (guardar/obtener/eliminar/listarClaves) |
| `src/services/storage.service.ts` | LocalforageStorageService implementing IStorageService |

### Source — Composables (3 files)

| Path | Purpose |
|------|---------|
| `src/composables/useAuth.ts` | Stub: reactive refs + throwing methods (deferred to auth-flow slice) |
| `src/composables/usePwaUpdate.ts` | Wraps virtual:pwa-register/vue (needRefresh, updateServiceWorker) |
| `src/composables/useOnlineStatus.ts` | navigator.onLine + online/offline window events |

### Source — Stores (1 file)

| Path | Purpose |
|------|---------|
| `src/stores/app.store.ts` | Pattern-proof Pinia store (appName ref + setAppName action) |

### Source — Router (2 files)

| Path | Purpose |
|------|---------|
| `src/router/index.ts` | createRouter with createWebHistory |
| `src/router/routes.ts` | Lazy-loaded / → HomeView + catch-all redirect |

### Source — Views (1 file)

| Path | Purpose |
|------|---------|
| `src/views/HomeView.vue` | App title, 3-phase subtitle, PWA status card, store value (24 lines, ≤200) |

### Source — Types (2 files)

| Path | Purpose |
|------|---------|
| `src/types/database.types.ts` | Stub Database interface (empty Tables; regenerated later) |
| `src/types/index.ts` | Barrel export placeholder |

### Source — Utils (2 files)

| Path | Purpose |
|------|---------|
| `src/utils/env.ts` | Zod schema; fail-fast at module import for Supabase vars |
| `src/utils/format.ts` | USD currency formatter (Intl.NumberFormat es-MX) |

### Entry / Shell (3 files)

| Path | Purpose |
|------|---------|
| `src/main.ts` | App bootstrap: createApp → plugins → provide → mount |
| `src/App.vue` | Root component: v-app + v-main + router-view |
| `src/plugins/.gitkeep` | (removed when vuetify.ts was created) |

### Tests (3 files)

| Path | Purpose |
|------|---------|
| `tests/setup.ts` | matchMedia + ResizeObserver + localforage in-memory mock |
| `src/App.spec.ts` | Trivial smoke test: app mounts and renders (PR2) |
| `src/views/HomeView.spec.ts` | 3 tests: h1+subtitle, appName store, online status (PR4) |

### PWA Assets (5 files)

| Path | Purpose |
|------|---------|
| `public/favicon.ico` | Favicon placeholder |
| `public/robots.txt` | Allow all |
| `public/icons/icon-192.png` | PWA icon 192×192 placeholder |
| `public/icons/icon-512.png` | PWA icon 512×512 placeholder |
| `public/icons/maskable-512.png` | PWA maskable icon 512×512 placeholder |

### Empty Directory Scaffolds (2 files)

| Path | Purpose |
|------|---------|
| `src/components/business/.gitkeep` | Empty directory scaffold for future business components |
| `src/components/ui/.gitkeep` | Empty directory scaffold for future UI components |

### Docs (1 file)

| Path | Purpose |
|------|---------|
| `docs/offline-sync.md` | 4-pillar offline-sync architecture documented (NOT implemented) |

### File Count Summary

| Category | Count |
|----------|-------|
| Config / root | 15 |
| Source (src/) | 18 code files + 1 spec + 2 empty dirs = 21 |
| Tests | 3 |
| PWA assets | 5 |
| Docs | 1 |
| **Total (excl. lockfile, openspec)** | **45** |

---

## 4. Spec Compliance — 54/54 REQ-IDs Satisfied

All 54 spec requirements from `openspec/changes/foundation/spec.md` are satisfied.

### Per-PR REQ-ID Distribution

| PR | REQ-IDs | Status |
|----|---------|--------|
| **PR1** (15) | TOOL-1..7, SHELL-1..2, UI-1 (partial), STATE-1 (partial), BE-4..5, PWA-2, CONV-7 | ✅ Satisfied (partials completed later) |
| **PR2** (13) | STATE-1..2, ROUTE-1..3, HOME-1..2, HOME-5, UI-1..2, UI-4, BE-3, TEST-3 | ✅ Satisfied (+ completions of UI-1, STATE-1, SHELL-1) |
| **PR3** (10) | BE-1..2, OFF-1..3, AUTH-1..4, SHELL-1 (completion) | ✅ Satisfied |
| **PR4** (12) | PWA-1..5, HOME-3..4, TEST-4..5, OFF-4, UI-3 (completion) | ✅ Satisfied |
| **Cross-cutting** (4) | SHELL-3, CONV-1..6, TEST-1..2 | ✅ Satisfied |

### Closure of Last 2 Partial REQ-IDs

| REQ-ID | PR2 Status | PR4 Status | Detail |
|--------|-----------|-----------|--------|
| **REQ-UI-3** | ⚠ PARTIAL — `v-container` only | ✅ FULLY SATISFIED — `v-card` + `v-card-title` + `v-card-text` in HomeView | Proves Vuetify tree-shaking works end-to-end via multiple component types |
| **REQ-TOOL-6** | ⚠ PARTIAL — `pnpm test` exited 1 (0 tests) | ✅ FULLY SATISFIED — `pnpm test` exits 0 with 4 tests | Vitest runner + smoke test infrastructure validated |

### Final Verification (post-PR4, confirmed by sdd-verify)

- `pnpm test` exits 0 with 4 passing tests ✅
- All 54 spec requirements satisfied ✅
- No forbidden dependencies/patterns (Vuex, Options API, axios, jQuery, moment, process.env, bootstrap) ✅
- All `.vue` files ≤ 200 lines ✅ (max: HomeView.vue at 24 lines)
- All functions ≤ 30 lines ✅
- All UI strings in Spanish ✅
- Spanish business identifiers, English infrastructure filenames ✅
- No `dark` theme block in `src/plugins/vuetify.ts` ✅
- `useAuth()` NOT imported or called in HomeView ✅
- `vite-plugin-vuetify` registered BEFORE `@vitejs/plugin-vue` (library-enforced) ✅
- SOLID principles verified: SRP, OCP, LSP, ISP, DIP ✅

---

## 5. Deviations from Plan (Aggregate Across All 4 PRs)

| # | Deviation | Category | Impact | Resolution |
|---|-----------|----------|--------|------------|
| 1 | **F2 split**: Task 1.7 split into 1.7a + PR2 Task 2.7 | Structural | Positive — kept PR1 under 400-line budget | Vuetify moved from PR1→PR2; PR1 dropped ~430→~385 lines |
| 2 | **Plugin order**: spec/design said vuetify→vue; library enforces vue→vuetify | Correction | Neutral — code was correct, docs were wrong | Corrected in PR2 chore (`d21eef4`) |
| 3 | **Node version**: spec said 20+; package.json says 22+ | Correction | Positive — matches reality | Corrected in PR2 chore (`d21eef4`) |
| 4 | **Task order swap**: PR2 HomeView (2.9) before wire-router (2.8) | Execution | Positive — dependency-correct | Apply followed actual deps (router lazy-imports HomeView) |
| 5 | **Task 4.6 no-op**: `docs/offline-sync.md` already existed | Execution | Neutral — file already on main from planning commit | Skipped commit; noted in tasks.md |
| 6 | **Extra devDeps**: `@types/node`, `@vue/eslint-config-typescript` | Execution | Positive — required for tsconfig.node.json + ESLint 9 flat config | Added in PR1 |
| 7 | **Type fixup**: localforage `ReturnType` idiom (831fc32) | Correction | Positive — localforage doesn't export `LocalForage` interface | Fixed in PR3 |
| 8 | **Type fixup**: usePwaUpdate `Ref` type-only import | Execution | Positive — caught by TS6133 | Fixed in PR4 |
| 9 | **Positive deviations**: useOnlineStatus cleanup (onMounted/onUnmounted), HomeView test split into 3 it() blocks | Execution | Positive — cheaper insurance than deferred cleanup, better test granularity | Applied in PR4 |

---

## 6. Key Decisions Made During Delivery

| # | Decision | Detail | Source |
|---|----------|--------|--------|
| 1 | **pnpm 10 trust-policy** (.npmrc committed) | pnpm 10 default trust-policy=no-downgrade blocks Vite 5.4.21 (first 5.4.x with npm provenance). Solution: commit `.npmrc` with `trust-policy=allow`. User chose G2 over G1 (global) or G3 (downgrade Vite). | PR1, commit `a60fd60` |
| 2 | **ZodError instead of Error** in env.ts | Spec REQ-BE-3 scenario says "a `ZodError` is thrown" but PR2 initially used `safeParse` + manual throw. PR3 J1 chore (`7734330`) switched to `new z.ZodError(...)` for exact spec compliance. | PR3, commit `7734330` |
| 3 | **@vue/eslint-config-typescript** for ESLint 9 flat config | Collapses 4 packages + ~50 lines of manual flat config into a single 5-line declarative config. The modern Vue 3 ESLint 9 pattern. | PR1 |
| 4 | **Plugin order** vue()→vuetify() | `vite-plugin-vuetify@2.1.3` has a HARD runtime check enforcing this. All docs corrected to match library reality. | PR2 chore `d21eef4` |
| 5 | **3 coordinated env tweaks** for Vuetify+jsdom tests | `server.deps.inline: ['vuetify']`, ResizeObserver stub, local Vuetify in spec — none alone suffices. | PR2 fixup `0795819` |
| 6 | **Stacked-to-main** chain strategy | User prioritized agility over rollback control; each PR merges directly to main. | Preflight E1a decision |
| 7 | **Service singletons via provide/inject** | DIP via `app.provide('supabase', ...)` and `app.provide('storageService', ...)` instead of direct imports in consumers. | Design §3 |

---

## 7. Delivery Metrics

| Metric | Value |
|--------|-------|
| Total PRs | 4 (stacked-to-main) |
| Total code lines (excl. lockfile) | ~1,085 (PR1: ~385, PR2: ~255, PR3: ~195, PR4: ~158) |
| Total source files | ~45 (excluding lockfile, openspec artifacts) |
| Tests | 4 (1 App.spec.ts + 3 HomeView.spec.ts) |
| Spec REQ-IDs satisfied | 54/54 (0 partials) |
| Per-PR verification gates | 6 gates × 4 PRs = 24 passes |
| Per-PR adversarial review gates | 4 verify reports |
| Per-PR merge commits | PR1: 7+1, PR2: 11, PR3: 9, PR4: 6 |
| Total commits (code) | ~35 commits |
| Total commits (planning + archive) | 2 (13d48f9 + this archive) |
| strict_tdd | ENABLED (flipped after PR4 verify) |
| Bundle size (production) | 459 KB JS raw / 140 KB gzip + 254 KB CSS / 30 KB gzip |
| PWA precache entries | 10 (746 KiB) |
| Service worker strategy | generateSW (autoUpdate) |

---

## 8. Engram Observations Created

| Topic Key | Type | Description |
|-----------|------|-------------|
| `sdd/foundation/explore` | architecture | Stack validation, integration patterns, file structure, gaps from brief |
| `sdd/foundation/proposal` | architecture | Change proposal with scope, stack, risks, future work |
| `sdd/foundation/spec` | architecture | 54 REQ-IDs with Given/When/Then scenarios |
| `sdd/foundation/design` | architecture | Architecture, plugin order, patterns, file→REQ traceability |
| `sdd/foundation/tasks` | architecture | 4-PR task breakdown with F2 split |
| `sdd/foundation/delivery` | decision | Chained PRs stacked-to-main strategy |
| `sdd/foundation/f2-split` | decision | Preemptive Task 1.7 split to keep PR1 under 400 lines |
| `sdd/foundation/npmrc-trust-policy` | decision | .npmrc trust-policy=allow for pnpm 10 + Vite 5.4.21 |
| `sdd/foundation/pr1-github` | decision | PR #1 opened on GitHub |
| `sdd/foundation/apply-progress` | architecture | PR1+PR2+PR3+PR4 apply progress (evolution across 5 revisions) |
| `sdd/foundation/verify-report-pr1` | architecture | PR1 verification: PASS WITH WARNINGS |
| `sdd/foundation/verify-report-pr2` | architecture | PR2 verification: PASS |
| `sdd/foundation/verify-report-pr3` | architecture | PR3 verification: PASS |
| `sdd/foundation/verify-report-pr4` | architecture | PR4 verification: PASS (foundation complete) |
| `sdd/foundation/archive-report` | architecture | **This artifact** — archive report |
| `sdd/kilo-lima/testing-capabilities` | config | Testing capabilities; strict_tdd flipped to true (PR4) |
| `kilo-lima/toolchain/fnm-setup` | config | fnm + Node v24.14.0 + pnpm 10.30.3 toolchain |
| `sdd-init/kilo-lima` | config | Project initialization |
| `sdd-preflight/kilo-lima` | config | Preflight settings |
| `conventions/kilo-lima` | pattern | Project conventions |

---

## 9. What's Next — Deferred Slices

The foundation change is complete. The following slices are deferred and can be started as new SDD changes:

| Slice | Dependent REQ-IDs | Priority (from brief) |
|-------|-------------------|----------------------|
| **auth-flow** | REQ-AUTH-2, REQ-AUTH-3 (replace stub with real Supabase Auth) | High — unlocks auth-gated features |
| **supabase-bootstrap** | REQ-BE-1 (regenerate `Database` types from real Supabase project) | High — prerequisite for any Supabase-backed slice |
| **catalog** | REQ-STATE-2 (new stores), REQ-ROUTE-2 (new routes) | Medium — ingredients + recipes CRUD |
| **planning** | REQ-STATE-2, REQ-ROUTE-2 | Medium — events + production planning |
| **pos** | REQ-STATE-2, REQ-SHELL-1 (consume services) | Medium — sales registration |
| **offline-sync** | REQ-OFF-4 (implement sync queue), REQ-PWA-3 (custom SW) | Medium — implement the documented architecture |
| **analytics** | REQ-STATE-2 (new stores), chart.js (deferred dep) | Low — dashboard with charts |
| **reports** | REQ-STATE-2, jsPDF (deferred dep) | Low — PDF export |
| **ci-setup** | REQ-TOOL-1..7 (CI runs all checks) | Low — GitHub Actions workflow |
| **dark-theme** | REQ-UI-4 (add dark theme block) | Low — reopens preflight decision |
| **branding** | REQ-PWA-2 (real icons) | Low — replace placeholder icons |

**Important for future slices**: strict_tdd is now ENABLED. All future slices MUST follow RED-GREEN-REFACTOR cycle.

---

## 10. Archive Verdict

- **Change**: Foundation
- **Status**: COMPLETE — all 4 chained PRs merged to main, all 54 REQ-IDs satisfied, 4 tests passing, strict_tdd enabled
- **Global spec synced**: YES → `openspec/specs/foundation/spec.md`
- **Change folder archived**: YES → `openspec/changes/archive/2026-06-16-foundation/`
- **Engram record**: YES → `sdd/foundation/archive-report`
- **Archive type**: Standard (no partial archive, no stale-checkbox reconciliation needed)
- **Blocking issues**: None — all CRITICAL/WARNING items from PR1 verify were resolved by PR4

The foundation SDD cycle is CLOSED. Future work opens new changes on top of the established foundation.

---

## Key Learnings

- The 54 spec requirements distributed cleanly across 4 stacked PRs. The F2 split (moving Vuetify from PR1→PR2) was the single most impactful structural decision — it kept PR1 under the 400-line budget and established the per-PR delivery pattern.
- `vite-plugin-vuetify@2.1.3` has a HARD runtime check that enforces `vue()` before `vuetify()` in the Vite plugin array. The spec and design docs initially described the reverse order; the library's runtime assertion is authoritative — always trust the library, not the docs.
- pnpm 10's trust-policy change (defaulting to `no-downgrade` for packages with npm provenance attestation) is a real blocker for projects pinning Vite 5.4.x. A committed `.npmrc` with `trust-policy=allow` is the cleanest fix for a personal project.
- The `IStorageService` LSP contract and `useAuth()` stub are the two most important API surfaces in the foundation. Every future slice depends on their stability. Both are frozen at the interface level.
- The 3-coordinated-tweak pattern for Vuetify+jsdom tests (`server.deps.inline`, ResizeObserver stub, local Vuetify in spec) must be replicated in every spec file that mounts a Vuetify-using component.
- strict_tdd went from `false` to `true` across the full foundation lifecycle. The 4-test suite (App + HomeView h1/subtitle + appName + online status) provides minimum-viable proof of the full Vue+Vuetify+Pinia+jsdom+test-utils stack.
- Total delivery time: ~4 hours from first planning commit to archive (one intense session). 4 PRs merged, 35+ commits, ~1,085 code lines, 54 requirements, 4 tests, 24 verification gate passes.
