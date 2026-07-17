-- Persist the two event-product pricing levers independently. `margen`
-- remains a true sale margin used only by the automatic-price fallback.
alter table public.evento_productos
  add column if not exists ganancia_markup numeric(10,4),
  add column if not exists contribucion_markup numeric(10,4);

-- Reconcile only legacy rows that have neither persisted lever. Existing
-- manual prices are never changed. The current recipe cost is used solely to
-- distribute that already-saved price into the two markup fields.
with costo_actual as (
  select
    p.id as producto_id,
    sum(ri.cantidad * mp.costo_por_unidad) / nullif(r.rendimiento_unidades, 0) as costo_unitario
  from public.productos p
  join public.recetas r on r.id = p.receta_id
  join public.receta_ingredientes ri on ri.receta_id = r.id
  join public.materias_primas mp on mp.id = ri.materia_prima_id
  group by p.id, r.rendimiento_unidades
),
reconciliacion as (
  select
    ep.id,
    case
      when ep.precio_venta is not null and ca.costo_unitario > 0
        then (ep.precio_venta / ca.costo_unitario) - 1
      when ep.precio_venta is null and coalesce(ep.margen, e.margen_ganancia) >= 0
        and coalesce(ep.margen, e.margen_ganancia) < 1
        then coalesce(ep.margen, e.margen_ganancia) / (1 - coalesce(ep.margen, e.margen_ganancia))
      else null
    end as markup_total
  from public.evento_productos ep
  join public.eventos e on e.id = ep.evento_id
  left join costo_actual ca on ca.producto_id = ep.producto_id
  where ep.ganancia_markup is null
    and ep.contribucion_markup is null
)
update public.evento_productos ep
set
  ganancia_markup = least(greatest(r.markup_total, 0), 2.00),
  contribucion_markup = greatest(greatest(r.markup_total, 0) - least(greatest(r.markup_total, 0), 2.00), 0)
from reconciliacion r
where ep.id = r.id
  and r.markup_total is not null;
