# Events — One-time Supabase setup

The events slice needs three Supabase tables (`eventos`, `gastos_fijos`,
`plan_produccion`) with permissive RLS for the anon role while auth is
not yet wired. Run the two SQL files below **in order** from the
Supabase Dashboard SQL Editor. No `supabase` CLI required.

## Steps

1. **Open the Supabase Dashboard** → your project → **SQL Editor** →
   **New query**.
2. **Paste and run** the contents of
   `supabase/migrations/20260618000000_events_inicial.sql`. This creates
   the three tables, indexes, FKs (CASCADE on `gastos_fijos` /
   `plan_produccion` to `eventos`, RESTRICT on `plan_produccion.receta_id`),
   CHECK constraints (estado enum, categoria enum, monto ≥ 0, unidades
   > 0, nombre length > 0), the `updated_at` trigger (reuses the
   function from catalog), UNIQUE(`evento_id`, `receta_id`) on
   `plan_produccion`, and RLS policies (select + write for
   authenticated on each table). Idempotent — safe to re-run.
3. **(Dev only) Paste and run** the contents of
   `supabase/dev_bypass_rls.sql`. The file is now extended with three
   `GRANT SELECT, INSERT, UPDATE, DELETE` lines for `eventos`,
   `gastos_fijos`, and `plan_produccion` to the `anon` role, plus the
   original three catalog grants. The PWA can read and write without
   Supabase Auth. **This file is dev-only and is removed by the
   `auth-flow` slice once real authentication ships.**

After both queries succeed, restart `pnpm dev`. The Eventos list page
will load data through the anon key.
