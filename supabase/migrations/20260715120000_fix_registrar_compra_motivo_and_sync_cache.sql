-- Fix stock purchase registration:
-- 1) sync_stock_cache must include a WHERE clause to satisfy environments
--    that reject UPDATE without WHERE.
-- 2) registrar_compra must accept and persist motivo so stock movement
--    history shows human-readable context instead of empty/invalid values.

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
  ), 0)
  where mp.id is not null;
end;
$$;

create or replace function public.registrar_compra(
  p_materia_prima_id    uuid,
  p_cantidad            numeric,
  p_costo_unitario      numeric,
  p_evento_id           uuid default null,
  p_compra_insumo_id    uuid default null,
  p_motivo              text default null,
  p_fecha               date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_movement    record;
begin
  if p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;
  if p_costo_unitario < 0 then
    raise exception 'COSTO_INVALIDO' using errcode = 'P0001';
  end if;

  insert into public.stock_movements (
    materia_prima_id, cantidad, tipo,
    evento_id, compra_insumo_id,
    costo_unitario_snapshot, motivo, fecha
  ) values (
    p_materia_prima_id, p_cantidad, 'compra',
    p_evento_id, p_compra_insumo_id,
    p_costo_unitario, p_motivo, p_fecha
  )
  returning id into v_movement_id;

  perform public.sync_stock_cache();

  select * into v_movement
  from public.stock_movements
  where id = v_movement_id;

  return to_jsonb(v_movement);
end;
$$;

revoke all on function public.registrar_compra(uuid,numeric,numeric,uuid,uuid,text,date) from public;
grant execute on function public.registrar_compra(uuid,numeric,numeric,uuid,uuid,text,date) to authenticated;
