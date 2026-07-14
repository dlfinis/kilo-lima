// event-product-management-refactor: Pinia store for producto_produccion.
// State shape: Map<eventoId, ProductoProduccion[]> for O(1) lookups.
// Editable guard via estadoEsEditable — a cerrado evento blocks all
// mutations with EVENTO_CERRADO before any Supabase call.
//
// Actions: cargarPorEvento, upsert.
// Getters: produccionDelEvento.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import type { Database, Evento, ProductoProduccion } from '@/types'
import { useProductoProduccionStore } from './productoProduccion.store'
import { useEventsStore } from './events.store'

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

const mkPP = (id: string, overrides: Partial<ProductoProduccion> = {}): ProductoProduccion => ({
  id,
  evento_producto_id: `ep-${id}`,
  unidades_a_producir: 50,
  created_at: '2026-07-13T00:00:00Z',
  ...overrides,
})

const mkEvento = (id: string, estado: Evento['estado']): Evento => ({
  id,
  nombre: 'Feria X',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: 0.4,
  ubicacion: null,
  estado,
  notas: null,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
})

describe('useProductoProduccionStore', () => {
  it('starts with empty map + cargando=false + error=null', () => {
    conContexto(() => {
      const store = useProductoProduccionStore()
      expect(store.produccionPorEvento.size).toBe(0)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento fetches rows and stores them keyed by evento_id', async () => {
    const rows = [mkPP('pp-1'), mkPP('pp-2', { evento_producto_id: 'ep-2' })]
    __pushSupabaseResponse<ProductoProduccion[]>({ data: rows, error: null })

    await conContexto(async () => {
      const store = useProductoProduccionStore()
      await store.cargarPorEvento('e-1')

      expect(store.produccionPorEvento.get('e-1')).toHaveLength(2)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento surfaces supabase errors in Spanish', async () => {
    __pushSupabaseResponse<ProductoProduccion[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    await conContexto(async () => {
      const store = useProductoProduccionStore()
      await store.cargarPorEvento('e-1')

      expect(store.error).toMatch(/Error al cargar/)
      expect(store.produccionPorEvento.size).toBe(0)
    })
  })

  it('produccionDelEvento getter returns the cached array', async () => {
    const rows = [mkPP('pp-1')]
    __pushSupabaseResponse<ProductoProduccion[]>({ data: rows, error: null })

    await conContexto(async () => {
      const store = useProductoProduccionStore()
      await store.cargarPorEvento('e-1')

      expect(store.produccionDelEvento('e-1')).toHaveLength(1)
      expect(store.produccionDelEvento('e-OTHER')).toEqual([])
    })
  })

  it('upsert adds a new row to the map on success', async () => {
    const row = mkPP('pp-new', { evento_producto_id: 'ep-new', unidades_a_producir: 30 })
    __pushSupabaseResponse<ProductoProduccion>({ data: row, error: null })

    await conContexto(async () => {
      const store = useProductoProduccionStore()
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'planificacion'))

      const result = await store.upsert('e-1', 'ep-new', 30)

      expect(result.error).toBeNull()
      expect(result.data?.id).toBe('pp-new')
      const lista = store.produccionPorEvento.get('e-1') ?? []
      expect(lista).toHaveLength(1)
      expect(lista[0]?.evento_producto_id).toBe('ep-new')
      expect(lista[0]?.unidades_a_producir).toBe(30)
    })
  })

  it('upsert reconciles an existing row in the map (replaces by evento_producto_id)', async () => {
    const existing = mkPP('pp-1', { unidades_a_producir: 50 })
    const updated = mkPP('pp-1', { unidades_a_producir: 75 })
    __pushSupabaseResponse<ProductoProduccion>({ data: updated, error: null })

    await conContexto(async () => {
      const store = useProductoProduccionStore()
      store.produccionPorEvento.set('e-1', [existing])
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'planificacion'))

      const result = await store.upsert('e-1', 'ep-pp-1', 75)

      expect(result.error).toBeNull()
      const lista = store.produccionPorEvento.get('e-1') ?? []
      expect(lista).toHaveLength(1)
      expect(lista[0]?.unidades_a_producir).toBe(75)
    })
  })

  it('upsert blocks the mutation on a cerrado evento', async () => {
    await conContexto(async () => {
      const store = useProductoProduccionStore()
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'cerrado'))

      const result = await store.upsert('e-1', 'ep-1', 50)

      expect(result.error?.code).toBe('EVENTO_CERRADO')
    })
  })

  it('upsert surfaces error when the service fails', async () => {
    __pushSupabaseResponse<ProductoProduccion>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    await conContexto(async () => {
      const store = useProductoProduccionStore()
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'planificacion'))

      const result = await store.upsert('e-1', 'ep-1', 50)

      expect(result.error).not.toBeNull()
      expect(store.error).toMatch(/No se pudo guardar/)
    })
  })
})
