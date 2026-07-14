// event-product-management-refactor: useProductoProduccion composable.
// Joins producto_produccion → evento_productos → productos → receta
// to produce derived rows (ProductoProduccionConDetalle). Follows
// the same pattern as usePreciosEvento: takes eventoId, reads stores
// inside computed(), inlines cost calculation.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  EventoProducto,
  MateriaPrima,
  ProductoProduccion,
  Producto,
  RecetaConIngredientes,
} from '@/types'
import { useProductoProduccionStore } from '@/stores/productoProduccion.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useProductoProduccion } from './useProductoProduccion'

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

const mkPP = (overrides: Partial<ProductoProduccion> = {}): ProductoProduccion => ({
  id: 'pp-1',
  evento_producto_id: 'ep-1',
  unidades_a_producir: 50,
  created_at: '2026-07-13T00:00:00Z',
  ...overrides,
})

const mkEP = (overrides: Partial<EventoProducto> = {}): EventoProducto => ({
  id: 'ep-1',
  evento_id: 'e-1',
  producto_id: 'p-1',
  precio_venta: 20,
  margen: 0.4,
  incluido: true,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
  ...overrides,
})

const mkProducto = (overrides: Partial<Producto> = {}): Producto => ({
  id: 'p-1',
  receta_id: 'r-1',
  nombre: 'Producto de prueba',
  categoria: null,
  icono: null,
  color: null,
  precio_venta: 0,
  disponible: true,
  orden: 0,
  descripcion: null,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
  ...overrides,
})

const mkReceta = (id: string, rendimiento = 1): RecetaConIngredientes => ({
  id,
  nombre: `Receta ${id}`,
  descripcion: null,
  rendimiento_unidades: rendimiento,
  notas: null,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
  ingredientes: [],
})

const mkMateria = (id: string, costo: number): MateriaPrima => ({
  id,
  nombre: `MP ${id}`,
  unidad: 'kg',
  costo_por_unidad: costo,
  notas: null,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
})

describe('useProductoProduccion', () => {
  it('returns empty array when the event has no production rows', () => {
    conContexto(() => {
      const { filasProduccion } = useProductoProduccion('e-1')
      expect(filasProduccion.value).toEqual([])
    })
  })

  it('returns empty array when eventoId is null', () => {
    conContexto(() => {
      const { filasProduccion } = useProductoProduccion(null)
      expect(filasProduccion.value).toEqual([])
    })
  })

  it('derived rows join pp → ep → producto + cost calculation', () => {
    conContexto(() => {
      const ppStore = useProductoProduccionStore()
      const epStore = useEventoProductosStore()
      const prodStore = useProductosStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()

      // Setup: producto p-1 → receta r-1 → materia mp-1 @ 10/kg, 2kg per batch
      // → costoPorUnidad = 20/1 = 20.
      recStore.recetas.push(mkReceta('r-1', 1))
      recStore.recetas[0]!.ingredientes = [
        {
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 2,
          created_at: '2026-06-20T00:00:00Z',
        },
      ]
      ingStore.materiasPrimas.push(mkMateria('mp-1', 10))
      prodStore.productos.push(mkProducto({ id: 'p-1', receta_id: 'r-1' }))
      epStore.productosPorEvento.set('e-1', [mkEP({ id: 'ep-1', producto_id: 'p-1' })])
      ppStore.produccionPorEvento.set('e-1', [mkPP({ evento_producto_id: 'ep-1', unidades_a_producir: 30 })])

      const { filasProduccion } = useProductoProduccion('e-1')
      const fila = filasProduccion.value[0]!

      expect(filasProduccion.value).toHaveLength(1)
      expect(fila.id).toBe('pp-1')
      expect(fila.evento_producto_id).toBe('ep-1')
      expect(fila.unidades_a_producir).toBe(30)
      // Joined fields from evento_producto.
      expect(fila.evento_id).toBe('e-1')
      expect(fila.producto_id).toBe('p-1')
      expect(fila.incluido).toBe(true)
      expect(fila.precio_venta).toBe(20)
      // Product identity.
      expect(fila.producto_nombre).toBe('Producto de prueba')
      expect(fila.receta_id).toBe('r-1')
      expect(fila.receta_nombre).toBe('Receta r-1')
      // Cost: 2kg × $10/kg = $20 per unit (rendimiento=1).
      expect(fila.costo_unitario).toBe(20)
    })
  })

  it('skips a production row when the linked evento_producto is missing', () => {
    conContexto(() => {
      const ppStore = useProductoProduccionStore()
      const epStore = useEventoProductosStore()

      // EP store is empty — the pp row references ep-orphan which doesn't exist.
      epStore.productosPorEvento.set('e-1', [])
      ppStore.produccionPorEvento.set('e-1', [mkPP({ evento_producto_id: 'ep-orphan' })])

      const { filasProduccion } = useProductoProduccion('e-1')
      expect(filasProduccion.value).toEqual([])
    })
  })

  it('handles a producto with no receta — costo_unitario stays 0', () => {
    conContexto(() => {
      const ppStore = useProductoProduccionStore()
      const epStore = useEventoProductosStore()
      const prodStore = useProductosStore()

      // Producto has receta_id pointing to a receta not in the store.
      prodStore.productos.push(mkProducto({ id: 'p-1', receta_id: 'r-missing' }))
      epStore.productosPorEvento.set('e-1', [mkEP()])
      ppStore.produccionPorEvento.set('e-1', [mkPP({ evento_producto_id: 'ep-1' })])

      const { filasProduccion } = useProductoProduccion('e-1')
      const fila = filasProduccion.value[0]!

      expect(fila).toBeDefined()
      expect(fila.costo_unitario).toBe(0)
      expect(fila.receta_nombre).toBe('')
    })
  })

  it('delegates cargando/error to the store', () => {
    conContexto(() => {
      const ppStore = useProductoProduccionStore()
      ppStore.cargando = true
      ppStore.error = 'test error'

      const { cargando, error } = useProductoProduccion('e-1')
      expect(cargando.value).toBe(true)
      expect(error.value).toBe('test error')
    })
  })
})
