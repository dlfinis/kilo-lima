# Tasks: Foundation

> **Change**: `foundation` | **Phase**: `sdd-tasks`
> **Proposal**: `openspec/changes/foundation/proposal.md`
> **Spec**: `openspec/changes/foundation/spec.md` (54 requirements)
> **Design**: `openspec/changes/foundation/design.md` (15 sections)
> **Delivery**: 4 chained PRs, stacked-to-main
> **Artifact store mode**: `hybrid` (both)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated total changed lines | ~1,085 (PR1 ~385, PR2 ~255, PR3 ~195, PR4 ~250) |
| 400-line budget risk | Low (all PRs after F2 split) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 bootable shell → PR2 router+stores+utils+types → PR3 services+auth stub → PR4 PWA+offline+smoke test |
| Delivery strategy | ask-always (already resolved via E1a) |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

---

## Per-PR Verification Gates (before moving to next PR)

After EACH PR merges to main:
- [ ] `pnpm install` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` exits 0 and produces `dist/`
- [ ] `pnpm preview` serves the built app
- [ ] PR diff is ≤ 400 lines (gate)
- [ ] No forbidden dependencies or patterns (REQ-CONV-3)

---

## PR1 — Bootable Shell (leaves main with a "Hello Kilo-Lima" Vue app; Vuetify arrives in PR2)

After PR1, main has a Vite+Vue+Pinia project that boots, builds, lints, typechecks, and displays a "Kilo-Lima" heading as plain HTML. No Vuetify yet, no PWA, no router, no services, no tests. **(F2 split: Vuetify plugin moved to PR2 to keep this PR under the 400-line budget.)**

### Task 1.1: Pin project dependencies and scripts

- **PR**: PR1
- **REQ-IDs covered**: REQ-TOOL-1, REQ-TOOL-2, REQ-TOOL-3, REQ-TOOL-4, REQ-TOOL-5, REQ-TOOL-6, REQ-TOOL-7
- **Files**:
  - `package.json` (create)
- **Depends on**: none
- **Work-unit commit message**: `chore(deps): pin foundation stack and scripts`
- **Verification**:
  - [ ] `pnpm install` exits 0, no peer-dep errors
  - [ ] `pnpm-lock.yaml` is generated
  - [ ] `pnpm dev --version` prints (vite is available)
- **Estimated changed lines**: 80
- **Notes**: Pin ALL versions from design §6 stack exactly as specified. Scripts: `dev`, `build`, `preview`, `lint`, `format`, `test`, `typecheck`. Deps include vue, vite, typescript, vuetify, pinia, vue-router, @supabase/supabase-js, vite-plugin-pwa, localforage, eslint, prettier, vitest, @vue/test-utils, zod, @vitejs/plugin-vue, vite-plugin-vuetify, vue-tsc, eslint-plugin-vue, typescript-eslint, jsdom. Follows design §1, spec §12 (REQ-TOOL-1..7).

### Task 1.2: Author TypeScript configs

- **PR**: PR1
- **REQ-IDs covered**: REQ-TOOL-3
- **Files**:
  - `tsconfig.json` (create)
  - `tsconfig.app.json` (create)
  - `tsconfig.node.json` (create)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `chore(tsconfig): strict TypeScript with path aliases`
- **Verification**:
  - [ ] `pnpm typecheck` exits 0 (will pass once src/main.ts exists after Task 1.7)
  - [ ] `tsconfig.json` has `strict: true`, `target: ES2022`, `moduleResolution: bundler`, paths `@/*` → `src/*`
- **Estimated changed lines**: 50
- **Notes**: Standard three-file TS config pattern for Vue projects. `tsconfig.json` is the solution file referencing the other two. Follows design §1, spec §1 (REQ-TOOL-3).

### Task 1.3: Author Vite and Vitest configs

- **PR**: PR1
- **REQ-IDs covered**: REQ-TOOL-1, REQ-TOOL-2, REQ-TOOL-6, REQ-UI-1
- **Files**:
  - `vite.config.ts` (create — plugins: `vite-plugin-vuetify` FIRST, then `@vitejs/plugin-vue`; NO VitePWA yet — that ships in PR4)
  - `vitest.config.ts` (create — mergeConfig with vite.config + test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'] })
- **Depends on**: Task 1.1
- **Work-unit commit message**: `chore(vite): vue + vuetify plugins; vitest with jsdom`
- **Verification**:
  - [ ] `pnpm dev` starts on a port (will show blank or error until Task 1.7)
  - [ ] `pnpm build` exits 0 (will produce minimal output)
  - [ ] `vite.config.ts` has `vite-plugin-vuetify` before `@vitejs/plugin-vue` in plugins array
- **Estimated changed lines**: 60
- **Notes**: `vite-plugin-vuetify` MUST be registered BEFORE `@vitejs/plugin-vue` per Vuetify docs. Vitest config uses `mergeConfig` to inherit aliases and plugins. Follows design §2, §10 (plugin order), §12.

### Task 1.4: Author ESLint, Prettier, and EditorConfig

- **PR**: PR1
- **REQ-IDs covered**: REQ-TOOL-4, REQ-TOOL-5
- **Files**:
  - `eslint.config.js` (create — flat config, vue + ts-eslint recommended)
  - `.prettierrc.json` (create — singleQuote: true, semi: false, printWidth: 100)
  - `.prettierignore` (create)
  - `.editorconfig` (create)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `chore(lint): eslint 9 flat config + prettier + editorconfig`
- **Verification**:
  - [ ] `pnpm lint` exits 0
  - [ ] `pnpm format` exits 0
  - [ ] `.prettierrc.json` has `singleQuote: true`, `semi: false`, `printWidth: 100`
- **Estimated changed lines**: 50
- **Notes**: ESLint 9 flat config with `eslint-plugin-vue` 9.33 + `typescript-eslint` 8. No custom rules in foundation. Follows design §1, spec §1 (REQ-TOOL-4, REQ-TOOL-5).

### Task 1.5: Author env types, example, and README

- **PR**: PR1
- **REQ-IDs covered**: REQ-BE-4, REQ-BE-5, REQ-CONV-7
- **Files**:
  - `env.d.ts` (create — ImportMetaEnv augmentation for VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
  - `.env.example` (create)
  - `README.md` (create — all 9 sections per REQ-CONV-7)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `chore(env): import.meta.env types, .env.example, README quickstart`
- **Verification**:
  - [ ] `cat .env.example` shows both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
  - [ ] README includes all commands: `pnpm install`, `cp .env.example .env.local`, `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm typecheck`
  - [ ] `env.d.ts` declares `ImportMetaEnv` with string-typed Supabase vars
- **Estimated changed lines**: 80
- **Notes**: README is in English (infrastructure artifact per REQ-CONV-7). `env.d.ts` lives at project root, NOT in `src/types/`. Follows design §4, spec §5 (REQ-BE-4, REQ-BE-5), spec §12 (REQ-CONV-7).

### Task 1.6: Author index.html and public assets

- **PR**: PR1
- **REQ-IDs covered**: REQ-PWA-2
- **Files**:
  - `index.html` (create — viewport meta, theme-color, manifest link, #app mount)
  - `public/robots.txt` (create)
  - `public/favicon.ico` (create — placeholder)
  - `public/icons/icon-192.png` (create — placeholder)
  - `public/icons/icon-512.png` (create — placeholder)
  - `public/icons/maskable-512.png` (create — placeholder)
- **Depends on**: Task 1.1
- **Work-unit commit message**: `chore(pwa): html shell, robots, placeholder icons`
- **Verification**:
  - [ ] All three icon files exist under `public/icons/`
  - [ ] `pnpm build` copies public/ to dist/
  - [ ] `index.html` has `<div id="app"></div>`
- **Estimated changed lines**: 30 (text files) + binary icons (placeholders)
- **Notes**: Icons are placeholders. Document as "real icons come in a later branding slice." The vite-plugin-pwa manifest registration comes in PR4 — icons exist as static assets for now. Follows proposal §4.1 (PWA assets), spec §8 (REQ-PWA-2).

### Task 1.7a: Author minimal main.ts and App.vue (no Vuetify yet — F2 split)

- **PR**: PR1
- **REQ-IDs covered**: REQ-SHELL-1, REQ-SHELL-2, REQ-STATE-1
- **Files**:
  - `src/main.ts` (create — `createApp`, `use(createPinia())`, `mount`; NO vuetify plugin yet)
  - `src/App.vue` (create — plain `<div id="app-root"><h1>Kilo-Lima</h1></div>`; NO `v-app`/`v-main` yet)
  - `src/components/ui/.gitkeep` (create — empty dir scaffold)
  - `src/components/business/.gitkeep` (create — empty dir scaffold)
  - `src/composables/.gitkeep` (create — empty dir scaffold)
  - `src/stores/.gitkeep` (create — empty dir scaffold)
  - `src/services/.gitkeep` (create — empty dir scaffold)
  - `src/views/.gitkeep` (create — empty dir scaffold)
  - `src/types/.gitkeep` (create — empty dir scaffold)
  - `src/utils/.gitkeep` (create — empty dir scaffold)
  - `src/plugins/.gitkeep` (create — empty dir scaffold)
- **Depends on**: Tasks 1.1, 1.2, 1.3
- **Work-unit commit message**: `feat(shell): vue app renders "Kilo-Lima" h1 (vuetify arrives in pr2)`
- **Verification**:
  - [ ] `pnpm dev` opens browser, shows plain "Kilo-Lima" h1 (no Vuetify styling)
  - [ ] `pnpm build` produces `dist/`
  - [ ] `pnpm typecheck` passes
  - [ ] All empty directories have a `.gitkeep` so git tracks them
- **Estimated changed lines**: 35
- **Notes**: **F2 split**: the original Task 1.7 also created `src/plugins/vuetify.ts` with the light theme. That work moved to PR2 (new Task 2.7) to keep PR1 under the 400-line budget. `src/main.ts` registers `createPinia()` even though no stores exist yet — Pinia handles this gracefully. Router will be wired in PR2 (Task 2.8). Folder scaffold uses `.gitkeep` files so empty directories are tracked by git. Follows design §2 (plugin order — Pinia before mount), spec §2 (REQ-SHELL-1, REQ-SHELL-2), spec §4 (REQ-STATE-1).

---

## PR2 — Vuetify + Router + Stores + Utils + Types (adds Vuetify theme, navigation, Pinia pattern, env validation, testing setup)

After PR2, main has Vuetify 3 fully integrated with the light theme, a working router with a HomeView placeholder, a Pinia store proof, Zod env validation, utility functions, stubbed database types, and a test setup file. **(F2 split: Vuetify plugin creation moved here from PR1 to keep PR1 under the 400-line budget.)**

### Task 2.1: Author env validation with Zod

- **PR**: PR2
- **REQ-IDs covered**: REQ-BE-3
- **Files**:
  - `src/utils/env.ts` (create — Zod schema for VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, fail-fast at module import)
- **Depends on**: PR1 merged
- **Work-unit commit message**: `feat(env): zod validation for supabase env vars`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] `import('@/utils/env')` with missing vars throws `ZodError` containing variable name
- **Estimated changed lines**: 30
- **Notes**: Single most impactful UX decision — catches missing `.env.local` at boot with a clear error. Follows design §4, spec §5 (REQ-BE-3).

### Task 2.2: Author database type stub

- **PR**: PR2
- **REQ-IDs covered**: REQ-BE-1 (partial — Database stub enables typed client)
- **Files**:
  - `src/types/database.types.ts` (create — empty `Database` interface with comment explaining CI regeneration)
  - `src/types/index.ts` (create — barrel export)
- **Depends on**: PR1 merged
- **Work-unit commit message**: `chore(types): supabase database stub + barrel`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] `import { Database } from '@/types'` resolves correctly
- **Estimated changed lines**: 25
- **Notes**: Stub has empty `public.Tables`, `Views`, `Functions`, `Enums`. Header comment: "TODO: Regenerate via `supabase gen types typescript` after real Supabase project is created." Follows design §11, spec §5 (REQ-BE-1).

### Task 2.3: Author app store (proof-of-pattern)

- **PR**: PR2
- **REQ-IDs covered**: REQ-STATE-2
- **Files**:
  - `src/stores/app.store.ts` (create — defineStore with appName ref + setAppName action)
- **Depends on**: PR1 merged
- **Work-unit commit message**: `feat(store): app store with composition-api setup style`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] `useAppStore().appName` returns `'Kilo-Lima'`
  - [ ] `useAppStore().setAppName('Nuevo')` updates appName reactively
- **Estimated changed lines**: 25
- **Notes**: Setup-style Pinia store (`defineStore('app', () => { ... })`). Pattern proof only — every future domain store follows this template. Follows design §8, spec §4 (REQ-STATE-2).

### Task 2.4: Author router with routes

- **PR**: PR2
- **REQ-IDs covered**: REQ-ROUTE-1, REQ-ROUTE-2, REQ-ROUTE-3
- **Files**:
  - `src/router/routes.ts` (create — single lazy `/` route → HomeView, catch-all redirect)
  - `src/router/index.ts` (create — createWebHistory + routes)
- **Depends on**: PR1 merged
- **Work-unit commit message**: `feat(router): web history with lazy home route and catch-all`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] `src/router/routes.ts` uses `() => import('@/views/HomeView.vue')` lazy pattern
  - [ ] Catch-all `/:pathMatch(.*)*` redirects to `/`
- **Estimated changed lines**: 50
- **Notes**: `createWebHistory(import.meta.env.BASE_URL)`. Route file separation: `routes.ts` holds definitions, `index.ts` does setup. Follows design §9, spec §9 (REQ-ROUTE-1, REQ-ROUTE-2, REQ-ROUTE-3).

### Task 2.5: Author USD formatter utility

- **PR**: PR2
- **REQ-IDs covered**: none (utility helper from proposal §4.1, not an explicit spec REQ)
- **Files**:
  - `src/utils/format.ts` (create — formatUSD using Intl.NumberFormat for USD with Spanish locale)
- **Depends on**: PR1 merged
- **Work-unit commit message**: `feat(util): USD currency formatter`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] `formatUSD(3.5)` returns `'US$3.50'` (or equivalent Spanish-USD format)
- **Estimated changed lines**: 20
- **Notes**: Uses `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' })`. This is a proof-of-pattern for the utils module; more formatters come in later slices. Follows proposal §4.1.

### Task 2.6: Author test setup file with mocks

- **PR**: PR2
- **REQ-IDs covered**: REQ-TEST-3
- **Files**:
  - `tests/setup.ts` (create — matchMedia mock + localforage in-memory stub)
- **Depends on**: PR1 merged
- **Work-unit commit message**: `chore(test): setup with matchMedia and localforage mocks`
- **Verification**:
  - [ ] `pnpm test` runs (no tests yet, but setup loads without error)
  - [ ] Importing file sets `window.matchMedia` to a function (not undefined)
- **Estimated changed lines**: 30
- **Notes**: `matchMedia` mock returns an object with `matches: false`, `addListener`, `removeListener`, `addEventListener`, `removeEventListener`, `dispatchEvent`. localforage stub uses an in-memory `Map`. Follows design §12, spec §11 (REQ-TEST-3).

### Task 2.7: Integrate Vuetify 3 with light theme (moved from PR1 per F2 split)

- **PR**: PR2
- **REQ-IDs covered**: REQ-UI-1, REQ-UI-2, REQ-UI-4, REQ-SHELL-1
- **Files**:
  - `src/plugins/vuetify.ts` (create — `createVuetify` with light theme palette from design §10; NO dark theme)
  - `src/main.ts` (modify — add `import vuetify from '@/plugins/vuetify'` and `app.use(vuetify)`)
  - `src/App.vue` (modify — wrap content in `<v-app><v-main>`)
  - `src/plugins/.gitkeep` (delete — no longer needed since vuetify.ts exists)
- **Depends on**: PR1 merged (modifies `main.ts` and `App.vue` created in Task 1.7a)
- **Work-unit commit message**: `feat(ui): vuetify 3 with light theme renders kilo-lima`
- **Verification**:
  - [ ] `pnpm dev` opens browser, shows Vuetify-themed page (v-app background, v-main padding)
  - [ ] `pnpm build` produces `dist/`
  - [ ] `src/plugins/vuetify.ts` has NO `dark` theme block
  - [ ] Theme palette matches: primary #1976D2, secondary #424242, accent #FF6B35, success #4CAF50, warning #FFC107, error #F44336, background #FAFAFA
  - [ ] `defaultTheme: 'light'` is set
- **Estimated changed lines**: 45
- **Notes**: **F2 split**: this task was originally Task 1.7 in PR1. Moved here to keep PR1 under the 400-line budget. `src/main.ts` now follows the full plugin order: Pinia → Vuetify → (router wired in Task 2.8) → (provide in PR3) → mount. The `v-app`/`v-main` wrapper in `App.vue` is required for Vuetify to apply its layout system. Follows design §2 (plugin order), §10 (theme palette), spec §2 (REQ-SHELL-1), spec §3 (REQ-UI-1, REQ-UI-2, REQ-UI-4).

### Task 2.8: Wire real router into main.ts (renumbered from 2.7 due to F2 split)

- **PR**: PR2
- **REQ-IDs covered**: REQ-ROUTE-1, REQ-SHELL-1
- **Files**:
  - `src/main.ts` (modify — import router from `@/router`, call `app.use(router)` between Vuetify and mount)
- **Depends on**: Task 2.4 (router), Task 2.9 (renumbered HomeView)
- **Work-unit commit message**: `refactor(shell): wire real router into main`
- **Verification**:
  - [ ] `pnpm dev` shows HomeView placeholder at `/`
  - [ ] `pnpm typecheck` passes
- **Estimated changed lines**: 5 (diff)
- **Notes**: Renumbered from 2.7 due to F2 split inserting Task 2.7 (Vuetify). Plugin order in `main.ts` is now: Pinia → Vuetify → Router → (provide in PR3) → mount. Follows design §2, spec §2 (REQ-SHELL-1), spec §9 (REQ-ROUTE-1).

### Task 2.9: Author minimal HomeView placeholder (renumbered from 2.8 due to F2 split)

- **PR**: PR2
- **REQ-IDs covered**: REQ-HOME-1, REQ-HOME-2, REQ-HOME-5
- **Files**:
  - `src/views/HomeView.vue` (create — minimal `<h1>Kilo-Lima</h1>` + Spanish subtitle + `<v-container>` Vuetify component)
  - `src/views/.gitkeep` (delete — no longer needed)
- **Depends on**: Task 2.4 (router), Task 2.7 (Vuetify — needed for `v-container`)
- **Work-unit commit message**: `feat(home): placeholder home view with h1 and subtitle`
- **Verification**:
  - [ ] `pnpm dev` shows "Kilo-Lima" + "Pre-evento · Durante evento · Post-evento"
  - [ ] Uses `<script setup lang="ts">`
  - [ ] File is ≤ 200 lines
- **Estimated changed lines**: 25
- **Notes**: Renumbered from 2.8 due to F2 split. Added dependency on Task 2.7 because `<v-container>` requires Vuetify to be installed. The PWA status card and store value display come in PR4 Task 4.4. Follows design §9, spec §10 (REQ-HOME-1, REQ-HOME-2, REQ-HOME-5), spec §3 (REQ-UI-3 — v-container proves Vuetify works end-to-end).

---

## PR3 — Services + Auth Stub (adds Supabase client, localforage, IStorageService, useAuth)

After PR3, main has all service layer interfaces and implementations, a stubbed auth composable, and the services plugin providing both singletons via DI.

### Task 3.1: Author localforage singleton client

- **PR**: PR3
- **REQ-IDs covered**: REQ-OFF-1
- **Files**:
  - `src/services/localforage.client.ts` (create — singleton instance with `name: 'kilo-lima'`)
- **Depends on**: PR2 merged
- **Work-unit commit message**: `feat(offline): localforage singleton instance`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] Importing instance works without error
- **Estimated changed lines**: 20
- **Notes**: `localforage.createInstance({ name: 'kilo-lima', storeName: 'kilo_lima_store' })`. Follows design §3, §6, spec §6 (REQ-OFF-1).

### Task 3.2: Author IStorageService interface

- **PR**: PR3
- **REQ-IDs covered**: REQ-OFF-2
- **Files**:
  - `src/services/storage.interface.ts` (create — IStorageService with Spanish method names)
- **Depends on**: PR2 merged
- **Work-unit commit message**: `feat(offline): IStorageService contract for LSP`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] Interface exports `guardar`, `obtener`, `eliminar`, `listarClaves` methods
- **Estimated changed lines**: 25
- **Notes**: Generic interface: `guardar<T>(clave: string, datos: T): Promise<void>`, `obtener<T>(clave: string): Promise<T | null>`, `eliminar(clave: string): Promise<void>`, `listarClaves(): Promise<string[]>`. Spanish method names per convention (REQ-CONV-5). Follows design §6, spec §6 (REQ-OFF-2).

### Task 3.3: Author LocalforageStorageService implementation

- **PR**: PR3
- **REQ-IDs covered**: REQ-OFF-3
- **Files**:
  - `src/services/storage.service.ts` (create — implements IStorageService against localforageInstance)
- **Depends on**: Tasks 3.1, 3.2
- **Work-unit commit message**: `feat(offline): LocalforageStorageService implementation`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] Service calls `guardar('k1', { a: 1 })` then `obtener('k1')` return `{ a: 1 }`
  - [ ] `obtener('inexistente')` returns `null`
- **Estimated changed lines**: 50
- **Notes**: Constructor receives localforage instance. Follows design §3, §6, spec §6 (REQ-OFF-3).

### Task 3.4: Author Supabase singleton client

- **PR**: PR3
- **REQ-IDs covered**: REQ-BE-1, REQ-BE-2, REQ-AUTH-1
- **Files**:
  - `src/services/supabase.client.ts` (create — imports env from utils, calls createClient<Database>)
- **Depends on**: PR2 merged (needs env.ts and database.types.ts)
- **Work-unit commit message**: `feat(be): supabase singleton client with typed database`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] With valid env vars, `import { supabase } from '@/services/supabase.client'` succeeds
  - [ ] Without valid env vars, import throws ZodError
  - [ ] `supabase.auth` is accessible and defined
- **Estimated changed lines**: 20
- **Notes**: Uses `env` from `@/utils/env` (Task 2.1) and `Database` from `@/types` (Task 2.2). If env is invalid, `createClient` is never called because the import chain fails at `env.ts`. Follows design §3, §4, spec §5 (REQ-BE-1, REQ-BE-2), spec §7 (REQ-AUTH-1).

### Task 3.5: Author useAuth stub composable

- **PR**: PR3
- **REQ-IDs covered**: REQ-AUTH-2, REQ-AUTH-3, REQ-AUTH-4
- **Files**:
  - `src/composables/useAuth.ts` (create — reactive refs + throwing methods)
- **Depends on**: PR2 merged
- **Work-unit commit message**: `feat(auth): useAuth stub with throwing methods and reactive refs`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] `useAuth().usuarioActual.value` is `null`
  - [ ] `useAuth().cargando.value` is `false`
  - [ ] `useAuth().iniciarSesion(...)` throws Error containing "No implementado"
  - [ ] No network request is made
- **Estimated changed lines**: 50
- **Notes**: All methods throw `new Error('No implementado: el flujo de autenticación llega en un slice posterior')`. Reactive refs: `usuarioActual: Ref<User | null>(null)`, `sesionActiva: Ref<boolean>(false)`, `cargando: Ref<boolean>(false)`. Methods: `iniciarSesion`, `cerrarSesion`, `obtenerUsuarioActual`, `registrar`. Follows design §7, spec §7 (REQ-AUTH-2, REQ-AUTH-3, REQ-AUTH-4).

### Task 3.6: Author services plugin (provide)

- **PR**: PR3
- **REQ-IDs covered**: REQ-SHELL-1
- **Files**:
  - `src/plugins/services.ts` (create — builds and provides supabase + storageService singletons)
- **Depends on**: Tasks 3.3, 3.4
- **Work-unit commit message**: `feat(shell): services plugin provides supabase and storageService`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] Plugin exports supabase and storageService singletons
- **Estimated changed lines**: 25
- **Notes**: Thin factory: imports both singletons, exports them, provides them via `app.provide('supabase', ...)` and `app.provide('storageService', ...)`. Follows design §2, §3, spec §2 (REQ-SHELL-1).

### Task 3.7: Wire services plugin into main.ts

- **PR**: PR3
- **REQ-IDs covered**: REQ-SHELL-1
- **Files**:
  - `src/main.ts` (modify — import and call `servicesPlugin`)
- **Depends on**: Task 3.6
- **Work-unit commit message**: `refactor(shell): install services plugin in main`
- **Verification**:
  - [ ] `pnpm dev` boots without errors
  - [ ] `pnpm typecheck` passes
- **Estimated changed lines**: 5 (diff)
- **Notes**: Import `app.use(servicesPlugin)` after Vuetify registration. Follows design §2 (plugin order: Pinia → Router → Vuetify → Provide → Mount). Follows spec §2 (REQ-SHELL-1).

---

## PR4 — PWA + Offline + Smoke Test (closes the foundation)

After PR4, main has a fully installable PWA with offline detection, a composable-filled HomeView, a passing smoke test, and offline-sync documentation. This is the FOUNDATION COMPLETE milestone.

### Task 4.1: Register vite-plugin-pwa in Vite config

- **PR**: PR4
- **REQ-IDs covered**: REQ-PWA-1, REQ-PWA-3
- **Files**:
  - `vite.config.ts` (modify — add VitePWA plugin with manifest, registerType: 'autoUpdate', devOptions: { enabled: true })
- **Depends on**: PR3 merged
- **Work-unit commit message**: `feat(pwa): register vite-plugin-pwa with kilo-lima manifest`
- **Verification**:
  - [ ] `pnpm build` produces `dist/manifest.webmanifest`
  - [ ] `dist/sw.js` exists
  - [ ] `pnpm typecheck` passes
  - [ ] Manifest has `name: 'Kilo-Lima'`, `short_name: 'KiloLima'`, `theme_color: '#1976D2'`, `display: 'standalone'`, icons array
- **Estimated changed lines**: 30 (diff)
- **Notes**: Uses `generateSW` strategy (default). `devOptions: { enabled: true }` for development testing. This is the ONLY place where `VitePWA` is imported. Follows design §5, spec §8 (REQ-PWA-1, REQ-PWA-3).

### Task 4.2: Author usePwaUpdate composable

- **PR**: PR4
- **REQ-IDs covered**: REQ-PWA-4
- **Files**:
  - `src/composables/usePwaUpdate.ts` (create — wraps `virtual:pwa-register/vue`)
- **Depends on**: Task 4.1
- **Work-unit commit message**: `feat(pwa): usePwaUpdate composable wraps registerSW`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] Exports `needRefresh: Ref<boolean>` and `updateServiceWorker: () => Promise<void>`
- **Estimated changed lines**: 25
- **Notes**: This is the ONLY consumer of `virtual:pwa-register/vue`. Exposes `{ needRefresh, offlineReady, updateServiceWorker }`. The `autoUpdate` strategy applies new SW on next page load. Follows design §5, spec §8 (REQ-PWA-4).

### Task 4.3: Author useOnlineStatus composable

- **PR**: PR4
- **REQ-IDs covered**: REQ-PWA-5
- **Files**:
  - `src/composables/useOnlineStatus.ts` (create — navigator.onLine + online/offline events)
- **Depends on**: PR3 merged
- **Work-unit commit message**: `feat(offline): useOnlineStatus composable from navigator.onLine`
- **Verification**:
  - [ ] `pnpm typecheck` passes
  - [ ] Returns `{ online: Ref<boolean> }`
  - [ ] Initial value matches `navigator.onLine`
- **Estimated changed lines**: 25
- **Notes**: Listens to `online` and `offline` window events. No cleanup needed for foundation (component lifecycle `onUnmounted` deferred to offline-sync slice). Follows design §5, spec §8 (REQ-PWA-5).

### Task 4.4: Enrich HomeView with PWA status card and store value

- **PR**: PR4
- **REQ-IDs covered**: REQ-HOME-3, REQ-HOME-4, REQ-UI-3, REQ-HOME-1
- **Files**:
  - `src/views/HomeView.vue` (modify — add online status card using `useOnlineStatus` + display `appName` from `useAppStore`)
- **Depends on**: Tasks 4.3, 2.8, 2.3
- **Work-unit commit message**: `feat(home): pwa status card and store value display`
- **Verification**:
  - [ ] `pnpm dev` shows "En línea" / "Sin conexión" card
  - [ ] Toggling browser offline updates the card reactively
  - [ ] Store `appName` value is visible in rendered output
  - [ ] Uses Vuetify `v-card` with `success`/`warning` color
- **Estimated changed lines**: 50 (diff from PR2 placeholder)
- **Notes**: Adds a Vuetify `v-card` with `color="success"` when online, `color="warning"` when offline. Displays "En línea" or "Sin conexión". The `v-card` itself proves Vuetify tree-shaking works (REQ-UI-3). Follows design §9, spec §10 (REQ-HOME-3, REQ-HOME-4), spec §3 (REQ-UI-3).

### Task 4.5: Author HomeView smoke test

- **PR**: PR4
- **REQ-IDs covered**: REQ-TEST-4, REQ-TEST-5
- **Files**:
  - `src/views/HomeView.spec.ts` (create — mounts HomeView with Pinia, asserts h1, subtitle, store value, online status)
- **Depends on**: Task 4.4, Task 2.6
- **Work-unit commit message**: `test(home): smoke test mounts and asserts h1, subtitle, store, online status`
- **Verification**:
  - [ ] `pnpm test` exits 0 with ≥1 passing test
  - [ ] Test output includes "Tests 1 passed" (or equivalent)
  - [ ] Assertions: `<h1>` contains "Kilo-Lima", subtitle contains "Pre-evento", store's `appName` visible, online status text present
- **Estimated changed lines**: 40
- **Notes**: This test passing flips `strict_tdd` to `true` in the next session. Uses `global: { plugins: [createPinia()] }` for Pinia injection. Follows design §12, spec §11 (REQ-TEST-4, REQ-TEST-5).

### Task 4.6: Document offline-sync architecture

- **PR**: PR4
- **REQ-IDs covered**: REQ-OFF-4
- **Files**:
  - `docs/offline-sync.md` (create — document 4-pillar architecture)
- **Depends on**: PR3 merged
- **Work-unit commit message**: `docs(offline): document sync queue architecture for future slice`
- **Verification**:
  - [ ] File exists at `docs/offline-sync.md`
  - [ ] Contains the 4-pillar architecture: optimistic UI + localforage WAL + Pinia sync queue + Background Sync API
  - [ ] No sync queue code exists in `src/` (REQ-OFF-4 negative requirement)
- **Estimated changed lines**: 80
- **Notes**: Documents the chosen architecture WITHOUT implementing it. This is the architecture record for the future `offline-sync` slice. Follows design §6, spec §6 (REQ-OFF-4).

---

## Final Verification (after PR4 merges)

- [ ] `pnpm test` exits 0 with ≥1 passing test (this flips `strict_tdd` to `true`)
- [ ] All 54 spec requirements satisfied (cross-check with spec.md)
- [ ] All brief §9 checklist items pass
- [ ] No forbidden dependencies or patterns (REQ-CONV-3: grep for axios, Vuex, Options API, process.env, jQuery, moment, bootstrap)
- [ ] All `.vue` ≤ 200 lines, all functions ≤ 30 lines (manual review)
- [ ] All UI strings in Spanish (REQ-CONV-4)
- [ ] Spanish business identifiers, English infrastructure filenames (REQ-CONV-5)
- [ ] No `dark` theme block in `src/plugins/vuetify.ts` (REQ-UI-4)
- [ ] `useAuth()` is NOT imported or called in HomeView (REQ-AUTH-4)
- [ ] `vite-plugin-vuetify` registered BEFORE `@vitejs/plugin-vue` in `vite.config.ts` (REQ-UI-1)

## Key Learnings

- The 54 spec requirements distribute across 4 stacked PRs with clean separation of concerns: PR1 is pure infrastructure (configs + shell), PR2 adds navigation + state + utilities, PR3 adds services + auth stub, PR4 caps with PWA + offline + the smoke test that flips strict_tdd.
- The `IStorageService` LSP contract and `useAuth()` stub are the two most important API surfaces in the foundation. Both must be stable from PR3 onward because every future slice depends on them.
- The smoke test deliberately lands last (PR4 Task 4.5) because it needs the full architecture: Vuetify, Pinia, router, services mocks, online composable, and the enriched HomeView all existing before it can meaningfully test.
- **F2 split applied**: original Task 1.7 (main + App + Vuetify plugin, ~80 lines) was split into Task 1.7a (PR1: main + App only, no Vuetify, ~35 lines) and a new Task 2.7 (PR2: Vuetify integration with light theme, ~45 lines). PR1 dropped from ~430 to ~385 lines, well under the 400-line budget. PR2 rose from ~215 to ~255 lines, still well under. Renumbering cascaded: old 2.7→2.8, old 2.8→2.9, with updated dependencies (HomeView now depends on the Vuetify task for `v-container`).
- The review workload guard of 400 lines per PR is now respected across all four PRs. If any future task risks exceeding the budget, split the largest task into the next PR before applying.
