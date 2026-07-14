// REQ-POS-12, REQ-POS-13, REQ-POS-17, REQ-POS-19, REQ-POS-52,
// REQ-POS-53: ventas service — factory pattern (OCP/DIP), never-throw
// (LSP). `registrarVenta` inserts the venta header first, then all
// items via Promise.all so a single item failure surfaces
// immediately. On item failure we best-effort delete the just-inserted
// header so the store can retry without orphaned venta rows. v1 is
// intentionally not wrapped in an RPC (atomic in a future slice per
// design §2).
//
// Snapshot pricing (REQ-POS-13): `precio_unitario` and `subtotal` are
// columns at write time — the service does NOT re-read
// `productos.precio_venta` on insert. The caller (cart) hands them
// in already snapshotted.
//
// FUTURE: authorization hardening. Today this is a single-user PWA
// using Supabase anon key + RLS policies. The `corregir_venta` RPC
// runs as SECURITY DEFINER and bypasses RLS for its writes, which is
// correct for the current design (trusted single-user device). When
// multi-user auth is introduced (useAuth composable, JWT sessions,
// per-socio ownership), the RPC should be audited to ensure it only
// operates on ventas that belong to the calling user's active evento.
// The migration at 20260708000000 already narrows RLS on
// venta_correcciones to deny-by-default — the same pattern should be
// extended to ventas + venta_items when auth goes live.
// See: supabase/migrations/20260708000000_venta_correcciones_rpc.sql §1
// and src/composables/useAuth.ts (placeholder for future auth slice).
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  MetodoPago,
  ServiceError,
  VentaConItems,
  VentaCorreccionInput,
  VentaItem,
  VentaItemInput,
} from '@/types'

// Input shape for `registrarVenta`. Lives next to the service because
// it is the caller's contract — the cart hands it in already priced.
//
// pos-redesign (REQ-POS-CAMBIO-5, REQ-POS-COMPROBANTE-5): the three
// cash-back / receipt columns are optional — the store derives them
// from montoRecibido + the active evento (comprobante_numero).
export interface VentaConItemsInput {
  evento_id: string
  metodo_pago: MetodoPago
  total: number
  monto_recibido?: number | null
  cambio?: number | null
  comprobante_numero?: string | null
  items: VentaItemInput[]
}

export interface VentasService {
  listar(): Promise<{ data: VentaConItems[] | null; error: ServiceError | null }>
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: VentaConItems[] | null; error: ServiceError | null }>
  registrarVenta(
    input: VentaConItemsInput,
  ): Promise<{ data: VentaConItems | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
  // pos-redesign (REQ-POS-COMPROBANTE-4): returns the next sequential
  // comprobante_numero (`V-001`, `V-002`, ...) for the given evento.
  // Uses COUNT(*) + 1 — AD1 in the design. Single-user PWA: no
  // concurrent writers in practice; the unique partial index catches
  // a rare collision (23505) so the caller can retry.
  generarComprobanteNumero(eventoId: string): Promise<string>
  // REQ-POS-CORRECCION-1..3: apply a sale correction atomically.
  //
  // The previous v1 flow did four non-transactional calls (delete
  // items, re-insert items, insert audit, update header) and could
  // leave the live data, the audit row, and the items array
  // inconsistent on partial failure. The new implementation collapses
  // all of this into a single RPC call (`public.corregir_venta`) that
  // runs as a SECURITY DEFINER PL/pgSQL transaction in the database.
  // Benefits:
  //   - atomicity (review finding #1)
  //   - backend-enforced evento-state guard (review finding #2)
  //   - append-only audit guaranteed at the schema level (finding #3)
  //   - server-validated MONTO_INSUFICIENTE + monto_recibido/cambio
  //     normalization (review finding #4)
  // The store still applies defense-in-depth checks (motivo,
  // MONTO_INSUFICIENTE, evento state) so the operator gets the error
  // before any wire round-trip.
  corregirVenta(
    input: VentaCorreccionInput,
  ): Promise<{ data: VentaConItems | null; error: ServiceError | null }>
}

const SIN_ITEMS: ServiceError = {
  code: 'VENTA_SIN_ITEMS',
  message: 'Una venta debe tener al menos un item',
}
// REQ-POS-CORRECCION-3: motivo is the human-readable audit invariant.
// The DB also enforces non-empty motivo via CHECK, but we short-circuit
// at the service layer so the user gets the error before any write.
const CORRECCION_SIN_MOTIVO: ServiceError = {
  code: 'CORRECCION_SIN_MOTIVO',
  message: 'Una corrección debe tener un motivo registrado',
}

// RPC → typed ServiceError mapper. The `public.corregir_venta` RPC
// raises PG exceptions with our domain codes as the exception text
// (e.g. `raise exception 'EVENTO_CERRADO' using errcode = 'P0001'`).
// Supabase surfaces the exception text in `error.message`. We parse
// that text and remap to a typed `ServiceError` so the rest of the
// app can keep its never-throw contract (LSP) and render specific
// toasts / banners per error code.
function mapearErrorRpc(error: { message?: string; code?: string } | null): ServiceError {
  const msg = (error?.message ?? '').toString()
  if (msg === 'EVENTO_CERRADO') {
    return { code: 'EVENTO_CERRADO', message: 'El evento está cerrado' }
  }
  if (msg === 'CORRECCION_SIN_MOTIVO') {
    return { code: 'CORRECCION_SIN_MOTIVO', message: 'Una corrección debe tener un motivo registrado' }
  }
  if (msg === 'CORRECCION_MOTIVO_MUY_LARGO') {
    return { code: 'CORRECCION_MOTIVO_MUY_LARGO', message: 'El motivo es demasiado largo (máx. 500 caracteres)' }
  }
  if (msg === 'MONTO_INSUFICIENTE') {
    return { code: 'MONTO_INSUFICIENTE', message: 'El monto recibido es menor que el total' }
  }
  if (msg === 'MONTO_REQUERIDO_PARA_EFECTIVO') {
    return { code: 'MONTO_INSUFICIENTE', message: 'El monto recibido es obligatorio para ventas en efectivo' }
  }
  if (msg === 'CORRECCION_SIN_ITEMS') {
    return { code: 'VENTA_SIN_ITEMS', message: 'Una venta debe tener al menos un item' }
  }
  if (msg === 'VENTA_NO_ENCONTRADA') {
    return { code: 'VENTA_NO_ENCONTRADA', message: 'La venta que querés corregir ya no existe' }
  }
  if (msg === 'METODO_PAGO_INVALIDO') {
    return { code: 'METODO_PAGO_INVALIDO', message: 'Método de pago no soportado' }
  }
  if (msg === 'TOTAL_NEGATIVO' || msg === 'TOTAL_REQUERIDO') {
    return { code: 'TOTAL_INVALIDO', message: 'El total de la venta no es válido' }
  }
  if (msg === 'TOTAL_INCONSISTENTE') {
    // Issue #4: client-sent total_nuevo disagreed with the server-
    // recomputed sum of subtotals. The RPC refused the correction
    // to keep the audit trail tamper-proof.
    return {
      code: 'TOTAL_INVALIDO',
      message: 'El total enviado no coincide con la suma de los items',
    }
  }
  return {
    code: (error?.code ?? 'UNKNOWN').toString(),
    message: msg || 'Error desconocido al corregir la venta',
  }
}

export function crearVentasService(supabase: SupabaseClient<Database>): VentasService {
  return {
    async listar() {
      const respuesta = await supabase
        .from('ventas')
        .select('*, items:venta_items(*)')
        .order('fecha', { ascending: false })
      return {
        data: (respuesta.data as VentaConItems[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async listarPorEvento(eventoId) {
      const respuesta = await supabase
        .from('ventas')
        .select('*, items:venta_items(*)')
        .eq('evento_id', eventoId)
        .order('fecha', { ascending: false })
      return {
        data: (respuesta.data as VentaConItems[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async registrarVenta(input) {
      // REQ-POS-17: short-circuit zero-item carts so the header insert
      // never fires (no orphaned venta row).
      if (input.items.length === 0) {
        return { data: null, error: SIN_ITEMS }
      }

      // 1) Header insert — returns the venta id used to tag each item.
      // pos-redesign: forward the cash-back + comprobante_numero cols
      // when the caller provides them (store-derives them; service
      // stays dumb and just forwards).
      const insercion = await supabase
        .from('ventas')
        .insert({
          evento_id: input.evento_id,
          metodo_pago: input.metodo_pago,
          total: input.total,
          monto_recibido: input.monto_recibido ?? null,
          cambio: input.cambio ?? null,
          comprobante_numero: input.comprobante_numero ?? null,
        } as Database['public']['Tables']['ventas']['Insert'])
        .select()
        .single()
      if (insercion.error || !insercion.data) {
        return { data: null, error: insercion.error }
      }
      const venta = insercion.data as VentaConItems

      // 2) Items insert — Promise.all so the first failure short-circuits.
      // REQ-FIN-12: forward costo_unitario + margen_aplicado (nullable,
      // legacy-safe — null = "no snapshot at sale time", contributes 0
      // to COGS via `?? 0` in utils/cierre.ts per REQ-FIN-8 / PD-4).
      // productos-configurables: insert personalizations after each item.
      const itemsConVentaId: Database['public']['Tables']['venta_items']['Insert'][] =
        input.items.map((it) => ({
          venta_id: venta.id,
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          subtotal: it.subtotal,
          costo_unitario: it.costo_unitario ?? null,
          margen_aplicado: it.margen_aplicado ?? null,
        }))
      const inserciones = await Promise.all(
        itemsConVentaId.map(async (it, index) => {
          const insercion = await supabase.from('venta_items').insert(it).select()
          if (insercion.error || !insercion.data) {
            return insercion
          }
          
          // productos-configurables: insert personalizations for this item
          const itemInput = input.items[index]
          if (itemInput && itemInput.personalizaciones && itemInput.personalizaciones.length > 0) {
            const ventaItemId = (insercion.data[0] as any).id
            const personalizacionesInsert = itemInput.personalizaciones.map((p) => ({
              venta_item_id: ventaItemId,
              grupo_id: p.grupo_id,
              materia_prima_id: p.materia_prima_id,
              es_incluido: p.es_incluido,
              costo_unitario: p.costo_unitario,
              precio_venta_extra: p.precio_venta_extra,
              cantidad: p.cantidad,
            }))
            await supabase.from('venta_item_personalizaciones').insert(personalizacionesInsert)
          }
          
          return insercion
        }),
      )
      const primerError = inserciones.find((r) => r.error)?.error ?? null
      if (primerError) {
        // Best-effort rollback so a retry doesn't produce duplicate
        // ventas. Failures of the rollback itself are ignored — the
        // caller's error is the item error, not the cleanup error.
        await supabase.from('ventas').delete().eq('id', venta.id)
        return { data: null, error: primerError }
      }

      // 3) Stitch the items array from the insert responses in input
      // order so the caller gets the canonical VentaConItems shape.
      const items: VentaItem[] = inserciones
        .map((r) => (r.data as VentaItem[] | null) ?? [])
        .flat()
      return { data: { ...venta, items }, error: null }
    },

    async eliminar(id) {
      // REQ-POS-19: ON DELETE CASCADE on venta_items.venta_id removes
      // the child rows automatically.
      const respuesta = await supabase.from('ventas').delete().eq('id', id)
      return { data: null, error: respuesta.error }
    },

    async generarComprobanteNumero(eventoId: string): Promise<string> {
      // REQ-POS-COMPROBANTE-4: COUNT(*) + 1 per evento. `head: true`
      // skips fetching the row bodies — we only need the count.
      // Filters by evento_id AND comprobante_numero IS NOT NULL so
      // legacy rows (null comprobante_numero) don't break the
      // sequence.
      const respuesta = await supabase
        .from('ventas')
        .select('*', { count: 'exact', head: true })
        .eq('evento_id', eventoId)
        .not('comprobante_numero', 'is', null)
      const count = respuesta.count ?? 0
      // ServiceError from the underlying query is intentionally
      // swallowed as a generation failure — the caller can retry. We
      // do not throw (never-throw LSP contract).
      return `V-${String(count + 1).padStart(3, '0')}`
    },

    async corregirVenta(input) {
      // REQ-POS-CORRECCION-3: traceability invariant — every edit must
      // have a motivo. The RPC also enforces this server-side, but we
      // short-circuit so the operator gets the error before any wire
      // round-trip.
      if (!input.motivo || input.motivo.trim().length === 0) {
        return { data: null, error: CORRECCION_SIN_MOTIVO }
      }
      // Atomic correction via the public.corregir_venta RPC. See the
      // migration 20260708000000_venta_correcciones_rpc.sql for the
      // full contract. The RPC handles:
      //   - motivo non-empty check
      //   - items non-empty check
      //   - venta existence + evento state (closes #2)
      //   - monto_recibido >= total for efectivo (closes #4)
      //   - monto_recibido/cambio normalization for non-efectivo (#4)
      //   - audit row insert + venta header update + items replace
      //     in a single transaction (closes #1)
      //   - audit row is append-only at the schema level (#3)
      //
      // The generated supabase-js types don't know about our custom
      // RPC (the typegen is regenerated when we run `supabase gen
      // types` against the live DB), so we cast the params/response
      // through `unknown` to keep the typed client happy without a
      // run-time schema regeneration cycle.
      const rpc = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>
      )('corregir_venta', {
        payload: {
          venta_id: input.venta_id,
          evento_id: input.evento_id,
          motivo: input.motivo.trim(),
          total_nuevo: input.total_nuevo,
          metodo_pago_nuevo: input.metodo_pago_nuevo,
          // cambio is always recomputed server-side for efectivo, and
          // always null for non-efectivo. We forward the caller's
          // `monto_recibido_nuevo` as-is for the efectivo branch; the
          // RPC will validate it.
          monto_recibido_nuevo: input.monto_recibido_nuevo,
          // cambio_nuevo is intentionally NOT forwarded — the RPC is
          // the source of truth. Forwarding a stale client value would
          // race the server-computed one.
          items: input.items_nuevos.map((it) => ({
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal: it.subtotal,
            costo_unitario: it.costo_unitario ?? null,
            margen_aplicado: it.margen_aplicado ?? null,
            evento_producto_id: it.evento_producto_id ?? null,
          })),
        },
      })
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      // (rpc.data already typed as unknown above)
      // The RPC returns { venta: {...}, items: [...] }. Stitch them
      // into the VentaConItems shape the rest of the app expects.
      const rpcData = rpc.data as { venta?: VentaConItems; items?: VentaItem[] } | null
      if (!rpcData?.venta) {
        return { data: null, error: { code: 'UNKNOWN', message: 'RPC devolvió respuesta vacía' } }
      }
      return {
        data: { ...rpcData.venta, items: rpcData.items ?? [] },
        error: null,
      }
    },
  }
}