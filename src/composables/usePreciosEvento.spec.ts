// REQ-PRICING-7, REQ-FIN-18, REQ-FIN-28/29, REQ-PRICING-3:
// usePreciosEvento joins evento_productos + productos + recetas to
// surface per-producto computed prices (costo, precio_sugerido,
// margen_efectivo, precio_final). The POS grid uses
// `productosDelEvento` (filtered `incluido = true`) and looks up
// each producto's price via `precioParaProducto(productoId)`.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  Evento,
  EventoProducto,
  MateriaPrima,
  RecetaConIngredientes,
} from '@/types'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useEventsStore } from '@/stores/events.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { usePreciosEvento } from './usePreciosEvento'

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

const mkEvento = (id: string, margen: number | null = 0.4): Evento => ({
  id,
  nombre: 'Feria X',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: margen,
  ubicacion: null,
  estado: 'planificacion',
  notas: null,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
})

const mkEP = (overrides: Partial<EventoProducto>): EventoProducto => ({
  id: 'ep-1',
  evento_id: 'e-1',
  producto_id: 'p-1',
  precio_venta: null,
  margen: null,
  incluido: true,
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

describe('usePreciosEvento', () => {
  it('returns empty array when the evento has no producto config', () => {
    conContexto(() => {
      const { productosDelEvento } = usePreciosEvento('e-1')
      expect(productosDelEvento.value).toEqual([])
    })
  })

  it('productosDelEvento joins costo + precio_sugerido + margen_efectivo + precio_final', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()
      const prodStore = useProductosStore()

      // Producto p-1 → receta r-1 → materia mp-1 @ 10/kg, 2kg per batch
      // → costoPorUnidad = 20.
      recStore.recetas.push(
        mkReceta('r-1', 1),
      )
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
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-1',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.4))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.5, precio_venta: null }),
      ])

      const { productosDelEvento } = usePreciosEvento('e-1')
      const fila = productosDelEvento.value[0]!

      expect(fila.costo_unitario).toBe(20)
      // precio_sugerido = 20 / (1 − 0.5) = 40
      expect(fila.precio_sugerido).toBe(40)
      expect(fila.margen_efectivo).toBe(0.5)
      // precio_final = precio_venta ?? precio_sugerido = 40
      expect(fila.precio_final).toBe(40)
      expect(fila.producto_nombre).toBe('Receta r-1')
    })
  })

  it('precio_final uses precio_venta when the operator set a manual override', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()
      const prodStore = useProductosStore()

      recStore.recetas.push(mkReceta('r-1', 1))
      ingStore.materiasPrimas.push(mkMateria('mp-1', 10))
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-1',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.4))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: 25 }),
      ])

      const { productosDelEvento, precioParaProducto } = usePreciosEvento('e-1')
      expect(productosDelEvento.value[0]!.precio_final).toBe(25)
      expect(precioParaProducto.value('p-1')).toBe(25)
    })
  })

  it('margen_efectivo falls back to evento.margen_ganancia when producto.margen is null', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()
      const prodStore = useProductosStore()

      // costoPorUnidad = (10 × 1) / 1 = 10.
      recStore.recetas.push(mkReceta('r-1', 1))
      recStore.recetas[0]!.ingredientes = [
        {
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-06-20T00:00:00Z',
        },
      ]
      ingStore.materiasPrimas.push(mkMateria('mp-1', 10))
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-1',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.5))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: null, precio_venta: null }),
      ])

      const { margenParaProducto, productosDelEvento } = usePreciosEvento('e-1')
      // producto.margen is null → falls back to evento.margen_ganancia (0.5).
      expect(margenParaProducto.value('p-1')).toBe(0.5)
      expect(productosDelEvento.value[0]!.margen_efectivo).toBe(0.5)
      // precio_sugerido = 10 / (1 − 0.5) = 20
      expect(productosDelEvento.value[0]!.precio_sugerido).toBe(20)
    })
  })

  it('precioParaProducto falls back to producto.precio_venta when no evento_producto exists', () => {
    conContexto(() => {
      const prodStore = useProductosStore()
      prodStore.productos.push({
        id: 'p-x',
        receta_id: 'r-x',
        precio_venta: 12.5,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })

      const { precioParaProducto } = usePreciosEvento('e-1')
      expect(precioParaProducto.value('p-x')).toBe(12.5)
    })
  })

  it('productosDelEvento only includes rows with incluido=true (the POS grid)', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const prodStore = useProductosStore()

      recStore.recetas.push(mkReceta('r-1', 1), mkReceta('r-2', 1))
      prodStore.productos.push(
        {
          id: 'p-1',
          receta_id: 'r-1',
          precio_venta: 0,
          disponible: true,
          orden: 0,
          descripcion: null,
          created_at: '2026-06-20T00:00:00Z',
          updated_at: '2026-06-20T00:00:00Z',
        },
        {
          id: 'p-2',
          receta_id: 'r-2',
          precio_venta: 0,
          disponible: true,
          orden: 1,
          descripcion: null,
          created_at: '2026-06-20T00:00:00Z',
          updated_at: '2026-06-20T00:00:00Z',
        },
      )
      evStore.eventos.push(mkEvento('e-1', 0.4))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', incluido: true, margen: 0.4 }),
        mkEP({ id: 'ep-2', producto_id: 'p-2', incluido: false, margen: 0.4 }),
      ])

      const { productosDelEvento } = usePreciosEvento('e-1')
      expect(productosDelEvento.value).toHaveLength(1)
      expect(productosDelEvento.value[0]!.producto_id).toBe('p-1')
    })
  })

  it('cargado reflects the store cached state (true after cargarPorEvento)', () => {
    conContexto(() => {
      const { cargado } = usePreciosEvento('e-1')
      expect(cargado.value).toBe(false)
    })
  })

  it('handles a producto whose receta is missing — costo_unitario = 0, fields stay 0', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const prodStore = useProductosStore()

      // producto points to receta r-x but the recipes store has no such receta.
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-x',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.4))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4 }),
      ])

      const { productosDelEvento } = usePreciosEvento('e-1')
      const fila = productosDelEvento.value[0]!
      expect(fila.costo_unitario).toBe(0)
      // precio_sugerido with costo 0 → 0 (REQ-PRICING-2 edge case).
      expect(fila.precio_sugerido).toBe(0)
    })
  })
})

// REQ-CON-8 (PR-2): per-producto contribution and minimum break-even
// price getters, layered on top of the existing join.
describe('usePreciosEvento — contribucionParaProducto (REQ-CON-8)', () => {
  it('returns precio_final − costo_unitario for a configured producto', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()
      const prodStore = useProductosStore()

      recStore.recetas.push(mkReceta('r-1', 1))
      recStore.recetas[0]!.ingredientes = [
        {
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-06-20T00:00:00Z',
        },
      ]
      ingStore.materiasPrimas.push(mkMateria('mp-1', 10))
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-1',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.5))
      // margen 0.5 → precio_sugerido = 20; manual override → 25
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.5, precio_venta: 25 }),
      ])

      const { contribucionParaProducto } = usePreciosEvento('e-1')
      // 25 − 10 = 15
      expect(contribucionParaProducto.value('p-1')).toBe(15)
    })
  })

  it('returns a negative number when the operator prices below cost (loss)', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()
      const prodStore = useProductosStore()

      recStore.recetas.push(mkReceta('r-1', 1))
      recStore.recetas[0]!.ingredientes = [
        {
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-06-20T00:00:00Z',
        },
      ]
      ingStore.materiasPrimas.push(mkMateria('mp-1', 10))
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-1',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.4))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: 8 }),
      ])

      const { contribucionParaProducto } = usePreciosEvento('e-1')
      // 8 − 10 = −2
      expect(contribucionParaProducto.value('p-1')).toBe(-2)
    })
  })

  it('returns null when the producto is not configured for the evento', () => {
    conContexto(() => {
      const { contribucionParaProducto } = usePreciosEvento('e-1')
      expect(contribucionParaProducto.value('p-missing')).toBeNull()
    })
  })

  it('returns 0 contribution when precio equals costo', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()
      const prodStore = useProductosStore()

      recStore.recetas.push(mkReceta('r-1', 1))
      recStore.recetas[0]!.ingredientes = [
        {
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-06-20T00:00:00Z',
        },
      ]
      ingStore.materiasPrimas.push(mkMateria('mp-1', 10))
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-1',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.4))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: 10 }),
      ])

      const { contribucionParaProducto } = usePreciosEvento('e-1')
      expect(contribucionParaProducto.value('p-1')).toBe(0)
    })
  })
})

describe('usePreciosEvento — precioMinimoParaProducto (REQ-CON-8)', () => {
  it('returns a non-null minimum price (>= costo) for a configured producto', () => {
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const evStore = useEventsStore()
      const recStore = useRecipesStore()
      const ingStore = useIngredientsStore()
      const prodStore = useProductosStore()

      recStore.recetas.push(mkReceta('r-1', 1))
      recStore.recetas[0]!.ingredientes = [
        {
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-06-20T00:00:00Z',
        },
      ]
      ingStore.materiasPrimas.push(mkMateria('mp-1', 10))
      prodStore.productos.push({
        id: 'p-1',
        receta_id: 'r-1',
        precio_venta: 0,
        disponible: true,
        orden: 0,
        descripcion: null,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      })
      evStore.eventos.push(mkEvento('e-1', 0.4))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: 15 }),
      ])

      const { precioMinimoParaProducto } = usePreciosEvento('e-1')
      const min = precioMinimoParaProducto.value('p-1')
      expect(min).not.toBeNull()
      expect(min!).toBeGreaterThanOrEqual(10)
    })
  })

  it('returns null when the producto is not configured for the evento', () => {
    conContexto(() => {
      const { precioMinimoParaProducto } = usePreciosEvento('e-1')
      expect(precioMinimoParaProducto.value('p-missing')).toBeNull()
    })
  })
})