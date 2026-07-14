// TDD RED: Type-level contract test for stock movement types.
// These imports will FAIL until stock.types.ts is created (RED → GREEN).
import { describe, it, expect } from 'vitest'
import type {
  TipoMovimiento,
  StockMovement,
  StockMovementInput,
  DerivedStock,
  RegistrarCompraInput,
  RegistrarConsumoInput,
  RegistrarCorreccionInput,
  StockMovementWithMateria,
} from './stock.types'

describe('stock.types', () => {
  describe('TipoMovimiento', () => {
    it('accepts all four valid movement types', () => {
      const tipos: TipoMovimiento[] = ['compra', 'consumo', 'correccion', 'ajuste']
      expect(tipos).toHaveLength(4)
      expect(tipos).toContain('compra')
      expect(tipos).toContain('consumo')
      expect(tipos).toContain('correccion')
      expect(tipos).toContain('ajuste')
    })
  })

  describe('StockMovement', () => {
    it('builds a compra movement with all fields populated', () => {
      const movement: StockMovement = {
        id: 'uuid-1',
        materia_prima_id: 'mp-1',
        cantidad: 10,
        tipo: 'compra',
        evento_id: null,
        compra_insumo_id: null,
        venta_id: null,
        movimiento_corregido_id: null,
        costo_unitario_snapshot: 2.5,
        motivo: null,
        fecha: '2026-07-14',
        created_at: '2026-07-14T12:00:00Z',
        created_by: null,
      }
      expect(movement.id).toBe('uuid-1')
      expect(movement.cantidad).toBe(10)
      expect(movement.tipo).toBe('compra')
      expect(movement.costo_unitario_snapshot).toBe(2.5)
    })

    it('builds a consumo movement with negative cantidad and venta reference', () => {
      const movement: StockMovement = {
        id: 'uuid-c',
        materia_prima_id: 'mp-2',
        cantidad: -3,
        tipo: 'consumo',
        evento_id: 'ev-1',
        compra_insumo_id: null,
        venta_id: 'v-1',
        movimiento_corregido_id: null,
        costo_unitario_snapshot: 1.8,
        motivo: null,
        fecha: '2026-07-14',
        created_at: '2026-07-14T12:00:00Z',
        created_by: null,
      }
      expect(movement.cantidad).toBe(-3)
      expect(movement.tipo).toBe('consumo')
      expect(movement.evento_id).toBe('ev-1')
      expect(movement.venta_id).toBe('v-1')
    })

    it('builds a correccion movement referencing the original and carrying motivo', () => {
      const movement: StockMovement = {
        id: 'uuid-cor',
        materia_prima_id: 'mp-1',
        cantidad: -1,
        tipo: 'correccion',
        evento_id: null,
        compra_insumo_id: null,
        venta_id: null,
        movimiento_corregido_id: 'uuid-1',
        costo_unitario_snapshot: null,
        motivo: 'Se registró mal la cantidad en la compra original',
        fecha: '2026-07-15',
        created_at: '2026-07-15T08:00:00Z',
        created_by: null,
      }
      expect(movement.tipo).toBe('correccion')
      expect(movement.movimiento_corregido_id).toBe('uuid-1')
      expect(movement.motivo).toBe('Se registró mal la cantidad en la compra original')
    })

    it('builds an ajuste movement (opening balance)', () => {
      const movement: StockMovement = {
        id: 'uuid-aj',
        materia_prima_id: 'mp-3',
        cantidad: 50,
        tipo: 'ajuste',
        evento_id: null,
        compra_insumo_id: null,
        venta_id: null,
        movimiento_corregido_id: null,
        costo_unitario_snapshot: null,
        motivo: 'Saldo inicial — migración automática',
        fecha: '2026-07-14',
        created_at: '2026-07-14T00:00:00Z',
        created_by: null,
      }
      expect(movement.tipo).toBe('ajuste')
      expect(movement.motivo).toBe('Saldo inicial — migración automática')
    })
  })

  describe('StockMovementInput', () => {
    it('accepts minimal compra input', () => {
      const input: StockMovementInput = {
        materia_prima_id: 'mp-1',
        cantidad: 5,
        tipo: 'compra',
      }
      expect(input.materia_prima_id).toBe('mp-1')
      expect(input.cantidad).toBe(5)
      expect(input.tipo).toBe('compra')
      expect(input.evento_id).toBeUndefined()
    })

    it('accepts full consumo input with event and venta references', () => {
      const input: StockMovementInput = {
        materia_prima_id: 'mp-2',
        cantidad: -2,
        tipo: 'consumo',
        evento_id: 'ev-1',
        venta_id: 'v-1',
        costo_unitario_snapshot: 3.2,
      }
      expect(input.cantidad).toBe(-2)
      expect(input.venta_id).toBe('v-1')
    })
  })

  describe('DerivedStock', () => {
    it('holds computed stock with material identity', () => {
      const ds: DerivedStock = {
        materia_prima_id: 'mp-1',
        nombre: 'Harina de trigo',
        unidad: 'kg',
        stock_actual: 12.5,
      }
      expect(ds.stock_actual).toBe(12.5)
      expect(ds.unidad).toBe('kg')
      expect(ds.nombre).toBe('Harina de trigo')
    })

    it('reflects zero stock for consumed materials', () => {
      const ds: DerivedStock = {
        materia_prima_id: 'mp-z',
        nombre: 'Azúcar glass',
        unidad: 'g',
        stock_actual: 0,
      }
      expect(ds.stock_actual).toBe(0)
    })
  })

  describe('RegistrarCompraInput', () => {
    it('requires materia, cantidad, and costo_unitario', () => {
      const input: RegistrarCompraInput = {
        materia_prima_id: 'mp-1',
        cantidad: 10,
        costo_unitario: 3.5,
      }
      expect(input.cantidad).toBe(10)
      expect(input.costo_unitario).toBe(3.5)
    })

    it('accepts optional event and compra references', () => {
      const input: RegistrarCompraInput = {
        materia_prima_id: 'mp-1',
        cantidad: 5,
        costo_unitario: 2.0,
        evento_id: 'ev-1',
        compra_insumo_id: 'ci-1',
      }
      expect(input.evento_id).toBe('ev-1')
      expect(input.compra_insumo_id).toBe('ci-1')
    })
  })

  describe('RegistrarConsumoInput', () => {
    it('requires evento_id alongside materia and cantidad', () => {
      const input: RegistrarConsumoInput = {
        materia_prima_id: 'mp-1',
        cantidad: 3,
        costo_unitario: 2.5,
        evento_id: 'ev-1',
      }
      expect(input.evento_id).toBe('ev-1')
      expect(input.cantidad).toBe(3)
    })

    it('accepts optional venta reference', () => {
      const input: RegistrarConsumoInput = {
        materia_prima_id: 'mp-2',
        cantidad: 1,
        costo_unitario: 4.0,
        evento_id: 'ev-2',
        venta_id: 'v-5',
      }
      expect(input.venta_id).toBe('v-5')
    })
  })

  describe('RegistrarCorreccionInput', () => {
    it('requires movimiento_id, cantidad_corregida, and motivo', () => {
      const input: RegistrarCorreccionInput = {
        movimiento_id: 'mov-1',
        cantidad_corregida: 4,
        motivo: 'Error en el registro inicial',
      }
      expect(input.movimiento_id).toBe('mov-1')
      expect(input.cantidad_corregida).toBe(4)
      expect(input.motivo).toBe('Error en el registro inicial')
    })
  })

  describe('StockMovementWithMateria', () => {
    it('extends StockMovement with materia_prima join fields', () => {
      const sm: StockMovementWithMateria = {
        id: 'uuid-1',
        materia_prima_id: 'mp-1',
        cantidad: 5,
        tipo: 'compra',
        evento_id: null,
        compra_insumo_id: null,
        venta_id: null,
        movimiento_corregido_id: null,
        costo_unitario_snapshot: 3.0,
        motivo: null,
        fecha: '2026-07-14',
        created_at: '2026-07-14T12:00:00Z',
        created_by: null,
        materia_prima: {
          nombre: 'Harina',
          unidad: 'kg',
        },
      }
      expect(sm.materia_prima?.nombre).toBe('Harina')
      expect(sm.materia_prima?.unidad).toBe('kg')
    })
  })
})
