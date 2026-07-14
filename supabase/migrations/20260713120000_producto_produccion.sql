-- producto_produccion.sql
-- Additive migration: event-product production plan.
-- One row per evento_producto, keyed by evento_producto_id (unique FK).
-- Replaces plan_produccion for new writes; plan_produccion stays readable.
-- Per event-product-management-refactor design.

-- 1. producto_produccion
create table if not exists public.producto_produccion (
  id uuid primary key default gen_random_uuid(),
  evento_producto_id uuid not null
    references public.evento_productos(id) on delete cascade,
  unidades_a_producir numeric(10,4) not null check (unidades_a_producir > 0),
  created_at timestamptz not null default now(),
  unique (evento_producto_id)
);

-- 2. Indexes
create index if not exists idx_producto_produccion_evento_producto_id
  on public.producto_produccion (evento_producto_id);

-- 3. RLS
alter table public.producto_produccion enable row level security;

drop policy if exists "producto_produccion_select_authenticated"
  on public.producto_produccion;
create policy "producto_produccion_select_authenticated"
  on public.producto_produccion
  for select to authenticated using (true);

drop policy if exists "producto_produccion_write_authenticated"
  on public.producto_produccion;
create policy "producto_produccion_write_authenticated"
  on public.producto_produccion
  for all to authenticated using (true) with check (true);
