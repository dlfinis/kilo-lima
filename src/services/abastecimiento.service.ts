// REQ-ABASTECIMIENTO-1..3: abastecimiento service — factory pattern
// (OCP/DIP), never-throw (LSP). Extracts compras_insumos from the
// socios domain and wraps the registrar_compra RPC so every purchase
// creates both a compras_insumos row AND a stock_movements row.
// Follows the existing stockMovements.service.ts pattern: the caller
// supplies the supabase client, the service never throws, RPC errors
// are mapped to typed ServiceError codes.
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CompraInsumo,
  CompraInsumoInput,
  Database,
  RegistrarCompraInput,
  RegistrarCompraInsumoInput,
  ServiceError,
  StockMovement,
} from '@/types'

export interface AbastecimientoService {
  listarCompras(eventoId: string): Promise<{
    data: CompraInsumo[] | null
    error: ServiceError | null
  }>
  crearCompra(
    input: CompraInsumoInput,
  ): Promise<{ data: CompraInsumo | null; error: ServiceError | null }>
  eliminarCompra(
    id: string,
  ): Promise<{ data: null; error: ServiceError | null }>
  registrarCompra(
    input: RegistrarCompraInput,
  ): Promise<{ data: StockMovement | null; error: ServiceError | null }>
  registrarCompraInsumo(
    input: RegistrarCompraInsumoInput,
  ): Promise<{ data: StockMovement | null; error: ServiceError | null }>
}

// RPC → typed ServiceError mapper. Same pattern as stockMovements.service.ts.
function mapearErrorRpc(
  error: { message?: string; code?: string } | null,
): ServiceError {
  const msg = (error?.message ?? '').toString()
  if (msg === 'CANTIDAD_INVALIDA') {
    return {
      code: 'CANTIDAD_INVALIDA',
      message: 'La cantidad debe ser mayor que cero',
    }
  }
  if (msg === 'COSTO_INVALIDO') {
    return {
      code: 'COSTO_INVALIDO',
      message: 'El costo unitario no puede ser negativo',
    }
  }
  if (msg === 'STOCK_INSUFICIENTE') {
    return {
      code: 'STOCK_INSUFICIENTE',
      message: 'No hay suficiente stock disponible para este consumo',
    }
  }
  return {
    code: (error?.code ?? 'UNKNOWN').toString(),
    message: msg || 'Error desconocido en la operación de abastecimiento',
  }
}

export function crearAbastecimientoService(
  supabase: SupabaseClient<Database>,
): AbastecimientoService {
  return {
    async listarCompras(eventoId) {
      const res = await supabase
        .from('compras_insumos')
        .select('*')
        .eq('evento_id', eventoId)
        .order('fecha', { ascending: false })
      return {
        data: (res.data as CompraInsumo[] | null) ?? null,
        error: res.error,
      }
    },

    async crearCompra(input) {
      const res = await supabase
        .from('compras_insumos')
        .insert(
          input as Database['public']['Tables']['compras_insumos']['Insert'],
        )
        .select()
        .single()
      return {
        data: (res.data as CompraInsumo | null) ?? null,
        error: res.error,
      }
    },

    async eliminarCompra(id) {
      const res = await supabase.from('compras_insumos').delete().eq('id', id)
      return { data: null, error: res.error }
    },

    // registrarCompra wraps the registrar_compra RPC so the caller gets
    // a single atomic operation: compras_insumos INSERT + stock_movements
    // INSERT + cache sync — all in one DB transaction.
    async registrarCompra(input) {
      const rpc = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: unknown
          error: { message?: string; code?: string } | null
        }>
      )('registrar_compra', {
        p_materia_prima_id: input.materia_prima_id,
        p_cantidad: input.cantidad,
        p_costo_unitario: input.costo_unitario,
        p_evento_id: input.evento_id ?? null,
        p_compra_insumo_id: input.compra_insumo_id ?? null,
        p_fecha: input.fecha,
      })
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      return {
        data: rpc.data as StockMovement | null,
        error: null,
      }
    },

    // registrarCompraInsumo wraps the combined registrar_compra_insumo RPC.
    // This is the canonical Abastecimiento purchase path: one call creates
    // both compras_insumos and stock_movements rows, then syncs the cache.
    async registrarCompraInsumo(input) {
      const rpc = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: unknown
          error: { message?: string; code?: string } | null
        }>
      )('registrar_compra_insumo', {
        p_socio_id: input.socio_id,
        p_materia_prima_id: input.materia_prima_id,
        p_cantidad: input.cantidad,
        p_costo_unitario: input.costo_unitario,
        p_costo_total: input.costo_total,
        p_evento_id: input.evento_id ?? null,
        p_descripcion: input.descripcion ?? null,
        p_fecha: input.fecha,
      })
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      return {
        data: rpc.data as StockMovement | null,
        error: null,
      }
    },
  }
}
