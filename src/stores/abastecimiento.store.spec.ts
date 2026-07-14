// REQ-ABASTECIMIENTO-1..3: Pinia store test for abastecimiento.
// Uses the global Supabase mock — same pattern as stockMovements.store.spec.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
  __getSupabaseMockCalls,
} from '../../tests/setup'
import type { CompraInsumo, StockMovement } from '@/types'
import { useAbastecimientoStore } from './abastecimiento.store'

const mkCompra = (overrides: Partial<CompraInsumo> = {}): CompraInsumo => ({
  id: 'ci-1',
  evento_id: 'ev-1',
  socio_id: 's-1',
  materia_prima_id: 'mp-1',
  cantidad: 10,
  costo_total: 25,
  fecha: '2026-07-14',
  descripcion: null,
  created_at: '2026-07-14T12:00:00Z',
  ...overrides,
})

const mkMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: 'sm-1',
  materia_prima_id: 'mp-1',
  cantidad: 10,
  tipo: 'compra',
  evento_id: 'ev-1',
  compra_insumo_id: 'ci-1',
  venta_id: null,
  movimiento_corregido_id: null,
  costo_unitario_snapshot: 2.5,
  motivo: null,
  fecha: '2026-07-14',
  created_at: '2026-07-14T12:00:00Z',
  created_by: null,
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

describe('useAbastecimientoStore', () => {
  it('starts with empty compras map, cargando=false, error=null', () => {
    conContexto(() => {
      const store = useAbastecimientoStore()
      expect(store.comprasInsumos.size).toBe(0)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarComprasInsumos fetches and stores compras by event', async () => {
    __pushSupabaseResponse<CompraInsumo[]>({
      data: [mkCompra({ id: 'ci-1' }), mkCompra({ id: 'ci-2', cantidad: 5 })],
      error: null,
    })
    await conContexto(async () => {
      const store = useAbastecimientoStore()
      await store.cargarComprasInsumos('ev-1')

      const compras = store.comprasInsumos.get('ev-1')
      expect(compras).toHaveLength(2)
      expect(compras?.[0]?.id).toBe('ci-1')
    })
  })

  it('cargarComprasInsumos sets error on fetch failure', async () => {
    __pushSupabaseResponse<CompraInsumo[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })
    await conContexto(async () => {
      const store = useAbastecimientoStore()
      await store.cargarComprasInsumos('ev-1')

      expect(store.error).toMatch(/Error al cargar/)
    })
  })

  it('crearCompraInsumo prepends to the event compras list', async () => {
    const nueva = mkCompra({ id: 'ci-new', cantidad: 15 })
    __pushSupabaseResponse<CompraInsumo>({ data: nueva, error: null })
    await conContexto(async () => {
      const store = useAbastecimientoStore()
      store.comprasInsumos.set('ev-1', [mkCompra({ id: 'ci-old' })])

      const { data, error } = await store.crearCompraInsumo({
        evento_id: 'ev-1',
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 15,
        costo_total: 30,
        fecha: '2026-07-14',
      })

      expect(error).toBeNull()
      expect(data?.id).toBe('ci-new')
      const compras = store.comprasInsumos.get('ev-1')
      expect(compras).toHaveLength(2)
      expect(compras?.[0]?.id).toBe('ci-new')
    })
  })

  it('eliminarCompraInsumo removes from the event compras list', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null })
    await conContexto(async () => {
      const store = useAbastecimientoStore()
      store.comprasInsumos.set('ev-1', [mkCompra({ id: 'ci-1' }), mkCompra({ id: 'ci-2' })])

      const { error } = await store.eliminarCompraInsumo('ev-1', 'ci-1')
      expect(error).toBeNull()
      const compras = store.comprasInsumos.get('ev-1')
      expect(compras).toHaveLength(1)
      expect(compras?.[0]?.id).toBe('ci-2')
    })
  })

  it('registrarCompraInsumo calls RPC and refreshes compras', async () => {
    // RPC response
    __pushSupabaseResponse<StockMovement>({ data: mkMovement(), error: null })
    // cargarComprasInsumos response (refresh)
    __pushSupabaseResponse<CompraInsumo[]>({
      data: [mkCompra({ id: 'ci-new' }), mkCompra({ id: 'ci-old' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useAbastecimientoStore()

      const { data, error } = await store.registrarCompraInsumo({
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 10,
        costo_unitario: 2.5,
        costo_total: 25,
        evento_id: 'ev-1',
      })

      expect(error).toBeNull()
      expect(data?.tipo).toBe('compra')
      // After success, compras list is refreshed
      const compras = store.comprasInsumos.get('ev-1')
      expect(compras).toHaveLength(2)
    })
  })

  it('registrarCompraInsumo sets error on RPC failure', async () => {
    __pushSupabaseResponse<StockMovement>({
      data: null,
      error: { code: 'P0001', message: 'CANTIDAD_INVALIDA' },
    })
    await conContexto(async () => {
      const store = useAbastecimientoStore()

      const { data, error } = await store.registrarCompraInsumo({
        socio_id: 's-1',
        materia_prima_id: 'mp-1',
        cantidad: 0,
        costo_unitario: 2.5,
        costo_total: 0,
        evento_id: 'ev-1',
      })

      expect(data).toBeNull()
      expect(error?.code).toBe('CANTIDAD_INVALIDA')
      expect(store.error).toMatch(/La cantidad debe ser mayor que cero/)
    })
  })
})
