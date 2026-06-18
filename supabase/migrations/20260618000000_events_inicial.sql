-- events_inicial.sql
-- Idempotent migration for the events slice.
-- Creates 3 tables (eventos, gastos_fijos, plan_produccion), indexes,
-- FKs, CHECK constraints, updated_at trigger, and RLS policies.
-- Reuses the `tg__set_updated_at()` trigger function created by the
-- catalog migration (20260616120000_catalog_inicial.sql).
-- Per REQ-EVENTS-28. Run from Supabase Dashboard SQL Editor.

-- 1. eventos
create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) > 0),
  fecha date not null,
  ubicacion text,
  estado text not null default 'planificacion'
    check (estado in ('planificacion','en_curso','cerrado')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. gastos_fijos
create table if not exists public.gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  categoria text not null
    check (categoria in ('renta','transporte','permisos','publicidad','servicios','otro')),
  monto numeric(10,2) not null check (monto >= 0),
  descripcion text,
  created_at timestamptz not null default now()
);

-- 3. plan_produccion
create table if not exists public.plan_produccion (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  receta_id uuid not null references public.recetas(id) on delete restrict,
  unidades_a_producir numeric(10,4) not null check (unidades_a_producir > 0),
  created_at timestamptz not null default now(),
  unique (evento_id, receta_id)
);

-- 4. Indexes
create index if not exists idx_eventos_fecha on public.eventos (fecha desc);
create index if not exists idx_eventos_estado on public.eventos (estado);
create index if not exists idx_eventos_nombre_lower on public.eventos (lower(nombre));
create index if not exists idx_gastos_fijos_evento_id on public.gastos_fijos (evento_id);
create index if not exists idx_plan_produccion_evento_id on public.plan_produccion (evento_id);
create index if not exists idx_plan_produccion_receta_id on public.plan_produccion (receta_id);

-- 5. updated_at trigger (reuses function from catalog migration)
drop trigger if exists tg_eventos_set_updated_at on public.eventos;
create trigger tg_eventos_set_updated_at
  before update on public.eventos
  for each row execute function public.tg__set_updated_at();

-- 6. RLS
alter table public.eventos enable row level security;
alter table public.gastos_fijos enable row level security;
alter table public.plan_produccion enable row level security;

drop policy if exists "eventos_select_authenticated" on public.eventos;
create policy "eventos_select_authenticated" on public.eventos
  for select to authenticated using (true);

drop policy if exists "eventos_write_authenticated" on public.eventos;
create policy "eventos_write_authenticated" on public.eventos
  for all to authenticated using (true) with check (true);

drop policy if exists "gastos_fijos_select_authenticated" on public.gastos_fijos;
create policy "gastos_fijos_select_authenticated" on public.gastos_fijos
  for select to authenticated using (true);

drop policy if exists "gastos_fijos_write_authenticated" on public.gastos_fijos;
create policy "gastos_fijos_write_authenticated" on public.gastos_fijos
  for all to authenticated using (true) with check (true);

drop policy if exists "plan_produccion_select_authenticated" on public.plan_produccion;
create policy "plan_produccion_select_authenticated" on public.plan_produccion
  for select to authenticated using (true);

drop policy if exists "plan_produccion_write_authenticated" on public.plan_produccion;
create policy "plan_produccion_write_authenticated" on public.plan_produccion
  for all to authenticated using (true) with check (true);
