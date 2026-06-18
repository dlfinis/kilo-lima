// REQ-POS-30, REQ-POS-31, REQ-POS-32, REQ-POS-33, REQ-POS-35, REQ-POS-36,
// REQ-POS-41, REQ-POS-44, REQ-POS-56: cierre math. Two exports from one
// file (events PR1 pattern):
//   - calcularCierre(input): pure function. Returns totalVentas,
//     totalGastosFijos, totalGastosImprevistos, utilidadBruta,
//     ventasPorMetodoPago breakdown, cantidadVentas, and the
//     diferencia field. diferencia is NULL when either efectivoEsperado
//     or efectivoReal is NULL (cash count was skipped).
//   - formatearDiferencia(monto): "Sobrante $X.XX" / "Faltante $X.XX" /
//     "Cuadre exacto" (used by CierreResumenCard for the yellow alert).
// 14 edge cases cover: empty, mixed pago, diferencia ±/0/null,
// float-drift round-up. Reuses redondearCentavos from catalog's
// utils/moneda.ts so cierre totals and venta_items subtotals share the
// same rounding policy (no cumulative ±$0.01 drift).
import { describe, expect, it } from 'vitest'
import type { CierreCaja, GastoFijo, GastoImprevisto, Venta } from '@/types'
import { calcularCierre, formatearDiferencia } from './cierre'

const mkVenta = (overrides: Partial<Venta> = {}): Venta => ({
  id: overrides.id ?? 'v-1',
  evento_id: 'e-1',
  fecha: '2026-06-19T10:00:00Z',
  total: overrides.total ?? 10,
  metodo_pago: overrides.metodo_pago ?? 'efectivo',
  created_at: '2026-06-19T10:00:00Z',
  ...overrides,
})

const mkGastoFijo = (overrides: Partial<GastoFijo> = {}): GastoFijo => ({
  id: overrides.id ?? 'g-1',
  evento_id: 'e-1',
  categoria: overrides.categoria ?? 'renta',
  monto: overrides.monto ?? 5,
  descripcion: overrides.descripcion ?? null,
  created_at: '2026-06-19T09:00:00Z',
  ...overrides,
})

const mkImprevisto = (overrides: Partial<GastoImprevisto> = {}): GastoImprevisto => ({
  id: overrides.id ?? 'gi-1',
  evento_id: 'e-1',
  monto: overrides.monto ?? 3,
  motivo: overrides.motivo ?? 'Compramos más vasos',
  categoria: overrides.categoria ?? 'insumos_extra',
  created_at: '2026-06-19T11:00:00Z',
  ...overrides,
})

describe('calcularCierre', () => {
  it('returns zero totals for an empty evento (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: null,
      efectivoReal: null,
    })
    expect(resumen.totalVentas).toBe(0)
    expect(resumen.totalGastosFijos).toBe(0)
    expect(resumen.totalGastosImprevistos).toBe(0)
    expect(resumen.utilidadBruta).toBe(0)
    expect(resumen.cantidadVentas).toBe(0)
    expect(resumen.ventasPorMetodoPago).toEqual({
      efectivo: 0,
      transferencia: 0,
      tarjeta: 0,
      mixto: 0,
    })
    expect(resumen.diferencia).toBeNull()
  })

  it('breaks ventas down by metodo_pago (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [
        mkVenta({ id: 'v-1', total: 10, metodo_pago: 'efectivo' }),
        mkVenta({ id: 'v-2', total: 15, metodo_pago: 'tarjeta' }),
        mkVenta({ id: 'v-3', total: 5, metodo_pago: 'efectivo' }),
      ],
      gastosFijos: [mkGastoFijo({ monto: 5 })],
      gastosImprevistos: [mkImprevisto({ monto: 3 })],
      efectivoEsperado: null,
      efectivoReal: null,
    })
    expect(resumen.totalVentas).toBe(30)
    expect(resumen.totalGastosFijos).toBe(5)
    expect(resumen.totalGastosImprevistos).toBe(3)
    expect(resumen.utilidadBruta).toBe(22)
    expect(resumen.cantidadVentas).toBe(3)
    expect(resumen.ventasPorMetodoPago.efectivo).toBe(15)
    expect(resumen.ventasPorMetodoPago.tarjeta).toBe(15)
    expect(resumen.ventasPorMetodoPago.transferencia).toBe(0)
    expect(resumen.ventasPorMetodoPago.mixto).toBe(0)
  })

  it('computes utilidadBruta = totalVentas − gastosFijos − imprevistos (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [mkVenta({ total: 100 })],
      gastosFijos: [mkGastoFijo({ monto: 30 })],
      gastosImprevistos: [mkImprevisto({ monto: 20 })],
      efectivoEsperado: null,
      efectivoReal: null,
    })
    expect(resumen.utilidadBruta).toBe(50)
  })

  it('computes diferencia = efectivoReal − efectivoEsperado (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: 100,
      efectivoReal: 95,
    })
    expect(resumen.diferencia).toBe(-5)
  })

  it('computes diferencia = 0 when cash count is exact (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: 100,
      efectivoReal: 100,
    })
    expect(resumen.diferencia).toBe(0)
  })

  it('computes positive diferencia (sobrante) (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: 100,
      efectivoReal: 110,
    })
    expect(resumen.diferencia).toBe(10)
  })

  it('returns diferencia = null when efectivoEsperado is null (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: null,
      efectivoReal: 95,
    })
    expect(resumen.diferencia).toBeNull()
  })

  it('returns diferencia = null when efectivoReal is null (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: 100,
      efectivoReal: null,
    })
    expect(resumen.diferencia).toBeNull()
  })

  it('rounds float-drift total to 2 decimals (REQ-POS-31, REQ-POS-13)', () => {
    const resumen = calcularCierre({
      ventas: [mkVenta({ total: 0.1 }), mkVenta({ id: 'v-2', total: 0.2 })],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: null,
      efectivoReal: null,
    })
    expect(resumen.totalVentas).toBe(0.3)
  })

  it('rounds utilidadBruta correctly with float-drift ventas (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [mkVenta({ total: 0.1 }), mkVenta({ id: 'v-2', total: 0.2 })],
      gastosFijos: [mkGastoFijo({ monto: 0.1 })],
      gastosImprevistos: [],
      efectivoEsperado: null,
      efectivoReal: null,
    })
    expect(resumen.totalVentas).toBe(0.3)
    expect(resumen.utilidadBruta).toBe(0.2)
  })

  it('rounds diferencia to 2 decimals (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: 100,
      efectivoReal: 100.1,
    })
    expect(resumen.diferencia).toBe(0.1)
  })

  it('passes efectivoEsperado/efectivoReal through to the resumen (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: 100,
      efectivoReal: 105,
    })
    expect(resumen.efectivoEsperado).toBe(100)
    expect(resumen.efectivoReal).toBe(105)
  })

  it('accumulates ventasPorMetodoPago across multiple sales of the same method (REQ-POS-31)', () => {
    const resumen = calcularCierre({
      ventas: [
        mkVenta({ id: 'v-1', total: 5, metodo_pago: 'transferencia' }),
        mkVenta({ id: 'v-2', total: 7, metodo_pago: 'transferencia' }),
        mkVenta({ id: 'v-3', total: 8, metodo_pago: 'mixto' }),
      ],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: null,
      efectivoReal: null,
    })
    expect(resumen.ventasPorMetodoPago.transferencia).toBe(12)
    expect(resumen.ventasPorMetodoPago.mixto).toBe(8)
    expect(resumen.ventasPorMetodoPago.efectivo).toBe(0)
    expect(resumen.ventasPorMetodoPago.tarjeta).toBe(0)
    expect(resumen.totalVentas).toBe(20)
  })

  it('returns the same shape (CierreResumen) for empty and full input (REQ-POS-31)', () => {
    const vacio = calcularCierre({
      ventas: [],
      gastosFijos: [],
      gastosImprevistos: [],
      efectivoEsperado: null,
      efectivoReal: null,
    })
    const lleno = calcularCierre({
      ventas: [mkVenta({ total: 50 })],
      gastosFijos: [mkGastoFijo({ monto: 10 })],
      gastosImprevistos: [mkImprevisto({ monto: 5 })],
      efectivoEsperado: 35,
      efectivoReal: 33,
    })
    for (const k of [
      'totalVentas',
      'totalGastosFijos',
      'totalGastosImprevistos',
      'utilidadBruta',
      'efectivoEsperado',
      'efectivoReal',
      'diferencia',
      'ventasPorMetodoPago',
      'cantidadVentas',
    ] as const) {
      expect(vacio).toHaveProperty(k)
      expect(lleno).toHaveProperty(k)
    }
    // Spot-check a CierreCaja row would consume the resumen via these fields
    const cierreRow: Pick<CierreCaja, 'total_ventas' | 'diferencia'> = {
      total_ventas: lleno.totalVentas,
      diferencia: lleno.diferencia,
    }
    expect(cierreRow.total_ventas).toBe(50)
    expect(cierreRow.diferencia).toBe(-2)
  })
})

describe('formatearDiferencia', () => {
  it('returns "Cuadre exacto" when diferencia is 0 (REQ-POS-31)', () => {
    expect(formatearDiferencia(0)).toBe('Cuadre exacto')
  })

  it('returns "Sobrante $X.XX" for positive diferencia (REQ-POS-31)', () => {
    expect(formatearDiferencia(5)).toBe('Sobrante $5.00')
    expect(formatearDiferencia(12.5)).toBe('Sobrante $12.50')
  })

  it('returns "Faltante $X.XX" for negative diferencia (REQ-POS-31)', () => {
    expect(formatearDiferencia(-5)).toBe('Faltante $5.00')
    expect(formatearDiferencia(-12.5)).toBe('Faltante $12.50')
  })

  it('strips the negative sign from the formatted amount (REQ-POS-31)', () => {
    expect(formatearDiferencia(-3.14)).toBe('Faltante $3.14')
    expect(formatearDiferencia(-0.01)).toBe('Faltante $0.01')
  })

  it('rounds to 2 decimals in the formatted output (REQ-POS-31)', () => {
    expect(formatearDiferencia(0.1 + 0.2)).toBe('Sobrante $0.30')
  })
})
