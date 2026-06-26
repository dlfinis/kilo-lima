-- seed.sql
-- Idempotent seed for the catalog slice.
-- 5 sample materias_primas, 2 recetas, 5 receta_ingredientes rows.
-- Uses ON CONFLICT DO NOTHING so it is safe to re-run.
-- Per REQ-CATALOG-23.
--
-- Extends with full lifecycle test data: 2 productos, 3 eventos
-- (one per estado), evento_productos, plan_produccion, ventas +
-- venta_items, gastos_fijos, gastos_imprevistos, and 1 cierre_caja.
-- Required for testing the evento cascade-delete behavior introduced
-- by the `cascade_ventas_evento` migration. Per REQ-EVENTS-39.
insert into public.materias_primas (nombre, unidad, costo_por_unidad, notas) values
  ('Azúcar', 'g', 0.05, null),
  ('Harina', 'kg', 2.50, 'Harina de trigo todo uso'),
  ('Mantequilla', 'g', 0.12, null),
  ('Huevo', 'unidad', 0.30, 'Huevo de gallina tamaño grande'),
  ('Chocolate', 'kg', 15.00, 'Chocolate semiamargo')
on conflict do nothing;

-- 2. recetas (2 rows)
insert into public.recetas (nombre, descripcion, rendimiento_unidades, notas) values
  ('Galleta de chocolate', 'Galleta clásica con chispas de chocolate', 24, 'Rinde 24 galletas'),
  ('Pan básico', 'Pan de caja artesanal', 2, 'Rinde 2 piezas')
on conflict do nothing;

-- 3. receta_ingredientes (5 rows)
-- Galleta: Harina 0.5 kg, Azúcar 200 g, Mantequilla 100 g, Huevo 2 unidad, Chocolate 0.15 kg
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Galleta de chocolate' and m.nombre = 'Harina'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 200
from public.recetas r, public.materias_primas m
where r.nombre = 'Galleta de chocolate' and m.nombre = 'Azúcar'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 100
from public.recetas r, public.materias_primas m
where r.nombre = 'Galleta de chocolate' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 2
from public.recetas r, public.materias_primas m
where r.nombre = 'Galleta de chocolate' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.15
from public.recetas r, public.materias_primas m
where r.nombre = 'Galleta de chocolate' and m.nombre = 'Chocolate'
on conflict do nothing;

-- ============================================================
-- Lifecycle test data: productos → eventos → evento_productos →
-- plan_produccion / ventas + venta_items / gastos_fijos /
-- gastos_imprevistos / cierres_caja.
-- ============================================================

-- 4. productos (2 rows) — one per receta.
-- producto_id is referenced by venta_items and evento_productos, so
-- it must exist before either table is populated.
insert into public.productos (receta_id, precio_venta, disponible, orden)
select r.id, 15.00, true, 1
from public.recetas r
where r.nombre = 'Galleta de chocolate'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, precio_venta, disponible, orden)
select r.id, 35.00, true, 2
from public.recetas r
where r.nombre = 'Pan básico'
on conflict (receta_id) do nothing;

-- 5. eventos (3 rows) — one per estado.
-- eventos has no unique constraint besides PK, so re-running the
-- seed on a populated DB will produce duplicates. The seed is
-- designed for `supabase db reset` (fresh DB); the cleanup script
-- `verify-final.mjs` runs against a reset DB. Best-effort.
insert into public.eventos (nombre, fecha, fecha_fin, margen_ganancia, ubicacion, estado, notas) values
  ('Feria del dulce',     '2026-07-15', null, 0.40, 'Plaza del Carmen', 'planificacion', 'Pre-producción de galletas'),
  ('Festival de la galleta', '2026-06-20', '2026-06-21', 0.45, 'Parque Hidalgo', 'en_curso', 'Venta activa + toma de pedidos'),
  ('Mercado de primavera', '2026-05-10', '2026-05-11', 0.50, 'Centro histórico', 'cerrado', 'Cierre completado: caja cuadrada')
on conflict do nothing;

-- 6. evento_productos (3 rows) — link one producto per evento.
-- Uses UNIQUE(evento_id, producto_id) so this section is fully
-- idempotent.
insert into public.evento_productos (evento_id, producto_id, precio_venta, margen, incluido)
select e.id, p.id, null, null, true
from public.eventos e, public.productos p
where e.nombre = 'Feria del dulce' and p.precio_venta = 15.00
on conflict (evento_id, producto_id) do nothing;

insert into public.evento_productos (evento_id, producto_id, precio_venta, margen, incluido)
select e.id, p.id, null, null, true
from public.eventos e, public.productos p
where e.nombre = 'Festival de la galleta' and p.precio_venta = 15.00
on conflict (evento_id, producto_id) do nothing;

insert into public.evento_productos (evento_id, producto_id, precio_venta, margen, incluido)
select e.id, p.id, null, null, true
from public.eventos e, public.productos p
where e.nombre = 'Mercado de primavera' and p.precio_venta = 35.00
on conflict (evento_id, producto_id) do nothing;

-- 7. plan_produccion (4 rows) — for "Festival de la galleta" (2
-- recetas) and "Mercado navideño" (2 recetas). UNIQUE(evento_id,
-- receta_id) makes this section idempotent.
insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 240
from public.eventos e, public.recetas r
where e.nombre = 'Festival de la galleta' and r.nombre = 'Galleta de chocolate'
on conflict (evento_id, receta_id) do nothing;

insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 40
from public.eventos e, public.recetas r
where e.nombre = 'Festival de la galleta' and r.nombre = 'Pan básico'
on conflict (evento_id, receta_id) do nothing;

insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 120
from public.eventos e, public.recetas r
where e.nombre = 'Mercado de primavera' and r.nombre = 'Galleta de chocolate'
on conflict (evento_id, receta_id) do nothing;

insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 60
from public.eventos e, public.recetas r
where e.nombre = 'Mercado de primavera' and r.nombre = 'Pan básico'
on conflict (evento_id, receta_id) do nothing;

-- 8. gastos_fijos (5 rows) — 2 for each non-planificación evento,
-- 1 for planificación. PK-only, best-effort idempotency.
insert into public.gastos_fijos (evento_id, categoria, monto, descripcion)
select e.id, 'renta', 800.00, 'Renta del stand'
from public.eventos e
where e.nombre = 'Feria del dulce'
on conflict do nothing;

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion)
select e.id, 'renta', 1200.00, 'Renta del stand'
from public.eventos e
where e.nombre = 'Festival de la galleta'
on conflict do nothing;

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion)
select e.id, 'publicidad', 350.00, 'Impresión de mantas'
from public.eventos e
where e.nombre = 'Festival de la galleta'
on conflict do nothing;

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion)
select e.id, 'renta', 2000.00, 'Renta del stand (5 días)'
from public.eventos e
where e.nombre = 'Mercado de primavera'
on conflict do nothing;

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion)
select e.id, 'permisos', 600.00, 'Permiso municipal'
from public.eventos e
where e.nombre = 'Mercado de primavera'
on conflict do nothing;

-- 9. ventas (4 rows) — 2 for "Festival de la galleta" (en_curso) and
-- 2 for "Mercado de primavera" (cerrado). PK-only, best-effort.
insert into public.ventas (evento_id, fecha, total, metodo_pago)
select e.id, '2026-06-20T10:30:00Z', 75.00, 'efectivo'
from public.eventos e
where e.nombre = 'Festival de la galleta'
on conflict do nothing;

insert into public.ventas (evento_id, fecha, total, metodo_pago)
select e.id, '2026-06-20T14:15:00Z', 105.00, 'transferencia'
from public eventos e
where e.nombre = 'Festival de la galleta'
on conflict do nothing;

insert into public.ventas (evento_id, fecha, total, metodo_pago)
select e.id, '2026-05-10T11:00:00Z', 180.00, 'mixto'
from public.eventos e
where e.nombre = 'Mercado de primavera'
on conflict do nothing;

insert into public.ventas (evento_id, fecha, total, metodo_pago)
select e.id, '2026-05-11T16:45:00Z', 140.00, 'tarjeta'
from public.eventos e
where e.nombre = 'Mercado de primavera'
on conflict do nothing;

-- 10. venta_items (8 rows) — items for all 4 ventas. Totales deben coincidir con ventas.total.
-- Venta 1 (efectivo, total 75): 3 galletas @ 15 = 45 + 2 galletas @ 15 = 30 → 75
-- Venta 2 (transferencia, total 105): 3 panes @ 35 = 105
-- Venta 3 (mixto, total 180): 3 panes @ 35 = 105 + 5 galletas @ 15 = 75 → 180
-- Venta 4 (tarjeta, total 140): 4 panes @ 35 = 140
insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 3, 15.00, 45.00
from public.ventas v, public.productos p
where v.metodo_pago = 'efectivo' and v.total = 75.00 and p.precio_venta = 15.00
on conflict do nothing;

insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 2, 15.00, 30.00
from public.ventas v, public.productos p
where v.metodo_pago = 'efectivo' and v.total = 75.00 and p.precio_venta = 15.00
on conflict do nothing;

insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 3, 35.00, 105.00
from public.ventas v, public.productos p
where v.metodo_pago = 'transferencia' and v.total = 105.00 and p.precio_venta = 35.00
on conflict do nothing;

insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 3, 35.00, 105.00
from public.ventas v, public.productos p
where v.metodo_pago = 'mixto' and v.total = 180.00 and p.precio_venta = 35.00
on conflict do nothing;

insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 5, 15.00, 75.00
from public.ventas v, public.productos p
where v.metodo_pago = 'mixto' and v.total = 180.00 and p.precio_venta = 15.00
on conflict do nothing;

insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 4, 35.00, 140.00
from public.ventas v, public.productos p
where v.metodo_pago = 'tarjeta' and v.total = 140.00 and p.precio_venta = 35.00
on conflict do nothing;

-- 11. gastos_imprevistos (2 rows) — for "Mercado de primavera" only.
-- PK-only, best-effort.
insert into public.gastos_imprevistos (evento_id, monto, motivo, categoria)
select e.id, 120.00, 'Reparación de horno eléctrico', 'reparacion'
from public.eventos e
where e.nombre = 'Mercado de primavera'
on conflict do nothing;

insert into public.gastos_imprevistos (evento_id, monto, motivo, categoria)
select e.id, 80.00, 'Compra extra de harina', 'insumos_extra'
from public.eventos e
where e.nombre = 'Mercado de primavera'
on conflict do nothing;

-- 12. cierres_caja (1 row) — for "Mercado de primavera". UNIQUE on
-- evento_id makes this section idempotent.
insert into public.cierres_caja (
  evento_id, fecha_cierre,
  total_ventas, total_gastos_fijos, total_gastos_imprevistos,
  utilidad_bruta,
  efectivo_esperado, efectivo_real, diferencia, notas
)
select e.id, '2026-05-11T20:00:00Z',
        320.00, 2600.00, 200.00,
        -2480.00,
        320.00, 320.00, 0.00, 'Cierre final: evento pequeño con gastos fijos altos'
from public.eventos e
where e.nombre = 'Mercado de primavera'
on conflict (evento_id) do nothing;
