-- catalog_inicial.sql
-- Idempotent migration for the catalog slice.
-- Creates 3 tables (materias_primas, recetas, receta_ingredientes), indexes,
-- FKs, CHECK constraints, updated_at trigger, and RLS policies.
-- Per REQ-CATALOG-22. Run from Supabase Dashboard SQL Editor.

-- 1. Extension (idempotent)
create extension if not exists "pgcrypto" schema public;

-- 2. materias_primas
create table if not exists public.materias_primas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) > 0),
  unidad text not null check (unidad in ('kg','g','l','ml','unidad')),
  costo_por_unidad numeric(10,4) not null check (costo_por_unidad >= 0),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. recetas
create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) > 0),
  descripcion text,
  rendimiento_unidades numeric(10,4) not null check (rendimiento_unidades > 0),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. receta_ingredientes
create table if not exists public.receta_ingredientes (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  materia_prima_id uuid not null references public.materias_primas(id) on delete restrict,
  cantidad numeric(12,6) not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  unique (receta_id, materia_prima_id)
);

-- 5. Indexes
create index if not exists idx_materias_primas_nombre_lower on public.materias_primas (lower(nombre));
create index if not exists idx_materias_primas_created_at on public.materias_primas (created_at desc);
create index if not exists idx_recetas_nombre_lower on public.recetas (lower(nombre));
create index if not exists idx_recetas_created_at on public.recetas (created_at desc);
create index if not exists idx_receta_ingredientes_receta_id on public.receta_ingredientes (receta_id);
create index if not exists idx_receta_ingredientes_materia_prima_id on public.receta_ingredientes (materia_prima_id);

-- 6. updated_at trigger
create or replace function public.tg__set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tg_materias_primas_set_updated_at on public.materias_primas;
create trigger tg_materias_primas_set_updated_at
  before update on public.materias_primas
  for each row execute function public.tg__set_updated_at();

drop trigger if exists tg_recetas_set_updated_at on public.recetas;
create trigger tg_recetas_set_updated_at
  before update on public.recetas
  for each row execute function public.tg__set_updated_at();

-- 7. RLS
alter table public.materias_primas enable row level security;
alter table public.recetas enable row level security;
alter table public.receta_ingredientes enable row level security;

drop policy if exists "materias_primas_select_authenticated" on public.materias_primas;
create policy "materias_primas_select_authenticated" on public.materias_primas
  for select to authenticated using (true);

drop policy if exists "materias_primas_write_authenticated" on public.materias_primas;
create policy "materias_primas_write_authenticated" on public.materias_primas
  for all to authenticated using (true) with check (true);

drop policy if exists "recetas_select_authenticated" on public.recetas;
create policy "recetas_select_authenticated" on public.recetas
  for select to authenticated using (true);

drop policy if exists "recetas_write_authenticated" on public.recetas;
create policy "recetas_write_authenticated" on public.recetas
  for all to authenticated using (true) with check (true);

drop policy if exists "receta_ingredientes_select_authenticated" on public.receta_ingredientes;
create policy "receta_ingredientes_select_authenticated" on public.receta_ingredientes
  for select to authenticated using (true);

drop policy if exists "receta_ingredientes_write_authenticated" on public.receta_ingredientes;
create policy "receta_ingredientes_write_authenticated" on public.receta_ingredientes
  for all to authenticated using (true) with check (true);
