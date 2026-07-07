-- venta_correcciones.sql
-- Append-only audit table for POS sale corrections (REQ-POS-CORRECCION-1..3).
-- Sale corrections preserve traceability: the row records the financial
-- deltas (totals, metodo_pago, monto_recibido) AND full snapshots of
-- the items array before/after the edit so the audit entry is
-- self-contained. The user policy is that corrections are allowed
-- ONLY while the evento is editable (en_curso / planificacion) — that
-- guard lives in the application layer (ventas.store.corregirVenta)
-- because we don't have a built-in DB-side reference to the evento
-- state at write time without a trigger.
--
-- Idempotent: every CREATE / ALTER uses IF NOT EXISTS.
-- Re-runnable from `supabase db push` or via the Dashboard SQL editor.

create table if not exists public.venta_correcciones (
  id                       uuid primary key default gen_random_uuid(),
  venta_id                 uuid not null references public.ventas(id) on delete cascade,
  evento_id                uuid not null references public.eventos(id) on delete cascade,
  -- Financial deltas
  total_anterior           numeric(10,2) not null check (total_anterior >= 0),
  total_nuevo              numeric(10,2) not null check (total_nuevo >= 0),
  metodo_pago_anterior     text not null
    check (metodo_pago_anterior in ('efectivo','transferencia','tarjeta','mixto')),
  metodo_pago_nuevo        text not null
    check (metodo_pago_nuevo in ('efectivo','transferencia','tarjeta','mixto')),
  monto_recibido_anterior  numeric(10,2)
    check (monto_recibido_anterior is null or monto_recibido_anterior >= 0),
  monto_recibido_nuevo     numeric(10,2)
    check (monto_recibido_nuevo is null or monto_recibido_nuevo >= 0),
  -- The operator's reason for the correction. Required so the audit
  -- trail is human-readable — every correction must be motivated.
  motivo                   text not null check (length(motivo) > 0 and length(motivo) <= 500),
  -- Full snapshots of venta_items before/after the edit. Self-contained
  -- — the report does NOT need to join live venta_items rows (which may
  -- themselves have been re-edited in v2 of this feature).
  items_anteriores         jsonb not null,
  items_nuevos             jsonb not null,
  created_at               timestamptz not null default now()
);

-- Hot-path indexes: per-evento lookups for the audit report; per-venta
-- lookups for the "show corrections of this sale" UI.
create index if not exists idx_venta_correcciones_evento_id
  on public.venta_correcciones (evento_id);
create index if not exists idx_venta_correcciones_venta_id
  on public.venta_correcciones (venta_id);
create index if not exists idx_venta_correcciones_created_at
  on public.venta_correcciones (created_at desc);

comment on table public.venta_correcciones is
  'Append-only audit log of POS sale corrections. One row per edit.';
comment on column public.venta_correcciones.items_anteriores is
  'Snapshot of venta_items BEFORE the correction (full array, jsonb).';
comment on column public.venta_correcciones.items_nuevos is
  'Snapshot of venta_items AFTER the correction (full array, jsonb).';

-- RLS — match the existing dev pattern (allow all on authenticated).
alter table public.venta_correcciones enable row level security;

drop policy if exists "venta_correcciones_select_authenticated" on public.venta_correcciones;
create policy "venta_correcciones_select_authenticated" on public.venta_correcciones
  for select to authenticated using (true);

drop policy if exists "venta_correcciones_write_authenticated" on public.venta_correcciones;
create policy "venta_correcciones_write_authenticated" on public.venta_correcciones
  for all to authenticated using (true) with check (true);