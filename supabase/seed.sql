-- seed.sql
-- Idempotent seed for the catalog slice.
-- 5 sample materias_primas, 2 recetas, 5 receta_ingredientes rows.
-- Uses ON CONFLICT DO NOTHING so it is safe to re-run.
-- Per REQ-CATALOG-23.

-- 1. materias_primas (5 rows)
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
