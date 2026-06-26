-- unique_names.sql
-- Agrega constraints UNIQUE a las columnas nombre en eventos, materias_primas y recetas
-- para evitar duplicados y reducir confusión.
-- Idempotente: usa DROP IF EXISTS + ADD para poder re-ejecutarse.

-- 1. eventos.nombre — no puede haber dos eventos con el mismo nombre
alter table public.eventos
  drop constraint if exists eventos_nombre_unique;

alter table public.eventos
  add constraint eventos_nombre_unique unique (nombre);

-- 2. materias_primas.nombre — no puede haber dos materias primas con el mismo nombre
alter table public.materias_primas
  drop constraint if exists materias_primas_nombre_unique;

alter table public.materias_primas
  add constraint materias_primas_nombre_unique unique (nombre);

-- 3. recetas.nombre — no puede haber dos recetas con el mismo nombre
alter table public.recetas
  drop constraint if exists recetas_nombre_unique;

alter table public.recetas
  add constraint recetas_nombre_unique unique (nombre);

-- Nota: productos no tiene columna nombre propia (usa receta.nombre vía FK),
-- por lo que no aplica constraint adicional aquí.
