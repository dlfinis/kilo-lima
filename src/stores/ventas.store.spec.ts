// REQ-POS-6, REQ-POS-7, REQ-POS-8, REQ-POS-9, REQ-POS-10, REQ-POS-11,
// REQ-POS-12, REQ-POS-13, REQ-POS-14, REQ-POS-15, REQ-POS-16,
// REQ-POS-17, REQ-POS-39, REQ-POS-51, REQ-POS-55, REQ-POS-56:
// ventas.store full surface.
//
// Cart math tests (PR1 skeleton — preserved) plus PR3 additions:
//   - cargarPorEvento loads ventas for the active evento
//   - registrarVenta: empty-cart guard, SIN_EVENTO_ACTIVO guard,
//     EVENTO_CERRADO guard, optimistic clear + revert-on-failure,
//     success appends the venta, emits success/error toast refs.
//   - snapshot pricing preserved end-to-end.
//
// Cross-store READS (eventsStore.eventos) happen inside `computed` —
// WRITES are forbidden per REQ-POS-51.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import { useEventsStore } from './events.store'
import { useVentasStore } from './ventas.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento, VentaConItems } from '@/types'

let aplicacion: App

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado: 'en_curso',
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkVenta = (overrides: Partial<VentaConItems> = {}): VentaConItems => ({
  id: 'v-1',
  evento_id: 'e-1',
  fecha: '2026-06-19T00:00:00Z',
  total: 10,
  metodo_pago: 'efectivo',
  created_at: '2026-06-19T00:00:00Z',
  items: [],
  ...overrides,
})

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

function sembrarEventoEnCurso(id = 'e-1') {
  return conContexto(() => {
    const events = useEventsStore()
    events.eventos.push(mkEvento(id))
  })
}

describe('useVentasStore — cart state shape (PR1 skeleton, preserved)', () => {
  it('starts with empty carrito and ventas (REQ-POS-6)', () => {
    conContexto(() => {
      const store = useVentasStore()
      expect(store.carrito).toEqual([])
      expect(store.ventas).toEqual([])
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
      expect(store.totalCarrito).toBe(0)
      expect(store.cantidadItems).toBe(0)
    })
  })

  it('agregarAlCarrito appends a new line for an unseen producto (REQ-POS-7)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]).toMatchObject({
        producto_id: 'p-1',
        nombre: 'Brownies',
        precio_unitario: 5,
        cantidad: 1,
        subtotal: 5,
      })
    })
  })

  it('agregarAlCarrito merges duplicates by incrementing cantidad (REQ-POS-7)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]?.cantidad).toBe(2)
      expect(store.carrito[0]?.subtotal).toBe(10)
    })
  })

  it('actualizarCantidad sets a positive quantity and recomputes subtotal (REQ-POS-8)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.actualizarCantidad('p-1', 3)
      expect(store.carrito[0]?.cantidad).toBe(3)
      expect(store.carrito[0]?.subtotal).toBe(15)
    })
  })

  it('actualizarCantidad(0) removes the line (REQ-POS-8)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.actualizarCantidad('p-1', 0)
      expect(store.carrito).toHaveLength(0)
    })
  })

  it('actualizarCantidad rejects negative quantities (REQ-POS-8)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.actualizarCantidad('p-1', -1)
      expect(store.carrito[0]?.cantidad).toBe(1)
    })
  })

  it('quitarDelCarrito removes the line for the given productoId (REQ-POS-9)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.agregarAlCarrito('p-2', 'Galletas', 3)
      store.quitarDelCarrito('p-1')
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]?.producto_id).toBe('p-2')
    })
  })

  it('vaciarCarrito empties the cart (REQ-POS-10)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.agregarAlCarrito('p-2', 'Galletas', 3)
      store.vaciarCarrito()
      expect(store.carrito).toEqual([])
      expect(store.totalCarrito).toBe(0)
      expect(store.cantidadItems).toBe(0)
    })
  })

  it('totalCarrito = Σ(cantidad × precio_unitario) rounded (REQ-POS-11)', () => {
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.agregarAlCarrito('p-2', 'Galletas', 3.5)
      store.actualizarCantidad('p-1', 2)
      expect(store.totalCarrito).toBe(13.5)
      expect(store.cantidadItems).toBe(3)
    })
  })
})

describe('useVentasStore — cargarPorEvento (PR3)', () => {
  it('loads ventas for the evento into ventas ref (REQ-POS-12)', async () => {
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-1' }), mkVenta({ id: 'v-2' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
      expect(store.ventas).toHaveLength(2)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('sets error when the fetch fails (REQ-POS-49)', async () => {
    __pushSupabaseResponse<VentaConItems[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
      expect(store.ventas).toEqual([])
      expect(store.error).toBeTruthy()
    })
  })
})

describe('useVentasStore — registrarVenta (REQ-POS-12, REQ-POS-14, REQ-POS-15, REQ-POS-16, REQ-POS-17, REQ-POS-39)', () => {
  it('returns SIN_EVENTO_ACTIVO when no evento is en_curso (REQ-POS-16)', async () => {
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      const res = await store.registrarVenta('efectivo')
      expect(res.error?.code).toBe('SIN_EVENTO_ACTIVO')
      // Cart untouched.
      expect(store.carrito).toHaveLength(1)
    })
  })

  it('returns EVENTO_CERRADO when the active evento is cerrado (REQ-POS-39)', async () => {
    await conContexto(async () => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { estado: 'cerrado' }))
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      const res = await store.registrarVenta('efectivo')
      expect(res.error?.code).toBe('EVENTO_CERRADO')
      expect(store.carrito).toHaveLength(1)
    })
  })

  it('returns VENTA_SIN_ITEMS when the cart is empty (REQ-POS-15, REQ-POS-17)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const res = await store.registrarVenta('efectivo')
      expect(res.error?.code).toBe('VENTA_SIN_ITEMS')
    })
  })

  it('optimistically clears the cart, calls the service, and appends the venta on success (REQ-POS-12, REQ-POS-14)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      // Mock the service: header insert returns the venta; the two
      // item inserts return their rows. Promise.all consumes one
      // response per `await`.
      __pushSupabaseResponse<VentaConItems>({
        data: mkVenta({ id: 'v-1', evento_id: 'e-1', total: 10 }),
        error: null,
      })
      __pushSupabaseResponse<unknown>({
        data: [{ id: 'vi-1', venta_id: 'v-1', producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 }],
        error: null,
      })

      const res = await store.registrarVenta('efectivo')
      expect(res.error).toBeNull()
      expect(res.data?.id).toBe('v-1')
      expect(store.carrito).toEqual([])
      expect(store.ventas).toHaveLength(1)
      expect(store.toast?.tipo).toBe('success')
    })
  })

  it('reverts the cart and shows an error toast when the service fails (REQ-POS-14)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      // Header insert fails.
      __pushSupabaseResponse<VentaConItems>({
        data: null,
        error: { code: 'PGRST301', message: 'connection lost' },
      })

      const res = await store.registrarVenta('efectivo')
      expect(res.error?.code).toBe('PGRST301')
      // Cart is restored to its pre-call state.
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]?.producto_id).toBe('p-1')
      expect(store.toast?.tipo).toBe('error')
    })
  })

  it('snapshots precio_unitario and subtotal from the cart (REQ-POS-13)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 'Brownies', 5)
      __pushSupabaseResponse<VentaConItems>({
        data: mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 }),
        error: null,
      })
      __pushSupabaseResponse<unknown>({
        data: [{ id: 'vi-1', venta_id: 'v-1', producto_id: 'p-1', cantidad: 1, precio_unitario: 5, subtotal: 5 }],
        error: null,
      })

      await store.registrarVenta('efectivo')
      const inserciones = __getSupabaseMockCalls().filter((l) => l.metodo === 'insert')
      // First insert = header (ventas). Second insert = item (venta_items).
      const headerArgs = inserciones[0]?.args[0] as Record<string, unknown>
      const itemArgs = inserciones[1]?.args[0] as Record<string, unknown>
      expect(headerArgs.evento_id).toBe('e-1')
      expect(headerArgs.metodo_pago).toBe('efectivo')
      expect(headerArgs.total).toBe(5)
      expect(itemArgs.precio_unitario).toBe(5)
      expect(itemArgs.subtotal).toBe(5)
      expect(itemArgs.cantidad).toBe(1)
    })
  })

  it('exposes eventoEnCurso as a computed (REQ-POS-51 cross-store READ)', () => {
    conContexto(() => {
      const store = useVentasStore()
      expect(store.eventoEnCurso).toBeNull()
    })
    sembrarEventoEnCurso('e-42')
    conContexto(() => {
      const store = useVentasStore()
      expect(store.eventoEnCurso?.id).toBe('e-42')
      expect(store.eventoEnCurso?.estado).toBe('en_curso')
    })
  })
})