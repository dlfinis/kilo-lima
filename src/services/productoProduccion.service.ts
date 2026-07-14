// event-product-management-refactor: factory service for
// `producto_produccion`. Never-throw (LSP), mirrors the existing
// service conventions (OCP/DIP).
//
// `listarPorEvento` joins through `evento_productos` so callers get
// all production rows for an event in one call. `upsertByEventoProductoId`
// writes a single row keyed by evento_producto_id — one row per event
// product, enforced by the UNIQUE constraint.
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  ProductoProduccion,
  ServiceError,
} from '@/types'

export interface ProductoProduccionService {
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: ProductoProduccion[] | null; error: ServiceError | null }>
  upsertByEventoProductoId(
    eventoProductoId: string,
    unidadesAProducir: number,
  ): Promise<{ data: ProductoProduccion | null; error: ServiceError | null }>
}

export function crearProductoProduccionService(
  supabase: SupabaseClient<Database>,
): ProductoProduccionService {
  return {
    async listarPorEvento(eventoId) {
      // Join through evento_productos: get producto_produccion rows
      // where the linked evento_producto belongs to this event.
      const respuesta = await supabase
        .from('producto_produccion')
        .select('*, evento_productos!inner(evento_id)')
        .eq('evento_productos.evento_id', eventoId)
      // Strip the joined envelope — callers want flat ProductoProduccion[].
      // Pick only the table columns; the `evento_productos` join field is
      // discarded because it's only used as a filter in the query.
      const raw = respuesta.data as Array<Record<string, unknown>> | null
      const rows = raw?.map((item) => ({
        id: item.id as string,
        evento_producto_id: item.evento_producto_id as string,
        unidades_a_producir: item.unidades_a_producir as number,
        created_at: item.created_at as string,
      })) ?? null
      return {
        data: rows,
        error: respuesta.error,
      }
    },

    async upsertByEventoProductoId(eventoProductoId, unidadesAProducir) {
      // Sanitize payload: only DB-writable fields. id and created_at
      // are DB-owned (DEFAULT gen_random_uuid() / now()).
      const payload = {
        evento_producto_id: eventoProductoId,
        unidades_a_producir: unidadesAProducir,
      }
      const respuesta = await supabase
        .from('producto_produccion')
        .upsert(
          [payload] as Database['public']['Tables']['producto_produccion']['Insert'][],
          { onConflict: 'evento_producto_id' },
        )
        .select()
        .single()
      return {
        data: (respuesta.data as ProductoProduccion | null) ?? null,
        error: respuesta.error,
      }
    },
  }
}
