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