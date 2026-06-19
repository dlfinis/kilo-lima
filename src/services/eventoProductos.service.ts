// REQ-PRICING-5, REQ-FIN-17: eventoProductos service — factory pattern
// (OCP/DIP), never-throw (LSP). Mirrors the `crearProductosService`
// shape but operates on the evento-scoped join table.
//
// `inicializarDesdeCatalogo` is the bulk action: reads the productos
// table, builds one EventoProducto row per producto (incluido=true,
// precio_venta=NULL, margen=NULL), and UPSERTs them on
// `UNIQUE(evento_id, producto_id)` so re-running the bulk action is
// idempotent (REQ-PRICING-6). Manual `margen` and `precio_venta`
// edits via `actualizarPrecio` / `toggleIncluido` / `upsert` are
// preserved across the next initialization because UPSERT only
// touches rows the service inserted in this call.
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CrearEventoProductoInput,
  Database,
  EventoProducto,
  ServiceError,
} from '@/types'

export interface EventoProductosService {
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: EventoProducto[] | null; error: ServiceError | null }>
  upsert(
    eventoId: string,
    productoId: string,
    data: Pick<CrearEventoProductoInput, 'precio_venta' | 'margen' | 'incluido'>,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }>
  actualizarPrecio(
    id: string,
    precioVenta: number,
    margen: number,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }>
  toggleIncluido(
    id: string,
    incluido: boolean,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }>
  inicializarDesdeCatalogo(
    eventoId: string,
  ): Promise<{ data: EventoProducto[] | null; error: ServiceError | null }>
}

export function crearEventoProductosService(
  supabase: SupabaseClient<Database>,
): EventoProductosService {
  return {
    async listarPorEvento(eventoId) {
      const respuesta = await supabase
        .from('evento_productos')
        .select('*')
        .eq('evento_id', eventoId)
      return {
        data: (respuesta.data as EventoProducto[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async upsert(eventoId, productoId, data) {
      const payload = [
        {
          evento_id: eventoId,
          producto_id: productoId,
          precio_venta: data.precio_venta,
          margen: data.margen,
          incluido: data.incluido,
        },
      ]
      const respuesta = await supabase
        .from('evento_productos')
        .upsert(payload as Database['public']['Tables']['evento_productos']['Insert'][], {
          onConflict: 'evento_id,producto_id',
        })
        .select()
        .single()
      return {
        data: (respuesta.data as EventoProducto | null) ?? null,
        error: respuesta.error,
      }
    },

    async actualizarPrecio(id, precioVenta, margen) {
      const respuesta = await supabase
        .from('evento_productos')
        .update({ precio_venta: precioVenta, margen } as Database['public']['Tables']['evento_productos']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as EventoProducto | null) ?? null,
        error: respuesta.error,
      }
    },

    async toggleIncluido(id, incluido) {
      const respuesta = await supabase
        .from('evento_productos')
        .update({ incluido } as Database['public']['Tables']['evento_productos']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as EventoProducto | null) ?? null,
        error: respuesta.error,
      }
    },

    async inicializarDesdeCatalogo(eventoId) {
      // 1) Read the catalog. If empty, short-circuit (idempotent:
      //    nothing to upsert).
      const productosResp = await supabase.from('productos').select('id, receta_id, precio_venta')
      if (productosResp.error) {
        return { data: null, error: productosResp.error }
      }
      const productos = (productosResp.data ?? []) as Array<{ id: string }>
      if (productos.length === 0) {
        return { data: [], error: null }
      }
      // 2) Build the upsert payload. precio_venta + margen start NULL
      //    so the operator sets them per-producto via the MargenSlider.
      //    `incluido = true` so newly-initialized rows show up in the
      //    POS grid by default (REQ-PRICING-1 default).
      const payload: CrearEventoProductoInput[] = productos.map((p) => ({
        evento_id: eventoId,
        producto_id: p.id,
        precio_venta: null,
        margen: null,
        incluido: true,
      }))
      const upsertResp = await supabase
        .from('evento_productos')
        .upsert(payload as Database['public']['Tables']['evento_productos']['Insert'][], {
          onConflict: 'evento_id,producto_id',
        })
        .select()
      return {
        data: (upsertResp.data as EventoProducto[] | null) ?? null,
        error: upsertResp.error,
      }
    },
  }
}