# kilo-lima

Personal PWA for managing production costs and sales at street fairs
(recipes, events, point-of-sale, reports). Single-user, USD, deployable
to Cloudflare Pages. Built with Vue 3 + Vite + Vuetify 3 + Pinia + Supabase.

---

## 1. Prerequisites

- **Node.js 22+** (Cloudflare Pages build env)
- **pnpm 9+** (locked package manager — do not use npm or yarn)
- A Supabase project (free tier) for backend, auth, and storage

Check your versions:

```bash
node --version    # expect v22.x or higher
pnpm --version    # expect 9.x or higher
```

## 2. Install

```bash
pnpm install
```

This generates `pnpm-lock.yaml`. Commit the lockfile alongside any
`package.json` change so the dep tree stays reproducible.

## 3. Environment

The app reads two variables at boot and validates them with Zod
(see `src/utils/env.ts`, added in PR2). If either is missing, the
app fails immediately with a clear error.

```bash
cp .env.example .env.local
```

Then edit `.env.local` and fill in your real Supabase project values:

- `VITE_SUPABASE_URL` — your project URL, e.g. `https://abc.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — the public anon key from Supabase settings

`.env.local` is gitignored. Never commit secrets.

## 4. Develop

```bash
pnpm dev
```

Opens a Vite dev server (default `http://localhost:5173`) with HMR.
The PWA service worker is registered automatically via
`vite-plugin-pwa` (added in PR4).

## 5. Build

```bash
pnpm build
```

Type-checks the project and emits a production bundle in `dist/`.
The output is a static SPA ready for any CDN (Cloudflare Pages, Netlify,
Vercel static, S3+CloudFront, etc.).

## 6. Preview

```bash
pnpm preview
```

Serves the production build from `dist/` locally. Use this to verify
the deployed artifact behaves the same as `pnpm dev`.

## 7. Test

```bash
pnpm test
```

Runs Vitest in jsdom mode with the setup file at `tests/setup.ts`.
PR4 adds the first real smoke test; the foundation ships only the
test runner and config.

## 8. Lint

```bash
pnpm lint           # check for issues
pnpm format         # auto-format with Prettier
```

ESLint 9 flat config + Prettier 3 + typescript-eslint.
`pnpm lint` covers `**/*.{js,ts,vue}` excluding `dist/` and `node_modules/`.

## 9. Type-check

```bash
pnpm typecheck
```

Runs `vue-tsc --noEmit` against `tsconfig.app.json`. The CI gate fails
the build on any TypeScript error.

## 10. Deploy

The `dist/` directory is fully static. To deploy to Cloudflare Pages:

1. Connect this repo in the Cloudflare dashboard.
2. Build command: `pnpm build`
3. Build output: `dist`
4. Add the two env vars from step 3 in the Pages project settings.

## Project layout

```
src/
├── components/
│   ├── ui/          # Reusable presentational components
│   └── business/    # Domain components
├── composables/     # useNombre.ts — reusable logic
├── stores/          # *.store.ts — Pinia stores
├── services/        # Supabase + localforage wrappers
├── views/           # Page-level components
├── types/           # TypeScript interfaces
└── utils/           # Pure helpers
```

## Conventions

- **Vue 3** with `<script setup lang="ts">` and Composition API (no Options API)
- **TypeScript strict** mode
- **One Pinia store per domain** — `ingredients`, `recipes`, `events`, `pos`, `reports`
- **`.vue` files ≤ 200 lines**, **functions ≤ 30 lines**
- **Comments explain WHY, never WHAT**
- **Spanish** for business identifiers and UI strings
- **English** for infrastructure files (`*.config.ts`, `env.d.ts`, this README)

See `brief.md` for the full design rationale and `openspec/changes/foundation/`
for the SDD artifacts that produced this foundation.
