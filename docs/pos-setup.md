# POS — One-time Supabase setup

The POS slice needs five Supabase tables (`productos`, `ventas`,
`venta_items`, `gastos_imprevistos`, `cierres_caja`) with permissive
RLS for the anon role while auth is not yet wired. Run the two SQL
files below **in order** from the Supabase Dashboard SQL Editor. No
`supabase` CLI required.

## Steps

1. **Open the Supabase Dashboard** → your project → **SQL Editor** →
   **New query**.
2. **Paste and run** the contents of
   `supabase/migrations/20260619000000_pos_inicial.sql`. This creates
   the five tables, indexes, FKs (RESTRICT on `productos.receta_id`
   and `ventas.evento_id`; CASCADE on `venta_items.venta_id`,
   `gastos_imprevistos.evento_id`, and `cierres_caja.evento_id`),
   CHECK constraints (`precio_venta > 0`, `cantidad > 0`,
   `monto > 0`, motivo `length > 0 AND <= 500`, the 4-value
   `metodo_pago` enum, the 5-value `categoria` enum on
   `gastos_imprevistos`), UNIQUE constraints
   (`productos.receta_id` and `cierres_caja.evento_id`), the
   `updated_at` trigger on `productos` (reuses the function from
   catalog), and 10 RLS policies (select + write for authenticated on
   each table). Idempotent — safe to re-run.
3. **(Dev only) Paste and run** the contents of
   `supabase/dev_bypass_rls.sql`. The file is now extended with five
   `GRANT SELECT, INSERT, UPDATE, DELETE` lines for `productos`,
   `ventas`, `venta_items`, `gastos_imprevistos`, and `cierres_caja`
   to the `anon` role, on top of the existing catalog + events grants.
   The PWA can read and write without Supabase Auth. **This file is
   dev-only and is removed by the `auth-flow` slice once real
   authentication ships.**

After both queries succeed, restart `pnpm dev`. PR1 ships the schema,
types, `calcularCierre` helper, cart state in `ventas.store`, and
`useCierreCaja` composable. The PR2 (Productos CRUD), PR3 (POS view
+ components), PR4 (Cierres + Imprevistos), and PR5 (Router) PRs
land the user-facing routes that consume this schema.

## Verify

To confirm tables were created, run `select * from public.productos;`
in the SQL Editor — it should return `0 rows` with no errors. Repeat
for `ventas`, `venta_items`, `gastos_imprevistos`, and `cierres_caja`.

## Known caveat (documented)

The cart lives in `ventas.store` (Pinia in-memory) and does **not**
persist across browser refresh. The `offline-sync` slice (Phase 5,
brief item 20) will add a WAL through the `// TODO(offline-sync):`
marker in `ventas.store`. Until that ships, refreshing the page
during a sale empties the cart — finish or abandon the sale before
refreshing.
