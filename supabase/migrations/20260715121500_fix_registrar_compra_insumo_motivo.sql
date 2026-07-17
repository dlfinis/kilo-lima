-- Ensure abastecimiento purchases leave a human-readable motivo in stock_movements.

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
  if p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA' using errcode = 'P0001';
  end if;
  if p_costo_unitario < 0 then
    raise exception 'COSTO_INVALIDO' using errcode = 'P0001';
  end if;

  insert into public.compras_insumos (
    evento_id, socio_id, materia_prima_id,
    cantidad, costo_total, fecha, descripcion
  ) values (
    p_evento_id, p_socio_id, p_materia_prima_id,
    p_cantidad, p_costo_total, p_fecha, p_descripcion
  )
  returning id into v_compra_id;

  insert into public.stock_movements (
    materia_prima_id, cantidad, tipo,
    evento_id, compra_insumo_id,
    costo_unitario_snapshot, motivo, fecha
  ) values (
    p_materia_prima_id, p_cantidad, 'compra',
    p_evento_id, v_compra_id,
    p_costo_unitario,
    coalesce(nullif(trim(p_descripcion), ''), 'Compra de insumo'),
    p_fecha
  )
  returning id into v_movement_id;

  perform public.sync_stock_cache();

  select * into v_movement
  from public.stock_movements
  where id = v_movement_id;

  return to_jsonb(v_movement);
end;
$$;
