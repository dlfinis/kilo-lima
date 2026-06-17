# Catalog — One-time Supabase setup

The catalog slice needs three Supabase tables (`materias_primas`, `recetas`,
`receta_ingredientes`) with permissive RLS for the anon role while auth is
not yet wired. Run the three SQL files below **in order** from the Supabase
Dashboard SQL Editor. No `supabase` CLI required.

## Steps

1. **Open the Supabase Dashboard** → your project → **SQL Editor** → **New query**.
2. **Paste and run** the contents of `supabase/migrations/20260616120000_catalog_inicial.sql`.
   This creates the three tables, indexes, RLS policies, and the `updated_at`
   trigger. Idempotent — safe to re-run.
3. **Paste and run** the contents of `supabase/seed.sql`.
   Inserts 5 demo `materias_primas`, 2 `recetas`, and 5 `receta_ingredientes`.
   Idempotent (`ON CONFLICT DO NOTHING`) — safe to re-run.
4. **(Dev only) Paste and run** the contents of `supabase/dev_bypass_rls.sql`.
   Grants the `anon` role table access so the PWA can read and write without
   Supabase Auth. **This file is dev-only and is removed by the `auth-flow`
   slice once real authentication ships.**

After all three queries succeed, restart `pnpm dev`. The app will load data
through the anon key.
