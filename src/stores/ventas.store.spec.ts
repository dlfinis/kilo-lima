// REQ-POS-6, REQ-POS-7, REQ-POS-8, REQ-POS-9, REQ-POS-10, REQ-POS-11,
// REQ-POS-12, REQ-POS-13, REQ-POS-14, REQ-POS-15, REQ-POS-16,
// REQ-POS-17, REQ-POS-39, REQ-POS-51, REQ-POS-55, REQ-POS-56,
// REQ-FIN-28..32, REQ-FIN-31 (sale-time COGS snapshot):
//
// Cart math tests (PR1 skeleton — preserved) plus PR3 additions:
//   - cargarPorEvento loads ventas for the active evento
//   - registrarVenta: empty-cart guard, SIN_EVENTO_ACTIVO guard,
//     EVENTO_CERRADO guard, optimistic clear + revert-on-failure,
//     success appends the venta, emits success/error toast refs.
//   - snapshot pricing preserved end-to-end.
//
// PR-2b additions (REQ-FIN-31 sale-time COGS snapshot):
//   - agregarAlCarrito(productoId, cantidad) reads from catalogo +
//     recetas + usePreciosEvento to populate costo_unitario,
//     margen_aplicado, precio_unitario in the LineaCarrito
//   - registrarVenta forwards the snapshot columns to the items insert
//   - COGS is FROZEN at add-to-cart time — updating receta costs after
//     the line is in the cart does NOT mutate the line's costo_unitario
//
// Cross-store READS (eventsStore.eventos, productosStore, recipesStore,
// eventoProductosStore) happen inside `computed` / actions — WRITES
// to other stores are forbidden per REQ-POS-51.
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
import { useProductosStore } from './productos.store'
import { useRecipesStore } from './recipes.store'
import { useIngredientsStore } from './ingredients.store'
import { useEventoProductosStore } from './eventoProductos.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Evento,
  EventoProducto,
  MateriaPrima,
  Producto,
  RecetaConIngredientes,
  VentaConItems,
} from '@/types'

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

const mkProducto = (id: string, overrides: Partial<Producto> = {}): Producto => ({
  id,
  receta_id: `r-${id}`,
  precio_venta: 5,
  disponible: true,
  orden: 0,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkReceta = (
  id: string,
  overrides: Partial<RecetaConIngredientes> = {},
): RecetaConIngredientes => ({
  id,
  nombre: 'Brownies',
  descripcion: null,
  rendimiento_unidades: 1,
  notas: null,
  ingredientes: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const mkMateriaPrima = (id: string, overrides: Partial<MateriaPrima> = {}): MateriaPrima => ({
  id,
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 10,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const mkEventoProducto = (
  id: string,
  overrides: Partial<EventoProducto> = {},
): EventoProducto => ({
  id,
  evento_id: 'e-1',
  producto_id: 'p-1',
  precio_venta: null,
  margen: 0.4,
  incluido: true,
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

// Seeds the minimum cross-store data so agregarAlCarrito(productoId, 1)
// resolves a non-zero precio_unitario. Margen defaults to 0 so
// precio = costo (calcularPrecioPorMargen falls back to costo when
// margen is 0).
function sembrarProducto(
  productoId: string,
  opts: { costo?: number; margen?: number; recetaId?: string } = {},
): void {
  const { costo = 5, margen = 0, recetaId = `r-${productoId}` } = opts
  conContexto(() => {
    const ingredientes = useIngredientsStore()
    ingredientes.materiasPrimas.push(
      mkMateriaPrima(`mp-${productoId}`, { costo_por_unidad: costo }),
    )
    const recetas = useRecipesStore()
    recetas.recetas.push(
      mkReceta(recetaId, {
        ingredientes: [
          {
            id: `ri-${productoId}`,
            receta_id: recetaId,
            materia_prima_id: `mp-${productoId}`,
            cantidad: 1,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    )
    const productos = useProductosStore()
    productos.productos.push(mkProducto(productoId, { receta_id: recetaId }))
    const epStore = useEventoProductosStore()
    epStore.productosPorEvento.set('e-1', [
      mkEventoProducto(`ep-${productoId}`, { producto_id: productoId, margen }),
    ])
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
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]).toMatchObject({
        producto_id: 'p-1',
        cantidad: 1,
      })
    })
  })

  it('agregarAlCarrito merges duplicates by incrementing cantidad (REQ-POS-7)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      store.agregarAlCarrito('p-1', 1)
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]?.cantidad).toBe(2)
    })
  })

  it('agregarAlCarrito adds the requested cantidad (not always 1) (REQ-FIN-31 PR-2b)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 3)
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]?.cantidad).toBe(3)
    })
  })

  it('actualizarCantidad sets a positive quantity and recomputes subtotal (REQ-POS-8)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      store.actualizarCantidad('p-1', 3)
      expect(store.carrito[0]?.cantidad).toBe(3)
      expect(store.carrito[0]?.subtotal).toBe(15)
    })
  })

  it('actualizarCantidad(0) removes the line (REQ-POS-8)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      store.actualizarCantidad('p-1', 0)
      expect(store.carrito).toHaveLength(0)
    })
  })

  it('actualizarCantidad rejects negative quantities (REQ-POS-8)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      store.actualizarCantidad('p-1', -1)
      expect(store.carrito[0]?.cantidad).toBe(1)
    })
  })

  it('quitarDelCarrito removes the line for the given productoId (REQ-POS-9)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    sembrarProducto('p-2')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      store.agregarAlCarrito('p-2', 1)
      store.quitarDelCarrito('p-1')
      expect(store.carrito).toHaveLength(1)
      expect(store.carrito[0]?.producto_id).toBe('p-2')
    })
  })

  it('vaciarCarrito empties the cart (REQ-POS-10)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    sembrarProducto('p-2')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      store.agregarAlCarrito('p-2', 1)
      store.vaciarCarrito()
      expect(store.carrito).toEqual([])
      expect(store.totalCarrito).toBe(0)
      expect(store.cantidadItems).toBe(0)
    })
  })

  it('totalCarrito = Σ(cantidad × precio_unitario) rounded (REQ-POS-11)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    sembrarProducto('p-2')
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      store.agregarAlCarrito('p-2', 1)
      store.actualizarCantidad('p-1', 2)
      // 2 × 5 (p-1) + 1 × 5 (p-2) = 15
      expect(store.totalCarrito).toBe(15)
      expect(store.cantidadItems).toBe(3)
    })
  })

  it('agregarAlCarrito is a no-op when the producto is unknown (REQ-FIN-31)', () => {
    sembrarEventoEnCurso()
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('ghost', 1)
      expect(store.carrito).toHaveLength(0)
    })
  })
})

describe('useVentasStore — agregarAlCarrito PR-2b (REQ-FIN-28, REQ-FIN-29, REQ-FIN-31)', () => {
  it('uses usePreciosEvento.precio_final as precio_unitario (REQ-FIN-29)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { costo: 10, margen: 0.4 })
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      // precio = 10 / (1 - 0.4) = 16.6666... → 16.67 after redondearCentavos
      expect(store.carrito[0]?.precio_unitario).toBeCloseTo(16.67, 2)
    })
  })

  it('snapshots costo_unitario from receta at add-to-cart time (REQ-FIN-31)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { costo: 10, margen: 0.4 })
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      // costo_unitario is snapshotted from receta.costoPorUnidad.
      expect(store.carrito[0]?.costo_unitario).toBe(10)
    })
  })

  it('freezes costo_unitario — recipe cost changes after add do not mutate the cart line (REQ-FIN-31)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { costo: 10, margen: 0.4 })
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      expect(store.carrito[0]?.costo_unitario).toBe(10)

      // Ingredient price doubles. The receta's computed costoPorUnidad
      // would now be 20, but the cart line was already snapshotted.
      const ingredientes = useIngredientsStore()
      ingredientes.materiasPrimas[0]!.costo_por_unidad = 20

      // Cart line keeps the original snapshot.
      expect(store.carrito[0]?.costo_unitario).toBe(10)
    })
  })

  it('snapshots margen_aplicado from evento_producto (REQ-FIN-31)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { costo: 10, margen: 0.35 })
    conContexto(() => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      expect(store.carrito[0]?.margen_aplicado).toBe(0.35)
    })
  })

  it('falls back to evento.margen_ganancia when evento_producto.margen is null', () => {
    sembrarEventoEnCurso()
    conContexto(() => {
      const events = useEventsStore()
      events.eventos[0]!.margen_ganancia = 0.5
    })
    sembrarProducto('p-1', { costo: 10, margen: undefined as unknown as number })
    conContexto(() => {
      const epStore = useEventoProductosStore()
      const ep = epStore.productosPorEvento.get('e-1')?.[0]
      if (ep) ep.margen = null
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      expect(store.carrito[0]?.margen_aplicado).toBe(0.5)
    })
  })

  it('sets costo_unitario=0 when receta has no ingredients (legacy-safe, REQ-FIN-31)', () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { costo: 0, margen: 0.4 })
    conContexto(() => {
      // Empty the receta ingredients so costoPorUnidad = 0.
      const recetas = useRecipesStore()
      recetas.recetas[0]!.ingredientes = []
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      expect(store.carrito[0]?.costo_unitario).toBe(0)
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

describe('useVentasStore — registrarVenta (REQ-POS-12, REQ-POS-14, REQ-POS-15, REQ-POS-16, REQ-POS-17, REQ-POS-39, REQ-FIN-31)', () => {
  it('returns SIN_EVENTO_ACTIVO when no evento is en_curso (REQ-POS-16)', async () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1')
    await conContexto(async () => {
      // Clear the seeded evento to force the guard.
      useEventsStore().eventos.length = 0
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      const res = await store.registrarVenta('efectivo')
      expect(res.error?.code).toBe('SIN_EVENTO_ACTIVO')
      // Cart untouched.
      expect(store.carrito).toHaveLength(1)
    })
  })

  it('returns EVENTO_CERRADO when the active evento is cerrado (REQ-POS-39)', async () => {
    sembrarProducto('p-1')
    await conContexto(async () => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { estado: 'cerrado' }))
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
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
    sembrarProducto('p-1')
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 2)
      __pushSupabaseResponse<VentaConItems>({
        data: mkVenta({ id: 'v-1', evento_id: 'e-1', total: 10 }),
        error: null,
      })
      __pushSupabaseResponse<unknown>({
        data: [
          {
            id: 'vi-1',
            venta_id: 'v-1',
            producto_id: 'p-1',
            cantidad: 2,
            precio_unitario: 5,
            subtotal: 10,
          },
        ],
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
    sembrarProducto('p-1')
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
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
    sembrarProducto('p-1')
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      __pushSupabaseResponse<VentaConItems>({
        data: mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 }),
        error: null,
      })
      __pushSupabaseResponse<unknown>({
        data: [
          {
            id: 'vi-1',
            venta_id: 'v-1',
            producto_id: 'p-1',
            cantidad: 1,
            precio_unitario: 5,
            subtotal: 5,
          },
        ],
        error: null,
      })

      await store.registrarVenta('efectivo')
      const inserciones = __getSupabaseMockCalls().filter((l) => l.metodo === 'insert')
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

  it('forwards costo_unitario + margen_aplicado to the venta_items insert (REQ-FIN-31)', async () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { costo: 10, margen: 0.4 })
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)

      __pushSupabaseResponse<VentaConItems>({
        data: mkVenta({ id: 'v-1', evento_id: 'e-1', total: 16.67 }),
        error: null,
      })
      __pushSupabaseResponse<unknown>({
        data: [
          {
            id: 'vi-1',
            venta_id: 'v-1',
            producto_id: 'p-1',
            cantidad: 1,
            precio_unitario: 16.67,
            subtotal: 16.67,
            costo_unitario: 10,
            margen_aplicado: 0.4,
          },
        ],
        error: null,
      })

      await store.registrarVenta('efectivo')

      const inserciones = __getSupabaseMockCalls().filter((l) => l.metodo === 'insert')
      const itemInsert = inserciones[inserciones.length - 1]
      const itemArgs = itemInsert?.args[0] as Record<string, unknown>
      expect(itemArgs.costo_unitario).toBe(10)
      expect(itemArgs.margen_aplicado).toBeCloseTo(0.4, 4)
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
