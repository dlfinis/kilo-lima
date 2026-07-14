-- ============================================================================
-- stock_movements.sql
-- ============================================================================
-- inventory-accounting-workflow-refactor / Phase 2: Stock Movement Ledger
-- Foundation.
--
-- Creates the append-only stock_movements table that becomes the source
-- of truth for raw-material inventory. Every stock-affecting action
-- (purchase, consumption, correction, adjustment) is recorded as a row;
-- available stock is derived from SUM(cantidad), never from manual
-- overwrites of materias_primas.cantidad_disponible.
--
-- Design matches the existing venta_correcciones pattern:
--   - tipo enum with four valid states
--   - CHECK constraint on cantidad (non-zero)
--   - append-only RLS (SELECT + INSERT granted; UPDATE + DELETE denied)
--   - idempotent — every CREATE / ALTER uses IF NOT EXISTS
--
-- This migration is the first of three for Phase 2:
--   1) stock_movements table + indexes + RLS (this file)
--   2) stock_movement_views.sql — derived-stock view, backfill, cache-sync
--   3) stock_movement_rpcs.sql — registrar_compra, registrar_consumo,
--      registrar_correccion, finalizar_evento_snapshot
--
-- Re-runnable from `supabase db push` or via the Dashboard SQL editor.
-- ============================================================================

-- 1) Movement type enum (idempotent guard via DO block).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_movimiento') then
    create type public.tipo_movimiento as enum (
      'compra',
      'consumo',
      'correccion',
      'ajuste'
    );
  end if;
end;
$$;

-- 2) stock_movements table — append-only ledger.
--    cantidad is signed: positive entries add stock (compra, ajuste);
--    negative entries subtract stock (consumo) or adjust previous
--    entries (correccion). The CHECK(cantidad <> 0) guarantees every
--    row has a meaningful quantity impact.
create table if not exists public.stock_movements (
  id                        uuid primary key default gen_random_uuid(),
  materia_prima_id          uuid not null
    references public.materias_primas(id) on delete restrict,
  cantidad                  numeric(10,2) not null check (cantidad <> 0),
  tipo                      public.tipo_movimiento not null,
  evento_id                 uuid
    references public.eventos(id) on delete set null,
  compra_insumo_id          uuid
    references public.compras_insumos(id) on delete set null,
  venta_id                  uuid
    references public.ventas(id) on delete set null,
  movimiento_corregido_id   uuid
    references public.stock_movements(id) on delete set null,
  costo_unitario_snapshot   numeric(10,4)
    check (costo_unitario_snapshot is null or costo_unitario_snapshot >= 0),
  motivo                    text
    check (motivo is null or (length(motivo) > 0 and length(motivo) <= 500)),
  fecha                     date not null default current_date,
  created_at                timestamptz not null default now(),
  created_by                uuid
);

comment on table public.stock_movements is
  'Append-only stock movement ledger. cantidad is signed — positive values '
  'add stock, negative values subtract. Derived stock = SUM(cantidad) per '
  'materia_prima. Corrections reference the original movement via '
  'movimiento_corregido_id and carry a mandatory motivo. Direct UPDATE and '
  'DELETE are denied by RLS.';

-- 3) Indexes — hot paths: per-material lookups, per-evento consumption
--    summaries, tipo filtering, and chronological queries.
create index if not exists idx_stock_movements_materia_prima_id
  on public.stock_movements (materia_prima_id);
create index if not exists idx_stock_movements_evento_id
  on public.stock_movements (evento_id);
create index if not exists idx_stock_movements_tipo
  on public.stock_movements (tipo);
create index if not exists idx_stock_movements_fecha
  on public.stock_movements (fecha);
create index if not exists idx_stock_movements_created_at
  on public.stock_movements (created_at desc);
create index if not exists idx_stock_movements_compra_insumo_id
  on public.stock_movements (compra_insumo_id);

-- 4) RLS — append-only enforcement.
--    SELECT and INSERT are granted to authenticated users so the app
--    can read the ledger and append new movements (including through
--    RPCs that run as SECURITY DEFINER). UPDATE and DELETE are
--    explicitly denied — corrections add a new row referencing the
--    original via movimiento_corregido_id.
alter table public.stock_movements enable row level security;

drop policy if exists "stock_movements_select_authenticated"
  on public.stock_movements;
create policy "stock_movements_select_authenticated"
  on public.stock_movements
  for select to authenticated
  using (true);

drop policy if exists "stock_movements_insert_authenticated"
  on public.stock_movements;
create policy "stock_movements_insert_authenticated"
  on public.stock_movements
  for insert to authenticated
  with check (true);

drop policy if exists "stock_movements_update_deny"
  on public.stock_movements;
create policy "stock_movements_update_deny"
  on public.stock_movements
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists "stock_movements_delete_deny"
  on public.stock_movements;
create policy "stock_movements_delete_deny"
  on public.stock_movements
  for delete to authenticated
  using (false);
