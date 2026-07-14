-- ===========================================================================
-- Migration: registrar_compra_insumo RPC
-- Atomic abastecimiento purchase: creates a compras_insumos row AND a
-- stock_movements row in one transaction, then syncs the stock cache.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- registrar_compra_insumo — atomic purchase for the Abastecimiento workflow.
-- Inserts into compras_insumos, inserts into stock_movements (linking back),
-- syncs the transitional cache, and returns the stock_movement as jsonb.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_compra_insumo(
  p_socio_id            uuid,
  p_materia_prima_id    uuid,
  p_cantidad            numeric,
  p_costo_unitario      numeric,
  p_costo_total         numeric,
  p_evento_id           uuid default null,
  p_descripcion         text default null,
  p_fecha               date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra_id    uuid;
  v_movement_id  uuid;
  v_movement     record;
begin
  -- Validate inputs.
  if p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;
  if p_costo_unitario < 0 then
    raise exception 'COSTO_INVALIDO' using errcode = 'P0001';
  end if;

  -- 1. Insert the compras_insumos row.
  insert into public.compras_insumos (
    evento_id, socio_id, materia_prima_id,
    cantidad, costo_total, fecha, descripcion
  ) values (
    p_evento_id, p_socio_id, p_materia_prima_id,
    p_cantidad, p_costo_total, p_fecha, p_descripcion
  )
  returning id into v_compra_id;

  -- 2. Insert the stock_movements row (positive = inflow).
  insert into public.stock_movements (
    materia_prima_id, cantidad, tipo,
    evento_id, compra_insumo_id,
    costo_unitario_snapshot, fecha
  ) values (
    p_materia_prima_id, p_cantidad, 'compra',
    p_evento_id, v_compra_id,
    p_costo_unitario, p_fecha
  )
  returning id into v_movement_id;

  -- 3. Sync the transitional cache.
  perform public.sync_stock_cache();

  -- 4. Return the movement row for the caller.
  select * into v_movement
  from public.stock_movements
  where id = v_movement_id;

  return to_jsonb(v_movement);
end;
$$;

revoke all on function public.registrar_compra_insumo(uuid,uuid,numeric,numeric,numeric,uuid,text,date) from public;
grant execute on function public.registrar_compra_insumo(uuid,uuid,numeric,numeric,numeric,uuid,text,date) to authenticated;

comment on function public.registrar_compra_insumo(uuid,uuid,numeric,numeric,numeric,uuid,text,date) is
  'Atomic Abastecimiento purchase: inserts compras_insumos + stock_movements(compra) '
  'in one transaction. Syncs the transitional cache. Returns the created movement as jsonb.';
