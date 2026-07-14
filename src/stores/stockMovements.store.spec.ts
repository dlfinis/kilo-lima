// REQ-STOCK-MOVEMENTS-1..4: Pinia store test for stock movements.
// Uses the global Supabase mock (tests/setup.ts) — same pattern as
// ingredients.store.spec.ts. Provides supabase via app.provide and
// wraps store calls in runWithContext.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
  __getSupabaseMockCalls,
} from '../../tests/setup'
import type { StockMovement, DerivedStock } from '@/types'
import { useStockMovementsStore } from './stockMovements.store'

const mkMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: 'sm-1',
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
  ...overrides,
})

const mkStock = (overrides: Partial<DerivedStock> = {}): DerivedStock => ({
  materia_prima_id: 'mp-1',
  nombre: 'Harina',
  unidad: 'kg',
  stock_actual: 7,
  ...overrides,
})

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useStockMovementsStore', () => {
  it('starts with empty movements and stock arrays, cargando=false, error=null', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      expect(store.movements).toEqual([])
      expect(store.stockActual).toEqual([])
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarMovimientos fetches and stores movements', async () => {
    __pushSupabaseResponse<StockMovement[]>(({
      data: [mkMovement({ id: 'sm-1' }), mkMovement({ id: 'sm-2', cantidad: -3, tipo: 'consumo' })],
      error: null,
    }))
    await conContexto(async () => {
      const store = useStockMovementsStore()
      await store.cargarMovimientos()

      expect(store.movements).toHaveLength(2)
      expect(store.movements[0]?.id).toBe('sm-1')
      expect(store.movements[1]?.tipo).toBe('consumo')
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarMovimientos sets error when fetch fails', async () => {
    __pushSupabaseResponse<StockMovement[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })
    await conContexto(async () => {
      const store = useStockMovementsStore()
      await store.cargarMovimientos()

      expect(store.error).toMatch(/Error al cargar los movimientos/)
      expect(store.movements).toEqual([])
    })
  })

  it('cargarMovimientosPorMateriaPrima filters by materia and updates state', async () => {
    __pushSupabaseResponse<StockMovement[]>(({
      data: [mkMovement({ materia_prima_id: 'mp-2', cantidad: 5 })],
      error: null,
    }))
    await conContexto(async () => {
      const store = useStockMovementsStore()
      await store.cargarMovimientosPorMateriaPrima('mp-2')

      expect(store.movements).toHaveLength(1)
      expect(store.movements[0]?.materia_prima_id).toBe('mp-2')
    })
  })

  it('cargarStockActual fetches derived stock from v_stock_actual', async () => {
    __pushSupabaseResponse<DerivedStock[]>(({
      data: [mkStock(), mkStock({ materia_prima_id: 'mp-2', nombre: 'Azúcar', unidad: 'g', stock_actual: 500 })],
      error: null,
    }))
    await conContexto(async () => {
      const store = useStockMovementsStore()
      await store.cargarStockActual()

      expect(store.stockActual).toHaveLength(2)
      expect(store.stockActual[0]?.stock_actual).toBe(7)
      expect(store.stockActual[1]?.nombre).toBe('Azúcar')
    })
  })

  it('obtenerStockPorMateria returns stock for a known material', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      store.stockActual = [mkStock(), mkStock({ materia_prima_id: 'mp-2', stock_actual: 15 })]

      expect(store.obtenerStockPorMateria('mp-1')).toBe(7)
      expect(store.obtenerStockPorMateria('mp-2')).toBe(15)
    })
  })

  it('obtenerStockPorMateria returns 0 for unknown material', () => {
    conContexto(() => {
      const store = useStockMovementsStore()
      store.stockActual = [mkStock()]
      expect(store.obtenerStockPorMateria('mp-unknown')).toBe(0)
    })
  })

  it('registrarCompra delegates to registrar_compra RPC and refreshes movements', async () => {
    // Response for the RPC call
    __pushSupabaseResponse<StockMovement>(({
      data: mkMovement({ id: 'sm-new', cantidad: 5, tipo: 'compra' }),
      error: null,
    }))
    // Response for the cargarMovimientos refresh
    __pushSupabaseResponse<StockMovement[]>(({
      data: [mkMovement(), mkMovement({ id: 'sm-new', cantidad: 5, tipo: 'compra' })],
      error: null,
    }))
    await conContexto(async () => {
      const store = useStockMovementsStore()

      const result = await store.registrarCompra({
        materia_prima_id: 'mp-1',
        cantidad: 5,
        costo_unitario: 3.0,
      })

      expect(result.data).toBeTruthy()
      expect(result.data?.tipo).toBe('compra')
      expect(result.error).toBeNull()
      // After success, the movements list is refreshed
      expect(store.movements).toHaveLength(2)
    })
  })

  it('registrarCompra sets error on RPC failure and does not refresh', async () => {
    __pushSupabaseResponse<StockMovement>(({
      data: null,
      error: { code: 'P0001', message: 'CANTIDAD_INVALIDA' },
    }))
    await conContexto(async () => {
      const store = useStockMovementsStore()

      const result = await store.registrarCompra({
        materia_prima_id: 'mp-1',
        cantidad: 0,
        costo_unitario: 3.0,
      })

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('CANTIDAD_INVALIDA')
      // Movements should NOT be refreshed after error
      expect(store.movements).toEqual([])
    })
  })

  it('registrarConsumo delegates to registrar_consumo RPC with evento_id required', async () => {
    __pushSupabaseResponse<StockMovement>(({
      data: mkMovement({ id: 'sm-c', cantidad: -2, tipo: 'consumo', evento_id: 'ev-1' }),
      error: null,
    }))
    __pushSupabaseResponse<StockMovement[]>(({
      data: [mkMovement({ id: 'sm-c', cantidad: -2, tipo: 'consumo' })],
      error: null,
    }))
    await conContexto(async () => {
      const store = useStockMovementsStore()

      const result = await store.registrarConsumo({
        materia_prima_id: 'mp-1',
        cantidad: 2,
        costo_unitario: 2.0,
        evento_id: 'ev-1',
      })

      expect(result.data?.tipo).toBe('consumo')
      expect(result.data?.cantidad).toBe(-2)
      const calls = __getSupabaseMockCalls()
      expect(calls.some((c) => c.metodo === 'rpc')).toBe(true)
    })
  })

  it('registrarCorreccion delegates to registrar_correccion RPC with motivo', async () => {
    __pushSupabaseResponse<StockMovement>(({
      data: mkMovement({
        id: 'sm-cor', cantidad: -1, tipo: 'correccion',
        movimiento_corregido_id: 'sm-orig',
        motivo: 'Error en cantidad',
      }),
      error: null,
    }))
    __pushSupabaseResponse<StockMovement[]>(({
      data: [mkMovement(), mkMovement({
        id: 'sm-cor', cantidad: -1, tipo: 'correccion',
        movimiento_corregido_id: 'sm-orig',
        motivo: 'Error en cantidad',
      })],
      error: null,
    }))
    await conContexto(async () => {
      const store = useStockMovementsStore()

      const result = await store.registrarCorreccion({
        movimiento_id: 'sm-orig',
        cantidad_corregida: 4,
        motivo: 'Error en cantidad',
      })

      expect(result.data?.tipo).toBe('correccion')
      expect(result.data?.movimiento_corregido_id).toBe('sm-orig')
      expect(result.error).toBeNull()
    })
  })
})
