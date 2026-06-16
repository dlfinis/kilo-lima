# Foundation — Change Proposal

> Change: `foundation`
> Phase: `sdd-propose` → feeds `sdd-spec` and `sdd-design`
> Source PRD: `brief.md` (locked). Source analysis: `openspec/changes/foundation/exploration.md`.
> Artifact store mode: `both` (filesystem + Engram).

---

## 1. Resumen ejecutivo

The `foundation` slice is the first OpenSpec change for kilo-lima. It bootstraps a Vite 5.4 + Vue 3.5 + TypeScript 5.9 + Vuetify 3.12 + Pinia 3.0 + Vue Router 4.6 + Supabase JS 2.108 + vite-plugin-pwa 1.3 + localforage 1.10 PWA, with ESLint 9 flat config, Prettier 3.8, Vitest 2.1, and Zod 4.4 env validation. The deliverable is one home view, one minimal Pinia store, one smoke test, a configured PWA shell, a stubbed auth composable, and the type contracts that every later sync slice will implement against. The slice intentionally stops there: no login UI, no business modules, no CI, no Docker, no dark theme, no real Supabase type generation. Every other slice in the kilo-lima roadmap (auth-flow, catalog, planning, POS, analytics, reports, offline-sync) depends on this foundation landing first.

## 2. Contexto y motivación

- **Source PRD**: `brief.md` (469 lines, locked) describes a personal PWA for managing dessert costs and sales at fairs (single user, USD, Spanish UI, Cloudflare Pages + Supabase Cloud deployment).
- **Exploration**: `openspec/changes/foundation/exploration.md` validates the brief's stack against the live npm registry on 2026-06-16, documents integration patterns, enumerates 35 files, sketches the offline-sync architecture, and surfaces 10 gaps/contradictions between the brief and the user's preflight.
- **Why first**: there is no `package.json`, no `src/`, no Vue project. The brief's Phase 1 explicitly starts with "Setup inicial del proyecto (Vite + Vue 3 + TypeScript)". Without this slice, no later slice (catalog, planning, POS, etc.) can be specified, designed, or implemented — the `node_modules`, the folder structure, and the type contracts all live here.
- **Why now**: the user's preflight locks the 7 product/tech decisions, removing the most common sources of churn (theme, hosting, auth scope, package manager, deferred deps). The remaining work is mechanical — install, scaffold, smoke test, document.

## 3. Decisiones de producto y técnica (LOCKED — do not revisit)

| # | Decision | One-line rationale | Source |
|---|---|---|---|
| 1 | Auth prepared, not functional | Ship Supabase JS + `useAuth()` stub that throws. No login UI. | Preflight, brief §7 |
| 2 | Supabase Cloud, no Docker Compose | Managed free tier. No local Supabase stack. | Preflight, brief deployment section |
| 3 | Offline-first from day 1 | `vite-plugin-pwa` + `localforage` configured; sync queue architecture documented, implementation deferred. | Preflight, brief §5.2 + §6 |
| 4 | Foundation = minimum slice + auth prep | One home view, one minimal Pinia store, one smoke test. No business modules. | Preflight, exploration §3 |
| 5 | Light theme only | Preflight wins over brief §1 line 20 ("tema oscuro/claro configurable"). | Preflight |
| 6 | Package manager: pnpm | `pnpm-lock.yaml` committed. Deterministic, strict peer-dep warnings. | Preflight |
| 7 | Deferred dependencies | `dayjs`, `chart.js`, `vue-chartjs`, `jspdf` ship with their consuming slice, not in foundation. | Preflight, exploration §1 + §9 |

## 4. Alcance

### 4.1 In-scope (concrete deliverables)

**Project root**
- `package.json` — pinned versions, scripts (`dev`, `build`, `preview`, `lint`, `format`, `test`, `typecheck`, `gen:types`), engines `node >=22`.
- `pnpm-lock.yaml` — generated, committed.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — strict TS, KISS (no `noUncheckedIndexedAccess`).
- `vite.config.ts` — `@vitejs/plugin-vue` + `vite-plugin-vuetify` + `vite-plugin-pwa` (in that order).
- `vitest.config.ts` — `jsdom` env, `@vue/test-utils` setup file.
- `eslint.config.js` — ESLint 9 flat config with `eslint-plugin-vue` 9.33 + `typescript-eslint` 8.
- `.prettierrc.json`, `.prettierignore`, `.editorconfig`.
- `index.html` — mount point + PWA meta + manifest link.
- `env.d.ts` — `ImportMetaEnv` declaration for the two Supabase vars.
- `.env.example` — documents `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `README.md` — quickstart (install, env, dev, build, deploy).

**PWA assets**
- `public/manifest.webmanifest` (or generated inline) with name, icons, theme color, display.
- `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` — placeholders.
- `public/favicon.ico`, `public/robots.txt`.

**Entry + plugins**
- `src/main.ts`, `src/App.vue` (root with `<router-view />` and a minimal top app bar).
- `src/plugins/vuetify.ts` (light theme palette per brief §6.4), `pinia.ts`, `router.ts`, `services.ts`.

**Services**
- `src/services/supabase.client.ts` — singleton client.
- `src/services/localforage.client.ts` — instance, `name: 'kilo-lima'`.
- `src/services/storage.interface.ts` — `IStorageService` (LSP contract).
- `src/services/storage.service.ts` — `LocalforageStorageService` impl.

**Composables**
- `src/composables/useAuth.ts` — stub returning throwing methods.
- `src/composables/usePwaUpdate.ts` — wraps `virtual:pwa-register/vue`.
- `src/composables/useOnlineStatus.ts` — `navigator.onLine` + `online`/`offline` events.

**Stores**
- `src/stores/app.store.ts` — minimal store, `appName: 'Kilo-Lima'`, `setAppName` action. Pattern proof, not business logic.

**Router + views**
- `src/router/index.ts`, `src/router/routes.ts` — `createWebHistory`, lazy-loaded home route.
- `src/views/HomeView.vue` — Vuetify `v-container`, `<h1>Kilo-Lima</h1>`, Spanish subtitle, PWA status card.

**Types**
- `src/types/database.types.ts` — hand-authored `Database` stub (empty `public.Tables`).
- `src/types/env.d.ts` (or merged into root `env.d.ts`).
- `src/types/index.ts` — barrel placeholder.

**Utils**
- `src/utils/env.ts` — Zod schema for `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, fail-fast at module import.
- `src/utils/format.ts` — USD number/currency formatter (Spanish-friendly).

**Tests**
- `src/views/HomeView.spec.ts` — smoke test: mount, assert `<h1>Kilo-Lima</h1>` renders and store `appName` is visible.
- `tests/setup.ts` — Vitest setup: jsdom, `@vue/test-utils` config, `matchMedia` (Vuetify needs it) and `localforage` mocks.

### 4.2 Out-of-scope

- Login UI, sign-up, password recovery, real Supabase auth flow.
- Business modules: ingredients, recipes, events, POS, sales, reports, analytics.
- CI/CD: no `.github/workflows/`. Local `pnpm` scripts only.
- Docker: no `docker-compose.yml`, no `supabase/` directory.
- Dark theme: no `dark` theme block, no toggle.
- Deferred dependencies: `dayjs`, `chart.js`, `vue-chartjs`, `jspdf`.
- `supabase gen types typescript` wiring (script stub only; the command itself runs in a later CI slice).
- Sync queue implementation (`sync.queue.store.ts`, `sync.service.ts`, custom SW `sync` handler).
- Playwright (deferred to a future E2E slice).
- i18n, multi-user, PWA install-prompt UI, custom service worker.

## 5. Stack técnico (pinned)

| Concern | Package | Pin | Source / coupling note |
|---|---|---|---|
| Build | `vite` | `^5.4.21` | exploration §1 — Vite 8 exists but preflight locks "5+" |
| Build | `@vitejs/plugin-vue` | `^6.0.7` | peers `vite ^5` |
| Build | `vue-tsc` | `^3.3.5` | dev — for `pnpm typecheck` |
| UI | `vue` | `^3.5.38` | peers `pinia ^3.0.0` |
| UI | `vuetify` | `^3.12.8` | last 3.x line; Vuetify 4 ignored per preflight |
| UI | `vite-plugin-vuetify` | `^2.1.3` | peers `vite >=5`, `vuetify >=3` |
| State | `pinia` | `^3.0.4` | peers `vue ^3.5.11` |
| Routing | `vue-router` | `^4.6.4` | brief locks 4; VR 5 ignored |
| Backend | `@supabase/supabase-js` | `^2.108.2` | brief locks v2 |
| Offline | `vite-plugin-pwa` | `^1.3.0` | Workbox 7.4 underlying |
| Offline | `localforage` | `^1.10.0` | **unmaintained**, flagged in Risks §1 |
| Testing | `vitest` | `^2.1.9` | peers `vite ^5` — bumps lockstep with Vite |
| Testing | `@vue/test-utils` | `^2.4.11` | — |
| Quality | `eslint` | `^9.39.4` | flat-config era |
| Quality | `eslint-plugin-vue` | `^9.33.0` | pinned to v9 for flat-config pair |
| Quality | `typescript-eslint` | `^8.x` | dev — for TS rules under flat config |
| Quality | `prettier` | `^3.8.4` | — |
| Quality | `zod` | `^4.4.3` | env validation at boot |

**Node engine**: `>=22` (matches Cloudflare Pages build env).

## 6. Estructura de archivos

See `openspec/changes/foundation/exploration.md` §3 for the authoritative file tree (35 files, each with a one-line purpose). Summary by area:

```
kilo-lima/
├── package.json, pnpm-lock.yaml
├── tsconfig.{json,app.json,node.json}
├── vite.config.ts, vitest.config.ts
├── eslint.config.js, .prettierrc.json, .prettierignore
├── .editorconfig, .env.example, env.d.ts
├── index.html, README.md
├── public/
│   ├── manifest.webmanifest
│   ├── favicon.ico, robots.txt
│   └── icons/{icon-192,icon-512,maskable-512}.png
├── tests/
│   └── setup.ts
└── src/
    ├── main.ts, App.vue
    ├── plugins/    (vuetify, pinia, router, services)
    ├── services/   (supabase, localforage, storage.interface, storage.service)
    ├── composables/(useAuth, usePwaUpdate, useOnlineStatus)
    ├── stores/     (app.store)
    ├── router/     (index, routes)
    ├── views/      (HomeView.vue + .spec.ts)
    ├── types/      (database.types, env, index)
    └── utils/      (env, format)
```

## 7. Enfoque de offline

The foundation ships **only the type contracts and the configured client**. No queue, no sync handler.

**Chosen architecture** (deferred implementation; documented in `exploration.md` §4):

> **Optimistic UI + localforage write-ahead log + Pinia-backed sync queue + Service Worker Background Sync API replay.**

Rationale: single-user POS, intermittent (not extended) offline windows at fairs, need for immediate UI feedback on every "Sold!" tap. Last-write-wins by timestamp; no CRDTs needed.

**What foundation ships:**
- `localforage.client.ts` instance.
- `IStorageService` interface + `LocalforageStorageService` impl.
- `useOnlineStatus()` composable (reads `navigator.onLine` + event listeners).
- `usePwaUpdate()` wrapping `virtual:pwa-register/vue` (autoUpdate strategy).
- This proposal as the architecture record.

**What foundation does NOT ship** (deferred to `offline-sync` slice): `sync.queue.store.ts`, `sync.service.ts`, `useSyncStatus`, custom SW (`custom-sw.ts` via `injectManifest`), SW `sync` event handler.

## 8. Validación de entorno

Zod schema in `src/utils/env.ts` validating at module import:

```ts
import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
})

export const env = envSchema.parse(import.meta.env)
```

Imported once in `src/main.ts` (transitively via `src/services/supabase.client.ts`). Throws a clear ZodError listing both missing/invalid vars at boot — no silent fallback, no cryptic 10-second-later Supabase failure. Bundle cost: Zod 4 ~12 KB gz, acceptable alongside Vuetify.

## 9. Estrategia de tipos de Supabase

**Foundation**: hand-authored `src/types/database.types.ts` with a stub `Database` interface and empty `public.Tables` so the Supabase JS client type-checks. A header comment notes it is a stub to be regenerated.

**Later slice** (e.g., `supabase-bootstrap` or `ci-setup`): a real Supabase project is created (manual step). Then `npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts` regenerates the file. The foundation's `package.json` includes a `gen:types` script stub but the command is **not** wired to `prebuild` yet (no token, no project in foundation).

**Why prebuild, not pre-commit**: avoids regenerating on every commit, guarantees `dist/` carries the latest types, allows the CI to opt out gracefully when `SUPABASE_ACCESS_TOKEN` is missing.

## 10. Estrategia de testing

- **Tooling installed**: `vitest@2.1.9` + `@vue/test-utils@2.4.11` + `jsdom`.
- **Test count in foundation**: 1 smoke test (`src/views/HomeView.spec.ts`) asserting the app boots, `<h1>Kilo-Lima</h1>` renders, and the Pinia store's `appName` is visible.
- **Test setup**: `tests/setup.ts` registers `@vue/test-utils` config, sets up `jsdom`, mocks `matchMedia` (Vuetify needs it) and `localforage`.
- **Coverage gate**: none. Coverage is not measured in foundation.
- **`strict_tdd`**: stays `false` in `openspec/config.yaml` until `npx vitest run` exits 0 with at least 1 passing test, observed in the apply phase.
- **Playwright**: deferred. Foundation does not install it.

## 11. Contradicciones del brief (resolved by preflight)

| # | Brief section | Brief says | Preflight says | Resolution |
|---|---|---|---|---|
| 1 | §1 line 20 | "tema oscuro/claro configurable" | Light only | Preflight wins. No `dark` theme block, no toggle. |
| 2 | §7 line 342 (Phase 1) | "Docker Compose con Supabase auto-hospedado" (vs. deployment section: "Supabase Cloud") | Supabase Cloud, no Docker | Preflight wins. No `docker-compose.yml`, no `supabase/` dir. |
| 3 | §7 line 344 (Phase 1) | "Autenticación simple (email/password local)" | Auth prepared, not functional | Preflight wins. `useAuth()` throws. No login UI. |
| 4 | §7 Fase 5 | "Estrategia offline con IndexedDB" in week 5 | Offline-first from day 1 | Preflight wins. PWA + localforage configured in foundation; sync queue deferred. |
| 5 | §7 testing | Vitest + Playwright | Vitest in foundation, Playwright deferred | Preflight wins. Playwright not installed. |
| 6 | §5.2 stack | Includes `dayjs` | dayjs deferred to consuming slice | Preflight wins. dayjs not installed. |
| 7 | §5.2 stack | Includes `chart.js`, `vue-chartjs`, `jspdf` | All deferred to analytics/reports slice | Preflight wins. None installed. |

## 12. Riesgos

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | `localforage` unmaintained (last release 2021) | Low (works fine for personal app) | Accept; swap to `idb-keyval` if a security issue ever surfaces. Flagged in `exploration.md` §8. |
| 2 | Vuetify 3 is EOL for new features; Vuetify 4 is current | Med | Pin 3.12.x (last 3.x line). Migrate to Vuetify 4 in a future slice if the project lives >18 months. |
| 3 | Vitest 2.x ↔ Vite 5.x tight coupling | Low | Document the coupling. Any Vite bump forces a Vitest bump in lockstep (Vitest 3 requires Vite 6+). |
| 4 | No CI in foundation | Med | Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` locally before commit. Add GitHub Actions in a later `ci-setup` slice. |
| 5 | `Database` stub will drift from real schema | Med | Hand-author the stub minimally (empty `public.Tables`). Regenerate immediately after the real Supabase project is created in a later slice. |
| 6 | ESLint 9 flat config is new to many devs | Low | Pin a known-good combo (`eslint-plugin-vue` 9.33 + `typescript-eslint` 8). Document the flat-config shape in `eslint.config.js` comments. |
| 7 | **`estimated_pr_lines` exceeds the 400-line review budget** | **High** | Foundation scaffolding is ~35 files (~1,100 lines of text content, binaries excluded). Orchestrator should plan **chained PRs** (see `chained-pr` skill): (a) root config + manifests + env, (b) Vue + Vuetify + Pinia + Router wiring, (c) services + composables + store, (d) types + utils + tests + home view. Each sub-PR targets the previous branch (Feature Branch Chain). |

## 13. Criterios de aceptación

- [ ] `pnpm install` completes without peer-dep errors.
- [ ] `pnpm dev` starts Vite; app renders `HomeView` with `<h1>Kilo-Lima</h1>` in Spanish.
- [ ] `pnpm typecheck` passes with `strict: true`.
- [ ] `pnpm lint` passes (ESLint 9 flat config, vue + ts rules).
- [ ] `pnpm test` runs the smoke test and passes (≥1 test).
- [ ] `pnpm build` produces `dist/` with PWA manifest + service worker.
- [ ] `pnpm preview` serves the built app and SW registers.
- [ ] Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` fails fast at boot with a clear Zod error.
- [ ] `useAuth()` stub returns throwing methods (no login UI, no network calls).
- [ ] Folder structure matches `brief.md` §3.2 + `exploration.md` §3.
- [ ] All `.vue` files ≤ 200 lines; all functions ≤ 30 lines.
- [ ] Comments are "why" only, never "what".
- [ ] Spanish identifiers for business terms; English for infrastructure.
- [ ] All UI text in Spanish.
- [ ] No Options API, no Vuex, no Axios, no Bootstrap, no Tailwind custom, no jQuery, no Moment.js.
- [ ] `dayjs`, `chart.js`, `vue-chartjs`, `jspdf` not installed.
- [ ] No `docker-compose.yml`, no `supabase/` directory, no `.github/workflows/`.
- [ ] `usePwaUpdate()` is the only consumer of `virtual:pwa-register/vue`.
- [ ] `plugin-vuetify` registered BEFORE `plugin-vue` in `vite.config.ts`.
- [ ] Total PR diff budget honored via chained PRs (see Risks §7).

## 14. No-objetivos (scope-creep guard)

- No login UI, no sign-up, no password recovery.
- No business logic (no ingredients, recipes, events, POS, sales).
- No multi-user support (single-user personal app).
- No PWA install-prompt UI (deferred to UX slice).
- No sync queue implementation.
- No analytics, no reports, no PDF export.
- No i18n (Spanish hardcoded).
- No dark theme.
- No CI/CD.
- No Docker.
- No Playwright.
- No real Supabase type generation (stub only).

## 15. Trabajo futuro (no en este slice)

Slices that depend on foundation landing, in the order implied by the brief:

- **`supabase-bootstrap`** — create real Supabase project, regenerate `Database` types, wire `gen:types` to `prebuild`.
- **`auth-flow`** — implement `useAuth()` against real Supabase Auth (email/password), add login view, session persistence, RLS policies.
- **`catalog`** — `Ingredient` + `Recipe` domains, CRUD views, cost calculator (consumes deferred `dayjs`).
- **`planning`** — `Event` + fixed costs + production planning.
- **`pos`** — sales registration, cart, daily close.
- **`offline-sync`** — `sync.queue.store.ts`, `sync.service.ts`, custom SW `injectManifest`, `useSyncStatus` (may be split per feature).
- **`analytics`** — dashboard with deferred `chart.js` + `vue-chartjs`.
- **`reports`** — PDF export with deferred `jspdf`.
- **`ci-setup`** — GitHub Actions workflow (`pnpm install --frozen-lockfile` + `lint` + `typecheck` + `test` + `build`).
- **`dark-theme`** — only if the user re-opens the §1 contradiction.

## 16. Rollback plan

Foundation is the first commit on `main` (or the first chained PR). Rollback = `git reset --hard HEAD~1` if not yet pushed, or `git revert <sha>` if pushed. If chained PRs are used, each sub-PR is independently revertable; the final merge is the cut-line. There is no pre-foundation state to restore.

## 17. Referencias

- `brief.md` — source PRD (locked).
- `openspec/changes/foundation/exploration.md` — exploration artifact (source of all stack/file decisions).
- `openspec/config.yaml` — project SDD config (`preflight` block locks the 7 decisions).
- `.atl/skill-registry.md` — indexed skills for this project.
- Engram observation `sdd/foundation/explore` — exploration summary for cross-session recovery.
- `~/.config/opencode/skills/sdd-propose/SKILL.md` — this phase skill.
- `~/.config/opencode/skills/sdd-spec/SKILL.md` — next phase.
- `~/.config/opencode/skills/sdd-design/SKILL.md` — next phase (parallel to spec).
- `~/.config/opencode/skills/chained-pr/SKILL.md` — chained-PR strategy for this slice's size.
- `~/.config/opencode/skills/cognitive-doc-design/SKILL.md` — README authoring guide.
- `~/.config/opencode/skills/node-control/SKILL.md` — Node/TS/Zod config conventions.
- `~/.config/opencode/skills/work-unit-commits/SKILL.md` — commit splitting for the chained PRs.
