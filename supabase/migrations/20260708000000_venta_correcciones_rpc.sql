-- ============================================================================
-- venta_correcciones_rpc.sql
-- ============================================================================
-- Closes the 7 confirmed review findings on the POS sale-correction flow:
--   1. Non-atomic correction (delete items + re-insert + audit + header
--      update happen in 4 separate non-transactional calls). The RPC below
--      collapses all of this into a single PL/pgSQL transaction.
--   2. Frontend-only enforcement of "open events only" — the client
--      store checks `estadoEsEditable` but a direct Supabase call bypasses
--      that. The RPC reads the live evento state and refuses updates
--      when the evento is cerrado.
--   3. Audit log not append-only — the existing RLS policy is `for all`
--      which permits update + delete. This migration drops that policy
--      and replaces it with narrow SELECT + INSERT; UPDATE and DELETE
--      have no policies so the deny-by-default of RLS rejects any
--      mutation attempt.
--   4. Invalid payment-state corrections — the RPC validates
--      `monto_recibido >= total` for `efectivo` and clears
--      `monto_recibido`/`cambio` for non-efectivo methods. The
--      `cambio` is recomputed server-side so the stored value is
--      always consistent with `monto_recibido - total`.
--   5. History error masquerading as empty state — handled in the
--      front end by the dialog; the server contract stays the same.
--   6. Type contract mismatch — `VentaItem.evento_producto_id` is
--      fixed in src/types/pos.types.ts; the column already exists in
--      venta_items (added in 20260620000000_finanzas_evento.sql).
--   7. Payment-method drift — handled in the front end by sourcing
--      from the centralized `METODOS_PAGO` constant.
--
-- The function is `SECURITY DEFINER` and runs as its owner (postgres),
-- which means it bypasses RLS for its own reads/writes. This is the
-- canonical way to expose privileged transactional work to a
-- least-privileged authenticated role in Supabase.
--
-- Follow-ups (applied in this migration):
--   - Issue #4: server-side recompute of total_nuevo and per-item
--     subtotal. The RPC previously trusted the client's numbers; a
--     malicious client could send a total_nuevo that didn't match the
--     underlying line items. Now the subtotal is recomputed from
--     `cantidad × precio_unitario`, summed into the authoritative
--     total, and any client-sent total that disagrees is rejected.
--   - Issue #5: narrow RLS to match actual UI access. The POS UI
--     never reads venta_correcciones directly and never inserts
--     outside the RPC. Drop the explicit SELECT and INSERT policies
--     so the deny-by-default of RLS rejects any direct client
--     access; the RPC continues to work because it runs as the
--     function owner (SECURITY DEFINER bypasses RLS).
--
-- Idempotent: every CREATE/REPLACE/DROP is guarded. Safe to re-run
-- via `supabase db push` or via the Dashboard SQL editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tighten RLS on venta_correcciones — truly append-only.
-- ----------------------------------------------------------------------------
-- Drop the existing permissive "for all" policy. The new policies only
-- allow SELECT and INSERT; UPDATE and DELETE are not granted, so any
-- direct client attempt will be denied by RLS's deny-by-default.

drop policy if exists "venta_correcciones_write_authenticated"
  on public.venta_correcciones;

drop policy if exists "venta_correcciones_update_authenticated"
  on public.venta_correcciones;
create policy "venta_correcciones_update_authenticated"
  on public.venta_correcciones
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists "venta_correcciones_delete_authenticated"
  on public.venta_correcciones;
create policy "venta_correcciones_delete_authenticated"
  on public.venta_correcciones
  for delete to authenticated
  using (false);

-- Issue #5: drop the SELECT and INSERT policies. The POS UI does not
-- perform direct reads of venta_correcciones (the audit report is
-- out of scope for this slice) and never inserts outside the RPC.
-- Without these policies the deny-by-default of RLS rejects any
-- direct client access; the SECURITY DEFINER RPC continues to work
-- because it runs as the function owner and bypasses RLS for its
-- own reads/writes.
drop policy if exists "venta_correcciones_select_authenticated"
  on public.venta_correcciones;
drop policy if exists "venta_correcciones_insert_authenticated"
  on public.venta_correcciones;

-- ----------------------------------------------------------------------------
-- 2) Atomic correction RPC.
-- ----------------------------------------------------------------------------
-- Inputs (jsonb):
--   {
--     "venta_id":              uuid,
--     "evento_id":             uuid,
--     "motivo":                text  (required, non-empty, length 1..500),
--     "total_nuevo":           numeric(10,2)  (>= 0),  -- advisory; recomputed server-side
--     "metodo_pago_nuevo":     text  (in {efectivo, transferencia, tarjeta, mixto}),
--     "monto_recibido_nuevo":  numeric(10,2) | null  (required for efectivo),
--     "items":                 [ { producto_id, cantidad, precio_unitario,
--                                  subtotal, costo_unitario?, margen_aplicado?,
--                                  evento_producto_id? }, ... ]  (>= 1 item)
--   }
--
-- Returns (jsonb):
--   { "venta": { ...row... }, "items": [ { ...row... }, ... ] }
--
-- Errors (raised as PG exceptions; the service layer maps them to
-- typed ServiceError codes by parsing the message text):
--   'CORRECCION_SIN_MOTIVO'     — motivo is null/empty/whitespace
--   'CORRECCION_MOTIVO_MUY_LARGO' — motivo longer than 500 chars
--   'CORRECCION_SIN_ITEMS'      — items array is empty
--   'TOTAL_REQUERIDO'           — total_nuevo is null
--   'TOTAL_NEGATIVO'            — recomputed total_nuevo < 0
--   'TOTAL_INCONSISTENTE'       — client-sent total_nuevo disagrees with
--                                  the server-computed sum of subtotals
--                                  (issue #4 — audit-trail tamper guard)
--   'VENTA_NO_ENCONTRADA'       — venta_id does not exist
--   'EVENTO_CERRADO'            — evento state is not in (en_curso, planificacion)
--   'METODO_PAGO_INVALIDO'      — metodo_pago_nuevo is not in the allowed set
--   'MONTO_INSUFICIENTE'        — efectivo + monto_recibido < total_nuevo

create or replace function public.corregir_venta(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta                 record;
  v_evento                record;
  v_audit_id              uuid;
  v_motivo                text;
  v_metodo_pago_nuevo     text;
  v_monto_recibido_nuevo  numeric(10,2);
  v_cambio_nuevo          numeric(10,2);
  -- Issue #4: server-recomputed authoritative total. The client's
  -- payload->>'total_nuevo' is only consulted for the consistency
  -- check (TOTAL_INCONSISTENTE) — the value the DB actually writes
  -- comes from v_total_nuevo_recomputado.
  v_total_nuevo           numeric(10,2);
  v_total_nuevo_cliente   numeric(10,2);
  v_total_nuevo_recomputado numeric(10,2);
  v_items                 jsonb;
  v_anteriores            jsonb;
  v_item                  record;
  v_item_subtotal         numeric(10,2);
  v_nuevos_items          jsonb := '[]'::jsonb;
begin
  -- 1) Required input: motivo.
  v_motivo := nullif(btrim(coalesce(payload->>'motivo', '')), '');
  if v_motivo is null then
    raise exception 'CORRECCION_SIN_MOTIVO' using errcode = 'P0001';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'CORRECCION_MOTIVO_MUY_LARGO' using errcode = 'P0001';
  end if;

  -- 2) Required input: metodo_pago_nuevo.
  v_metodo_pago_nuevo := payload->>'metodo_pago_nuevo';
  if v_metodo_pago_nuevo not in ('efectivo','transferencia','tarjeta','mixto') then
    raise exception 'METODO_PAGO_INVALIDO' using errcode = 'P0001';
  end if;

  -- 3) Required input: items (non-empty array).
  v_items := coalesce(payload->'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'CORRECCION_SIN_ITEMS' using errcode = 'P0001';
  end if;

  -- 4) Lock the venta row. SELECT ... FOR UPDATE serializes concurrent
  --    corrections against the same venta and gives us the current
  --    financial state for the audit snapshot.
  select * into v_venta
  from public.ventas
  where id = (payload->>'venta_id')::uuid
  for update;
  if not found then
    raise exception 'VENTA_NO_ENCONTRADA' using errcode = 'P0001';
  end if;

  -- 5) Verify the evento is editable (backend-enforced protection,
  --    closes review finding #2). The client may lie about the evento
  --    state in the request body, but the DB knows the truth.
  select * into v_evento
  from public.eventos
  where id = v_venta.evento_id
  for share;
  if v_evento.estado not in ('en_curso', 'planificacion') then
    raise exception 'EVENTO_CERRADO' using errcode = 'P0001';
  end if;

  -- 6) Issue #4 — first pass over the items: recompute each subtotal
  --    from `cantidad × precio_unitario` (rounded to cents). This
  --    intentionally IGNORES the client-provided `subtotal` column —
  --    a malicious client could otherwise send a subtotal that
  --    disagrees with the underlying quantity × unit price, tampering
  --    with the audit trail. The recomputed value is what gets
  --    inserted, audited, and summed into the authoritative total.
  --
  --    We accumulate the subtotals into a jsonb array so we can sum
  --    them in step 6b without re-reading venta_items. The items
  --    array is not inserted yet — that happens in step 9.
  v_total_nuevo_recomputado := 0;
  for v_item in
    select * from jsonb_to_recordset(v_items) as x(
      producto_id        uuid,
      cantidad           numeric(10,4),
      precio_unitario    numeric(10,2),
      subtotal           numeric(10,2),
      costo_unitario     numeric(10,2),
      margen_aplicado    numeric(5,4),
      evento_producto_id uuid
    )
  loop
    v_item_subtotal := round((v_item.cantidad * v_item.precio_unitario)::numeric, 2);
    v_total_nuevo_recomputado := v_total_nuevo_recomputado + v_item_subtotal;
  end loop;
  v_total_nuevo_recomputado := round(v_total_nuevo_recomputado, 2);

  -- 6b) Compare with the client's total_nuevo. If they disagree
  --     we refuse the correction — the audit row would otherwise
  --     carry inconsistent financial state. The client is the
  --     transport, not the source of truth.
  if (payload->>'total_nuevo') is null then
    raise exception 'TOTAL_REQUERIDO' using errcode = 'P0001';
  end if;
  v_total_nuevo_cliente := (payload->>'total_nuevo')::numeric(10,2);
  if v_total_nuevo_recomputado <> v_total_nuevo_cliente then
    raise exception 'TOTAL_INCONSISTENTE' using errcode = 'P0001';
  end if;
  v_total_nuevo := v_total_nuevo_recomputado;
  if v_total_nuevo < 0 then
    raise exception 'TOTAL_NEGATIVO' using errcode = 'P0001';
  end if;

  -- 7) Normalize monto_recibido / cambio (closes review finding #4).
  --    For non-efectivo methods both columns are NULL. For efectivo,
  --    cambio is recomputed server-side so the stored value is always
  --    consistent with monto_recibido - total.
  if v_metodo_pago_nuevo = 'efectivo' then
    if (payload->>'monto_recibido_nuevo') is null then
      raise exception 'MONTO_REQUERIDO_PARA_EFECTIVO' using errcode = 'P0001';
    end if;
    v_monto_recibido_nuevo := (payload->>'monto_recibido_nuevo')::numeric(10,2);
    if v_monto_recibido_nuevo < v_total_nuevo then
      raise exception 'MONTO_INSUFICIENTE' using errcode = 'P0001';
    end if;
    v_cambio_nuevo := round((v_monto_recibido_nuevo - v_total_nuevo)::numeric, 2);
  else
    v_monto_recibido_nuevo := null;
    v_cambio_nuevo := null;
  end if;

  -- 8) Capture the BEFORE snapshot of the items array (so the audit
  --    trail reflects what was actually there at the moment of the
  --    edit, regardless of what the client claims).
  select coalesce(
    jsonb_agg(to_jsonb(vi) order by vi.created_at),
    '[]'::jsonb
  ) into v_anteriores
  from public.venta_items vi
  where vi.venta_id = v_venta.id;

  -- 9) Insert the audit row FIRST. The audit trail is the durable
  --    record of intent; the items_nuevos snapshot is filled in at
  --    the end of the transaction. If anything fails below, the
  --    whole transaction rolls back (audit included).
  insert into public.venta_correcciones (
    venta_id, evento_id,
    total_anterior, total_nuevo,
    metodo_pago_anterior, metodo_pago_nuevo,
    monto_recibido_anterior, monto_recibido_nuevo,
    motivo, items_anteriores, items_nuevos
  ) values (
    v_venta.id, v_venta.evento_id,
    v_venta.total, v_total_nuevo,
    v_venta.metodo_pago, v_metodo_pago_nuevo,
    v_venta.monto_recibido, v_monto_recibido_nuevo,
    v_motivo, v_anteriores, '[]'::jsonb
  )
  returning id into v_audit_id;

  -- 10) Update the venta header.
  update public.ventas
  set total            = v_total_nuevo,
      metodo_pago      = v_metodo_pago_nuevo,
      monto_recibido   = v_monto_recibido_nuevo,
      cambio           = v_cambio_nuevo
  where id = v_venta.id
  returning * into v_venta;

  -- 11) Replace the items array atomically. Explicit DELETE (instead
  --     of relying on the FK cascade) keeps the entire operation
  --     inside this transaction so the audit row, the header update,
  --     and the items array all commit or all roll back together.
  delete from public.venta_items where venta_id = v_venta.id;

  for v_item in
    select * from jsonb_to_recordset(v_items) as x(
      producto_id        uuid,
      cantidad           numeric(10,4),
      precio_unitario    numeric(10,2),
      subtotal           numeric(10,2),
      costo_unitario     numeric(10,2),
      margen_aplicado    numeric(5,4),
      evento_producto_id uuid
    )
  loop
    -- Issue #4: subtotal is recomputed server-side from
    -- `cantidad × precio_unitario`. The client's `subtotal` field
    -- is accepted in the jsonb for backwards compatibility but is
    -- never trusted — the DB-computed value is what gets written.
    v_item_subtotal := round((v_item.cantidad * v_item.precio_unitario)::numeric, 2);
    insert into public.venta_items (
      venta_id, producto_id, cantidad,
      precio_unitario, subtotal,
      costo_unitario, margen_aplicado, evento_producto_id
    ) values (
      v_venta.id, v_item.producto_id, v_item.cantidad,
      v_item.precio_unitario, v_item_subtotal,
      v_item.costo_unitario, v_item.margen_aplicado, v_item.evento_producto_id
    )
    returning to_jsonb(venta_items.*) into v_item;
    v_nuevos_items := v_nuevos_items || jsonb_build_array(v_item);
  end loop;

  -- 12) Stamp the audit row with the new items snapshot.
  update public.venta_correcciones
  set items_nuevos = v_nuevos_items
  where id = v_audit_id;

  -- 13) Return the post-correction state to the caller.
  return jsonb_build_object(
    'venta', to_jsonb(v_venta),
    'items', v_nuevos_items
  );
end;
$$;

-- Grant EXECUTE on the RPC to authenticated users. SECURITY DEFINER
-- means the function runs as the owner (postgres) and bypasses RLS,
-- so the authenticated role doesn't need table-level write grants
-- on ventas / venta_items / venta_correcciones for the RPC to work.
-- Issue #5: with the SELECT and INSERT policies dropped, the
-- authenticated role has NO direct table access to venta_correcciones
-- (only the explicit UPDATE/DELETE deny policies remain). The RPC is
-- the only path the UI uses, and it works because SECURITY DEFINER
-- bypasses RLS for its own reads/writes.
revoke all on function public.corregir_venta(jsonb) from public;
grant execute on function public.corregir_venta(jsonb) to authenticated;

comment on function public.corregir_venta(jsonb) is
  'Atomic POS sale-correction: validates motivo + evento state + payment '
  'state, recomputes total_nuevo and per-item subtotal server-side '
  '(audit-trail tamper guard, issue #4), inserts the audit row, '
  'updates the venta header, and replaces the items array — all in '
  'one transaction. SECURITY DEFINER + the narrowed RLS (no SELECT/INSERT '
  'policies for authenticated; only explicit UPDATE/DELETE deny policies '
  'remain) make the audit log truly append-only and the table reachable '
  'only through this function.';