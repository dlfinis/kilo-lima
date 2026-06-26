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
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  MetodoPago,
  ServiceError,
  VentaConItems,
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
}

const SIN_ITEMS: ServiceError = {
  code: 'VENTA_SIN_ITEMS',
  message: 'Una venta debe tener al menos un item',
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
        itemsConVentaId.map((it) =>
          supabase.from('venta_items').insert(it).select(),
        ),
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
  }
}