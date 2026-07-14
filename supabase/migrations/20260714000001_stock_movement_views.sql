-- ============================================================================
-- stock_movement_views.sql
-- ============================================================================
-- inventory-accounting-workflow-refactor / Phase 2: derived-stock view,
-- cache-sync function, and idempotent opening-balance backfill.
--
-- v_stock_actual is the authoritative derived stock for every materia_prima —
-- it sums all stock_movements rows grouped by material. The view replaces
-- direct reads of materias_primas.cantidad_disponible for trusted inventory
-- state.
--
-- sync_stock_cache() copies the derived stock into the cantidad_disponible
-- cache column so legacy code (ingredients service, inventory view) continues
-- to work during the transitional period. It is called by the RPCs after
-- every movement insertion.
--
-- The opening-balance backfill registers the current cantidad_disponible of
-- every material with positive stock as an 'ajuste' row so the ledger has a
-- starting point. The backfill is idempotent — each material gets exactly
-- one ajuste row keyed by a unique migration source motivo.
--
-- Idempotent: every CREATE / REPLACE / INSERT is guarded. Safe to re-run.
-- ============================================================================

-- 0) Self-healing guard: add cantidad_disponible when it was lost to migration
--    drift (20260710000000 tracked as applied but column missing on some remotes).
do $$
begin
  perform 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'materias_primas'
      and column_name  = 'cantidad_disponible';
  if not found then
    alter table public.materias_primas
      add column cantidad_disponible numeric(10,2) not null default 0;
  end if;
end;
$$;

-- 1) Derived-stock view — source of truth for on-hand inventory.
create or replace view public.v_stock_actual as
select
  mp.id          as materia_prima_id,
  mp.nombre      as nombre,
  mp.unidad      as unidad,
  coalesce(sum(sm.cantidad), 0) as stock_actual
from public.materias_primas mp
left join public.stock_movements sm on sm.materia_prima_id = mp.id
group by mp.id, mp.nombre, mp.unidad;

comment on view public.v_stock_actual is
  'Derived stock from the movement ledger. SUM(stock_movements.cantidad) '
  'per materia_prima. Replaces direct reads of cantidad_disponible for '
  'trusted inventory state.';

-- 2) Cache-sync function — copies derived stock into the transitional
--    cantidad_disponible column. SECURITY DEFINER so it can write to
--    materias_primas even if the authenticated role's RLS is tightened
--    in the future.
create or replace function public.sync_stock_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.materias_primas mp
  set cantidad_disponible = coalesce((
    select sum(sm.cantidad)
    from public.stock_movements sm
    where sm.materia_prima_id = mp.id
  ), 0);
end;
$$;

comment on function public.sync_stock_cache() is
  'Copies derived stock (SUM of all movements per material) into '
  'materias_primas.cantidad_disponible. Called after every RPC that '
  'inserts a movement. SECURITY DEFINER so it bypasses RLS.';

-- 3) Idempotent opening-balance backfill.
--    For every materia_prima that currently has cantidad_disponible > 0,
--    insert a single 'ajuste' movement representing the starting balance.
--    The unique guard is (materia_prima_id, tipo = 'ajuste', motivo), so
--    re-running this migration never duplicates rows.
insert into public.stock_movements (
  materia_prima_id,
  cantidad,
  tipo,
  motivo,
  fecha
)
select
  mp.id,
  mp.cantidad_disponible,
  'ajuste',
  'Saldo inicial — migración automática',
  current_date
from public.materias_primas mp
where mp.cantidad_disponible is not null
  and mp.cantidad_disponible > 0
  and not exists (
    select 1
    from public.stock_movements sm
    where sm.materia_prima_id = mp.id
      and sm.tipo = 'ajuste'
      and sm.motivo = 'Saldo inicial — migración automática'
  );

-- Grant SELECT on the view to authenticated users.
grant select on public.v_stock_actual to authenticated;

-- Grant EXECUTE on the cache-sync function to authenticated users.
revoke all on function public.sync_stock_cache() from public;
grant execute on function public.sync_stock_cache() to authenticated;
