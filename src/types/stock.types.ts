// Stock movement types per REQ-STOCK-MOVEMENTS-1..4.
// Movement ledger with audit trail, corrections, and derived stock.
// Field names mirror SQL columns 1:1 to eliminate name-mapping bugs.

export type TipoMovimiento = 'compra' | 'consumo' | 'correccion' | 'ajuste'

export interface StockMovement {
  id: string
  materia_prima_id: string
  cantidad: number // signed non-zero: positive = inflow, negative = outflow
  tipo: TipoMovimiento
  evento_id: string | null
  compra_insumo_id: string | null
  venta_id: string | null
  movimiento_corregido_id: string | null
  costo_unitario_snapshot: number | null
  motivo: string | null // required for correccion; optional for ajuste
  fecha: string
  created_at: string
  created_by: string | null
}

export type StockMovementInput = Pick<
  StockMovement,
  'materia_prima_id' | 'cantidad' | 'tipo'
> &
  Partial<
    Pick<
      StockMovement,
      | 'evento_id'
      | 'compra_insumo_id'
      | 'venta_id'
      | 'movimiento_corregido_id'
      | 'costo_unitario_snapshot'
      | 'motivo'
      | 'fecha'
    >
  >

export interface DerivedStock {
  materia_prima_id: string
  nombre: string
  unidad: string
  stock_actual: number
}

export interface RegistrarCompraInput {
  materia_prima_id: string
  cantidad: number
  costo_unitario: number
  evento_id?: string | null
  compra_insumo_id?: string | null
  motivo?: string | null
  fecha?: string
}

export interface RegistrarConsumoInput {
  materia_prima_id: string
  cantidad: number
  costo_unitario: number
  evento_id: string
  venta_id?: string | null
  fecha?: string
}

export interface RegistrarCorreccionInput {
  movimiento_id: string
  cantidad_corregida: number
  motivo: string
  costo_unitario?: number | null
  fecha?: string
}

export interface RegistrarAjusteInput {
  materia_prima_id: string
  cantidad: number // signed: positive = entrada, negative = merma/corrección
  motivo: string
  created_by?: string | null
  fecha?: string
}

export interface StockMovementWithMateria extends StockMovement {
  materia_prima?: {
    nombre: string
    unidad: string
  }
}

export interface RegistrarCompraInsumoInput {
  socio_id: string
  materia_prima_id: string
  cantidad: number
  costo_unitario: number
  costo_total: number
  evento_id?: string | null
  descripcion?: string | null
  fecha?: string
}
