-- pos_cambio_comprobante.sql
-- POS redesign (REQ-POS-CAMBIO-5, REQ-POS-COMPROBANTE-5): adds three
-- nullable columns to public.ventas for cash-back (cambio), amount
-- received (monto_recibido), and a sequential comprobante_numero per
-- evento. All three are nullable to preserve legacy rows.
--
-- CHECK constraints reject negative values at the DB level (mirror of
-- the pure `calcularCambio` function — defense in depth).
--
-- The unique partial index (evento_id, comprobante_numero) is the
-- safety net for the app-level `COUNT(*) + 1` numbering strategy
-- (AD1 in the design). Concurrent inserters would race; the unique
-- index surfaces a 23505 duplicate-key error so the caller can retry
-- on the next available number. Per spec the receipt numbering is
-- best-effort — gaps are acceptable; collisions are not.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Re-runnable from `supabase db push`.
--
-- Per REQ-POS-CAMBIO-5 + REQ-POS-COMPROBANTE-4 + REQ-POS-COMPROBANTE-5.

alter table public.ventas
  add column if not exists monto_recibido numeric(10,2)
    check (monto_recibido is null or monto_recibido >= 0);

alter table public.ventas
  add column if not exists cambio numeric(10,2)
    check (cambio is null or cambio >= 0);

alter table public.ventas
  add column if not exists comprobante_numero text;

create unique index if not exists uq_ventas_comprobante_evento
  on public.ventas (evento_id, comprobante_numero)
  where comprobante_numero is not null;

comment on column public.ventas.monto_recibido is
  'Monto recibido del cliente (efectivo). Nullable — solo ventas en efectivo.';
comment on column public.ventas.cambio is
  'Cambio devuelto (monto_recibido − total). Nullable.';
comment on column public.ventas.comprobante_numero is
  'Número secuencial de comprobante por evento (V-001, V-002...).';
