-- pos_inicial.sql
-- Idempotent migration for the POS slice. Creates 5 tables
-- (productos, ventas, venta_items, gastos_imprevistos, cierres_caja)
-- with FKs, CHECK constraints, indexes, an updated_at trigger on
-- productos (only mutable table), and 10 RLS policies. Reuses the
-- tg__set_updated_at() function created by the catalog migration.
-- Per REQ-POS-41. Run from Supabase Dashboard SQL Editor.

-- 1. productos (mutable — has updated_at)
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete restrict,
  precio_venta numeric(10,2) not null check (precio_venta > 0),
  disponible boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receta_id)
);

-- 2. ventas (append-only — no updated_at)
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete restrict,
  fecha timestamptz not null default now(),
  total numeric(10,2) not null check (total >= 0),
  metodo_pago text not null
    check (metodo_pago in ('efectivo','transferencia','tarjeta','mixto')),
  created_at timestamptz not null default now()
);

-- 3. venta_items (append-only — snapshot pricing)
create table if not exists public.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad numeric(10,4) not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

-- 4. gastos_imprevistos (separate from gastos_fijos — REQ-POS-38)
create table if not exists public.gastos_imprevistos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  monto numeric(10,2) not null check (monto > 0),
  motivo text not null check (length(motivo) > 0 and length(motivo) <= 500),
  categoria text
    check (categoria in ('insumos_extra','transporte','reparacion','propina','otro')),
  created_at timestamptz not null default now()
);

-- 5. cierres_caja (immutable snapshot — no updated_at, UNIQUE evento_id)
create table if not exists public.cierres_caja (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null unique references public.eventos(id) on delete cascade,
  fecha_cierre timestamptz not null default now(),
  total_ventas numeric(10,2) not null check (total_ventas >= 0),
  total_gastos_fijos numeric(10,2) not null check (total_gastos_fijos >= 0),
  total_gastos_imprevistos numeric(10,2) not null check (total_gastos_imprevistos >= 0),
  utilidad_bruta numeric(10,2) not null,
  efectivo_esperado numeric(10,2),
  efectivo_real numeric(10,2),
  diferencia numeric(10,2),
  notas text,
  created_at timestamptz not null default now()
);

-- 6. Indexes (hot paths: POS grid query, cierre aggregation)
create index if not exists idx_productos_receta_id on public.productos (receta_id);
create index if not exists idx_productos_disponible_orden on public.productos (disponible, orden);
create index if not exists idx_ventas_evento_id on public.ventas (evento_id);
create index if not exists idx_ventas_fecha on public.ventas (fecha desc);
create index if not exists idx_ventas_metodo_pago on public.ventas (metodo_pago);
create index if not exists idx_venta_items_venta_id on public.venta_items (venta_id);
create index if not exists idx_venta_items_producto_id on public.venta_items (producto_id);
create index if not exists idx_gastos_imprevistos_evento_id on public.gastos_imprevistos (evento_id);
create unique index if not exists idx_cierres_caja_evento_id on public.cierres_caja (evento_id);

-- 7. updated_at trigger on productos (reuses function from catalog migration)
drop trigger if exists tg_productos_set_updated_at on public.productos;
create trigger tg_productos_set_updated_at
  before update on public.productos
  for each row execute function public.tg__set_updated_at();

-- 8. RLS — enable + select + write policies on all 5 tables
alter table public.productos enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_items enable row level security;
alter table public.gastos_imprevistos enable row level security;
alter table public.cierres_caja enable row level security;

drop policy if exists "productos_select_authenticated" on public.productos;
create policy "productos_select_authenticated" on public.productos
  for select to authenticated using (true);

drop policy if exists "productos_write_authenticated" on public.productos;
create policy "productos_write_authenticated" on public.productos
  for all to authenticated using (true) with check (true);

drop policy if exists "ventas_select_authenticated" on public.ventas;
create policy "ventas_select_authenticated" on public.ventas
  for select to authenticated using (true);

drop policy if exists "ventas_write_authenticated" on public.ventas;
create policy "ventas_write_authenticated" on public.ventas
  for all to authenticated using (true) with check (true);

drop policy if exists "venta_items_select_authenticated" on public.venta_items;
create policy "venta_items_select_authenticated" on public.venta_items
  for select to authenticated using (true);

drop policy if exists "venta_items_write_authenticated" on public.venta_items;
create policy "venta_items_write_authenticated" on public.venta_items
  for all to authenticated using (true) with check (true);

drop policy if exists "gastos_imprevistos_select_authenticated" on public.gastos_imprevistos;
create policy "gastos_imprevistos_select_authenticated" on public.gastos_imprevistos
  for select to authenticated using (true);

drop policy if exists "gastos_imprevistos_write_authenticated" on public.gastos_imprevistos;
create policy "gastos_imprevistos_write_authenticated" on public.gastos_imprevistos
  for all to authenticated using (true) with check (true);

drop policy if exists "cierres_caja_select_authenticated" on public.cierres_caja;
create policy "cierres_caja_select_authenticated" on public.cierres_caja
  for select to authenticated using (true);

drop policy if exists "cierres_caja_write_authenticated" on public.cierres_caja;
create policy "cierres_caja_write_authenticated" on public.cierres_caja
  for all to authenticated using (true) with check (true);
