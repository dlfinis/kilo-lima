-- =====================================================================
-- Kilo-Lima · seed.sql
-- ---------------------------------------------------------------------
-- Seed legible para el entorno de desarrollo.
--
-- Deja un dataset completo que cubre cada pantalla:
--   * Home               → 1 evento en curso y 1 cerrado (números vivos)
--   * Materias primas    → 6 filas (5 ingredientes + 1 empaque)
--   * Recetas            → 2 recetas (galletas + pan básico)
--   * Productos          → 1 por receta con margen y costo trazable
--   * Eventos            → 3 eventos (uno por estado) con productos
--                          + plan de producción + gastos fijos
--   * POS                → ventas con sus items en el evento en curso
--                          y en el cerrado, más una corrección
--                          documentada
--   * Cierre de caja     → 1 cierre del evento cerrado (cuadra)
--   * Contabilidad       → 2 socios, aportes por evento, compras de
--                          insumo y gastos asignados al socio que
--                          puso la lana
--
-- Idempotente: cada `INSERT` usa `ON CONFLICT DO NOTHING` sobre la
-- unique constraint que aplique, así que se puede correr contra una
-- base que ya tenga datos sin duplicarlos.
--
-- Aplicación:
--   1. Reset completo (recomendado en dev):
--        node scripts/db-reset.mjs
--      → confirma, trunca todas las tablas y re-corre este seed.
--   2. Manual desde Supabase SQL editor: pegar este archivo entero.
-- =====================================================================

-- begin; -- no-op (la RPC exec_sql del proyecto no soporta BEGIN/COMMIT)

-- =====================================================================
-- 1. MATERIAS PRIMAS (catálogo)
-- Base inicial + catálogo ampliado de pastelería ecuatoriana.
-- Costos en USD/mercado-local (Referencial Quito, 2026).
-- Categoría: 'ingrediente' o 'empaque'.
-- =====================================================================
insert into public.materias_primas (nombre, unidad, costo_por_unidad, categoria, notas) values
  -- Base (Panadería tradicional)
  ('Azúcar',          'g',      0.05,   'ingrediente', null),
  ('Harina',          'kg',     2.50,   'ingrediente', 'Harina de trigo todo uso'),
  ('Mantequilla',     'g',      0.12,   'ingrediente', null),
  ('Huevo',           'unidad', 0.30,   'ingrediente', 'Huevo de gallina grande'),
  ('Chocolate',       'kg',    15.00,   'ingrediente', 'Chocolate semiamargo'),
  ('Caja para pan',   'unidad', 1.50,   'empaque',     'Caja de cartón kraft para 2 piezas'),
  -- Endulzantes / saborizantes andinos
  ('Panela',          'kg',     3.20,   'ingrediente', 'Panela en bloque, rallada o molida fina'),
  ('Miel de abeja',   'ml',     0.06,   'ingrediente', 'Miel pura de abeja (Cosecha nacional)'),
  ('Canela molida',   'g',      0.40,   'ingrediente', 'Canela molida fina'),
  ('Vainilla',        'ml',     0.50,   'ingrediente', 'Esencia de vainilla'),
  -- Harinas y almidones típicos
  ('Harina de maíz',  'kg',     2.80,   'ingrediente', 'Harina de maíz blanco, para tortillas y humitas'),
  ('Almidón de yuca', 'kg',     4.50,   'ingrediente', 'Almidón dulce de yuca, base del pan de yuca'),
  ('Harina de banano','kg',     3.00,   'ingrediente', 'Harina verde de banano, sin azúcar añadida'),
  -- Lácteos y rellenos
  ('Queso fresco',    'kg',     8.00,   'ingrediente', 'Queso fresco de vaca (cuajada)'),
  ('Leche entera',    'l',      1.20,   'ingrediente', 'Leche entera UHT, sin azúcar'),
  ('Crema de leche',  'l',      5.50,   'ingrediente', 'Crema de leche para heladería/pastelería'),
  ('Mantequilla de maní','kg', 12.00,   'ingrediente', 'Mantequilla de maní natural sin azúcar'),
  -- Rellenos salados
  ('Mortadela',       'kg',     9.00,   'ingrediente', 'Mortadela en pieza, para empanadas'),
  -- Frutas y aromáticos
  ('Banano maduro',   'kg',     1.00,   'ingrediente', 'Banano maduro (plátano de seda)'),
  ('Piña natural',    'kg',     1.50,   'ingrediente', 'Piña picada en trozos pequeños'),
  ('Coco rallado',    'kg',     6.00,   'ingrediente', 'Coco rallado fresco/endulado, sin azúcar'),
  -- Endulzantes modernos para coladas y bizcochos
  ('Leche condensada','g',      0.06,   'ingrediente', 'Leche condensada azucarada'),
  -- Combustibles / consumibles
  ('Aceite vegetal',  'l',      3.50,   'ingrediente', 'Aceite vegetal neutro para freír'),
  ('Gas refrigerante','g',      0.10,   'ingrediente', 'Gas refrigerante para la máquina de helado'),
  -- Empaques adicionales
  ('Bolsa celofán',   'unidad', 0.05,   'empaque',     'Bolsa de celofán transparente 15×20 cm'),
  ('Funda papel kraft','unidad', 0.15,  'empaque',     'Funda kraft con ventana, para panes y bizcochos'),
  -- Bebidas calientes (insumos)
  ('Café molido',     'g',      0.45,   'ingrediente', 'Café arábigo molido medio'),
  ('Canelazo premezcla','g',    0.30,   'ingrediente', 'Premezcla para canelazo (canela+clavo de olor)')
on conflict (nombre) do nothing;

-- =====================================================================
-- 2. RECETAS + INGREDIENTES
-- Galleta de chocolate → 24 unidades por lote
-- Pan básico           → 2 piezas por lote
-- =====================================================================
insert into public.recetas (nombre, descripcion, rendimiento_unidades, notas) values
  ('Galleta de chocolate', 'Galleta clásica con chispas',         24, 'Lote de 24 piezas'),
  ('Pan básico',           'Pan de caja artesanal masa madre',    2, 'Lote de 2 piezas')
on conflict (nombre) do nothing;

-- Receta 1: Galleta de chocolate
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

-- Receta 2: Pan básico
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 1.0
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan básico' and m.nombre = 'Harina'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.05
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan básico' and m.nombre = 'Azúcar'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.05
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan básico' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 1
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan básico' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 1
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan básico' and m.nombre = 'Caja para pan'
on conflict do nothing;

-- =====================================================================
-- 2b. RECETAS DE PASTELERÍA ECUATORIANA
-- 10 recetas típicas con rendimiento realista para ferias/eventos.
-- Cada una reutiliza la base existente o las MP nuevas del paso 1.
-- =====================================================================
insert into public.recetas (nombre, descripcion, rendimiento_unidades, notas) values
  ('Empanada de viento',          'Masa de harina rellena de queso, frita y aireada', 20, '20 empanadas'),
  ('Humita',                       'Tamales de maíz dulce envueltos en hoja',          12, '12 humitas'),
  ('Quimbolito',                   'Tamal dulce al vapor con harina de maíz',          12, '12 quimbolitos'),
  ('Pan de yuca',                  'Bolitas crocantes con almidón de yuca y queso',   24, '24 unidades'),
  ('Tortilla de tiesto',           'Tortilla grande de maíz, asada en tiesto',         8, '8 tortillas grandes'),
  ('Rosquilla quiteña',            'Rosca dulce con panela, derretida al horno',      24, '24 rosquillas'),
  ('Pan de banano con maní',       'Bizcocho húmedo con banano maduro y maní',        12, '12 porciones'),
  ('Helado de paila (mora)',       'Helado artesanal hecho en paila metálica',         1, 'Por tanda de 3 L'),
  ('Bizcocho de colada morada',    'Bizcocho con harina de maíz y especias',          12, '12 porciones'),
  ('Canelazo',                     'Bebida caliente con canela y aguardiente',         1, 'Por jarra de 2 L')
on conflict (nombre) do nothing;

-- 2b.1 Empanada de viento (20 unidades): harina 500g, agua 250ml, huevo 1,
-- manteca vegetal 60g, sal 8g, queso fresco 300g, aceite 1 L para freír.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Empanada de viento' and m.nombre = 'Harina'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.3
from public.recetas r, public.materias_primas m
where r.nombre = 'Empanada de viento' and m.nombre = 'Queso fresco'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 1
from public.recetas r, public.materias_primas m
where r.nombre = 'Empanada de viento' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.06
from public.recetas r, public.materias_primas m
where r.nombre = 'Empanada de viento' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 1
from public.recetas r, public.materias_primas m
where r.nombre = 'Empanada de viento' and m.nombre = 'Aceite vegetal'
on conflict do nothing;

-- 2b.2 Humita (12 unidades): maíz tierno molido 1 kg, manteca 100g,
-- panela 150g, anís 5g, huevo 2, leche 250ml.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 1
from public.recetas r, public.materias_primas m
where r.nombre = 'Humita' and m.nombre = 'Harina de maíz'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.15
from public.recetas r, public.materias_primas m
where r.nombre = 'Humita' and m.nombre = 'Panela'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.1
from public.recetas r, public.materias_primas m
where r.nombre = 'Humita' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.25
from public.recetas r, public.materias_primas m
where r.nombre = 'Humita' and m.nombre = 'Leche entera'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 2
from public.recetas r, public.materias_primas m
where r.nombre = 'Humita' and m.nombre = 'Huevo'
on conflict do nothing;

-- 2b.3 Quimbolito (12 unidades): harina de maíz 500g, panela 200g,
-- huevos 3, manteca 80g, leche 300ml, vainilla 5ml.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Quimbolito' and m.nombre = 'Harina de maíz'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.2
from public.recetas r, public.materias_primas m
where r.nombre = 'Quimbolito' and m.nombre = 'Panela'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.08
from public.recetas r, public.materias_primas m
where r.nombre = 'Quimbolito' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.3
from public.recetas r, public.materias_primas m
where r.nombre = 'Quimbolito' and m.nombre = 'Leche entera'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 3
from public.recetas r, public.materias_primas m
where r.nombre = 'Quimbolito' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 5
from public.recetas r, public.materias_primas m
where r.nombre = 'Quimbolito' and m.nombre = 'Vainilla'
on conflict do nothing;

-- 2b.4 Pan de yuca (24 unidades): almidón de yuca 500g, queso fresco
-- 250g, huevos 2, mantequilla 60g, leche 200ml.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de yuca' and m.nombre = 'Almidón de yuca'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.25
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de yuca' and m.nombre = 'Queso fresco'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 2
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de yuca' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.06
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de yuca' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.2
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de yuca' and m.nombre = 'Leche entera'
on conflict do nothing;

-- 2b.5 Tortilla de tiesto (8 unidades): harina de maíz 500g, manteca
-- 60g, sal 8g, agua 250ml.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Tortilla de tiesto' and m.nombre = 'Harina de maíz'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.06
from public.recetas r, public.materias_primas m
where r.nombre = 'Tortilla de tiesto' and m.nombre = 'Mantequilla'
on conflict do nothing;

-- 2b.6 Rosquilla quiteña (24 unidades): harina 500g, panela 200g,
-- mantequilla 80g, huevo 2, anís 5g, aceite 0.5 L.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Rosquilla quiteña' and m.nombre = 'Harina'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.2
from public.recetas r, public.materias_primas m
where r.nombre = 'Rosquilla quiteña' and m.nombre = 'Panela'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.08
from public.recetas r, public.materias_primas m
where r.nombre = 'Rosquilla quiteña' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 2
from public.recetas r, public.materias_primas m
where r.nombre = 'Rosquilla quiteña' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Rosquilla quiteña' and m.nombre = 'Aceite vegetal'
on conflict do nothing;

-- 2b.7 Pan de banano con maní (12 porciones): banano maduro 600g,
-- harina de banano 200g, mantequilla 100g, panela 150g, huevos 2,
-- mantequilla de maní 100g, leche condensada 100g.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.6
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de banano con maní' and m.nombre = 'Banano maduro'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.2
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de banano con maní' and m.nombre = 'Harina de banano'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.1
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de banano con maní' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.1
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de banano con maní' and m.nombre = 'Mantequilla de maní'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.1
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de banano con maní' and m.nombre = 'Leche condensada'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 2
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de banano con maní' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 1
from public.recetas r, public.materias_primas m
where r.nombre = 'Pan de banano con maní' and m.nombre = 'Funda papel kraft'
on conflict do nothing;

-- 2b.8 Helado de paila (mora) - 1 tanda de 3 L: leche entera 2.5 L,
-- panela 250g, piña madura 200g (para dulzor ácido), mora fresca
-- 500g, crema de leche 0.5 L, gas refrigerante 50g.
-- (La piña se modela con "Piña natural" como acidulante natural.)
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 2.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Helado de paila (mora)' and m.nombre = 'Leche entera'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.25
from public.recetas r, public.materias_primas m
where r.nombre = 'Helado de paila (mora)' and m.nombre = 'Panela'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.2
from public.recetas r, public.materias_primas m
where r.nombre = 'Helado de paila (mora)' and m.nombre = 'Piña natural'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.5
from public.recetas r, public.materias_primas m
where r.nombre = 'Helado de paila (mora)' and m.nombre = 'Crema de leche'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 50
from public.recetas r, public.materias_primas m
where r.nombre = 'Helado de paila (mora)' and m.nombre = 'Gas refrigerante'
on conflict do nothing;

-- 2b.9 Bizcocho de colada morada (12 porciones): harina de maíz 250g,
-- harina de trigo 250g, panela 300g, mantequilla 120g, huevos 3,
-- leche 250ml, canela 10g, piña 100g (pulpa).
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.25
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Harina de maíz'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.25
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Harina'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.3
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Panela'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.12
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Mantequilla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 3
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Huevo'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.25
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Leche entera'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 10
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Canela molida'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.1
from public.recetas r, public.materias_primas m
where r.nombre = 'Bizcocho de colada morada' and m.nombre = 'Piña natural'
on conflict do nothing;

-- 2b.10 Canelazo por jarra (2 L): agua 1.8 L, panela 250g,
-- canela 20g (extra para infusión), clavo de olor (no agregado,
-- ya incluido en premezcla), aguardiente 200ml (no está en catálogo,
-- se modela con "Canelazo premezcla" como concentrado),
-- limones (no en catálogo).
-- Para no inflar materias primas: usamos solo "Canelazo premezcla"
-- y agua (no-modelada) para reflejar la bebida.
insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 100
from public.recetas r, public.materias_primas m
where r.nombre = 'Canelazo' and m.nombre = 'Canelazo premezcla'
on conflict do nothing;

insert into public.receta_ingredientes (receta_id, materia_prima_id, cantidad)
select r.id, m.id, 0.25
from public.recetas r, public.materias_primas m
where r.nombre = 'Canelazo' and m.nombre = 'Panela'
on conflict do nothing;


-- =====================================================================
-- 3. SOCIOS (contabilidad)
-- 2 socios · porcentajes de ganancia para el evento "Festival 2026"
-- =====================================================================
insert into public.socios (nombre, email, telefono, notas) values
  ('Diego',    'diego@example.com',   '+52 55 0000 0001', 'Encargado de producción'),
  ('Ana',   'lucia@example.com',   '+52 55 0000 0002', 'Encargada de ventas')
on conflict (nombre) do nothing;

-- =====================================================================
-- 4. EVENTOS
-- 3 eventos · uno por estado · fechas legibles
-- =====================================================================
insert into public.eventos (nombre, fecha, fecha_fin, margen_ganancia, ubicacion, estado, notas) values
  ('Feria del Centro',       '2026-08-10', null,                  0.45, 'Plaza del Carmen',     'planificacion', 'Pre-producción de galletas y pan'),
  ('Festival Primavera 2026','2026-06-20', '2026-06-21',          0.50, 'Parque Hidalgo',      'en_curso',      'Venta activa con caja abierta'),
  ('Mercado Navideño 2025',  '2025-12-12', '2025-12-13',          0.40, 'Centro histórico',     'cerrado',       'Cierre ejecutado: caja cuadrada')
on conflict do nothing;

-- =====================================================================
-- 5. PRODUCTOS
-- 1 por receta · con margen override para que se vea la calculadora
-- =====================================================================
-- catalog-domain-refactor / Slice 1: nombre + categoria added.
-- nombre defaults to receta.nombre per the product-form prefill spec.
insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'dulce',  15.00, true, 1, 'Galleta clásica con chispas', 'mdi-cookie',  '#A0522D'
from public.recetas r
where r.nombre = 'Galleta de chocolate'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'salado', 35.00, true, 2, 'Pan de caja artesanal',      'mdi-bread-slice', '#D2691E'
from public.recetas r
where r.nombre = 'Pan básico'
on conflict (receta_id) do nothing;

-- catalog-domain-refactor / Slice 1: nombre + categoria added to all inserts.
insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'salado', 0.80, true,  3, 'Empanada de viento quiteña — masa rellena de queso, frita',           'mdi-food-croissant', '#E9967A'
from public.recetas r
where r.nombre = 'Empanada de viento'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'salado', 1.50, true,  4, 'Humita quiteña — tamal de maíz dulce envuelto en hoja',            'mdi-corn',           '#F4D03F'
from public.recetas r
where r.nombre = 'Humita'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'dulce',  1.50, true,  5, 'Quimbolito — tamal dulce al vapor con harina de maíz',            'mdi-bowl',           '#D4AC0D'
from public.recetas r
where r.nombre = 'Quimbolito'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'salado', 0.60, true,  6, 'Pan de yuca — bolitas crocantes de almidón de yuca y queso',     'mdi-baguette',       '#F5DEB3'
from public.recetas r
where r.nombre = 'Pan de yuca'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'salado', 2.00, true,  7, 'Tortilla de tiesto grande — asada en tiesto de barro',          'mdi-flatbread',      '#DAA520'
from public.recetas r
where r.nombre = 'Tortilla de tiesto'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'dulce',  0.75, true,  8, 'Rosquilla quiteña — rosca dulce con panela, horneada',           'mdi-cookie-outline', '#CD853F'
from public.recetas r
where r.nombre = 'Rosquilla quiteña'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'dulce',  2.50, true,  9, 'Porción de pan de banano con mantequilla de maní',              'mdi-cake-variant',   '#FFE4B5'
from public.recetas r
where r.nombre = 'Pan de banano con maní'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'helado', 25.00, true, 10, 'Tanda de helado de paila de mora — artesanal por 3 L',          'mdi-ice-cream',      '#8B4789'
from public.recetas r
where r.nombre = 'Helado de paila (mora)'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'dulce',  2.25, true, 11, 'Porción de bizcocho de colada morada — para Todos los Santos',  'mdi-cupcake',        '#8B4513'
from public.recetas r
where r.nombre = 'Bizcocho de colada morada'
on conflict (receta_id) do nothing;

insert into public.productos (receta_id, nombre, categoria, precio_venta, disponible, orden, descripcion, icono, color)
select r.id, r.nombre, 'bebida', 6.00, true, 12, 'Jarra de canelazo 2 L — bebida caliente con canela',            'mdi-cup',            '#A0522D'
from public.recetas r
where r.nombre = 'Canelazo'
on conflict (receta_id) do nothing;

-- =====================================================================
-- 6. EVENTO_PRODUCTOS (receta → evento con margen override)
-- =====================================================================
insert into public.evento_productos (evento_id, producto_id, precio_venta, margen, incluido)
select e.id, p.id, 18.00, 0.55, true
from public.eventos e, public.productos p
where e.nombre = 'Festival Primavera 2026' and p.nombre = 'Galleta de chocolate'
on conflict (evento_id, producto_id) do nothing;

insert into public.evento_productos (evento_id, producto_id, precio_venta, margen, incluido)
select e.id, p.id, 42.00, 0.45, true
from public.eventos e, public.productos p
where e.nombre = 'Festival Primavera 2026' and p.nombre = 'Pan básico'
on conflict (evento_id, producto_id) do nothing;

insert into public.evento_productos (evento_id, producto_id, precio_venta, margen, incluido)
select e.id, p.id, null, null, true
from public.eventos e, public.productos p
where e.nombre = 'Feria del Centro' and p.nombre = 'Galleta de chocolate'
on conflict (evento_id, producto_id) do nothing;

insert into public.evento_productos (evento_id, producto_id, precio_venta, margen, incluido)
select e.id, p.id, null, null, true
from public.eventos e, public.productos p
where e.nombre = 'Mercado Navideño 2025' and p.nombre = 'Pan básico'
on conflict (evento_id, producto_id) do nothing;

-- =====================================================================
-- 7. PLAN DE PRODUCCIÓN
-- Lotes planeados por receta para cada evento
-- =====================================================================
insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 240
from public.eventos e, public.recetas r
where e.nombre = 'Festival Primavera 2026' and r.nombre = 'Galleta de chocolate'
on conflict (evento_id, receta_id) do nothing;

insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 40
from public.eventos e, public.recetas r
where e.nombre = 'Festival Primavera 2026' and r.nombre = 'Pan básico'
on conflict (evento_id, receta_id) do nothing;

insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 120
from public.eventos e, public.recetas r
where e.nombre = 'Mercado Navideño 2025' and r.nombre = 'Galleta de chocolate'
on conflict (evento_id, receta_id) do nothing;

insert into public.plan_produccion (evento_id, receta_id, unidades_a_producir)
select e.id, r.id, 60
from public.eventos e, public.recetas r
where e.nombre = 'Mercado Navideño 2025' and r.nombre = 'Pan básico'
on conflict (evento_id, receta_id) do nothing;

-- =====================================================================
-- 8. EVENTO_SOCIOS + APORTES
-- Para "Festival Primavera 2026": 2 socios con aportes de capital
-- =====================================================================
insert into public.evento_socios (evento_id, socio_id, porcentaje_ganancia)
select e.id, s.id, 0.60
from public.eventos e, public.socios s
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Diego León'
on conflict (evento_id, socio_id) do nothing;

insert into public.evento_socios (evento_id, socio_id, porcentaje_ganancia)
select e.id, s.id, 0.40
from public.eventos e, public.socios s
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Lucía Reyes'
on conflict (evento_id, socio_id) do nothing;

insert into public.aportes (evento_id, socio_id, monto, fecha, descripcion)
select e.id, s.id, 1500.00, '2026-06-15', 'Aporte inicial de capital'
from public.eventos e, public.socios s
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Diego León';

insert into public.aportes (evento_id, socio_id, monto, fecha, descripcion)
select e.id, s.id, 1000.00, '2026-06-15', 'Aporte inicial de capital'
from public.eventos e, public.socios s
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Lucía Reyes';

-- =====================================================================
-- 9. COMPRAS DE INSUMOS
-- Compras para reponer stock atribuidas a Diego
-- =====================================================================
insert into public.compras_insumos (evento_id, socio_id, materia_prima_id, cantidad, costo_total, fecha, descripcion)
select e.id, s.id, m.id, 10, 25.00, '2026-06-16', 'Harina para Festival Primavera'
from public.eventos e, public.socios s, public.materias_primas m
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Diego León' and m.nombre = 'Harina';

insert into public.compras_insumos (evento_id, socio_id, materia_prima_id, cantidad, costo_total, fecha, descripcion)
select e.id, s.id, m.id, 3, 45.00, '2026-06-17', 'Chocolate para Festival Primavera'
from public.eventos e, public.socios s, public.materias_primas m
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Diego León' and m.nombre = 'Chocolate';

-- =====================================================================
-- 10. GASTOS FIJOS (con socio_id opcional)
-- =====================================================================
insert into public.gastos_fijos (evento_id, categoria, monto, descripcion, socio_id)
select e.id, 'renta', 800.00, 'Renta del stand', s.id
from public.eventos e, public.socios s
where e.nombre = 'Feria del Centro' and s.nombre = 'Diego León';

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion, socio_id)
select e.id, 'publicidad', 250.00, 'Diseño + impresión de mantas', s.id
from public.eventos e, public.socios s
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Lucía Reyes';

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion, socio_id)
select e.id, 'renta', 1200.00, 'Renta del stand (2 días)', s.id
from public.eventos e, public.socios s
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Diego León';

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion, socio_id)
select e.id, 'renta', 1500.00, 'Renta del stand (2 días)', s.id
from public.eventos e, public.socios s
where e.nombre = 'Mercado Navideño 2025' and s.nombre = 'Diego León';

insert into public.gastos_fijos (evento_id, categoria, monto, descripcion, socio_id)
select e.id, 'permisos', 600.00, 'Permiso municipal', null
from public.eventos e
where e.nombre = 'Mercado Navideño 2025';

-- =====================================================================
-- 11. GASTOS IMPREVISTOS (con socio_id opcional)
-- =====================================================================
insert into public.gastos_imprevistos (evento_id, monto, motivo, categoria, socio_id)
select e.id, 120.00, 'Reparación de horno eléctrico', 'reparacion', s.id
from public.eventos e, public.socios s
where e.nombre = 'Mercado Navideño 2025' and s.nombre = 'Diego León';

insert into public.gastos_imprevistos (evento_id, monto, motivo, categoria, socio_id)
select e.id, 80.00, 'Compra extra de harina',         'insumos_extra', s.id
from public.eventos e, public.socios s
where e.nombre = 'Mercado Navideño 2025' and s.nombre = 'Diego León';

insert into public.gastos_imprevistos (evento_id, monto, motivo, categoria, socio_id)
select e.id, 60.00, 'Propinas al staff',             'propina', s.id
from public.eventos e, public.socios s
where e.nombre = 'Festival Primavera 2026' and s.nombre = 'Lucía Reyes';

-- =====================================================================
-- 12. VENTAS + ITEMS
-- 3 ventas en "Festival Primavera 2026" (en_curso)
-- 2 ventas en "Mercado Navideño 2025" (cerrado)
-- =====================================================================
insert into public.ventas (evento_id, fecha, total, metodo_pago, monto_recibido, cambio, comprobante_numero)
select e.id, '2026-06-20T10:30:00Z', 90.00,  'efectivo',     100.00, 10.00, 'FPR-001'
from public.eventos e
where e.nombre = 'Festival Primavera 2026';

insert into public.ventas (evento_id, fecha, total, metodo_pago, monto_recibido, cambio, comprobante_numero)
select e.id, '2026-06-20T11:15:00Z', 126.00, 'tarjeta',      null,    null,  'FPR-002'
from public.eventos e
where e.nombre = 'Festival Primavera 2026';

insert into public.ventas (evento_id, fecha, total, metodo_pago, monto_recibido, cambio, comprobante_numero)
select e.id, '2026-06-20T13:45:00Z', 60.00,  'efectivo',     60.00,  0.00,  'FPR-003'
from public.eventos e
where e.nombre = 'Festival Primavera 2026';

insert into public.ventas (evento_id, fecha, total, metodo_pago, monto_recibido, cambio, comprobante_numero)
select e.id, '2025-12-12T11:00:00Z', 180.00, 'mixto',        200.00, 20.00, 'MNA-001'
from public.eventos e
where e.nombre = 'Mercado Navideño 2025';

insert into public.ventas (evento_id, fecha, total, metodo_pago, monto_recibido, cambio, comprobante_numero)
select e.id, '2025-12-13T16:45:00Z', 140.00, 'efectivo',     140.00, 0.00,  'MNA-002'
from public.eventos e
where e.nombre = 'Mercado Navideño 2025';

-- Venta 1 (Festival, efectivo, 90): 5 galletas @ 18 = 90
insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, margen_aplicado, evento_producto_id)
select v.id, p.id, 5, 18.00, 90.00, 7.27, 0.60, ep.id
from public.ventas v
join public.eventos e on e.id = v.evento_id
join public.productos p on p.nombre = 'Galleta de chocolate'
join public.evento_productos ep
  on ep.evento_id = e.id and ep.producto_id = p.id
where e.nombre = 'Festival Primavera 2026' and v.comprobante_numero = 'FPR-001';

-- Venta 2 (Festival, tarjeta, 126): 3 panes @ 42 = 126
insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, margen_aplicado, evento_producto_id)
select v.id, p.id, 3, 42.00, 126.00, 23.10, 0.45, ep.id
from public.ventas v
join public.eventos e on e.id = v.evento_id
join public.productos p on p.nombre = 'Pan básico'
join public.evento_productos ep
  on ep.evento_id = e.id and ep.producto_id = p.id
where e.nombre = 'Festival Primavera 2026' and v.comprobante_numero = 'FPR-002';

-- Venta 3 (Festival, efectivo, 60): 2 panes @ 42 = 84 (REBAJA: se cobra 60) → corrección posterior
insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, margen_aplicado, evento_producto_id)
select v.id, p.id, 2, 30.00, 60.00, 23.10, 0.23, ep.id
from public.ventas v
join public.eventos e on e.id = v.evento_id
join public.productos p on p.nombre = 'Pan básico'
join public.evento_productos ep
  on ep.evento_id = e.id and ep.producto_id = p.id
where e.nombre = 'Festival Primavera 2026' and v.comprobante_numero = 'FPR-003';

-- Venta 4 (Navideño, mixto, 180): 3 panes catálogo @ 35 = 105 + 5 galletas catálogo @ 15 = 75 → 180
insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 3, 35.00, 105.00
from public.ventas v
join public.eventos e on e.id = v.evento_id
join public.productos p on p.nombre = 'Pan básico'
where e.nombre = 'Mercado Navideño 2025' and v.comprobante_numero = 'MNA-001';

insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 5, 15.00, 75.00
from public.ventas v
join public.eventos e on e.id = v.evento_id
join public.productos p on p.nombre = 'Galleta de chocolate'
where e.nombre = 'Mercado Navideño 2025' and v.comprobante_numero = 'MNA-001';

-- Venta 5 (Navideño, efectivo, 140): 4 panes @ 35 = 140
insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, subtotal)
select v.id, p.id, 4, 35.00, 140.00
from public.ventas v
join public.eventos e on e.id = v.evento_id
join public.productos p on p.nombre = 'Pan básico'
where e.nombre = 'Mercado Navideño 2025' and v.comprobante_numero = 'MNA-002';

-- =====================================================================
-- 13. CORRECCIÓN DE VENTA (auditoría)
-- El operador corrigió FPR-003 después de registrarlo: ajustó
-- precio_unitario y dejó el motivo registrado.
-- Se usa json_build_object en lugar de concatenar strings para
-- evitar parseos manuales de JSON que rompan al pasar SQL por
-- ciertas RPC multi-cliente.
-- =====================================================================
insert into public.venta_correcciones (
  venta_id, evento_id,
  total_anterior, total_nuevo,
  metodo_pago_anterior, metodo_pago_nuevo,
  monto_recibido_anterior, monto_recibido_nuevo,
  motivo,
  items_anteriores, items_nuevos
)
select
  v.id, v.evento_id,
  84.00, 60.00,
  'efectivo', 'efectivo',
  100.00, 60.00,
  'Cliente frecuente: descuento de cortesía autorizado por Diego',
  jsonb_build_array(jsonb_build_object(
    'producto_id', p.id::text,
    'cantidad', 2,
    'precio_unitario', 42.00,
    'subtotal', 84.00
  )),
  jsonb_build_array(jsonb_build_object(
    'producto_id', p.id::text,
    'cantidad', 2,
    'precio_unitario', 30.00,
    'subtotal', 60.00
  ))
from public.ventas v
join public.eventos e on e.id = v.evento_id
join public.productos p on p.nombre = 'Pan básico'
where e.nombre = 'Festival Primavera 2026' and v.comprobante_numero = 'FPR-003';

-- =====================================================================
-- 14. CIERRE DE CAJA
-- Mercado Navideño 2025 cerró bien. Sus totales:
--   ventas = 180 + 140 = 320
--   gastos_fijos = 1500 + 600 = 2100
--   imprevistos = 120 + 80 = 200
--   utilidad_bruta = 320 - 2100 - 200 = -1980
--   efectivo_esperado = 140 (solo ventas en efectivo)
--   efectivo_real = 140, diferencia = 0
-- =====================================================================
insert into public.cierres_caja (
  evento_id, fecha_cierre,
  total_ventas, total_gastos_fijos, total_gastos_imprevistos,
  utilidad_bruta, total_cogs, total_utilidad_bruta, total_utilidad_neta,
  efectivo_esperado, efectivo_real, diferencia, notas
)
select e.id, '2025-12-13T20:00:00Z',
       320.00, 2100.00, 200.00,
       -1980.00, 0.00, -1980.00, -1980.00,
       140.00, 140.00, 0.00,
       'Cierre final: caja cuadrada. Gastos fijos altos (stand + permiso) superan la venta.'
from public.eventos e
where e.nombre = 'Mercado Navideño 2025'
on conflict (evento_id) do nothing;

-- (sin COMMIT explícito — la RPC exec_sql no permite transaction commands)

-- =====================================================================
-- RESUMEN (corre al final del seed — útil para inspección manual)
-- =====================================================================
select 'materias_primas'    as tabla, count(*)::text as filas from public.materias_primas
union all select 'recetas',        count(*)::text from public.recetas
union all select 'productos',      count(*)::text from public.productos
union all select 'socios',         count(*)::text from public.socios
union all select 'eventos',        count(*)::text from public.eventos
union all select 'evento_productos', count(*)::text from public.evento_productos
union all select 'plan_produccion',count(*)::text from public.plan_produccion
union all select 'gastos_fijos',   count(*)::text from public.gastos_fijos
union all select 'gastos_imprevistos', count(*)::text from public.gastos_imprevistos
union all select 'aportes',        count(*)::text from public.aportes
union all select 'compras_insumos',count(*)::text from public.compras_insumos
union all select 'ventas',         count(*)::text from public.ventas
union all select 'venta_items',    count(*)::text from public.venta_items
union all select 'venta_correcciones', count(*)::text from public.venta_correcciones
union all select 'cierres_caja',   count(*)::text from public.cierres_caja
order by tabla;