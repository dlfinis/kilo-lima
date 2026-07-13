// REQ-POS-54, REQ-POS-56, REQ-FIN-31 (PR-2b sale-time COGS snapshot):
// thin container/presentational seam for ventas.store. `storeToRefs`
// keeps reactivity when the view destructures the refs. The composable
// is the only contract components see — they don't import the store
// directly. PR-2b updated `agregarAlCarrito` to (productoId, cantidad)
// — the store derives precio/costo/margen via usePreciosEvento.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import { useVentas } from './useVentas'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
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

function sembrarProducto(productoId: string, opts: { costo?: number; margen?: number } = {}): void {
  const { costo = 5, margen = 0 } = opts
  const ingredientes = useIngredientsStore()
  ingredientes.materiasPrimas.push({
    id: `mp-${productoId}`,
    nombre: 'Harina',
    unidad: 'kg',
    costo_por_unidad: costo,
    notas: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  const recetas = useRecipesStore()
  recetas.recetas.push({
    id: `r-${productoId}`,
    nombre: 'Receta',
    descripcion: null,
    rendimiento_unidades: 1,
    notas: null,
    ingredientes: [
      {
        id: `ri-${productoId}`,
        receta_id: `r-${productoId}`,
        materia_prima_id: `mp-${productoId}`,
        cantidad: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  const productos = useProductosStore()
  productos.productos.push({
    id: productoId,
    receta_id: `r-${productoId}`,
    // catalog-domain-refactor / Slice 1
    nombre: `Producto ${productoId}`,
    categoria: null,
    icono: null,
    color: null,
    precio_venta: null,
    disponible: true,
    orden: 0,
    descripcion: null,
    created_at: '2026-06-19T00:00:00Z',
    updated_at: '2026-06-19T00:00:00Z',
  })
  const epStore = useEventoProductosStore()
  epStore.productosPorEvento.set('e-1', [
    {
      id: `ep-${productoId}`,
      evento_id: 'e-1',
      producto_id: productoId,
      precio_venta: null,
      margen,
      incluido: true,
      created_at: '2026-06-19T00:00:00Z',
      updated_at: '2026-06-19T00:00:00Z',
    },
  ])
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

  it('agregarAlCarrito + totalCarrito stays reactive after destructure (REQ-POS-46, REQ-FIN-31)', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1'))
      sembrarProducto('p-1', { costo: 5, margen: 0 })
      const composable = useVentas()
      const { carrito, totalCarrito } = composable
      composable.agregarAlCarrito('p-1', 1)
      composable.agregarAlCarrito('p-1', 1)
      expect(carrito.value).toHaveLength(1)
      // margen=0 + costo=5 → precio=5; 2 × 5 = 10
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