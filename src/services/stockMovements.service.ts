// REQ-STOCK-MOVEMENTS-1..4: stock movements service — factory pattern
// (OCP/DIP), never-throw (LSP). Wraps the stock_movements table queries
// and the four Phase-2 RPCs. Follows the existing ventas.service.ts
// pattern: the caller supplies the supabase client, the service never
// throws, RPC errors are mapped to typed ServiceError codes.
//
// The service provides:
//   listar()            — all movements, ordered by fecha desc
//   listarPorMateriaPrima(id)  — movements for a single material
//   calcularStockDesdeMovimientos(movements) — pure function: SUM(cantidad)
//   listarStockActual()       — derived stock from v_stock_actual view
//   registrarCompra(input)    — wrapper over registrar_compra RPC
//   registrarConsumo(input)   — wrapper over registrar_consumo RPC
//   registrarCorreccion(input)— wrapper over registrar_correccion RPC
//   finalizarEventoSnapshot(eventoId) — wrapper over snapshot RPC
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  DerivedStock,
  RegistrarAjusteInput,
  RegistrarCompraInput,
  RegistrarConsumoInput,
  RegistrarCorreccionInput,
  ServiceError,
  StockMovement,
} from '@/types'

export interface StockMovementsService {
  listar(): Promise<{ data: StockMovement[] | null; error: ServiceError | null }>
  listarPorMateriaPrima(
    materiaPrimaId: string,
  ): Promise<{ data: StockMovement[] | null; error: ServiceError | null }>
  calcularStockDesdeMovimientos(
    movements: Pick<StockMovement, 'cantidad'>[],
  ): number
  listarStockActual(): Promise<{
    data: DerivedStock[] | null
    error: ServiceError | null
  }>
  registrarCompra(
    input: RegistrarCompraInput,
  ): Promise<{ data: StockMovement | null; error: ServiceError | null }>
  registrarConsumo(
    input: RegistrarConsumoInput,
  ): Promise<{ data: StockMovement | null; error: ServiceError | null }>
  registrarCorreccion(
    input: RegistrarCorreccionInput,
  ): Promise<{ data: StockMovement | null; error: ServiceError | null }>
  registrarAjuste(
    input: RegistrarAjusteInput,
  ): Promise<{ data: StockMovement | null; error: ServiceError | null }>
  finalizarEventoSnapshot(
    eventoId: string,
  ): Promise<{ data: Record<string, unknown> | null; error: ServiceError | null }>
}

// RPC → typed ServiceError mapper. Each RPC raises PG exceptions
// with domain error codes as the exception text. Supabase surfaces
// the text in error.message — we parse it to a ServiceError so the
// rest of the app keeps its never-throw contract (LSP).
function mapearErrorRpc(error: { message?: string; code?: string } | null): ServiceError {
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
  if (msg === 'CORRECCION_SIN_MOTIVO') {
    return {
      code: 'CORRECCION_SIN_MOTIVO',
      message: 'Una corrección debe tener un motivo registrado',
    }
  }
  if (msg === 'CORRECCION_MOTIVO_MUY_LARGO') {
    return {
      code: 'CORRECCION_MOTIVO_MUY_LARGO',
      message: 'El motivo es demasiado largo (máx. 500 caracteres)',
    }
  }
  if (msg === 'MOVIMIENTO_NO_ENCONTRADO') {
    return {
      code: 'MOVIMIENTO_NO_ENCONTRADO',
      message: 'El movimiento que querés corregir ya no existe',
    }
  }
  return {
    code: (error?.code ?? 'UNKNOWN').toString(),
    message: msg || 'Error desconocido en la operación de inventario',
  }
}

export function crearStockMovementsService(
  supabase: SupabaseClient<Database>,
): StockMovementsService {
  return {
    async listar() {
      const respuesta = await supabase
        .from('stock_movements')
        .select('*')
        .order('fecha', { ascending: false })
      return {
        data: (respuesta.data as StockMovement[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async listarPorMateriaPrima(materiaPrimaId) {
      const respuesta = await supabase
        .from('stock_movements')
        .select('*')
        .eq('materia_prima_id', materiaPrimaId)
        .order('fecha', { ascending: false })
      return {
        data: (respuesta.data as StockMovement[] | null) ?? null,
        error: respuesta.error,
      }
    },

    calcularStockDesdeMovimientos(movements) {
      return movements.reduce((sum, m) => sum + m.cantidad, 0)
    },

    async listarStockActual() {
      const respuesta = await supabase.from('v_stock_actual').select('*')
      return {
        data: (respuesta.data as DerivedStock[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async registrarCompra(input) {
      const rpc = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>)(
        'registrar_compra',
        {
          p_materia_prima_id: input.materia_prima_id,
          p_cantidad: input.cantidad,
          p_costo_unitario: input.costo_unitario,
          p_evento_id: input.evento_id ?? null,
          p_compra_insumo_id: input.compra_insumo_id ?? null,
          p_motivo: input.motivo ?? null,
          p_fecha: input.fecha,
        },
      )
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      return {
        data: rpc.data as StockMovement | null,
        error: null,
      }
    },

    async registrarConsumo(input) {
      const rpc = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>)(
        'registrar_consumo',
        {
          p_materia_prima_id: input.materia_prima_id,
          p_cantidad: input.cantidad,
          p_costo_unitario: input.costo_unitario,
          p_evento_id: input.evento_id,
          p_venta_id: input.venta_id ?? null,
          p_fecha: input.fecha,
        },
      )
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      return {
        data: rpc.data as StockMovement | null,
        error: null,
      }
    },

    async registrarCorreccion(input) {
      const rpc = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>)(
        'registrar_correccion',
        {
          p_movimiento_id: input.movimiento_id,
          p_cantidad_corregida: input.cantidad_corregida,
          p_motivo: input.motivo,
          p_fecha: input.fecha,
        },
      )
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      return {
        data: rpc.data as StockMovement | null,
        error: null,
      }
    },

    async registrarAjuste(input) {
      const rpc = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>)(
        'registrar_ajuste',
        {
          p_materia_prima_id: input.materia_prima_id,
          p_cantidad: input.cantidad,
          p_motivo: input.motivo,
          p_fecha: input.fecha,
        },
      )
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      return {
        data: rpc.data as StockMovement | null,
        error: null,
      }
    },

    async finalizarEventoSnapshot(eventoId) {
      const rpc = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>)(
        'finalizar_evento_snapshot',
        { p_evento_id: eventoId },
      )
      if (rpc.error) {
        return { data: null, error: mapearErrorRpc(rpc.error) }
      }
      return {
        data: rpc.data as Record<string, unknown> | null,
        error: null,
      }
    },
  }
}
