-- contabilidad-socios: partner/investor tracking, procurement
-- tracking, expense assignment, and consolidated accounting.
--
-- Tables: socios, evento_socios, aportes, compras_insumos
-- Modifications: gastos_fijos +socio_id, gastos_imprevistos +socio_id

-- 1. socios — people who participate in events as partners.
create table if not exists public.socios (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null unique,
  email         text,
  telefono      text,
  notas         text,
  created_at    timestamptz not null default now()
);

alter table public.socios enable row level security;
create policy "Allow all on socios"
  on public.socios for all using (true) with check (true);

-- 2. evento_socios — partner participation per event
create table if not exists public.evento_socios (
  id                  uuid primary key default gen_random_uuid(),
  evento_id           uuid not null references public.eventos(id)
                        on delete cascade,
  socio_id            uuid not null references public.socios(id),
  porcentaje_ganancia numeric(5,4) not null default 0,
  created_at          timestamptz not null default now(),
  unique(evento_id, socio_id)
);

create index if not exists idx_evento_socios_evento
  on public.evento_socios(evento_id);

alter table public.evento_socios enable row level security;
create policy "Allow all on evento_socios"
  on public.evento_socios for all using (true) with check (true);

-- 3. aportes — direct capital contributions per socio per event
create table if not exists public.aportes (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references public.eventos(id)
                  on delete cascade,
  socio_id      uuid not null references public.socios(id),
  monto         numeric(10,2) not null,
  fecha         date not null default current_date,
  descripcion   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_aportes_evento
  on public.aportes(evento_id);

alter table public.aportes enable row level security;
create policy "Allow all on aportes"
  on public.aportes for all using (true) with check (true);

-- 4. compras_insumos — raw material purchases per socio
--    evento_id is NULLable for general stock purchases
create table if not exists public.compras_insumos (
  id                uuid primary key default gen_random_uuid(),
  evento_id         uuid references public.eventos(id)
                      on delete cascade,
  socio_id          uuid not null references public.socios(id),
  materia_prima_id  uuid not null references public.materias_primas(id),
  cantidad          numeric(10,2) not null,
  costo_total       numeric(10,2) not null,
  fecha             date not null default current_date,
  descripcion       text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_compras_insumos_evento
  on public.compras_insumos(evento_id);

alter table public.compras_insumos enable row level security;
create policy "Allow all on compras_insumos"
  on public.compras_insumos for all using (true) with check (true);

-- 5. Trigger: update materia prima cost on purchase
create or replace function public.actualizar_costo_materia_prima()
returns trigger
language plpgsql
as $$
begin
  update public.materias_primas
  set costo_por_unidad = round((NEW.costo_total / NEW.cantidad)::numeric, 4)
  where id = NEW.materia_prima_id;
  return NEW;
end;
$$;

drop trigger if exists trg_compras_insumos_costo
  on public.compras_insumos;

create trigger trg_compras_insumos_costo
  after insert on public.compras_insumos
  for each row
  execute function public.actualizar_costo_materia_prima();

-- 6. Add socio_id to existing expense tables
alter table public.gastos_fijos
  add column if not exists socio_id uuid
  references public.socios(id);

alter table public.gastos_imprevistos
  add column if not exists socio_id uuid
  references public.socios(id);
