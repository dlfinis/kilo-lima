-- producto_nombre_categoria.sql
-- Slice 1 (schema & foundation) of catalog-domain-refactor.
-- Adds product commercial identity columns (nombre, categoria),
-- makes precio_venta nullable (event pricing becomes authority),
-- backfills nombre from linked receta, and indexes categoria.
-- Idempotent: uses IF NOT EXISTS / safe DO blocks.

-- 1. Add nombre column (initially nullable for backfill)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'productos'
      and column_name  = 'nombre'
  ) then
    alter table public.productos add column nombre text;
  end if;
end $$;

-- 2. Add categoria column (always nullable — free-text filter tag)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'productos'
      and column_name  = 'categoria'
  ) then
    alter table public.productos add column categoria text;
  end if;
end $$;

-- 3. Make precio_venta nullable so event pricing is the sole authority.
--    The column stays in place for backward compat; later slices drop the
--    catalog-price fallback from the service layer.
alter table public.productos
  alter column precio_venta drop not null;

-- 4. Backfill productos.nombre from linked recetas.nombre.
--    Only rows with a null nombre are touched (idempotent).
update public.productos
set nombre = r.nombre
from public.recetas r
where productos.receta_id = r.id
  and productos.nombre is null;

-- 5. After backfill, enforce NOT NULL on nombre.
alter table public.productos
  alter column nombre set not null;

-- 6. Backfill categoria for seeded/demo-style products where the
--    product name gives a reasonable default. The mapping is
--    intentionally loose — just enough to populate demo data without
--    leaving every row null. Production rows without an obvious
--    category stay null (the column is nullable by design).
update public.productos
set categoria = 'dulce'
where categoria is null
  and (lower(nombre) like '%galleta%'
    or lower(nombre) like '%chocolate%'
    or lower(nombre) like '%bizcocho%'
    or lower(nombre) like '%colada%'
    or lower(nombre) like '%rosquilla%'
    or lower(nombre) like '%quimbolito%');

update public.productos
set categoria = 'salado'
where categoria is null
  and (lower(nombre) like '%pan %'
    or lower(nombre) like '%pan de%'
    or lower(nombre) like '%empanada%'
    or lower(nombre) like '%humita%'
    or lower(nombre) like '%yuca%'
    or lower(nombre) like '%tortilla%');

update public.productos
set categoria = 'helado'
where categoria is null
  and lower(nombre) like '%helado%';

update public.productos
set categoria = 'bebida'
where categoria is null
  and lower(nombre) like '%canelazo%';

-- 7. Index on categoria for POS filter performance.
create index if not exists idx_productos_categoria
  on public.productos (categoria)
  where categoria is not null;

-- 8. Enforce unique commercial product names. producto.nombre is the
--    display/search identity; uniqueness guarantees seed joins by
--    p.nombre are stable and prevents two products from claiming the
--    same commercial name (including Small/Grande variants, which
--    must use distinct names like "Pan básico Pequeño" / "Pan básico Grande").
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_type = 'UNIQUE'
      and table_name = 'productos'
      and constraint_name = 'productos_nombre_key'
  ) then
    alter table public.productos add constraint productos_nombre_key unique (nombre);
  end if;
end $$;

-- Transitional note: at this point productos has:
--   nombre   — NOT NULL, backfilled from recetas.nombre
--   categoria — nullable, backfilled heuristically for demo rows
--   precio_venta — nullable, preserved for backward compat
--
-- Runtime code in later slices switches display/search/filtering to
-- producto.nombre (independent identity) and removes the catalog-price
-- fallback. Until then, precio_venta stays on every seed row so
-- existing POS flows (which haven't been updated yet) keep working.
-- producto -> receta FK and unique(receta_id) are left intact.
-- The visible rename to 'Preparaciones' happens in later slices.
