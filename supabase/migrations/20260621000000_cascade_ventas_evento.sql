-- cascade_ventas_evento.sql
-- Flip the ventas.evento_id foreign key from ON DELETE RESTRICT to
-- ON DELETE CASCADE so deleting an evento atomically cascades to
-- ventas → venta_items. Every other FK to public.eventos(id) already
-- cascades (gastos_fijos, plan_produccion, gastos_imprevistos,
-- cierres_caja, evento_productos). This migration completes the
-- chain.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS lets the script run safely on
-- a DB that already has the CASCADE constraint in place (e.g., after
-- `supabase db reset` followed by a re-apply). Re-runnable.
--
-- Per REQ-EVENTS-39. Run from Supabase Dashboard SQL Editor or
-- `supabase db push`.

alter table public.ventas
  drop constraint if exists ventas_evento_id_fkey;

alter table public.ventas
  add constraint ventas_evento_id_fkey
  foreign key (evento_id) references public.eventos(id)
  on delete cascade;