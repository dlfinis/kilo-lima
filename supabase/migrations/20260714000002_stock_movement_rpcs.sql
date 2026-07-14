-- ============================================================================
-- stock_movement_rpcs.sql
-- ============================================================================
-- inventory-accounting-workflow-refactor / Phase 2: atomic stock-movement
-- RPCs. Every function is SECURITY DEFINER and runs in a single PL/pgSQL
-- transaction — movement insertion + cache sync are atomic.
--
-- Functions:
--   1) registrar_compra        — purchase adds positive movement
--   2) registrar_consumo       — consumption adds negative movement
--   3) registrar_correccion    — correction references original movement
--   4) finalizar_evento_snapshot — stub for Phase 4 COGS snapshot
--
-- Error codes (raised as PG exceptions parsed by the service layer):
--   'CANTIDAD_INVALIDA'          — cantidad <= 0
--   'COSTO_INVALIDO'             — costo_unitario < 0
--   'STOCK_INSUFICIENTE'         — on-hand stock < requested consumption
--   'CORRECCION_SIN_MOTIVO'      — motivo is null/empty
--   'MOVIMIENTO_NO_ENCONTRADO'   — referenced movement does not exist
--
-- All RPCs call sync_stock_cache() at the end to keep the transitional
-- cantidad_disponible column in sync with the ledger.
--
-- Idempotent: every CREATE OR REPLACE is safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) registrar_compra — purchase creates a positive movement with a
--    weighted-average cost snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_compra(
  p_materia_prima_id    uuid,
  p_cantidad            numeric,
  p_costo_unitario      numeric,
  p_evento_id           uuid default null,
  p_compra_insumo_id    uuid default null,
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
  if p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;
  if p_costo_unitario < 0 then
    raise exception 'COSTO_INVALIDO' using errcode = 'P0001';
  end if;

  -- Insert the movement. cantidad is positive (stock inflow).
  insert into public.stock_movements (
    materia_prima_id, cantidad, tipo,
    evento_id, compra_insumo_id,
    costo_unitario_snapshot, fecha
  ) values (
    p_materia_prima_id, p_cantidad, 'compra',
    p_evento_id, p_compra_insumo_id,
    p_costo_unitario, p_fecha
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

revoke all on function public.registrar_compra(uuid,numeric,numeric,uuid,uuid,date) from public;
grant execute on function public.registrar_compra(uuid,numeric,numeric,uuid,uuid,date) to authenticated;

comment on function public.registrar_compra(uuid,numeric,numeric,uuid,uuid,date) is
  'Atomic purchase registration: inserts a positive stock_movements row, '
  'syncs the transitional cache. Returns the created movement as jsonb.';

-- ---------------------------------------------------------------------------
-- 2) registrar_consumo — consumption creates a negative movement after
--    verifying sufficient stock.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_consumo(
  p_materia_prima_id    uuid,
  p_cantidad            numeric,
  p_costo_unitario      numeric,
  p_evento_id           uuid,
  p_venta_id            uuid default null,
  p_fecha               date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_actual numeric;
  v_movement_id  uuid;
  v_movement     record;
begin
  -- Validate inputs.
  if p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;

  -- Verify stock availability from the ledger.
  select coalesce(sum(sm.cantidad), 0) into v_stock_actual
  from public.stock_movements sm
  where sm.materia_prima_id = p_materia_prima_id;

  if v_stock_actual < p_cantidad then
    raise exception 'STOCK_INSUFICIENTE' using errcode = 'P0001';
  end if;

  -- Insert the movement. cantidad is negative (stock outflow).
  insert into public.stock_movements (
    materia_prima_id, cantidad, tipo,
    evento_id, venta_id,
    costo_unitario_snapshot, fecha
  ) values (
    p_materia_prima_id, -p_cantidad, 'consumo',
    p_evento_id, p_venta_id,
    p_costo_unitario, p_fecha
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

revoke all on function public.registrar_consumo(uuid,numeric,numeric,uuid,uuid,date) from public;
grant execute on function public.registrar_consumo(uuid,numeric,numeric,uuid,uuid,date) to authenticated;

comment on function public.registrar_consumo(uuid,numeric,numeric,uuid,uuid,date) is
  'Atomic consumption registration: verifies stock availability from the '
  'ledger, inserts a negative stock_movements row, syncs the cache. '
  'Returns the created movement as jsonb.';

-- ---------------------------------------------------------------------------
-- 3) registrar_correccion — correction creates a new movement referencing
--    the original. The correction's cantidad is the delta between the
--    corrected absolute value and the original absolute value, signed
--    consistently with the original's direction.
--
--    Example: original compra of 5 (wrong), should be 4
--      → correction cantidad = -(5 - 4) = -1 (removes 1 unit from stock)
--    Example: original compra of 3 (wrong), should be 5
--      → correction cantidad = +(5 - 3) = +2 (adds 2 units to stock)
--    Example: original consumo of 2 (wrong, recorded as -2), should be 1
--      → correction cantidad = +(2 - 1) = +1 (adds 1 unit back to stock)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_correccion(
  p_movimiento_id       uuid,
  p_cantidad_corregida  numeric,
  p_motivo              text,
  p_fecha               date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original       record;
  v_delta          numeric;
  v_correccion_id  uuid;
  v_movement       record;
begin
  -- Validate motivo (required for audit traceability).
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'CORRECCION_SIN_MOTIVO' using errcode = 'P0001';
  end if;
  if length(p_motivo) > 500 then
    raise exception 'CORRECCION_MOTIVO_MUY_LARGO' using errcode = 'P0001';
  end if;

  if p_cantidad_corregida <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;

  -- Read the original movement.
  select * into v_original
  from public.stock_movements
  where id = p_movimiento_id;
  if not found then
    raise exception 'MOVIMIENTO_NO_ENCONTRADO' using errcode = 'P0001';
  end if;

  -- Compute the delta: how much to add (positive) or remove (negative)
  -- to adjust from the original's absolute quantity to the corrected
  -- absolute quantity. The sign follows the original's direction:
  --   original positivo (compra/ajuste): delta = corregido - original
  --   original negativo (consumo): delta = -(corregido - abs(original))
  v_delta := p_cantidad_corregida - abs(v_original.cantidad);
  if v_original.cantidad < 0 then
    v_delta := -v_delta;
  end if;

  -- Insert the correction movement referencing the original.
  insert into public.stock_movements (
    materia_prima_id, cantidad, tipo,
    evento_id,
    movimiento_corregido_id,
    costo_unitario_snapshot,
    motivo, fecha
  ) values (
    v_original.materia_prima_id,
    v_delta,
    'correccion',
    v_original.evento_id,
    p_movimiento_id,
    v_original.costo_unitario_snapshot,
    p_motivo,
    p_fecha
  )
  returning id into v_correccion_id;

  -- Keep the transitional cache in sync.
  perform public.sync_stock_cache();

  select * into v_movement
  from public.stock_movements
  where id = v_correccion_id;

  return to_jsonb(v_movement);
end;
$$;

revoke all on function public.registrar_correccion(uuid,numeric,text,date) from public;
grant execute on function public.registrar_correccion(uuid,numeric,text,date) to authenticated;

comment on function public.registrar_correccion(uuid,numeric,text,date) is
  'Atomic correction: reads the original movement, computes the quantity '
  'delta, inserts a correccion-type movement referencing the original via '
  'movimiento_corregido_id. Motivo is mandatory. Returns the created '
  'correction movement as jsonb.';

-- ---------------------------------------------------------------------------
-- 4) finalizar_evento_snapshot — Phase 2 stub.
--
--    Validates that the evento exists and returns a consumption-total
--    snapshot for that event. The full COGS snapshot (weighted-average
--    cost × consumed quantity) and cierres_caja integration are wired
--    in Phase 4 (Movement-Backed COGS). Phase 2 establishes the RPC
--    contract so the service/store layer can be built against it now.
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_evento_snapshot(
  p_evento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  -- Phase 2 stub: aggregate consumption totals for the given event.
  -- Phase 4 extends this to compute weighted-average COGS and update
  -- cierres_caja.total_cogs.
  select jsonb_build_object(
    'evento_id',            p_evento_id,
    'total_consumido',      coalesce(sum(abs(sm.cantidad)), 0),
    'consumption_records',  coalesce(count(*), 0)
  ) into v_snapshot
  from public.stock_movements sm
  where sm.evento_id = p_evento_id
    and sm.tipo = 'consumo';

  -- Return a valid snapshot even when there are no consumption records.
  if v_snapshot is null then
    v_snapshot := jsonb_build_object(
      'evento_id',            p_evento_id,
      'total_consumido',      0,
      'consumption_records',  0
    );
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.finalizar_evento_snapshot(uuid) from public;
grant execute on function public.finalizar_evento_snapshot(uuid) to authenticated;

comment on function public.finalizar_evento_snapshot(uuid) is
  'Phase 2 stub: returns consumption-total snapshot for the given evento. '
  'Phase 4 extends this to compute weighted-average COGS and update '
  'cierres_caja.';
