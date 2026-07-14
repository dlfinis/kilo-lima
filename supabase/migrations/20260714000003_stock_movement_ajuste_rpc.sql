-- ============================================================================
-- stock_movement_ajuste_rpc.sql
-- ============================================================================
-- inventory-tabs-redesign / Work Unit 2: registrar_ajuste RPC.
--
-- Provides a standalone stock adjustment entry point. Unlike
-- registrar_correccion, ajuste does NOT require a prior movement_id —
-- it's a direct stock adjustment (positive for entradas, negative for
-- mermas/corrections). The motivo field carries the adjustment reason
-- and responsible person context for audit traceability.
--
-- This RPC is the backend for the StockMovementModal in InventarioTab
-- and complements registrar_compra (which creates tipo='compra' rows
-- with costo_unitario tracking). The modal routes "entrada" with
-- reason "compra" through registrar_compra; all other cases use this
-- RPC with tipo='ajuste'.
--
-- Idempotent: CREATE OR REPLACE makes it safe to re-run.
-- ============================================================================

create or replace function public.registrar_ajuste(
  p_materia_prima_id    uuid,
  p_cantidad            numeric,
  p_motivo              text,
  p_created_by          uuid default auth.uid(),
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
  -- Validate inputs.
  if p_cantidad = 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'CORRECCION_SIN_MOTIVO' using errcode = 'P0001';
  end if;
  if length(p_motivo) > 500 then
    raise exception 'CORRECCION_MOTIVO_MUY_LARGO' using errcode = 'P0001';
  end if;

  -- Insert the ajuste movement. cantidad can be positive (inflow/entrada)
  -- or negative (outflow/merma/corrección). evento_id and
  -- movimiento_corregido_id are null — this is a standalone global
  -- adjustment, not event-scoped and not correcting a prior movement.
  insert into public.stock_movements (
    materia_prima_id, cantidad, tipo,
    motivo, created_by, fecha
  ) values (
    p_materia_prima_id, p_cantidad, 'ajuste',
    p_motivo, p_created_by, p_fecha
  )
  returning id into v_movement_id;

  -- Keep the transitional cache in sync.
  perform public.sync_stock_cache();

  select * into v_movement
  from public.stock_movements
  where id = v_movement_id;

  return to_jsonb(v_movement);
end;
$$;

revoke all on function public.registrar_ajuste(uuid,numeric,text,uuid,date) from public;
grant execute on function public.registrar_ajuste(uuid,numeric,text,uuid,date) to authenticated;

comment on function public.registrar_ajuste(uuid,numeric,text,uuid,date) is
  'Atomic global stock adjustment: inserts an ajuste-type stock_movements '
  'row with the given cantidad (signed — positive for entradas, negative '
  'for mermas/corrections), motivo for audit context, and created_by for '
  'traceability. Does not require a prior movement_id. Syncs the '
  'transitional cache. Returns the created movement as jsonb.';
