// REQ-PRICING-7, REQ-FIN-13, REQ-FIN-18: Pinia store for evento-scoped
// product config. State shape:
//   - productosPorEvento: Map<eventoId, EventoProducto[]>
//   - cargando: boolean
//   - error: string | null
//
// The Map keeps per-evento lookups O(1) for the POS grid
// (cross-store READ in ventas.store) and avoids a giant array scan on
// every `productosDelEvento(eventoId)` call.
//
// Actions: cargarPorEvento, toggleIncluido, actualizarPrecio,
// inicializarDesdeCatalogo. All gate on `estadoEsEditable` (read from
// `eventsStore.eventos`) so a cerrado evento can't be mutated from the
// configurator or the POS.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import type { Database, Evento, EventoProducto } from '@/types'
import { useEventoProductosStore } from './eventoProductos.store'
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

const mkEP = (id: string, overrides: Partial<EventoProducto> = {}): EventoProducto => ({
  id,
  evento_id: 'e-1',
  producto_id: `p-${id}`,
  precio_venta: 16.67,
  margen: 0.4,
  incluido: true,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
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

describe('useEventoProductosStore', () => {
  it('starts with empty map + cargando=false + error=null', () => {
    conContexto(() => {
      const store = useEventoProductosStore()
      expect(store.productosPorEvento.size).toBe(0)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento fetches the rows and stores them keyed by evento_id', async () => {
    const rows = [mkEP('ep-1'), mkEP('ep-2', { producto_id: 'p-2' })]
    __pushSupabaseResponse<EventoProducto[]>({ data: rows, error: null })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      await store.cargarPorEvento('e-1')

      expect(store.productosPorEvento.get('e-1')).toHaveLength(2)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento surfaces supabase errors in Spanish', async () => {
    __pushSupabaseResponse<EventoProducto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      await store.cargarPorEvento('e-1')

      expect(store.error).toMatch(/Error al cargar/)
      expect(store.productosPorEvento.size).toBe(0)
    })
  })

  it('productosDelEvento getter returns the cached array', async () => {
    const rows = [mkEP('ep-1', { incluido: true })]
    __pushSupabaseResponse<EventoProducto[]>({ data: rows, error: null })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      await store.cargarPorEvento('e-1')

      expect(store.productosDelEvento('e-1')).toHaveLength(1)
      expect(store.productosDelEvento('e-OTHER')).toEqual([])
    })
  })

  it('tieneProductosConfigurados returns true when the evento has rows', async () => {
    __pushSupabaseResponse<EventoProducto[]>({ data: [mkEP('ep-1')], error: null })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      await store.cargarPorEvento('e-1')

      expect(store.tieneProductosConfigurados('e-1')).toBe(true)
      expect(store.tieneProductosConfigurados('e-OTHER')).toBe(false)
    })
  })

  it('toggleIncluido optimistically flips the boolean then reconciles', async () => {
    __pushSupabaseResponse<EventoProducto>({
      data: mkEP('ep-1', { incluido: false }),
      error: null,
    })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      store.productosPorEvento.set('e-1', [mkEP('ep-1', { incluido: true })])
      // Need to seed the evento in events store so estadoEsEditable is true.
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'planificacion'))

      const resultado = await store.toggleIncluido('e-1', 'p-ep-1')

      expect(resultado.error).toBeNull()
      expect(store.productosPorEvento.get('e-1')?.[0]?.incluido).toBe(false)
    })
  })

  it('toggleIncluido blocks the mutation on a cerrado evento (REQ-PRICING-7)', async () => {
    await conContexto(async () => {
      const store = useEventoProductosStore()
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'cerrado'))

      const resultado = await store.toggleIncluido('e-1', 'p-ep-1')

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
    })
  })

  it('actualizarPrecio recomputes the row state from the service', async () => {
    __pushSupabaseResponse<EventoProducto>({
      data: mkEP('ep-1', { precio_venta: 20, margen: 0.4, ganancia_markup: 0.5, contribucion_markup: 0.25 }),
      error: null,
    })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      store.productosPorEvento.set('e-1', [mkEP('ep-1')])
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'planificacion'))

      await store.actualizarPrecio('e-1', 'p-ep-1', 20, 0.4, 0.5, 0.25)

      expect(store.productosPorEvento.get('e-1')?.[0]?.precio_venta).toBe(20)
      expect(store.productosPorEvento.get('e-1')?.[0]?.margen).toBe(0.4)
      expect(store.productosPorEvento.get('e-1')?.[0]?.ganancia_markup).toBe(0.5)
      expect(store.productosPorEvento.get('e-1')?.[0]?.contribucion_markup).toBe(0.25)
    })
  })

  it('actualizarPrecio blocks the mutation on a cerrado evento', async () => {
    await conContexto(async () => {
      const store = useEventoProductosStore()
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'cerrado'))

      const resultado = await store.actualizarPrecio('e-1', 'p-ep-1', 20, 0.4, 0.5, 0.25)

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
    })
  })

  // productos-mejoras / evento-producto-pricing: the slider must send
  // null through to the service when the operator hasn't set a manual
  // override. The old code coerced to 0, which re-wrote the DB row as
  // "manual price = 0" and broke auto-calc on the next reload.
  it('actualizarPrecio propagates precioVenta=null to the service (no 0 coercion)', async () => {
    __pushSupabaseResponse<EventoProducto>({
      data: mkEP('ep-1', { precio_venta: null, margen: 0.3, ganancia_markup: 0.4, contribucion_markup: 0.1 }),
      error: null,
    })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      store.productosPorEvento.set('e-1', [mkEP('ep-1', { precio_venta: null })])
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'planificacion'))

      await store.actualizarPrecio('e-1', 'p-ep-1', null, null, 0.4, 0.1)

      const fila = store.productosPorEvento.get('e-1')?.[0]
      expect(fila?.precio_venta).toBeNull()
      expect(fila?.margen).toBe(0.3)
      expect(fila?.ganancia_markup).toBe(0.4)
      expect(fila?.contribucion_markup).toBe(0.1)
    })
  })

  // productos-mejoras / evento-producto-agregar: high-level action
  // wraps `servicio.upsert` with auto-calc defaults so the new row
  // shows up in the POS grid immediately. Idempotent via
  // UNIQUE(evento_id, producto_id).
  it('agregar wraps servicio.upsert with auto-calc defaults and refreshes the map', async () => {
    const rowAgregada = mkEP('ep-new', {
      producto_id: 'p-new',
      incluido: true,
      precio_venta: null,
      margen: null,
    })
    __pushSupabaseResponse<EventoProducto>({ data: rowAgregada, error: null })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'planificacion'))

      const resultado = await store.agregar('e-1', 'p-new')

      expect(resultado.error).toBeNull()
      const lista = store.productosPorEvento.get('e-1') ?? []
      const agregada = lista.find((p) => p.producto_id === 'p-new')
      expect(agregada).toBeDefined()
      expect(agregada?.incluido).toBe(true)
      expect(agregada?.precio_venta).toBeNull()
      expect(agregada?.margen).toBeNull()
    })
  })

  it('agregar blocks the mutation on a cerrado evento', async () => {
    await conContexto(async () => {
      const store = useEventoProductosStore()
      const eventsStore = useEventsStore()
      eventsStore.eventos.push(mkEvento('e-1', 'cerrado'))

      const resultado = await store.agregar('e-1', 'p-new')

      expect(resultado.error?.code).toBe('EVENTO_CERRADO')
    })
  })

  it('inicializarDesdeCatalogo fetches productos then reloads the evento row', async () => {
    // 1) Productos catalog (3 rows).
    __pushSupabaseResponse<Array<{ id: string }>>({
      data: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }],
      error: null,
    })
    // 2) Upsert result.
    __pushSupabaseResponse<EventoProducto[]>({
      data: [
        mkEP('ep-1', { producto_id: 'p-1' }),
        mkEP('ep-2', { producto_id: 'p-2' }),
        mkEP('ep-3', { producto_id: 'p-3' }),
      ],
      error: null,
    })
    // 3) Reload from the DB so the map reflects server-side rows.
    __pushSupabaseResponse<EventoProducto[]>({
      data: [
        mkEP('ep-1', { producto_id: 'p-1' }),
        mkEP('ep-2', { producto_id: 'p-2' }),
        mkEP('ep-3', { producto_id: 'p-3' }),
      ],
      error: null,
    })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      const resultado = await store.inicializarDesdeCatalogo('e-1')

      expect(resultado.error).toBeNull()
      // After init the map is hydrated.
      expect(store.productosPorEvento.get('e-1')).toHaveLength(3)
    })
  })

  it('inicializarDesdeCatalogo is idempotent — calling twice keeps the map populated', async () => {
    // First call: catalog → upsert → reload.
    __pushSupabaseResponse<Array<{ id: string }>>({
      data: [{ id: 'p-1' }, { id: 'p-2' }],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [
        mkEP('ep-1', { producto_id: 'p-1' }),
        mkEP('ep-2', { producto_id: 'p-2' }),
      ],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [
        mkEP('ep-1', { producto_id: 'p-1' }),
        mkEP('ep-2', { producto_id: 'p-2' }),
      ],
      error: null,
    })
    // Second call: same 3-step sequence.
    __pushSupabaseResponse<Array<{ id: string }>>({
      data: [{ id: 'p-1' }, { id: 'p-2' }],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [
        mkEP('ep-1', { producto_id: 'p-1' }),
        mkEP('ep-2', { producto_id: 'p-2' }),
      ],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [
        mkEP('ep-1', { producto_id: 'p-1' }),
        mkEP('ep-2', { producto_id: 'p-2' }),
      ],
      error: null,
    })

    await conContexto(async () => {
      const store = useEventoProductosStore()
      await store.inicializarDesdeCatalogo('e-1')
      await store.inicializarDesdeCatalogo('e-1')

      // No duplicates — same 2 rows.
      expect(store.productosPorEvento.get('e-1')).toHaveLength(2)
    })
  })
})
