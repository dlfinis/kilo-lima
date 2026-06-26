-- productos_descripcion.sql
-- Agrega la columna `descripcion` a la tabla `productos` para soportar
-- texto libre opcional (≤ 500 chars) sobre cada producto del catálogo.
-- Idempotente: ADD COLUMN IF NOT EXISTS + CHECK length ≤ 500.
--
-- Nullable (sin default) para no backfill: las filas existentes quedan
-- con descripcion = NULL y el UI las trata como "sin descripción".
-- El trigger de updated_at ya está aplicado por la migración POS
-- inicial, así que las escrituras nuevas refrescan la columna.
-- Sin cambios a RLS (la policy `productos_write_authenticated` cubre
-- cualquier UPDATE).
--
-- Per productos-mejoras / producto-descripcion capability.

alter table public.productos
  add column if not exists descripcion text
  check (descripcion is null or length(descripcion) <= 500);

comment on column public.productos.descripcion is
  'Descripción opcional del producto (≤ 500 chars). Nullable.';