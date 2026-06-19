// REQ-POS-54, REQ-POS-56: thin container/presentational seam for
// ventas.store. `storeToRefs` keeps reactivity when the view
// destructures the refs. The composable is the only contract
// components see — they don't import the store directly.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import { useVentas } from './useVentas'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento } from '@/types'

let aplicacion: App

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria',
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

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useVentas', () => {
  it('exposes the same surface as the store (REQ-POS-46, REQ-POS-54)', () => {
    conContexto(() => {
      const composable = useVentas()
      expect(composable.carrito).toBeDefined()
      expect(composable.totalCarrito).toBeDefined()
      expect(composable.cantidadItems).toBeDefined()
      expect(composable.eventoEnCurso).toBeDefined()
      expect(typeof composable.agregarAlCarrito).toBe('function')
      expect(typeof composable.actualizarCantidad).toBe('function')
      expect(typeof composable.quitarDelCarrito).toBe('function')
      expect(typeof composable.vaciarCarrito).toBe('function')
      expect(typeof composable.registrarVenta).toBe('function')
      expect(typeof composable.descartarToast).toBe('function')
    })
  })

  it('returns a fresh cart-empty totalCarrito (REQ-POS-11)', () => {
    conContexto(() => {
      const composable = useVentas()
      expect(composable.totalCarrito.value).toBe(0)
      expect(composable.cantidadItems.value).toBe(0)
    })
  })

  it('agregarAlCarrito + totalCarrito stays reactive after destructure (REQ-POS-46)', () => {
    conContexto(() => {
      const composable = useVentas()
      const { carrito, totalCarrito } = composable
      composable.agregarAlCarrito('p-1', 'Brownies', 5)
      composable.agregarAlCarrito('p-1', 'Brownies', 5)
      expect(carrito.value).toHaveLength(1)
      expect(totalCarrito.value).toBe(10)
    })
  })

  it('exposes eventoEnCurso as a reactive ref (REQ-POS-51)', () => {
    conContexto(() => {
      const composable = useVentas()
      expect(composable.eventoEnCurso.value).toBeNull()
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1'))
      expect(composable.eventoEnCurso.value?.id).toBe('e-1')
      // Smoke check: store stays accessible too
      const store = useVentasStore()
      expect(store.eventoEnCurso?.id).toBe('e-1')
    })
  })
})