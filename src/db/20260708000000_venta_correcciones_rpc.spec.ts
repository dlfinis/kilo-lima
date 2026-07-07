// 20260708000000_venta_correcciones_rpc.sql — structural tests.
//
// The migration is the source of truth for review findings #1, #2,
// #3, and the server-side portion of #4. These tests assert the
// migration's *contract* — its policy statements, the RPC signature,
// the explicit `for update/delete` deny rules, and the SECURITY
// DEFINER marker — by reading the migration file. We do NOT spin up
// Postgres; the dev project is the only DB instance and the migration
// is reapplied via `supabase db push` or the Dashboard SQL editor.
//
// The tests fail loudly if any future change removes a guarantee the
// review findings depend on (e.g. a "convenient" `for all` policy
// that re-opens the audit log to mutations).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260708000000_venta_correcciones_rpc.sql',
)
const migration = readFileSync(MIGRATION_PATH, 'utf-8')

describe('20260708000000_venta_correcciones_rpc.sql — contract', () => {
  it('drops the legacy FOR ALL write policy on venta_correcciones', () => {
    // The previous policy allowed update + delete, which is the
    // root cause of review finding #3 (audit not append-only).
    expect(migration).toMatch(
      /drop policy if exists "venta_correcciones_write_authenticated"/,
    )
  })

  it('adds explicit deny policies for UPDATE and DELETE (truly append-only, finding #3)', () => {
    // The deny-by-default of RLS would already block ungranted
    // actions, but we make the intent explicit so a future reader
    // does not "fix" the missing policy by adding a permissive one.
    expect(migration).toMatch(
      /create policy "venta_correcciones_update_authenticated"[\s\S]*?for update to authenticated[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/,
    )
    expect(migration).toMatch(
      /create policy "venta_correcciones_delete_authenticated"[\s\S]*?for delete to authenticated[\s\S]*?using \(false\)/,
    )
  })

  it('does NOT add a permissive INSERT policy (issue #5 — RPC-only writes)', () => {
    // Issue #5 narrowed the RLS surface: the POS UI never inserts
    // outside the RPC, so the explicit INSERT policy was dropped.
    // Without it the deny-by-default of RLS rejects any direct
    // client INSERT — the RPC continues to work because it runs as
    // the function owner (SECURITY DEFINER bypasses RLS).
    expect(migration).not.toMatch(
      /create policy "venta_correcciones_insert_authenticated"[\s\S]*?for insert to authenticated[\s\S]*?with check \(true\)/,
    )
  })

  it('declares the corregir_venta function as SECURITY DEFINER (atomicity + RLS bypass, finding #1)', () => {
    // SECURITY DEFINER lets the function write to venta_correcciones
    // and the other tables without needing client-level write grants
    // — combined with the deny-by-default of UPDATE/DELETE RLS, the
    // audit log stays append-only at the schema level.
    expect(migration).toMatch(
      /create or replace function public\.corregir_venta\(payload jsonb\)[\s\S]*?security definer/s,
    )
  })

  it('locks the venta row with FOR UPDATE (atomicity invariant, finding #1)', () => {
    // The lock serializes concurrent corrections against the same
    // venta so the audit snapshot + the live data stay consistent.
    expect(migration).toMatch(
      /select \* into v_venta[\s\S]*?from public\.ventas[\s\S]*?for update/s,
    )
  })

  it('validates the evento state inside the RPC (backend-enforced open-events-only, finding #2)', () => {
    // The check is independent of the client — a direct Supabase
    // call cannot bypass it. Cerrado / unknown states are rejected.
    expect(migration).toMatch(
      /if v_evento\.estado not in \('en_curso', 'planificacion'\) then[\s\S]*?raise exception 'EVENTO_CERRADO'/s,
    )
  })

  it('validates MONTO_INSUFICIENTE server-side for efectivo (finding #4)', () => {
    expect(migration).toMatch(
      /if v_monto_recibido_nuevo < v_total_nuevo then[\s\S]*?raise exception 'MONTO_INSUFICIENTE'/s,
    )
  })

  it('normalizes monto_recibido / cambio to null for non-efectivo (finding #4)', () => {
    // Stale cash-back values from a previous effective payment must
    // not leak into the new record.
    expect(migration).toMatch(
      /else[\s\S]*?v_monto_recibido_nuevo := null;[\s\S]*?v_cambio_nuevo := null;/s,
    )
  })

  it('requires motivo (REQ-POS-CORRECCION-3 — traceability)', () => {
    expect(migration).toMatch(
      /v_motivo := nullif\(btrim\(coalesce\(payload->>'motivo', ''\)\), ''\);[\s\S]*?if v_motivo is null then[\s\S]*?raise exception 'CORRECCION_SIN_MOTIVO'/s,
    )
  })

  it('requires a non-empty items array', () => {
    expect(migration).toMatch(
      /if jsonb_typeof\(v_items\) <> 'array' or jsonb_array_length\(v_items\) = 0 then[\s\S]*?raise exception 'CORRECCION_SIN_ITEMS'/s,
    )
  })

  it('inserts the audit row, updates the header, and replaces items in one transaction (finding #1)', () => {
    // The whole flow is in one PL/pgSQL function — implicit
    // transaction (no COMMIT/ROLLBACK in the body, so PG commits
    // the entire body or rolls it all back on any error).
    expect(migration).toMatch(
      /insert into public\.venta_correcciones/,
    )
    expect(migration).toMatch(
      /update public\.ventas/,
    )
    expect(migration).toMatch(
      /delete from public\.venta_items where venta_id = v_venta\.id/,
    )
    // No explicit COMMIT — PL/pgSQL functions run inside an
    // implicit transaction. (Word-boundary check on `COMMIT;` /
    // `ROLLBACK;` statements; the word "commit" appears in
    // comments and is excluded.)
    expect(migration).not.toMatch(/^\s*(commit|rollback)\b/im)
  })

  it('grants EXECUTE on the RPC only to authenticated', () => {
    // The function runs as its owner (postgres) and bypasses RLS
    // for its own writes. The authenticated role only needs
    // EXECUTE — no table-level write grants.
    expect(migration).toMatch(
      /grant execute on function public\.corregir_venta\(jsonb\) to authenticated/,
    )
  })

  // Issue #4: server-side recompute of financial totals. The RPC
  // previously trusted the client's `total_nuevo` and per-item
  // `subtotal`. A malicious client could send a total_nuevo that
  // didn't match the underlying line items, tampering with the
  // audit trail and the live venta header. The fix: recompute
  // subtotal from `cantidad × precio_unitario` server-side, sum the
  // recomputed subtotals into the authoritative total_nuevo, and
  // (defense in depth) reject client-sent totals that disagree.
  it('recomputes item subtotals server-side from cantidad × precio_unitario (issue #4)', () => {
    // The select into the loop must alias the recomputed subtotal
    // (e.g. v_item_subtotal) OR cast the multiplication into a
    // numeric(10,2). We assert the multiplication expression
    // appears inside the loop body so a future "optimization"
    // that trusts the client's subtotal is rejected.
    expect(migration).toMatch(
      /for v_item in[\s\S]*?loop[\s\S]*?(round\([\s\S]*?\*[\s\S]*?v_item\.cantidad[\s\S]*?v_item\.precio_unitario|quantity\s*\*\s*price)/,
    )
  })

  it('recomputes total_nuevo from the server-computed subtotals (issue #4)', () => {
    // Look for a SUM() over the recomputed subtotals that is used
    // to (re)assign v_total_nuevo. Any direct use of the client's
    // payload->>'total_nuevo' without a consistency check would
    // fail this assertion — a clear signal to the next reader.
    expect(migration).toMatch(
      /v_total_nuevo[\s\S]*?sum[\s\S]*?(subtotal|cantidad\s*\*\s*precio)/i,
    )
  })

  it('enforces a consistency check between client total_nuevo and the recomputed sum (issue #4)', () => {
    // The defensive check: if the client-sent total disagrees with
    // the recomputed sum, raise a typed exception so the audit row
    // is never written with inconsistent financial state.
    expect(migration).toMatch(
      /if\s+v_total_nuevo[^=]*<>[\s\S]*?then[\s\S]*?raise exception 'TOTAL_INCONSISTENTE'/,
    )
  })

  // Issue #5: narrow RLS to match actual UI access. The previous
  // policies granted SELECT + INSERT to authenticated. The POS UI
  // writes exclusively through the RPC (SECURITY DEFINER bypasses
  // RLS) and never reads venta_correcciones directly — the audit
  // report is out of scope for this slice. Narrowing reduces the
  // surface area for both bugs (direct mutation) and feature
  // drift (UI accidentally reading/writing the table).
  it('drops the explicit SELECT policy on venta_correcciones (issue #5)', () => {
    // The function bypasses RLS, so removing the SELECT policy
    // only affects direct client reads — the UI does not perform
    // any, so this is safe.
    expect(migration).toMatch(
      /drop policy if exists "venta_correcciones_select_authenticated"/,
    )
  })

  it('drops the explicit INSERT policy on venta_correcciones (issue #5)', () => {
    // The RPC is the only writer. Without this INSERT policy the
    // deny-by-default of RLS rejects any direct client INSERT,
    // closing the "convenient admin tooling" path that bypassed
    // the RPC's invariants (motivo, evento state, payment state).
    expect(migration).toMatch(
      /drop policy if exists "venta_correcciones_insert_authenticated"/,
    )
  })

  it('keeps the UPDATE and DELETE deny policies (true append-only, finding #3)', () => {
    // Sanity: the narrowing must not regress the explicit UPDATE
    // and DELETE deny policies added in finding #3. Without them
    // the deny-by-default of RLS would still block mutations, but
    // the explicit `using(false) with check(false)` makes the
    // intent unambiguous for the next reader.
    expect(migration).toMatch(
      /create policy "venta_correcciones_update_authenticated"[\s\S]*?for update to authenticated[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/,
    )
    expect(migration).toMatch(
      /create policy "venta_correcciones_delete_authenticated"[\s\S]*?for delete to authenticated[\s\S]*?using \(false\)/,
    )
  })
})
