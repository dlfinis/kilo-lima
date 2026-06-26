// REQ-POS-1, REQ-POS-2, REQ-POS-3, REQ-POS-4, REQ-POS-5, REQ-POS-44,
// REQ-POS-55, REQ-POS-56: productos store wires the factory service
// into Pinia reactive state. State shape: productos[] (all, ordered
// by orden/created_at), cargando, error. Actions: cargarTodas,
// cargarPorId, crear, actualizar, toggleDisponible, eliminar.
// Spanish error messages follow the catalog/events precedent.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { Database, Producto } from '@/types'
import { useProductosStore } from './productos.store'

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

const mkProducto = (id: string, overrides: Partial<Producto> = {}): Producto => ({
  id,
  receta_id: `r-${id}`,
  precio_venta: 5,
  disponible: true,
  orden: 0,
  descripcion: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

describe('useProductosStore', () => {
  it('starts with empty productos, cargando=false, error=null (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useProductosStore()
      expect(store.productos).toEqual([])
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarTodas fetches productos and stores them (REQ-POS-1)', async () => {
    const rows = [mkProducto('p-1'), mkProducto('p-2', { orden: 1 })]
    __pushSupabaseResponse<Producto[]>({ data: rows, error: null })

    await conContexto(async () => {
      const store = useProductosStore()
      await store.cargarTodas()

      expect(store.productos).toHaveLength(2)
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarTodas surfaces supabase errors in Spanish (REQ-POS-53)', async () => {
    __pushSupabaseResponse<Producto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    await conContexto(async () => {
      const store = useProductosStore()
      await store.cargarTodas()

      expect(store.error).toMatch(/Error al cargar los productos/)
      expect(store.productos).toEqual([])
    })
  })

  it('cargarPorId returns and stores the matching producto (REQ-POS-1)', async () => {
    const row = mkProducto('p-1', { precio_venta: 6.5 })
    __pushSupabaseResponse<Producto>({ data: row, error: null })

    await conContexto(async () => {
      const store = useProductosStore()
      const resultado = await store.cargarPorId('p-1')

      expect(resultado.error).toBeNull()
      expect(resultado.data?.precio_venta).toBe(6.5)
      expect(store.productos).toHaveLength(1)
      expect(store.productos[0]?.id).toBe('p-1')
    })
  })

  it('crear prepends the new producto (REQ-POS-1, REQ-POS-4)', async () => {
    const creada = mkProducto('p-new', { precio_venta: 7.5 })
    __pushSupabaseResponse<Producto>({ data: creada, error: null })

    await conContexto(async () => {
      const store = useProductosStore()
      store.productos.push(mkProducto('p-1', { precio_venta: 5 }))

      const resultado = await store.crear({
        receta_id: 'r-1',
        precio_venta: 7.5,
        disponible: true,
        orden: 0,
        descripcion: null,
      })

      expect(resultado.error).toBeNull()
      expect(store.productos).toHaveLength(2)
      expect(store.productos[0]?.id).toBe('p-new')
      expect(store.productos[0]?.precio_venta).toBe(7.5)
    })
  })

  it('crear surfaces DUPLICATE_RECETA as a friendly Spanish error (REQ-POS-2, REQ-POS-53)', async () => {
    __pushSupabaseResponse<Producto>({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })

    await conContexto(async () => {
      const store = useProductosStore()
      const resultado = await store.crear({
        receta_id: 'r-1',
        precio_venta: 5,
        disponible: true,
        orden: 0,
        descripcion: null,
      })

      expect(resultado.error?.code).toBe('DUPLICATE_RECETA')
      expect(store.error).toMatch(/Ya existe un producto/)
      expect(store.productos).toEqual([])
    })
  })

  it('actualizar mutates the matching producto in place (REQ-POS-3, REQ-POS-4)', async () => {
    const actualizada = mkProducto('p-1', { precio_venta: 8, disponible: false })
    __pushSupabaseResponse<Producto>({ data: actualizada, error: null })

    await conContexto(async () => {
      const store = useProductosStore()
      store.productos.push(mkProducto('p-1', { precio_venta: 5, disponible: true }))

      const resultado = await store.actualizar('p-1', { precio_venta: 8, disponible: false })

      expect(resultado.error).toBeNull()
      expect(store.productos[0]?.precio_venta).toBe(8)
      expect(store.productos[0]?.disponible).toBe(false)
    })
  })

  it('toggleDisponible flips the boolean via actualizar (REQ-POS-3)', async () => {
    const invertida = mkProducto('p-1', { disponible: false })
    __pushSupabaseResponse<Producto>({ data: invertida, error: null })

    await conContexto(async () => {
      const store = useProductosStore()
      store.productos.push(mkProducto('p-1', { disponible: true }))

      await store.toggleDisponible('p-1')

      expect(store.productos[0]?.disponible).toBe(false)
    })
  })

  it('eliminar removes the matching producto (REQ-POS-1)', async () => {
    __pushSupabaseResponse<null>({ data: null, error: null })

    await conContexto(async () => {
      const store = useProductosStore()
      store.productos.push(mkProducto('p-1'))
      store.productos.push(mkProducto('p-2'))

      const resultado = await store.eliminar('p-1')

      expect(resultado.error).toBeNull()
      expect(store.productos).toHaveLength(1)
      expect(store.productos[0]?.id).toBe('p-2')
    })
  })

  it('eliminar surfaces VENTA_HISTORIAL when FK blocks the delete (REQ-POS-5)', async () => {
    __pushSupabaseResponse<null>({
      data: null,
      error: { code: '23503', message: 'fk violation' },
    })

    await conContexto(async () => {
      const store = useProductosStore()
      store.productos.push(mkProducto('p-1'))

      const resultado = await store.eliminar('p-1')

      expect(resultado.error?.code).toBe('VENTA_HISTORIAL')
      expect(store.productos).toHaveLength(1)
    })
  })
})