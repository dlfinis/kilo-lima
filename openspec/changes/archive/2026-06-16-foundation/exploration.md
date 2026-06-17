# Exploration: foundation

> Generated: 2026-06-16 by sdd-explore for the `foundation` change of kilo-lima.
> Source PRD: `brief.md` (469 lines). Repo state: greenfield (only `brief.md`, `.gitignore`, `LICENSE`, OpenSpec scaffolding, `.atl/skill-registry.md`).

## Executive Summary

The locked stack from `brief.md` (Vue 3.4+, Vite 5+, TS 5+, Vuetify 3, Pinia, Vue Router 4, Supabase JS v2, localforage, vite-plugin-pwa) is **still valid and the right shape for a single-user offline-first PWA in mid-2026** — no deprecations, no security advisories, no peer-dependency traps within the locked major ranges. The world has moved on to Vite 8 / TS 6 / Vuetify 4 / Vue Router 5, but those are NOT required and would violate the user's LOCKED product decisions. Recommend pinning within the locked majors: **Vite 5.4.x, Vue 3.5.x, TS 5.9.x, Vuetify 3.12.x, Vue Router 4.6.x, Pinia 3.0.x, Supabase JS 2.108.x, vite-plugin-pwa 1.3.x, ESLint 9.39.x, Vitest 2.1.x**. The brief itself contains **two contradictions** with the user's LOCKED preflight (dark/light theme toggle, "Docker Compose" + "local email/password auth" in Phase 1). These are flagged in `gaps_from_brief` and the proposal must surface them; the user's preflight wins.

## 1. Stack Validation (mid-2026)

Versions verified live against `registry.npmjs.org` on 2026-06-16.

| Package | Locked Range | Recommended Pin | Latest in Major | Notes |
|---|---|---|---|---|
| `vue` | 3.4+ | `^3.5.0` (3.5.38) | 3.5.38 | Composition API stable; no breaking changes since 3.4. |
| `vite` | 5+ | `^5.4.0` (5.4.21) | 8.0.16 | Brief locks "5+". Vite 8 is brand new; Vite 5.4 is the most battle-tested. Peer deps all align. |
| `typescript` | 5+ | `^5.9.0` (5.9.3) | 6.0.3 | TS 6 is a major; brief says 5+. Stay on 5.9. |
| `vuetify` | 3 | `^3.12.0` (3.12.8) | 4.1.2 | Vuetify 4 is out; the brief explicitly says "Vuetify 3". Stay on 3.12.x — last 3.x line. |
| `pinia` | (unspecified) | `^3.0.0` (3.0.4) | 3.0.4 | Peers `vue ^3.5.11`. Fine. |
| `vue-router` | 4 | `^4.6.0` (4.6.4) | 5.1.0 | VR 5 exists; brief locks 4. Stay on 4.6.x. |
| `@supabase/supabase-js` | v2 | `^2.108.0` (2.108.2) | 2.108.2 | No deprecations. |
| `vite-plugin-pwa` | (unspecified) | `^1.3.0` (1.3.0) | 1.3.0 | Workbox 7.4 underlying. |
| `localforage` | (unspecified) | `^1.10.0` (1.10.0) | 1.10.0 | **Unmaintained** (no release since 2021). Works fine for a personal app, but flagged. |
| `dayjs` | (unspecified) | `^1.11.0` (1.11.21) | 1.11.21 | Still maintained. |
| `chart.js` | 4 | `^4.5.0` (4.5.1) | 4.5.1 | Fine. |
| `vue-chartjs` | (unspecified) | `^5.3.0` (5.3.3) | 5.3.3 | Peers `chart.js ^4.1.1` and `vue ^3.0.0`. |
| `jspdf` | (unspecified) | `^4.2.0` (4.2.1) | 4.2.1 | Fine. |
| `eslint` | (unspecified) | `^9.39.0` (9.39.4) | 10.5.0 | ESLint 9 is flat-config era; ESLint 10 is current. Brief says "ESLint + Prettier". `eslint-plugin-vue 9.33` supports `^9.0.0`; `eslint-plugin-vue 10.9` supports `^10.0.0`. **Pin 9.39.x to use `eslint-plugin-vue 9.33.0`** (lower churn, well-documented flat config). |
| `prettier` | (unspecified) | `^3.8.0` (3.8.4) | 3.8.4 | Fine. |
| `vitest` | (unspecified) | `^2.1.0` (2.1.9) | 4.1.9 | Brief doesn't pin. Vitest 2.x peers `vite ^5`. Vitest 3/4 require vite 6+. **Pin 2.1.9** to match vite 5. |
| `@vue/test-utils` | (unspecified) | `^2.4.0` (2.4.11) | 2.4.11 | Fine. |
| `@vitejs/plugin-vue` | (transitive) | `^6.0.0` (6.0.7) | 6.0.7 | Required by Vite to compile SFCs. Peers `vite ^5`. |
| `vite-plugin-vuetify` | (transitive) | `^2.1.0` (2.1.3) | 2.1.3 | Required for Vuetify 3 tree-shaking. Peers `vite >=5`, `vuetify >=3`. |
| `vue-tsc` | (dev) | `^3.0.0` (3.3.5) | 3.3.5 | For `vue-tsc --noEmit` in CI. |
| `eslint-plugin-vue` | (dev) | `^9.33.0` (9.33.0) | 10.9.2 | Pinned to v9 to match ESLint 9 and to use the established flat config. |
| `typescript-eslint` | (dev) | `^8.0.0` (latest 8.x) | latest 8.x | For TS rules under flat config. |
| `zod` (env validation) | (unspecified) | `^4.4.0` (4.4.3) | 4.4.3 | For env validation at boot. Industry standard. |

**Version pinning strategy**: Use caret ranges (`^x.y.z`) in `package.json` to allow non-breaking minor + patch updates. Pin the **major** to the locked range from the brief. This gives the user free security patches without surprise breaking changes.

**No deprecations, no known security advisories** for any locked package as of the search date.

## 2. Integration Patterns

### 2.1 Supabase JS v2 + Vue 3 Composition API

- **Single client singleton**: Create `src/services/supabase.client.ts` that calls `createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })`. Export a single instance, never re-create.
- **Provide / inject**: In `src/plugins/services.ts` register `app.provide('supabase', supabaseClient)`. Composables that need it use `const supabase = inject<SupabaseClient>('supabase')`.
- **TypeScript types**: Generate with `supabase gen types typescript --project-id <id> --schema public > src/types/database.types.ts`. Until a real Supabase project exists, ship a stub `Database` interface so the rest of the app compiles.
- **RLS awareness**: Even though foundation has no real auth, the `IStorageService` interface and the proposed `SupabaseService` must accept a Supabase client whose policies assume the user is `anon` with a `user_id = auth.uid()` filter. Document this for the auth slice.
- **Env validation**: Validate `VITE_SUPABASE_URL` (must be a URL) and `VITE_SUPABASE_ANON_KEY` (must be a non-empty string) at app boot via a Zod schema in `src/utils/env.ts`. Fail loudly in dev with a clear error toast; fail loud in production too (do not silent-fallback).
- **No direct `fetch` from components** — only from `services/`. The brief already locks this.
- **No Axios** — brief locks this too.

### 2.2 Vuetify 3 + Vite

- **Plugin order matters**: `vite-plugin-vuetify` MUST be registered BEFORE `@vitejs/plugin-vue` (the README is explicit about this). Use `Vuetify({ autoImport: true })` from the plugin.
- **Tree-shaking**: `vite-plugin-vuetify` auto-imports used components and directives. No need for `unplugin-vue-components` unless the user wants auto-import of local `src/components/ui/*.vue`. Recommended NOT to auto-import local components in the foundation — it complicates the LSP story. Hand-import them; auto-import only Vuetify.
- **Theme config**: Brief specifies a single light theme with the brand palette. Configure in `src/plugins/vuetify.ts`:

  ```ts
  import { createVuetify } from 'vuetify'
  import * as components from 'vuetify/components'
  import * as directives from 'vuetify/directives'

  export const vuetify = createVuetify({
    components, directives,
    theme: {
      defaultTheme: 'light',
      themes: {
        light: {
          dark: false,
          colors: {
            primary: '#1976D2', secondary: '#424242', accent: '#FF6B35',
            success: '#4CAF50', warning: '#FFC107', error: '#F44336',
            background: '#FAFAFA',
          },
        },
      },
    },
  })
  ```
- **CSS**: Import `vuetify/styles` in `main.ts` BEFORE the app CSS.
- **Dark theme**: NOT configured (preflight says light only). The brief's `theme.dark` toggle is dropped per preflight — see `gaps_from_brief`.

### 2.3 vite-plugin-pwa + Vue 3

- **Manifest**: `public/manifest.webmanifest` (or generated inline) with `name: 'Kilo-Lima'`, `short_name: 'Kilo'`, `theme_color: '#1976D2'`, `background_color: '#FAFAFA'`, `display: 'standalone'`, `start_url: '/'`, icons in `public/icons/`.
- **Workbox strategies** (configured in `vite.config.ts`):
  - `registerType: 'autoUpdate'` — auto-apply new SW on next page load.
  - Precache app shell (`index.html`, JS chunks, CSS, fonts, the 3 critical icons).
  - Runtime caching for `cdn.jsdelivr.net` (Vuetify fonts if any) with `CacheFirst`, 30-day expiry.
- **Install / update prompt**: Foundation ships a minimal `usePwaUpdate()` composable in `src/composables/usePwaUpdate.ts` that exposes `needRefresh` and `updateServiceWorker()` from `virtual:pwa-register/vue`. The full install-prompt UX (the "Add to Home Screen" banner) is deferred to a later slice.
- **NO custom service worker** in foundation — the generated one from the plugin is enough. Custom SW work goes with the offline-sync slice.

### 2.4 localforage + Supabase offline sync

See section 4 for the recommended architecture. In foundation, only:
- `src/services/localforage.client.ts` that wraps `localforage.createInstance({ name: 'kilo-lima', storeName: 'app' })`.
- `src/services/storage.service.ts` implementing `IStorageService` (per brief's LSP requirement) using localforage.
- `IStorageService` interface in `src/services/storage.interface.ts` with `guardar<T>(key, data): Promise<void>` and `obtener<T>(key): Promise<T | null>`.
- The sync queue and the `SyncService` are NOT implemented in foundation — only the type contract is.

## 3. Concrete Project Structure for the Foundation Slice

Every file the foundation should create, with a one-line purpose:

### Root config

- `package.json` — npm manifest with the pinned versions above, scripts (`dev`, `build`, `preview`, `lint`, `format`, `test`, `typecheck`).
- `pnpm-lock.yaml` — generated lockfile (if user picks pnpm; not authored by hand).
- `tsconfig.json` — strict TypeScript config (strict: true, no implicit any, but allow `noUncheckedIndexedAccess: false` for KISS).
- `tsconfig.app.json` — extends `tsconfig.json`, includes `src/**/*`, `src/**/*.vue` via `vue-tsc`.
- `tsconfig.node.json` — for Vite config and CLI scripts.
- `vite.config.ts` — Vite + `@vitejs/plugin-vue` + `vite-plugin-vuetify` + `vite-plugin-pwa` config.
- `vitest.config.ts` — Vitest config with `jsdom` env and `@vue/test-utils` setup.
- `eslint.config.js` — flat config (ESLint 9) with `eslint-plugin-vue` + `typescript-eslint` + `eslint-config-prettier`.
- `.prettierrc.json` — Prettier config (singleQuote: true, semi: false, printWidth: 100).
- `.prettierignore` — ignores `dist/`, `node_modules/`, `*.lock`.
- `.gitignore` — already exists; verify it covers `.env`, `dist/`, `node_modules/`, `*.local` (existing file looks complete).
- `.editorconfig` — UTF-8, LF, 2-space indent.
- `index.html` — single HTML entry, mount point `#app`, viewport meta for mobile, theme-color meta, link to `/manifest.webmanifest`.
- `env.d.ts` — declares `ImportMetaEnv` interface for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `.env.example` — documents the two env vars; user copies to `.env.local` (gitignored).
- `README.md` — quickstart: install, env, dev, build, deploy. (Foundation scope — full docs come later.)

### PWA assets

- `public/favicon.ico` — placeholder.
- `public/icons/icon-192.png` — placeholder (Kilo-Lima logo, 192x192).
- `public/icons/icon-512.png` — placeholder (Kilo-Lima logo, 512x512).
- `public/icons/maskable-512.png` — placeholder for Android adaptive icon.
- `public/robots.txt` — allow all (single-user, no SEO concerns).

### Entry + plugins

- `src/main.ts` — creates the app, registers Pinia, router, Vuetify, mounts.
- `src/App.vue` — root component, contains `<router-view />` and a minimal top app bar.
- `src/plugins/vuetify.ts` — Vuetify instance with light theme palette.
- `src/plugins/pinia.ts` — Pinia instance (or just `app.use(createPinia())` inline in main).
- `src/plugins/router.ts` — Vue Router instance with the home route.
- `src/plugins/services.ts` — registers `provide('supabase')` and `provide('storageService')`.

### Services

- `src/services/supabase.client.ts` — single Supabase client instance.
- `src/services/localforage.client.ts` — localforage instance, configured with `name: 'kilo-lima'`.
- `src/services/storage.interface.ts` — `IStorageService` contract (LSP).
- `src/services/storage.service.ts` — `LocalforageStorageService` implementing `IStorageService`.

### Composables

- `src/composables/useAuth.ts` — auth STUB: returns `{ user: Ref<null>, isLoading: Ref<false>, signIn: () => Promise.reject('not implemented') }`. Per preflight: NO real auth.
- `src/composables/usePwaUpdate.ts` — exposes `needRefresh` ref and `updateServiceWorker()` from `virtual:pwa-register/vue`.
- `src/composables/useOnlineStatus.ts` — returns `online: Ref<boolean>` based on `navigator.onLine` + `online`/`offline` events. Used in future offline sync; foundation ships the composable for parity with the future sync slice.

### Stores

- `src/stores/app.store.ts` — minimal Pinia store that proves the pattern: holds `appName: 'Kilo-Lima'`, `setAppName(name)` action. NO business logic.

### Router

- `src/router/index.ts` — `createRouter` with `createWebHistory()`, the home route. Lazy-loaded views for future-proofing.
- `src/router/routes.ts` — route definitions (separated so future slices add routes without touching the router setup).

### Views

- `src/views/HomeView.vue` — the home page. Renders a Vuetify `v-container` with `<h1>Kilo-Lima</h1>`, a brief Spanish subtitle, and a `v-card` showing the PWA install / online status. Proves the stack works.

### Types

- `src/types/database.types.ts` — stub `Database` interface (matches what `supabase gen types` would produce). Empty `public.Tables` so the Supabase client compiles. Will be regenerated in a later slice.
- `src/types/env.d.ts` — `ImportMetaEnv` declarations (or merged into root `env.d.ts`).
- `src/types/index.ts` — barrel export for shared domain types. Foundation exports none; the file exists as a placeholder for future domain types (`Ingredient`, `Recipe`, etc.).

### Utils

- `src/utils/env.ts` — Zod schema validating `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at app boot. Throws with a clear message if missing.
- `src/utils/format.ts` — Spanish-friendly number/currency formatters (USD, 2 decimals). Tiny. Proves the utils pattern.

### Tests

- `src/views/HomeView.spec.ts` — smoke test: mounts `HomeView` with a Pinia + Vuetify test plugin, asserts the `<h1>Kilo-Lima</h1>` renders and the app name from the store is visible.
- `tests/setup.ts` — Vitest setup: registers `@vue/test-utils` global config, sets up `jsdom`, mocks `matchMedia` and `localforage`.

### CI (deferred — see Risks)

No `.github/workflows/` files in foundation. The user's preflight permits deferral.

## 4. Offline Sync Architecture Recommendation

**Chosen approach: Optimistic UI + localforage write-ahead log + Pinia-backed sync queue + Background Sync API replay**

**Why this fits kilo-lima:**
- **Single user, intermittent connectivity at fairs** — no need for CRDTs, no multi-device merge. Last-write-wins by timestamp is enough.
- **POS context** — the user taps "Sold!" and needs immediate feedback. Optimistic UI is mandatory. The 50ms latency of waiting for Supabase would feel broken.
- **Fair connectivity** — at a fair, you may be on a flaky 4G with seconds of outage, not 30-min blackouts. Background Sync API (with a `sync` event registered in the service worker) is the right primitive. If unsupported, fall back to retry-on-`online`-event from the queue.

**Flow:**
1. UI calls `mutate()` on a Pinia store.
2. Store generates `{ id, op, payload, ts }`, appends to `useSyncQueueStore().pending`, writes the row to localforage, and updates the local cache optimistically. UI re-renders immediately with the optimistic state.
3. Store attempts the Supabase call. On success, removes the entry from the queue. On failure, the entry stays; the SW will retry on `sync`.
4. SW registers a `sync` event with tag `'kilo-lima-sync'`; the browser fires it when connectivity returns. The SW drains the queue.
5. On reconnect the queue status ref flips to `'synced'`; the UI shows a green indicator.

**Alternatives considered (and rejected for this use case):**

- **Pull-only on reconnect** — loses offline-entered sales. Hard NO for a POS.
- **Supabase Realtime multi-client** — overkill, no second client.
- **Service-worker-only sync (no Pinia)** — gives no optimistic UI, bad UX for sales.
- **idb-keyval instead of localforage** — would require writing the queue index by hand. localforage is the brief's lock; the cost of staying on it is low.

**Implementation deferred to a later slice** (sync-related files): the foundation ONLY creates the type contracts (`IStorageService`, `IOnlineSyncService`) and a no-op `useSyncQueueStore` stub. The actual `sync.service.ts`, `sync.queue.store.ts`, and the SW's `sync` handler ship in the `offline-sync` slice.

**Key files in the future sync slice:**
- `src/stores/sync.queue.store.ts`
- `src/services/sync.service.ts`
- `src/services/online-sync.interface.ts`
- SW extension (`custom-sw.ts` via `injectManifest` strategy in vite-plugin-pwa)
- `useSyncStatus.ts` composable

## 5. Supabase Type Generation

**Tool**: `supabase gen types typescript --project-id <ref> --schema public`

**When**: **prebuild** (in `package.json` `build` script) and **CI** (GitHub Actions later). Plus an `npm run gen:types` script the user can run manually.

**Foundation decision**: Since there is no live Supabase project yet, the foundation SHIPS a hand-authored `src/types/database.types.ts` stub with an empty `Database.Tables` interface so the rest of the app compiles. When the user creates the real Supabase project (a manual step outside foundation), they run `npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts` and commit the output.

**Why prebuild, not pre-commit**:
- Avoids generating types on every commit (slows the dev loop).
- Prebuild guarantees `dist/` always carries the latest types — no stale production builds.
- A prebuild script that calls `supabase` CLI requires a logged-in Supabase account in CI; if not available, fall back to "skip typegen, use checked-in types" with a clear warning.

**CI setup**: In the deferred CI workflow, add a step: `if: ${{ env.SUPABASE_ACCESS_TOKEN != '' }}` that runs `npx supabase gen types typescript --project-id ${{ env.SUPABASE_PROJECT_ID }} --schema public > src/types/database.types.ts` before `npm run typecheck`. If the token is missing, skip with a warning.

## 6. Env Validation

**Approach: Zod** (zod 4.4.x).

**Why Zod, not Valibot, not a simple check, not nothing**:
- **Zod 4** is the industry standard, has first-class TS inference, and the user's own `node-control` skill recommends it. Familiar to most developers.
- **Valibot 1.4** is smaller (~90% less code) but newer; the foundation should use the safe default.
- **A simple `if (!url) throw` is fragile** — it doesn't validate URL shape, doesn't give typed env, doesn't compose. A 2-schema Zod block is barely more code and far more robust.
- **Doing nothing** means the app silently boots with `undefined` and the first Supabase call fails 10 seconds later with a cryptic "Invalid URL".

**Pattern**: `src/utils/env.ts` exports a typed `env: { VITE_SUPABASE_URL: string; VITE_SUPABASE_ANON_KEY: string }` parsed from a Zod schema. The module throws at import-time if the env vars are missing. Imported once in `src/main.ts` (or in `src/services/supabase.client.ts` which is imported by `main.ts`).

**Bundle cost**: Zod 4 is ~12 KB gzipped. Acceptable for a PWA shell that already ships Vuetify (~50 KB gz) and Vue Router (~10 KB gz).

## 7. CI/CD & Deploy

**Provider**: GitHub Actions (deferred to a later slice) + Cloudflare Pages (the actual host, configured in Cloudflare dashboard, NOT in this repo).

**Minimum pipeline (in GitHub Actions, deferred)**:
1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (ESLint flat config)
3. `pnpm typecheck` (`vue-tsc --noEmit`)
4. `pnpm test` (Vitest with jsdom)
5. `pnpm build` (Vite build)

**Why defer CI**:
- Foundation is a single-author greenfield; the orchestrator + apply phases run these checks locally before commit.
- Cloudflare Pages has its OWN build pipeline (it runs `pnpm build` on push). The GH Actions pipeline is for PR validation only, which is overkill for the foundation slice.
- Chained PRs would benefit from GH Actions, but the user has not yet asked for CI.
- Adding `.github/workflows/ci.yml` in the foundation would inflate the PR past the 400-line budget.

**In foundation: false.** The `package.json` scripts are wired and runnable locally; CI YAML is created in a later slice (e.g. `ci-setup`).

**Cloudflare Pages config** (not committed, configured in dashboard):
- Build command: `pnpm build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Node version: 22 (matches the engines requirement)

## 8. Risks

1. **Vuetify 3 is a moving target** — Vuetify 4 is current. Vuetify 3.12.x is the last 3.x line and will get security patches but not new features. If the project lives >18 months, a future slice will need to migrate to Vuetify 4. Surface this to the user at proposal time.
2. **`localforage` is unmaintained** (last release 2021). For a personal app, this is fine. For a team app, swap to `idb-keyval` + `idb` (or Dexie). Foundation ships localforage per the brief's lock; the proposal should note this for the user.
3. **ESLint 9 + `typescript-eslint` 8 is the flat-config era** — the `.eslintrc` style is GONE. The foundation's `eslint.config.js` must use the new format. Risk: developer unfamiliar with flat config misconfigures the file. Mitigation: pin a known-good `eslint-plugin-vue` 9.33 + `typescript-eslint` 8.x combo.
4. **Vitest 2.x + Vite 5.x is a known-good pair** but Vitest 3/4 require Vite 6+. If a future slice upgrades Vite, Vitest must be bumped in lockstep. Document this coupling in the proposal.
5. **No type generation without a Supabase project** — the `Database` stub means type errors will only surface AFTER the user creates a Supabase project. Acceptable but worth flagging.
6. **No CI in foundation** — the user's preflight explicitly allows deferral, but a future PR will need GH Actions. Note in proposal.
7. **The brief says "no Docker"** but the README needs a setup section that walks the user through `pnpm install`, creating `.env.local` from `.env.example`, and `pnpm dev`. Without it, the user (you) will hit "blank page" errors on first run.
8. **`vite-plugin-pwa` virtual modules** (`virtual:pwa-register/vue`) are tree-shake-friendly, but if the user later switches to a custom SW, the import path changes. The `usePwaUpdate` composable must be the ONLY consumer — the `virtual:pwa-register/vue` import should not leak into other files.

## 9. Gaps from the Brief

These are the contradictions and ambiguities between `brief.md` and the user's LOCKED preflight decisions. The proposal must surface them; the user's preflight wins.

1. **Theme — Dark mode**: `brief.md` §1 line 20 says "Vuetify 3 con tema oscuro/claro configurable" (dark/light configurable). The user's preflight says "Light theme only". **CONTRADICTION — preflight wins.** Foundation configures a single light theme. No `dark` theme block, no toggle.

2. **Supabase hosting mode — Docker**: `brief.md` §7 line 342 (Phase 1) says "Docker Compose con Supabase auto-hospedado" and the deployment section says "Supabase Cloud (free tier, gestionado)". **CONTRADICTION within the brief itself.** The user's preflight is unambiguous: "Supabase Cloud, NO Docker Compose". **CONTRADICTION — preflight wins.** No `docker-compose.yml`, no `supabase/` directory in foundation.

3. **Auth — local password**: `brief.md` §7 line 344 (Phase 1) says "Autenticación simple (email/password local)". The user's preflight says "Auth prepared, not functional — NO login UI, no sign-up, no password recovery". **CONTRADICTION — preflight wins.** Foundation ships a `useAuth()` stub that throws on every method. No login page, no form, no Supabase auth call.

4. **Phase ordering — Fase 5 says "Estrategia offline con IndexedDB" in week 5** but the user's preflight wants `vite-plugin-pwa` + `localforage` configured in foundation (week 1). **CONTRADICTION — preflight wins.** The foundation DOES configure the PWA shell + localforage client + `IStorageService`, but the sync queue itself is deferred.

5. **Testing — "Vitest + Playwright"** is recommended in the brief (§7) and in `openspec/config.yaml`. The user's preflight says install Vitest + `@vue/test-utils` ONLY in foundation; Playwright is deferred. Foundation ships the Vitest smoke test. Playwright setup is for a later slice.

6. **`brief.md` §6.1 enumerates Vuetify breakpoints** but does not say which breakpoint triggers the bottom nav vs. the top bar. This is a later-slice concern, not foundation.

7. **`brief.md` §3.1 KISS table** bans "Librerías de utilidades custom — Lodash/DayJS solo si es necesario". `dayjs` IS in the stack and IS needed. No conflict — the brief self-clarifies: "Lodash/DayJS solo si es necesario". Foundation does NOT need dayjs yet (no date logic), so it should NOT be installed in foundation. Defer to the recipe/cost-calculation slice that actually needs dates.

8. **`brief.md` §9 validation checklist** ("¿Incluye manejo de errores básico? ¿Tiene loading states?") is a per-component gate, not a foundation concern. The foundation's `useAuth` and `usePwaUpdate` should be the FIRST examples of the error + loading patterns future slices must follow.

9. **Package manager not specified** — the brief does not say pnpm vs. npm vs. yarn. The user's preflight does not pin it. **Recommend pnpm** for: deterministic installs, fast cold installs, strict peer-dep warnings (catches version mismatches early). pnpm is also what the Vuetify team uses for their monorepo and what the brief's peer-dep math is most likely tuned for. npm is also fine if the user prefers. **Surface as a question in the proposal** rather than deciding silently.

10. **Brief §5.2 line 238-249 lists Vuetify, Pinia, Supabase JS v2, localforage, Day.js, Chart.js, vue-chartjs, jsPDF as the "Stack Obligatorio"** — but the foundation doesn't need `chart.js`, `vue-chartjs`, `jspdf`, or `dayjs` yet. They ship in the analytics/PDF slice. The proposal must NOT install them in foundation (would inflate the slice past the 400-line budget). Surface as a decision point.

## 10. Ready for Proposal

**Yes.** The foundation slice is well-defined: a known stack (Vite 5.4 + Vue 3.5 + TS 5.9 + Vuetify 3.12 + Vue Router 4.6 + Pinia 3.0 + Supabase JS 2.108 + PWA 1.3 + localforage 1.10), a clean file structure, one smoke test, a deferred sync architecture documented, and a clear list of contradictions to surface to the user. The proposal should:
- Pin all versions per section 1.
- Enumerate files per section 3.
- Defer all offline sync implementation per section 4.
- Surface the 10 gaps in section 9 to the user before apply.
- NOT install chart.js / vue-chartjs / jspdf / dayjs in foundation.

## Affected Areas (for the proposal to cite)

- New project — no existing code is affected.
- `brief.md` is the source PRD and is NOT modified by the foundation.
- `openspec/config.yaml` will need its `testing` block updated AFTER the foundation lands (Vitest detected, runner: vitest, framework: vitest). This is a sdd-init follow-up, not an apply task.

## Recommended Next Phase

`/sdd-propose foundation` — this artifact is sufficient input for the proposal phase. The proposal should:
- Adopt the version pins from section 1 verbatim.
- Adopt the file list from section 3 as the task scope.
- Adopt the offline-sync deferred approach from section 4.
- Surface the 10 gaps from section 9 to the user with a "acknowledge or override" choice.
- Recommend pnpm and ask the user to confirm.

---

## Key Learnings (for Engram capture)

- Brief was authored when Vuetify 3 was current and explicitly says "Vuetify 3" — but Vuetify 4 is the current major. The user's LOCKED preflight to "Vuetify 3" overrides the world drift.
- localforage 1.10.0 has been the latest release since 2021 — effectively unmaintained, but still works for IndexedDB. For a personal app this is fine; flag in proposal.
- Vitest and Vite versions are tightly coupled: Vitest 2.x requires Vite 5+, Vitest 3 requires Vite 6+, Vitest 4 requires Vite 6+. Bumping Vite means bumping Vitest in lockstep.
- ESLint 9 is the flat-config era; `eslint-plugin-vue` 9.x supports flat config, `eslint-plugin-vue` 10.x is for ESLint 10. Pick one pair and stick to it.
- Brief contradicts itself: §1 says dark/light configurable, but deployment says "light theme only" (actually the deployment says nothing about dark/light — the §1 line 20 is the only mention). Plus Phase 1 in §7 says Docker Compose + local auth, while deployment says Supabase Cloud + email/password via Supabase Auth. The user's preflight is the source of truth and resolves all contradictions.
- Vuetify 3 + Vite 5.4 + Pinia 3.0 + Vue 3.5 + Vue Router 4.6 is a known-good peer-dep combo as of June 2026.
- The recommended offline-sync architecture for a single-user POS is optimistic UI + localforage WAL + Pinia sync queue + SW Background Sync API. This is the right primitive for intermittent-but-not-extended offline windows.
