# Foundation — Delta Specification

> **Change**: `foundation` | **Type**: New capabilities (greenfield)
> **Source PRD**: `brief.md` (locked). **Proposal**: `openspec/changes/foundation/proposal.md`.
> **Exploration**: `openspec/changes/foundation/exploration.md`.
> **Artifact store mode**: `both`.
>
> This spec defines the complete set of requirements and scenarios for the
> kilo-lima foundation slice. It is PR-AGNOSTIC — it states WHAT must be true
> at the end of foundation, not which PR implements which requirement.

---

## Purpose

The foundation slice bootstraps the kilo-lima PWA: a Vite 5.4 + Vue 3.5 +
TypeScript 5.9 + Vuetify 3.12 + Pinia 3.0 + Vue Router 4.6 + Supabase JS 2.108
+ vite-plugin-pwa 1.3 + localforage 1.10 project with ESLint 9 flat config,
Prettier 3.8, Vitest 2.1, and Zod 4.4 env validation. It ships one home view,
one minimal Pinia store, one smoke test, a configured PWA shell, a stubbed
auth composable, and type contracts for all deferred slices.

---

## ADDED Requirements

### 1. Tooling & Build

#### REQ-TOOL-1: Development server

The project SHALL provide a `pnpm dev` script that starts the Vite development
server and serves the Vue application on a local port.

**Rationale**: Primary developer feedback loop. Without it, no development can
occur.

**Scenario: Dev server starts and serves the app**

- GIVEN dependencies are installed (`pnpm install`)
- WHEN the developer runs `pnpm dev`
- THEN Vite starts and prints a localhost URL
- AND navigating to that URL renders the Vue application

---

#### REQ-TOOL-2: Production build

The project SHALL provide a `pnpm build` script that produces a deployable
`dist/` directory containing the bundled application and PWA service worker.

**Rationale**: Deployable artifact required for Cloudflare Pages.

**Scenario: Production build produces dist/ with PWA artifacts**

- GIVEN the project compiles without type errors
- WHEN the developer runs `pnpm build`
- THEN a `dist/` directory is created
- AND `dist/` contains `index.html`, JS/CSS bundles, `manifest.webmanifest`, and a service worker file

---

#### REQ-TOOL-3: Type checking

The project SHALL provide a `pnpm typecheck` script that runs `vue-tsc --noEmit`
and exits 0 when there are zero type errors under `strict: true`.

**Rationale**: Catch type errors before they reach runtime or the CI pipeline.

**Scenario: Typecheck passes on clean code**

- GIVEN all source files are type-correct with no `any`-casted violations
- WHEN the developer runs `pnpm typecheck`
- THEN the command exits with code 0
- AND no type errors are printed to stderr

**Scenario: Typecheck fails on a type violation**

- GIVEN a `.vue` or `.ts` file contains an intentional type error (e.g., assigning `string` to a `number` slot)
- WHEN the developer runs `pnpm typecheck`
- THEN the command exits with a non-zero code
- AND the error message identifies the file, line, and type mismatch

---

#### REQ-TOOL-4: Linting

The project SHALL provide a `pnpm lint` script using ESLint 9 flat config with
`eslint-plugin-vue` and `typescript-eslint` that passes on compliant source code.

**Rationale**: Enforce code quality, catch common Vue/TS mistakes, and maintain
consistency across slices.

**Scenario: Lint passes on compliant code**

- GIVEN all `.vue`, `.ts`, and `.js` files follow the configured ESLint rules
- WHEN the developer runs `pnpm lint`
- THEN the command exits with code 0
- AND no warnings or errors are printed

**Scenario: Lint fails on a forbidden pattern**

- GIVEN a source file uses the Options API or `var` instead of `const`
- WHEN the developer runs `pnpm lint`
- THEN the command exits with a non-zero code
- AND the error message points to the file, line, and rule violated

---

#### REQ-TOOL-5: Formatting

The project SHALL provide a `pnpm format` script using Prettier that formats
all configured file globs (`.vue`, `.ts`, `.js`, `.json`, `.css`, `.md`) and
exits 0 when all files match the configured style.

**Rationale**: Eliminate style debates; Prettier is the single source of truth
for formatting.

**Scenario: Format applies Prettier rules and exits clean**

- GIVEN source files are already formatted per `.prettierrc.json`
- WHEN the developer runs `pnpm format`
- THEN the command exits with code 0
- AND no files are modified

**Scenario: Format fixes unformatted files**

- GIVEN a source file has inconsistent indentation or missing semicolons
- WHEN the developer runs `pnpm format`
- THEN the file is rewritten to match Prettier rules
- AND the command exits with code 0

---

#### REQ-TOOL-6: Test runner

The project SHALL provide a `pnpm test` script that runs Vitest with jsdom and
exits 0 when at least one test passes and no test fails.

**Rationale**: Requirement for the `strict_tdd` gate to flip to `true`. The
foundation must prove the test infrastructure works before any TDD cycle can
begin.

**Scenario: Test runner executes the smoke test and passes**

- GIVEN the Vitest config and test setup file are in place
- WHEN the developer runs `pnpm test`
- THEN Vitest discovers and executes `HomeView.spec.ts`
- AND at least one assertion passes
- AND the command exits with code 0

**Scenario: Test runner fails on a broken test**

- GIVEN `HomeView.spec.ts` asserts "Kilo-Lima" but the `<h1>` text is "WrongApp"
- WHEN the developer runs `pnpm test`
- THEN the command exits with a non-zero code
- AND the failure report includes the expected vs. received text

---

#### REQ-TOOL-7: Lockfile

The project SHALL include a committed `pnpm-lock.yaml` generated by `pnpm
install` that records exact dependency versions.

**Rationale**: Deterministic installs across machines and CI environments.
pnpm enforces strict peer-dependency resolution.

**Scenario: Lockfile exists and is committed**

- GIVEN `pnpm install` has been run
- WHEN the developer inspects the repository
- THEN `pnpm-lock.yaml` is tracked by git
- AND the file is not listed in `.gitignore`

---

### 2. Application Shell

#### REQ-SHELL-1: Entry point wiring

`src/main.ts` SHALL boot the Vue application by creating the Vue app, installing
Pinia, Vue Router, and Vuetify plugins, and providing cross-cutting services
(`supabase` client, `storageService`) via `app.provide`.

**Rationale**: Single entry point that wires every architectural layer. A
well-defined `main.ts` makes the dependency graph explicit and testable.

**Scenario: App boots and all plugins are installed**

- GIVEN the browser loads the application
- WHEN `src/main.ts` executes
- THEN `createApp` is called with `App.vue`
- AND `createPinia()` is registered via `app.use()`
- AND the Vue Router instance is registered via `app.use()`
- AND the Vuetify instance is registered via `app.use()`
- AND `app.provide('supabase', …)` is called with a Supabase client
- AND `app.provide('storageService', …)` is called with an `IStorageService` implementation

**Scenario: App mounts to #app**

- GIVEN `index.html` contains `<div id="app"></div>`
- WHEN the application finishes booting
- THEN `App.vue` is mounted inside `#app`
- AND the DOM contains the rendered root component

---

#### REQ-SHELL-2: Root component

`src/App.vue` SHALL be a minimal root component containing a Vuetify `<v-app>`
wrapper and a `<router-view />` for rendering the current route.

**Rationale**: Vuetify requires `<v-app>` as the top-level wrapper for its
theme, layout, and SSR support. `<router-view />` is Vue Router's outlet for
lazy-loaded views.

**Scenario: App renders the current route inside v-app**

- GIVEN the application is booted and the router is installed
- WHEN the browser navigates to `/`
- THEN `<v-app>` is present in the DOM
- AND `<router-view />` is a child of `<v-app>`
- AND the `HomeView` component is rendered inside `<router-view />`

---

#### REQ-SHELL-3: Folder structure

The `src/` directory SHALL mirror `brief.md` §3.2 with the following
subdirectories: `components/ui`, `components/business`, `composables`,
`stores`, `services`, `views`, `types`, and `utils`.

**Rationale**: Convention established in the PRD. Every future slice adds files
to these directories. A consistent layout reduces cognitive load for the solo
developer.

**Scenario: All required directories exist**

- GIVEN the foundation has been implemented
- WHEN the developer inspects `src/`
- THEN the directory contains `components/ui/`, `components/business/`,
  `composables/`, `stores/`, `services/`, `views/`, `types/`, and `utils/`

**Scenario: No extra top-level directories exist**

- GIVEN the foundation has been implemented
- WHEN the developer inspects `src/`
- THEN there are no directories beyond those listed in `brief.md` §3.2
  (e.g., no `src/api/`, no `src/modules/`, no `src/pages/`)

---

### 3. UI Framework (Vuetify 3)

#### REQ-UI-1: Vuetify plugin installation

Vuetify 3 SHALL be installed via the `vite-plugin-vuetify` Vite plugin and
configured in `src/plugins/vuetify.ts` as a Vue plugin using `createVuetify`.

**Rationale**: `vite-plugin-vuetify` enables automatic component tree-shaking
and on-demand style injection, reducing bundle size.

**Scenario: Vuetify instance is created and registered**

- GIVEN `src/plugins/vuetify.ts` exports a Vuetify instance
- WHEN `src/main.ts` calls `app.use(vuetify)`
- THEN Vuetify components and directives are globally available
- AND Vuetify styles are injected into the page

**Scenario: @vitejs/plugin-vue is registered before vite-plugin-vuetify**

- GIVEN `vite.config.ts` defines the plugin array
- WHEN the developer inspects the plugin order
- THEN `@vitejs/plugin-vue` appears before `vite-plugin-vuetify` in the array
- AND `vite-plugin-vuetify@2.1.3`'s runtime check is satisfied (it throws at config resolution if the Vue plugin is not loaded first; discovered during PR1 verify)

---

#### REQ-UI-2: Light theme palette

The Vuetify theme configuration SHALL define a single `light` theme with the
exact color palette specified in `brief.md` §6.4: `primary #1976D2`, `secondary
#424242`, `accent #FF6B35`, `success #4CAF50`, `warning #FFC107`, `error
#F44336`, `background #FAFAFA`.

**Rationale**: Brand consistency. The palette is locked by the PRD and used by
every Vuetify component across every slice.

**Scenario: Theme colors are accessible in components**

- GIVEN the Vuetify theme is configured per `brief.md` §6.4
- WHEN a component uses `color="primary"` on a `v-btn`
- THEN the button background renders as `#1976D2`
- AND no dark theme colors are defined or accessible

**Scenario: Default theme is light**

- GIVEN the Vuetify instance is created
- WHEN the developer inspects `theme.defaultTheme`
- THEN the value is `'light'`
- AND `theme.themes` contains only the `light` key (no `dark` key)

---

#### REQ-UI-3: Vuetify component renders in HomeView

The HomeView SHALL render at least one Vuetify component (e.g., `v-btn`,
`v-card`, `v-container`) to prove the Vuetify integration works end-to-end.

**Rationale**: Vuetify tree-shaking can silently remove components if the plugin
is misconfigured. A visible Vuetify component in the default view catches this
immediately.

**Scenario: HomeView contains a rendered Vuetify component**

- GIVEN the app is loaded on `/`
- WHEN the developer inspects the DOM
- THEN at least one element with a `v-` class prefix (e.g., `v-container`,
  `v-card`) is present
- AND the element has Vuetify-computed styles applied

---

#### REQ-UI-4: No dark theme

The theme configuration SHALL NOT define a `dark` theme block. No theme toggle
component SHALL exist anywhere in the application.

**Rationale**: Preflight decision 5A overrides the brief's mention of "tema
oscuro/claro configurable." Light-only simplifies the foundation, avoids toggle
UI, and eliminates color-contrast testing for dark mode.

**Scenario: Dark theme is absent from the Vuetify config**

- GIVEN `src/plugins/vuetify.ts` is the sole Vuetify configuration file
- WHEN the developer searches for the string `dark`
- THEN no `dark` theme block exists in the `themes` object

**Scenario: No theme toggle exists in the application**

- GIVEN the full source tree under `src/`
- WHEN the developer searches for any component or composable referencing
  "toggle theme", "dark mode", or "cambiar tema"
- THEN zero results are found

---

### 4. State Management (Pinia)

#### REQ-STATE-1: Pinia registration

Pinia SHALL be installed as a dependency and registered in `src/main.ts` via
`app.use(createPinia())`.

**Rationale**: Pinia is the locked state management library (no Vuex).
Registration in `main.ts` makes the store available to every component via
`useStore()` without per-component setup.

**Scenario: Pinia is callable from a component**

- GIVEN `app.use(createPinia())` has been called in `main.ts`
- WHEN a component's `<script setup>` block calls `useAppStore()`
- THEN the store instance is returned without errors
- AND the store's state and actions are accessible

---

#### REQ-STATE-2: App store pattern proof

`src/stores/app.store.ts` SHALL exist as a setup-style Pinia store (Composition
API) with at least one `ref` state property and at least one action. It MUST use
the `defineStore` pattern with a string id (e.g., `'app'`).

**Rationale**: Proves the one-store-per-domain pattern established in
`brief.md` §4.1. Every future domain store follows this template.

**Scenario: App store exposes reactive state**

- GIVEN `app.store.ts` defines a store with `defineStore('app', () => { … })`
- WHEN a component calls `const app = useAppStore()`
- THEN `app.appName` returns a reactive string (e.g., `'Kilo-Lima'`)
- AND `app.setAppName('Nuevo')` is callable and updates `appName` reactively

**Scenario: Store is a singleton**

- GIVEN two separate components both call `useAppStore()`
- WHEN both components read `appName`
- THEN both read the same value
- AND calling `setAppName` from one component updates the value in the other

---

### 5. Backend Client (Supabase)

#### REQ-BE-1: Supabase client singleton

`@supabase/supabase-js` v2 SHALL be installed and `src/services/supabase.client.ts`
SHALL export a single Supabase client instance created via `createClient()`.

**Rationale**: A single client avoids multiple TCP connections and ensures
consistent auth state across the app.

**Scenario: Client is exported as a singleton**

- GIVEN `src/services/supabase.client.ts` exports `supabase`
- WHEN two different modules import `{ supabase } from '@/services/supabase.client'`
- THEN both receive the same object reference
- AND calling `supabase.from('table').select()` does not create a new connection

---

#### REQ-BE-2: Environment variable sourcing

The Supabase client SHALL read its configuration from `import.meta.env`:
`VITE_SUPABASE_URL` for the project URL and `VITE_SUPABASE_ANON_KEY` for the
anonymous API key.

**Rationale**: Vite exposes `VITE_`-prefixed env vars via `import.meta.env`.
`process.env` does NOT work in Vite. All Supabase configuration must come from
the environment, never be hardcoded.

**Scenario: Client uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY**

- GIVEN `.env.local` contains `VITE_SUPABASE_URL=https://xyz.supabase.co` and
  `VITE_SUPABASE_ANON_KEY=eyJhbG…`
- WHEN the Supabase client is created
- THEN `createClient` is called with `import.meta.env.VITE_SUPABASE_URL` as
  the first argument and `import.meta.env.VITE_SUPABASE_ANON_KEY` as the second

---

#### REQ-BE-3: Fail-fast env validation

`src/utils/env.ts` SHALL validate `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
at module import time using a Zod schema. Missing or invalid variables MUST throw
a descriptive error that includes the variable name.

**Rationale**: Delaying the error to the first Supabase call produces a cryptic
"Invalid URL" 10 seconds later with no context. Zod validation at boot gives an
immediate, clear error message.

**Scenario: Both env vars are valid — app proceeds**

- GIVEN `VITE_SUPABASE_URL` is a valid HTTPS URL and `VITE_SUPABASE_ANON_KEY`
  is a non-empty string
- WHEN `src/utils/env.ts` is imported
- THEN the module exports a typed `env` object
- AND no error is thrown

**Scenario: Missing VITE_SUPABASE_URL throws immediately**

- GIVEN `VITE_SUPABASE_URL` is undefined or empty
- WHEN `src/utils/env.ts` is imported at app boot
- THEN a `ZodError` is thrown
- AND the error message contains the string `VITE_SUPABASE_URL`

**Scenario: Invalid VITE_SUPABASE_URL (not a URL) throws immediately**

- GIVEN `VITE_SUPABASE_URL` is set to `"not-a-url"`
- WHEN `src/utils/env.ts` is imported
- THEN a `ZodError` is thrown
- AND the error message indicates the URL format is invalid

---

#### REQ-BE-4: ImportMetaEnv type declarations

`env.d.ts` (at the project root or under `src/types/`) SHALL declare the
`ImportMetaEnv` interface to include typed `VITE_SUPABASE_URL: string` and
`VITE_SUPABASE_ANON_KEY: string` properties.

**Rationale**: Without the declaration, TypeScript treats `import.meta.env.*`
as `any` or `unknown`, defeating the `strict: true` setting.

**Scenario: import.meta.env is typed**

- GIVEN `env.d.ts` declares `ImportMetaEnv` with the two Supabase vars
- WHEN a `.ts` file accesses `import.meta.env.VITE_SUPABASE_URL`
- THEN TypeScript infers the type as `string` (not `any`)
- AND the property autocompletes in the IDE

---

#### REQ-BE-5: Environment example file

`.env.example` SHALL document `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
with placeholder values so new developers know what variables are required.

**Rationale**: The `.env.local` file is gitignored. Without `.env.example`, a
new checkout has no clue what env vars to create.

**Scenario: .env.example exists with both vars**

- GIVEN the repository has been cloned fresh
- WHEN the developer opens `.env.example`
- THEN the file contains `VITE_SUPABASE_URL=` with a placeholder URL
- AND the file contains `VITE_SUPABASE_ANON_KEY=` with a placeholder key
- AND a comment explains the developer should copy to `.env.local` and fill in
  real values

---

### 6. Offline Skeleton

#### REQ-OFF-1: localforage instance

`localforage` SHALL be installed and `src/services/localforage.client.ts` SHALL
export a configured instance with `name: 'kilo-lima'`.

**Rationale**: localforage is the brief's locked IndexedDB abstraction. A
pre-configured instance avoids per-file configuration duplication.

**Scenario: localforage instance is configured**

- GIVEN `src/services/localforage.client.ts` is imported
- WHEN the instance is used to call `setItem('test', 'value')`
- THEN the data is stored in IndexedDB under the database name `kilo-lima`
- AND calling `getItem('test')` returns `'value'`

---

#### REQ-OFF-2: IStorageService interface

`src/services/storage.interface.ts` SHALL define an `IStorageService` interface
with Spanish-named methods: `guardar<T>(clave: string, datos: T): Promise<void>`
and `obtener<T>(clave: string): Promise<T | null>`.

**Rationale**: Implements the Liskov Substitution Principle per `brief.md`
§4.3. The Spanish method names align with the business-language convention.
Concrete implementations (localforage, Supabase, in-memory mock) can be swapped
without changing consumers.

**Scenario: Interface compiles and can be implemented**

- GIVEN `IStorageService` is imported in a TypeScript file
- WHEN a class declares `implements IStorageService`
- THEN TypeScript requires `guardar` and `obtener` methods
- AND the generic type parameter `<T>` is preserved

---

#### REQ-OFF-3: LocalforageStorageService implementation

`src/services/storage.service.ts` SHALL export `LocalforageStorageService`, a
class that `implements IStorageService` using the localforage instance from
`localforage.client.ts`.

**Rationale**: Provides a concrete implementation so consumers can call
`guardar`/`obtener` without knowing the storage backend. The foundation uses
localforage; a future slice may introduce a Supabase-backed implementation.

**Scenario: guardar stores and obtener retrieves data**

- GIVEN `LocalforageStorageService` is instantiated
- WHEN `guardar('clave-ejemplo', { nombre: 'Test' })` is called and awaited
- THEN `obtener('clave-ejemplo')` resolves to `{ nombre: 'Test' }`

**Scenario: obtener returns null for unknown keys**

- GIVEN no data has been stored under `'inexistente'`
- WHEN `obtener('inexistente')` is called and awaited
- THEN the result is `null`

---

#### REQ-OFF-4: Offline-sync architecture documented

The recommended offline-sync architecture (optimistic UI + localforage WAL +
Pinia sync queue + Background Sync API) SHALL be documented, either in a
`docs/offline-sync.md` file or as a header comment in `storage.service.ts`. The
architecture SHALL NOT be implemented in foundation.

**Rationale**: The foundation installs the sync primitives but defers
implementation to the `offline-sync` slice per preflight decision. Documentation
ensures the deferred team (future self) understands the architecture intent.

**Scenario: Architecture description exists**

- GIVEN the foundation has been implemented
- WHEN the developer searches for documentation referencing "optimistic UI",
  "write-ahead log", or "Background Sync API"
- THEN the documentation is found either in `docs/offline-sync.md` or as a
  JSDoc/header comment in `src/services/storage.service.ts`

**Scenario: No sync queue code exists**

- GIVEN the foundation has been implemented
- WHEN the developer searches for `sync.queue.store.ts`, `sync.service.ts`, or
  `useSyncStatus`
- THEN no such files exist in `src/`

---

### 7. Auth Scaffold

#### REQ-AUTH-1: Supabase Auth namespace available

The Supabase client instance SHALL include the Auth namespace. The Supabase JS
v2 client includes it by default; the foundation documents this and verifies the
client can reference `supabase.auth`.

**Rationale**: Future slices (`auth-flow`) consume `supabase.auth` directly.
The foundation must confirm the namespace is present so consumers don't hit
surprise `undefined` errors.

**Scenario: supabase.auth is accessible**

- GIVEN the Supabase client singleton is imported
- WHEN `supabase.auth` is accessed
- THEN the value is an object (not `undefined` or `null`)
- AND calling `supabase.auth.getSession()` does not throw a "not a function"
  error (it may return a null session, which is expected)

---

#### REQ-AUTH-2: useAuth stub composable

`src/composables/useAuth.ts` SHALL export a STUB composable. Every exported
method (`iniciarSesion`, `cerrarSesion`, `obtenerUsuarioActual`, `registrar`,
and any other auth-related method) SHALL throw an `Error` with a clear Spanish
message indicating the auth flow is not implemented and ships in a later slice.

**Rationale**: Preflight decision: "Auth prepared, not functional." The stub
lets components wire to the composable's API without breaking when the real
implementation lands. Throwing prevents accidental production use.

**Scenario: Calling any auth method throws**

- GIVEN `useAuth()` is called in a component
- WHEN `iniciarSesion({ email, password })` is invoked
- THEN a synchronous or asynchronous error is thrown
- AND the error message is in Spanish and contains the word "implementado"
  (not implemented)

**Scenario: All auth methods are stubs**

- GIVEN the `useAuth` composable is imported
- WHEN the developer inspects its exports
- THEN no method initiates a network request to Supabase
- AND every exported method follows the throw-on-call pattern

---

#### REQ-AUTH-3: Reactive refs in the stub

The `useAuth()` stub SHALL return reactive refs (`Ref<User | null>`, `Ref<boolean>`)
for auth state (e.g., `usuarioActual`, `cargando`) initialized to `null` and
`false` respectively, so consumers can bind to them reactively without API
changes when the real implementation lands.

**Rationale**: Components that bind to `usuarioActual` in templates should not
break when the stub is replaced. Returning properly typed `Ref` values ensures
template bindings compile and render correctly.

**Scenario: usuarioActual ref is null by default**

- GIVEN `useAuth()` is called
- WHEN the return value is destructured: `const { usuarioActual } = useAuth()`
- THEN `usuarioActual.value` is `null`
- AND `usuarioActual` is typed as `Ref<User | null>`

**Scenario: cargando ref is false by default**

- GIVEN `useAuth()` is called
- WHEN the return value is destructured: `const { cargando } = useAuth()`
- THEN `cargando.value` is `false`

---

#### REQ-AUTH-4: No login UI

The foundation SHALL NOT contain any login UI, sign-up UI, or password recovery
UI. The HomeView SHALL NOT import or call any auth method.

**Rationale**: Preflight decision. Auth UI ships in the `auth-flow` slice. The
foundation's job is the scaffold, not the feature.

**Scenario: HomeView does not call useAuth**

- GIVEN `src/views/HomeView.vue` is the only view in the foundation
- WHEN the developer searches the file for `useAuth`, `iniciarSesion`,
  `cerrarSesion`, or `registrar`
- THEN no matches are found

**Scenario: No auth-related components exist**

- GIVEN the full source tree under `src/`
- WHEN the developer searches for files named `Login`, `SignUp`,
  `PasswordReset`, or `Auth`
- THEN no such `.vue` files exist

---

### 8. PWA Skeleton

#### REQ-PWA-1: vite-plugin-pwa registration

`vite-plugin-pwa` SHALL be registered in `vite.config.ts` with a `VitePWA`
configuration block containing: `registerType: 'autoUpdate'`, a `manifest` with
`name: 'Kilo-Lima'`, `short_name: 'KiloLima'`, `theme_color: '#1976D2'`,
`background_color: '#FAFAFA'`, `display: 'standalone'`, and `icons` array
containing 192×192, 512×512, and maskable 512×512 icon entries.

**Rationale**: Required for the app to be installable as a PWA and for the
service worker to enable offline caching. `autoUpdate` applies new SW versions
on the next page load without a user prompt.

**Scenario: VitePWA plugin is in the Vite config**

- GIVEN `vite.config.ts` is inspected
- WHEN the developer reads the plugins array
- THEN `VitePWA({ … })` is present
- AND the config includes `registerType: 'autoUpdate'`

**Scenario: Manifest contains required fields**

- GIVEN the VitePWA config is in place
- WHEN the developer runs `pnpm build`
- THEN `dist/manifest.webmanifest` contains `"name": "Kilo-Lima"`,
  `"short_name": "KiloLima"`, `"theme_color": "#1976D2"`,
  `"display": "standalone"`, and an `icons` array

---

#### REQ-PWA-2: PWA icon assets

Placeholder PWA icons SHALL exist at `public/icons/icon-192.png`,
`public/icons/icon-512.png`, and `public/icons/maskable-512.png`.

**Rationale**: The manifest references these paths. Missing icons cause the
install prompt to fail silently. Placeholders are acceptable for foundation;
real branding icons ship later.

**Scenario: All three icon files exist**

- GIVEN the foundation has been implemented
- WHEN the developer lists `public/icons/`
- THEN `icon-192.png`, `icon-512.png`, and `maskable-512.png` are present

---

#### REQ-PWA-3: Service worker generation

The PWA build SHALL generate a service worker using the default `generateSW`
strategy provided by `vite-plugin-pwa`.

**Rationale**: `generateSW` provides precaching and runtime caching with zero
configuration for the SW itself — sufficient for the foundation's caching needs.
A custom SW (`injectManifest`) is deferred to the `offline-sync` slice.

**Scenario: Service worker is produced at build time**

- GIVEN `pnpm build` succeeds
- WHEN the developer inspects `dist/`
- THEN a service worker file (e.g., `sw.js` or `workbox-*.js`) exists
- AND the file contains precache manifest entries for the app shell

---

#### REQ-PWA-4: usePwaUpdate composable

`src/composables/usePwaUpdate.ts` SHALL wrap `virtual:pwa-register/vue` and
expose `{ needRefresh: Ref<boolean>, updateServiceWorker: (reloadPage?: boolean) => Promise<void> }`.

**Rationale**: Encapsulates the PWA update lifecycle behind a single composable
so that a future UX improvement (install-prompt banner, update toast) only
touches one file. The `virtual:pwa-register/vue` import MUST NOT leak into
other modules.

**Scenario: needRefresh is false on initial load**

- GIVEN the composable is called in a component
- WHEN the app loads for the first time (no waiting SW)
- THEN `needRefresh.value` is `false`

**Scenario: updateServiceWorker is callable**

- GIVEN the composable is called
- WHEN `updateServiceWorker()` is invoked
- THEN it returns a `Promise<void>` without throwing
- AND the call dispatches the SW `skipWaiting` message (underlying behavior)

---

#### REQ-PWA-5: useOnlineStatus composable

`src/composables/useOnlineStatus.ts` SHALL return `{ online: Ref<boolean> }`
derived from `navigator.onLine` at call time and kept in sync by listening to
`online` and `offline` window events.

**Rationale**: The offline-sync slice depends on knowing whether the app is
online. Shipping the composable in foundation avoids API drift when the sync
slice lands.

**Scenario: online reflects navigator.onLine on mount**

- GIVEN the browser is online (`navigator.onLine === true`)
- WHEN `useOnlineStatus()` is called
- THEN `online.value` is `true`

**Scenario: online toggles when the browser goes offline**

- GIVEN `useOnlineStatus()` has been called and `online.value` is `true`
- WHEN the browser fires the `offline` event (e.g., airplane mode)
- THEN `online.value` becomes `false`
- AND the composable continues to listen (no teardown needed)

**Scenario: online recovers when connectivity returns**

- GIVEN `useOnlineStatus()` reports `online.value === false`
- WHEN the browser fires the `online` event
- THEN `online.value` becomes `true`

---

### 9. Routing

#### REQ-ROUTE-1: Vue Router installation

Vue Router 4 SHALL be installed and configured with `createWebHistory(import.meta.env.BASE_URL)`.

**Rationale**: `createWebHistory` provides clean URLs (`/`, `/catalogo`)
without hash fragments. `import.meta.env.BASE_URL` respects the Vite `base`
config, important for Cloudflare Pages deployment.

**Scenario: Router uses web history mode**

- GIVEN the router is created
- WHEN the app navigates to `/`
- THEN the URL in the browser address bar is `/` (no `#/` fragment)

---

#### REQ-ROUTE-2: Single lazy-loaded home route

The router SHALL define EXACTLY ONE route: `/` rendering
`src/views/HomeView.vue` using the lazy-load pattern
`component: () => import('@/views/HomeView.vue')`.

**Rationale**: Lazy loading reduces initial bundle size and establishes the
pattern every future slice must follow for its routes.

**Scenario: Navigating to / renders HomeView**

- GIVEN the app is loaded
- WHEN the browser navigates to `/`
- THEN the `HomeView` component is rendered
- AND the `<h1>` text "Kilo-Lima" is visible in the DOM

**Scenario: HomeView is lazy-loaded**

- GIVEN the route definition for `/`
- WHEN the developer inspects the route config
- THEN the `component` property uses the dynamic `() => import(…)` syntax
- AND the `HomeView.vue` chunk is NOT in the initial JS bundle (verifiable
  via build analysis)

---

#### REQ-ROUTE-3: Unmatched route handling

An unmatched route SHALL either redirect to `/` or render a minimal not-found
view. The behavior MUST NOT produce a blank page or a console error.

**Rationale**: Typing a wrong URL in the address bar should not crash the app.
A graceful fallback is a minimum-viable UX requirement.

**Scenario: Unknown path redirects or shows a not-found view**

- GIVEN the app is loaded
- WHEN the browser navigates to `/ruta-inexistente`
- THEN the browser does NOT show a blank page
- AND either the URL redirects to `/`, or a message like "Página no encontrada"
  is displayed in Spanish

---

### 10. Home View

#### REQ-HOME-1: App title heading

`src/views/HomeView.vue` SHALL render an `<h1>` element containing the text
"Kilo-Lima".

**Rationale**: Immediate visual confirmation that the app booted, Vue compiled,
and the router rendered the correct view. The smoke test asserts this.

**Scenario: h1 renders the app name**

- GIVEN the app is loaded on `/`
- WHEN the DOM is inspected
- THEN an `<h1>` element exists
- AND its `textContent` is `"Kilo-Lima"`

---

#### REQ-HOME-2: Business phase subtitle

The HomeView SHALL render a subtitle that reflects the three business phases:
"Pre-evento · Durante evento · Post-evento" in Spanish.

**Rationale**: The PRD's UX philosophy is "El usuario comprende el flujo del
negocio." The three phases are the central mental model for every feature.

**Scenario: Subtitle shows the three phases**

- GIVEN the app is loaded on `/`
- WHEN the DOM is inspected
- THEN an element contains the text "Pre-evento"
- AND the same or a sibling element contains "Durante evento"
- AND the same or a sibling element contains "Post-evento"

---

#### REQ-HOME-3: PWA status card

The HomeView SHALL render a card (using Vuetify `v-card` or equivalent) that
displays the current online state from `useOnlineStatus()`. The card SHALL show
"En línea" when online and "Sin conexión" when offline.

**Rationale**: Offline awareness is critical for a PWA used at fairs. The user
must always know whether their sales data has synced.

**Scenario: Card shows online status when connected**

- GIVEN the browser is online
- WHEN the HomeView renders
- THEN a card or element displays "En línea"
- AND the indicator uses Vuetify's `success` color or equivalent green styling

**Scenario: Card shows offline status when disconnected**

- GIVEN the browser goes offline (the `offline` event fires)
- WHEN the HomeView re-renders reactively
- THEN the card or element displays "Sin conexión"
- AND the styling changes to reflect the offline state (e.g., `warning` or
  `error` color)

---

#### REQ-HOME-4: Store value display

The HomeView SHALL read a value from `useAppStore()` (e.g., `appName`) and
display it in the rendered output, proving the Pinia store pattern works
end-to-end.

**Rationale**: End-to-end proof that Pinia is wired correctly. If the store
value renders, the entire `main.ts → plugin → store → component → template`
chain is verified.

**Scenario: Store appName is visible in the rendered view**

- GIVEN `app.store.ts` stores `appName: 'Kilo-Lima'`
- WHEN the HomeView renders
- THEN the string `'Kilo-Lima'` appears in the rendered HTML
- AND the value originates from a `useAppStore()` call (verifiable by changing
  it and observing the re-render)

---

#### REQ-HOME-5: Composition API + line limit

`HomeView.vue` SHALL use Composition API with `<script setup>` and SHALL be
≤ 200 lines.

**Rationale**: `brief.md` §3.2 locks Composition API + `<script setup>` and the
200-line per-file budget. The first view sets the pattern every future view must
follow.

**Scenario: HomeView uses <script setup>**

- GIVEN `src/views/HomeView.vue` is opened
- WHEN the developer reads the file
- THEN the script block uses `<script setup lang="ts">`
- AND no `export default` or Options API is present

**Scenario: HomeView is at most 200 lines**

- GIVEN `src/views/HomeView.vue` is the complete file
- WHEN the developer runs `wc -l src/views/HomeView.vue`
- THEN the line count is ≤ 200

---

### 11. Testing

#### REQ-TEST-1: Vitest configuration

Vitest SHALL be installed and `vitest.config.ts` SHALL extend `vite.config.ts`
with a `test` block specifying `environment: 'jsdom'`.

**Rationale**: `jsdom` provides a DOM environment for component tests. Extending
`vite.config.ts` ensures Vitest resolves aliases, plugins, and env vars
identically to the dev/build pipeline.

**Scenario: vitest.config.ts extends vite.config.ts**

- GIVEN `vitest.config.ts` exists
- WHEN the developer inspects the file
- THEN it imports and merges from `vite.config.ts` (e.g., via
  `defineConfig`, `mergeConfig`, or spreading)
- AND the `test.environment` field is `'jsdom'`

---

#### REQ-TEST-2: @vue/test-utils installation

`@vue/test-utils` SHALL be installed as a dev dependency with a version
compatible with Vue 3.5.

**Rationale**: Required for mounting Vue components in tests. No native DOM API
can simulate Vue's reactivity and component lifecycle.

**Scenario: mount is importable**

- GIVEN `@vue/test-utils` is installed
- WHEN a test file imports `{ mount } from '@vue/test-utils'`
- THEN the import resolves without errors

---

#### REQ-TEST-3: Test setup file

`tests/setup.ts` SHALL mock `window.matchMedia` (required by Vuetify for
breakpoint detection) and stub `localforage` with an in-memory map so
component tests do not touch IndexedDB.

**Rationale**: Vuetify components call `window.matchMedia` during mount.
Without a mock, every test that mounts a Vuetify component crashes in jsdom.
localforage stubbing prevents test pollution from IndexedDB state.

**Scenario: matchMedia mock is registered**

- GIVEN `tests/setup.ts` is loaded by Vitest (via `setupFiles` in
  `vitest.config.ts`)
- WHEN a test mounts a component that uses Vuetify's `v-container`
- THEN no `matchMedia is not a function` error is thrown

**Scenario: localforage is stubbed**

- GIVEN `tests/setup.ts` has replaced localforage with an in-memory mock
- WHEN a service test calls `localforage.setItem('key', 'val')`
- THEN the call succeeds without accessing IndexedDB
- AND `localforage.getItem('key')` returns `'val'` within the same test
- AND the stored value is isolated per test (no cross-test leakage)

---

#### REQ-TEST-4: HomeView smoke test

`src/views/HomeView.spec.ts` SHALL exist and contain at least one test that:
(1) mounts `HomeView` with a Pinia instance provided, (2) asserts the `<h1>`
text contains "Kilo-Lima", (3) asserts the subtitle contains "Pre-evento",
(4) asserts the store's `appName` value is visible in the rendered output, and
(5) asserts online status text ("En línea" or "Sin conexión") is present.

**Rationale**: The single smoke test proves the entire architecture works:
Vue + Vuetify + Pinia + jsdom + test utils. If it passes, the stack is
validated.

**Scenario: Smoke test passes all assertions**

- GIVEN `pnpm test` is run
- WHEN `HomeView.spec.ts` executes
- THEN `expect(wrapper.text()).toContain('Kilo-Lima')` passes
- AND `expect(wrapper.text()).toContain('Pre-evento')` passes
- AND the store's `appName` value is asserted visible in the wrapper
- AND the online status text is asserted present

---

#### REQ-TEST-5: pnpm test exits 0

`pnpm test` SHALL execute the smoke test and exit with code 0 when at least one
test passes and zero tests fail.

**Rationale**: This is the gate that flips `strict_tdd` from `false` to `true`
in `openspec/config.yaml`. Without a passing test command, the project cannot
enter TDD mode for future slices.

**Scenario: pnpm test exits cleanly**

- GIVEN all tests pass
- WHEN the developer runs `pnpm test`
- THEN the process exits with code 0
- AND the output includes "Tests 1 passed" (or equivalent)

---

### 12. Conventions & Quality Gates

#### REQ-CONV-1: .vue file line budget

All `.vue` files created in the foundation SHALL be ≤ 200 lines.

**Rationale**: Per `brief.md` §3.2. Enforced by review, not by tooling in
foundation.

**Scenario: Each .vue file is within the budget**

- GIVEN all `.vue` files in `src/`
- WHEN the developer counts lines per file
- THEN every `.vue` file has ≤ 200 lines

---

#### REQ-CONV-2: Function line budget

All functions defined in the foundation (in `.vue` `<script setup>` blocks and
standalone `.ts` files) SHALL be ≤ 30 lines.

**Rationale**: Per `brief.md` §3.2 rule 1. Forces single-responsibility
functions and prevents monolithic logic blocks.

**Scenario: Each function is within the budget**

- GIVEN all functions in the foundation source code
- WHEN the developer counts lines per function body
- THEN every function body (signature to closing brace) is ≤ 30 lines

---

#### REQ-CONV-3: No forbidden dependencies or patterns

The foundation SHALL NOT contain: Options API, Vuex, Axios, Bootstrap, custom
Tailwind (outside Vuetify), jQuery, Moment.js, or `process.env`.

**Rationale**: `brief.md` §5.1 explicitly bans these. Each has a locked
alternative (Composition API, Pinia, supabase-js / fetch, Vuetify, Vite
`import.meta.env`).

**Scenario: No banned imports or patterns exist**

- GIVEN the full source tree
- WHEN the developer searches for banned patterns:
  - `import axios` → zero results
  - `import Vuex` → zero results
  - `export default {` in `.vue` files → zero results (Options API)
  - `process.env` → zero results
  - `jquery` or `$(` → zero results
  - `moment` → zero results
  - `bootstrap` → zero results

---

#### REQ-CONV-4: Spanish UI strings

All user-visible strings in the foundation SHALL be in Spanish.

**Rationale**: The app's target user is a Spanish-speaking fair vendor. UI
text in English would break the "lenguaje del feriante" UX principle.

**Scenario: No English UI text**

- GIVEN the rendered HomeView
- WHEN the developer inspects the visible text
- THEN all text is in Spanish (e.g., "En línea", "Sin conexión",
  "Pre-evento · Durante evento · Post-evento")
- AND no English UI labels exist (e.g., no "Online", no "Offline", no "Home")

---

#### REQ-CONV-5: Spanish business identifiers, English infrastructure

Business identifiers (composable names, store names, type names for domain
concepts) SHALL be in Spanish. Infrastructure identifiers (service files, build
config, env vars, npm scripts, tooling config) SHALL be in English.

**Rationale**: Separation of concerns at the naming level. Business logic
names match the user's mental model (`iniciarSesion`, `guardar`). Infrastructure
names match the broader JS ecosystem (`supabase.client.ts`, `VITE_SUPABASE_URL`).

**Scenario: Composable exports have Spanish names**

- GIVEN `src/composables/`
- WHEN the developer inspects exports
- THEN `useAuth` exports methods named `iniciarSesion`, `cerrarSesion`,
  `obtenerUsuarioActual`, and `registrar` (Spanish)
- AND `useOnlineStatus` exports `online` (the `Ref` name may be English — it is
  a technical primitive, not a domain concept)

**Scenario: Store state properties have Spanish names**

- GIVEN `src/stores/app.store.ts`
- WHEN the developer inspects the store's state
- THEN domain state fields (e.g., `appName`, or a future `nombreEvento`) use
  Spanish descriptors

**Scenario: Infrastructure files use English names**

- GIVEN `src/services/`
- WHEN the developer lists files
- THEN filenames use English: `supabase.client.ts`, `localforage.client.ts`,
  `storage.interface.ts`, `storage.service.ts`

---

#### REQ-CONV-6: "Why" comments only

Code comments in the foundation SHALL explain the "why" of a decision, never the
"what" of the code. Comments that merely restate what the code does (e.g.,
"// Sumamos los costos" above `return a + b`) SHALL NOT be present.

**Rationale**: `brief.md` §3.2 rule 4. Comments that describe "what" rot
immediately because the code drifts from the comment. "Why" comments capture
intent and business rules that are invisible from the code alone.

**Scenario: No "what" comments exist**

- GIVEN all source files in the foundation
- WHEN the developer reviews comments
- THEN no comment describes a trivial operation (e.g., "// creates a new array")
- AND every comment that exists justifies a non-obvious choice (e.g.,
  "// Redondeamos hacia arriba para cubrir mermas de producción")

**Scenario: "Why" comments are present where needed**

- GIVEN the Zod env validation in `src/utils/env.ts`
- WHEN the developer reads the file
- THEN a comment explains WHY the app fails fast at module import rather than
  silently falling back (rationale: "Zod validation at boot gives an immediate,
  clear error message")

---

#### REQ-CONV-7: README quickstart

`README.md` SHALL document: prerequisites (Node 22+, pnpm 9+), `pnpm install`,
`.env.local` setup (copy from `.env.example` and fill in Supabase values),
`pnpm dev`, `pnpm build`, `pnpm preview`, `pnpm test`, `pnpm lint`, `pnpm
format`, and `pnpm typecheck`.

**Rationale**: Without a quickstart, a fresh checkout on a new machine is
blocked. The README is the first file a developer (including the solo user 6
months later) reads.

**Scenario: README includes all required sections**

- GIVEN `README.md` in the repository root
- WHEN the developer reads the file
- THEN the document lists Node 22+ and pnpm 9+ as prerequisites
- AND the document includes the exact commands: `pnpm install`, `cp .env.example .env.local`, `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm format`, and `pnpm typecheck`

**Scenario: README is in English (infrastructure)**

- GIVEN `README.md`
- WHEN the developer reads the file
- THEN the technical instructions are in English (infrastructure artifact)
- AND no Spanish technical instructions exist (unless the project explicitly
  grows a `LEEME.md` for non-technical onboarding, which is out of scope)

---

## Key Learnings

- This spec is a NEW (greenfield) artifact — no existing specs to delta against.
  All 12 capability sections are ADDED Requirements.
- The 400-line review budget constraint (proposal §12, risk 7) means the apply
  phase must split this spec's 54 requirements across 4 chained PRs. This spec
  is intentionally PR-AGNOSTIC so sdd-tasks can assign requirements to PRs
  independently.
- Future slices (auth-flow, catalog, offline-sync, etc.) will write DELTA specs
  against these capabilities as they add, modify, or extend foundation
  requirements.
- The `IStorageService` LSP contract and `useAuth()` stub are the two most
  important API surfaces — every future slice depends on their stability.
