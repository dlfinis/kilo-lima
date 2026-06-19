// REQ-POS-44, REQ-POS-56: pos domain types compile correctly and
// resolve all imports from @/types. Verifies the Spanish domain
// surface (Producto, Venta, VentaItem, VentaConItems, GastoImprevisto,
// CierreCaja, MetodoPago, CategoriaImprevisto) is importable and
// *Input variants exclude the DB-only fields (id, created_at,
// updated_at). Mirrors events.types.spec.ts.
import { describe, expect, it } from 'vitest'
import type {
  CategoriaImprevisto,
  CierreCaja,
  CierreCajaInput,
  CierreInput,
  CierreResultado,
  GastoImprevisto,
  GastoImprevistoInput,
  LineaCarrito,
  MetodoPago,
  Producto,
  ProductoInput,
  ResumenCarrito,
  Venta,
  VentaConItems,
  VentaInput,
  VentaItem,
  VentaItemInput,
} from '@/types'

const mkProducto = (overrides: Partial<Producto> = {}): Producto => ({
  id: 'p-1',
  receta_id: 'r-1',
  precio_venta: 5,
  disponible: true,
  orden: 0,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkVenta = (overrides: Partial<Venta> = {}): Venta => ({
  id: 'v-1',
  evento_id: 'e-1',
  fecha: '2026-06-19T10:00:00Z',
  total: 10,
  metodo_pago: 'efectivo',
  created_at: '2026-06-19T10:00:00Z',
  ...overrides,
})

const mkVentaItem = (overrides: Partial<VentaItem> = {}): VentaItem => ({
  id: 'vi-1',
  venta_id: 'v-1',
  producto_id: 'p-1',
  cantidad: 2,
  precio_unitario: 5,
  subtotal: 10,
  costo_unitario: null,
  margen_aplicado: null,
  created_at: '2026-06-19T10:00:00Z',
  ...overrides,
})

const mkGastoImprevisto = (overrides: Partial<GastoImprevisto> = {}): GastoImprevisto => ({
  id: 'gi-1',
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  created_at: '2026-06-19T11:00:00Z',
  ...overrides,
})

const mkCierre = (overrides: Partial<CierreCaja> = {}): CierreCaja => ({
  id: 'cc-1',
  evento_id: 'e-1',
  fecha_cierre: '2026-06-19T20:00:00Z',
  total_ventas: 100,
  total_gastos_fijos: 30,
  total_gastos_imprevistos: 20,
  utilidad_bruta: 50,
  efectivo_esperado: 70,
  efectivo_real: 68,
  diferencia: -2,
  notas: null,
  created_at: '2026-06-19T20:00:00Z',
  ...overrides,
})

describe('pos.types surface', () => {
  it('MetodoPago and CategoriaImprevisto literal unions are exhaustive (REQ-POS-44)', () => {
    const metodos: MetodoPago[] = ['efectivo', 'transferencia', 'tarjeta', 'mixto']
    expect(metodos).toHaveLength(4)
    const categorias: CategoriaImprevisto[] = [
      'insumos_extra',
      'transporte',
      'reparacion',
      'propina',
      'otro',
    ]
    expect(categorias).toHaveLength(5)
  })

  it('Producto carries every SQL column (REQ-POS-44)', () => {
    const producto = mkProducto()
    expect(producto.receta_id).toBe('r-1')
    expect(producto.precio_venta).toBe(5)
    expect(producto.disponible).toBe(true)
    expect(producto.orden).toBe(0)
    expect(producto.created_at).toMatch(/^2026-/)
    expect(producto.updated_at).toMatch(/^2026-/)
  })

  it('ProductoInput excludes id, created_at, updated_at (REQ-POS-44)', () => {
    const input: ProductoInput = {
      receta_id: 'r-1',
      precio_venta: 5,
      disponible: true,
      orden: 0,
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
    expect(input).not.toHaveProperty('updated_at')
  })

  it('Venta + VentaInput exclude id, fecha, created_at (REQ-POS-44)', () => {
    const venta = mkVenta({ metodo_pago: 'tarjeta' })
    expect(venta.metodo_pago).toBe('tarjeta')
    const input: VentaInput = {
      evento_id: 'e-1',
      total: 10,
      metodo_pago: 'efectivo',
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('fecha')
    expect(input).not.toHaveProperty('created_at')
  })

  it('VentaItem + VentaItemInput exclude id, venta_id, created_at (REQ-POS-44)', () => {
    const item = mkVentaItem()
    expect(item.producto_id).toBe('p-1')
    const input: VentaItemInput = {
      producto_id: 'p-1',
      cantidad: 2,
      precio_unitario: 5,
      subtotal: 10,
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('venta_id')
    expect(input).not.toHaveProperty('created_at')
  })

  it('VentaItem carries the COGS snapshot columns nullable (REQ-FIN-12)', () => {
    const item = mkVentaItem({ costo_unitario: 3.5, margen_aplicado: 0.4 })
    expect(item.costo_unitario).toBe(3.5)
    expect(item.margen_aplicado).toBeCloseTo(0.4, 4)
    const itemNull: VentaItem = mkVentaItem({ costo_unitario: null, margen_aplicado: null })
    expect(itemNull.costo_unitario).toBeNull()
    expect(itemNull.margen_aplicado).toBeNull()
  })

  it('VentaItemInput accepts optional COGS snapshot fields (REQ-FIN-12)', () => {
    const input: VentaItemInput = {
      producto_id: 'p-1',
      cantidad: 2,
      precio_unitario: 5,
      subtotal: 10,
      costo_unitario: 3.5,
      margen_aplicado: 0.4,
    }
    expect(input.costo_unitario).toBe(3.5)
    expect(input.margen_aplicado).toBeCloseTo(0.4, 4)
  })

  it('VentaConItems extends Venta with items array (REQ-POS-44)', () => {
    const ventaConItems: VentaConItems = {
      ...mkVenta(),
      items: [mkVentaItem(), mkVentaItem({ id: 'vi-2', producto_id: 'p-2' })],
    }
    expect(ventaConItems.items).toHaveLength(2)
  })

  it('GastoImprevisto + GastoImprevistoInput exclude id and created_at (REQ-POS-44)', () => {
    const gasto = mkGastoImprevisto({ categoria: null })
    expect(gasto.categoria).toBeNull()
    const input: GastoImprevistoInput = {
      evento_id: 'e-1',
      monto: 50,
      motivo: 'Compramos más vasos',
      categoria: 'insumos_extra',
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
  })

  it('CierreCaja nullable cash fields default to null in input (REQ-POS-44, REQ-POS-31)', () => {
    const cierre = mkCierre({ efectivo_esperado: null, efectivo_real: null, diferencia: null })
    expect(cierre.efectivo_esperado).toBeNull()
    expect(cierre.efectivo_real).toBeNull()
    expect(cierre.diferencia).toBeNull()
    const input: CierreCajaInput = {
      evento_id: 'e-1',
      total_ventas: 100,
      total_gastos_fijos: 30,
      total_gastos_imprevistos: 20,
      utilidad_bruta: 50,
      efectivo_esperado: null,
      efectivo_real: null,
      diferencia: null,
      notas: null,
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('fecha_cierre')
    expect(input).not.toHaveProperty('created_at')
  })

  it('LineaCarrito and ResumenCarrito are the cart shapes (REQ-POS-44, REQ-POS-6, REQ-FIN-31)', () => {
    const linea: LineaCarrito = {
      producto_id: 'p-1',
      nombre: 'Brownies',
      precio_unitario: 5,
      cantidad: 2,
      subtotal: 10,
      costo_unitario: 2.5,
      margen_aplicado: 0.4,
    }
    expect(linea.subtotal).toBe(10)
    const resumen: ResumenCarrito = {
      lineas: [linea],
      total: 10,
      cantidadItems: 2,
    }
    expect(resumen.cantidadItems).toBe(2)
  })

  it('CierreInput and CierreResultado are the cierre pure-function shapes (REQ-POS-44, REQ-POS-31)', () => {
    const input: CierreInput = {
      ventas: [mkVenta()],
      ventaItems: [mkVentaItem({ costo_unitario: 3, cantidad: 2, subtotal: 10 })],
      gastosFijos: [],
      gastosImprevistos: [mkGastoImprevisto()],
      efectivoEsperado: null,
      efectivoReal: null,
    }
    const resultado: CierreResultado = {
      totalVentas: 10,
      totalCogs: 6,
      totalGastosFijos: 0,
      totalGastosImprevistos: 50,
      utilidadBruta: 4,
      utilidadNeta: -46,
      efectivoEsperado: null,
      efectivoReal: null,
      diferencia: null,
      ventasPorMetodoPago: { efectivo: 10, transferencia: 0, tarjeta: 0, mixto: 0 },
      cantidadVentas: 1,
      desgloseProductos: [],
      desgloseDias: [],
    }
    expect(resultado.utilidadBruta).toBe(4)
    expect(resultado.utilidadNeta).toBe(-46)
    expect(input.ventas).toHaveLength(1)
    expect(input.ventaItems).toHaveLength(1)
    expect(resultado.desgloseProductos).toEqual([])
    expect(resultado.desgloseDias).toEqual([])
  })
})
