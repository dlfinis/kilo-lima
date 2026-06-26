-- categoria_materia_prima.sql
-- Agrega columna `categoria` a materias_primas para clasificar
-- entre 'ingrediente' (consumible) y 'empaque' (descartable).
-- Ambas se incluyen en el costo de producción de la receta.
-- Idempotente: usa ADD COLUMN IF NOT EXISTS y ALTER COLUMN TYPE.

-- 1. Agregar columna categoria con default 'ingrediente' para rows existentes
alter table public.materias_primas
  add column if not exists categoria text not null default 'ingrediente'
  check (categoria in ('ingrediente', 'empaque'));

-- 2. Actualizar el comentario de la tabla para documentar el cambio
comment on column public.materias_primas.categoria is
  'Clasificación: ingrediente (consumible) o empaque (descartable). Ambas se incluyen en el costo de producción.';
