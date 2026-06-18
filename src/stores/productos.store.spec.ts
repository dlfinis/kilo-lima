// REQ-POS-1, REQ-POS-44, REQ-POS-56: productos.store PR1 skeleton.
// Verifies the reactive state shape is wired and the Supabase DI
// contract is honored. CRUD land in PR2.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Producto } from '@/types'
import { useProductosStore } from './productos.store'

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

describe('useProductosStore — state shape (PR1 skeleton)', () => {
  it('starts with empty productos and null error (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useProductosStore()
      expect(store.productos).toEqual([])
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('can hold a Producto row (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useProductosStore()
      store.productos = [mkProducto()]
      expect(store.productos).toHaveLength(1)
      expect(store.productos[0]?.receta_id).toBe('r-1')
    })
  })
})
