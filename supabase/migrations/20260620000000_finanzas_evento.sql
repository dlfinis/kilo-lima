-- finanzas_evento.sql
-- Fase 1 of the `finanzas-evento` change: cierre formula fix + multi-day
-- support + per-evento margin configuration. Adds columns only — does
-- NOT rename `eventos.fecha` (keeps backward compat with the events
-- slice and avoids touching rows that already exist). Nullable columns
-- so existing rows stay valid and Fase 2 can backfill via the
-- evento_productos flow (PD-4: no historical backfill).
--
-- REQ-FIN-1, REQ-FIN-5, REQ-FIN-12.

-- 1. eventos — add optional end date + per-evento margin default.
--    fecha_fin is nullable (NULL = single day, treated as fecha at the
--    UI layer). margen_ganancia defaults to 40% per PD-1.
alter table public.eventos
  add column if not exists fecha_fin date;

alter table public.eventos
  add column if not exists margen_ganancia numeric(5,4) default 0.40;

-- 2. venta_items — snapshot the COGS-relevant fields at sale time.
--    Both columns nullable so existing rows stay NULL until Fase 2
--    (when producto snapshots start carrying the data). Legacy
--    ventas contribute 0 to COGS via `costo_unitario ?? 0`.
alter table public.venta_items
  add column if not exists costo_unitario numeric(10,2);

alter table public.venta_items
  add column if not exists margen_aplicado numeric(5,4);

-- 3. cierres_caja — capture the corrected utilidad_bruta and the new
--    utilidad_neta so the snapshot matches the formula in
--    src/utils/cierre.ts. Legacy cierres_caja rows get 0 for the new
--    columns; the corrected formula does not backfill historical
--    cierres (PD-4 — closure-time snapshot only).
alter table public.cierres_caja
  add column if not exists total_cogs numeric(10,2) not null default 0;

alter table public.cierres_caja
  add column if not exists total_utilidad_bruta numeric(10,2) not null default 0;

alter table public.cierres_caja
  add column if not exists total_utilidad_neta numeric(10,2) not null default 0;

-- ============================================================
-- Fase 2a DDL: evento_productos (REQ-FIN-13)
-- ============================================================

-- Per-event product pricing configuration. Each row maps a
-- producto to an evento with optional pricing overrides. The
-- UNIQUE(evento_id, producto_id) constraint ensures at most
-- one config row per product per event.
create table if not exists public.evento_productos (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references public.eventos(id)
                  on delete cascade,
  producto_id   uuid not null references public.productos(id),
  precio_venta  numeric(10,2),   -- null = auto-calc from margen
  margen        numeric(5,4),    -- null = inherit evento.margen_ganancia
  incluido      boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique(evento_id, producto_id)
);

-- Index for per-evento lookups (EventoProductosView, POS filtering).
create index if not exists idx_evento_productos_evento
  on public.evento_productos(evento_id);

-- Fase 2b: link venta_items to the pricing row that was active
-- at sale time. Nullable — legacy rows and Fase 1 ventas have
-- no link; Fase 2 sales populate it. Without this FK, backfill
-- (REQ-FIN-9) can't match a venta_item to its evento_producto.
alter table public.venta_items
  add column if not exists evento_producto_id uuid
  references public.evento_productos(id);

-- ============================================================
-- RLS policies
-- ============================================================

-- Development mode: allow all (matches existing seed.sql pattern).
-- Production would use per-user policies; the current Supabase
-- project has RLS disabled via dev_* migrations.
alter table public.evento_productos enable row level security;

create policy "Allow all operations on evento_productos"
  on public.evento_productos
  for all
  using (true)
  with check (true);