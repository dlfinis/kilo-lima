// REQ-POS-6, REQ-POS-7, REQ-POS-8, REQ-POS-9, REQ-POS-10, REQ-POS-11,
// REQ-POS-15, REQ-POS-16, REQ-POS-56: ventas.store cart math +
// initial shape. PR1 ships the cart helpers (PR3 wires the optimistic
// registrarVenta path). Tests cover the 5 cart actions + 2 computed
// totals — the parts PR2+ compose against.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import { useVentasStore } from './ventas.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useVentasStore — cart state shape (PR1 skeleton)', () => {
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
