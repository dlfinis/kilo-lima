// REQ-POS-6, REQ-POS-7, REQ-POS-8, REQ-POS-9, REQ-POS-10, REQ-POS-11,
// REQ-POS-12, REQ-POS-13, REQ-POS-14, REQ-POS-15, REQ-POS-16,
// REQ-POS-17, REQ-POS-39, REQ-POS-51, REQ-POS-55, REQ-POS-56,
// REQ-FIN-28..32, REQ-FIN-31 (PR-2b sale-time COGS snapshot):
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
// pos-redesign (REQ-POS-CAMBIO-2, REQ-POS-CAMBIO-4, REQ-POS-COMPROBANTE-4,
// REQ-POS-COMPROBANTE-5):
//   - MONTO_INSUFICIENTE: registrarVenta rejects when metodo_pago =
//     efectivo and montoRecibido < total.
//   - cambio persisted from calcularCambio(total, montoRecibido).
//   - comprobante_numero generated via service.generarComprobanteNumero
//     and forwarded on the header insert; the response includes it.
//
// Cross-store READS (eventsStore.eventos, productosStore, recipesStore,
// eventoProductosStore) happen inside `computed` / actions — WRITES
// to other stores are forbidden per REQ-POS-51.
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  descripcion: null,
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
  monto_recibido: null,
  cambio: null,
  comprobante_numero: null,
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

  it('sets error when the fetch fails (REQ-POS-49, finding #5)', async () => {
    // Review finding #5: when the fetch fails, the previous
    // implementation cleared `ventas` to `[]` so the history dialog
    // rendered the misleading "Aún no hay ventas" empty state. The
    // new behavior keeps the prior ventas intact and sets `error`
    // so the history dialog can render an error banner with a retry
    // button (the new surface is in HistorialVentasEventoDialog).
    __pushSupabaseResponse<VentaConItems[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const store = useVentasStore()
      // Pre-seed ventas with the last successful data so the
      // invariant ("ventas is NOT cleared on error") is observable.
      // We also tag the cache with `ventasEventoId` so the wrong-event
      // safety check (finding #6) doesn't mistakenly treat these
      // rows as belonging to a different evento.
      store.ventas = [mkVenta({ id: 'v-prev' })]
      store.ventasEventoId = 'e-1'
      await store.cargarPorEvento('e-1')
      // ventas must NOT be cleared.
      expect(store.ventas).toHaveLength(1)
      expect(store.ventas[0]?.id).toBe('v-prev')
      // error is set so the dialog can render the banner.
      expect(store.error).toBeTruthy()
    })
  })

  // Issue: history fallback can show the wrong event's sales after a
  // load failure. When the operator switches the active evento and
  // the new load fails, the previous implementation retained the
  // prior evento's ventas array — the history dialog would render
  // them under the NEW evento's name. Fix: scope the ventas array
  // to the evento it was loaded for, and clear stale data when the
  // evento being loaded differs from the one currently cached.
  it('clears stale ventas when switching to a different evento (finding #6)', async () => {
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-e1', evento_id: 'e-1' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      // First load for e-1 succeeds.
      await store.cargarPorEvento('e-1')
      expect(store.ventas.map((v) => v.id)).toEqual(['v-e1'])
    })
    // Second load targets e-2 (the operator switched eventos). Push
    // a response so the load completes — we're testing the
    // successful-switch path, not the failure path.
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-e2', evento_id: 'e-2' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-2')
      // The array must contain only e-2's ventas, never e-1's.
      expect(store.ventas.map((v) => v.id)).toEqual(['v-e2'])
    })
  })

  it('clears stale ventas when a load for a DIFFERENT evento fails (finding #6)', async () => {
    // Seed ventas with e-1's data (the last successful load).
    await conContexto(async () => {
      const store = useVentasStore()
      store.ventas = [mkVenta({ id: 'v-e1', evento_id: 'e-1' })]
    })
    // Operator switched to e-2; load fails.
    __pushSupabaseResponse<VentaConItems[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-2')
      // The stale e-1 ventas must be cleared — never show e-1's data
      // labeled as e-2's. Showing them would mislead the operator
      // into thinking the failed load for e-2 returned e-1's sales.
      expect(store.ventas).toEqual([])
      expect(store.error).toBeTruthy()
    })
  })

  it('keeps ventas on failure when the failing load targets the SAME evento (no regression)', async () => {
    // Review finding #5 invariant: if the same evento fails, keep
    // the last successful ventas. Only the wrong-event case clears.
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-e1', evento_id: 'e-1' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
      expect(store.ventas.map((v) => v.id)).toEqual(['v-e1'])
    })
    // Same evento, second load fails — keep the last good ventas.
    __pushSupabaseResponse<VentaConItems[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
      expect(store.ventas.map((v) => v.id)).toEqual(['v-e1'])
      expect(store.error).toBeTruthy()
    })
  })

  // Issue #6: history-load failures emit a structured log line via
  // the logger utility. The log line is the minimum observability
  // signal we can wire without adding a third-party dependency.
  it('emits a structured log when cargarPorEvento fails (issue #6)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    __pushSupabaseResponse<VentaConItems[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const store = useVentasStore()
      store.ventas = [mkVenta({ id: 'v-prev' })]
      store.ventasEventoId = 'e-1'
      await store.cargarPorEvento('e-1')
    })
    expect(spy).toHaveBeenCalled()
    const [tag, context] = spy.mock.calls[0] ?? []
    expect(String(tag)).toMatch(/^\[cargarPorEvento\]\s+failed to load ventas/)
    expect(context).toMatchObject({
      eventoId: 'e-1',
      errorCode: 'PGRST301',
    })
    spy.mockRestore()
  })

  it('emits logInfo when cargarPorEvento starts (success-path trace)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-1' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
    })
    expect(infoSpy).toHaveBeenCalled()
    const [tag, context] = infoSpy.mock.calls[0] ?? []
    expect(String(tag)).toMatch(/^\[cargarPorEvento\]\s+loading ventas/)
    expect(context).toMatchObject({ eventoId: 'e-1' })
    infoSpy.mockRestore()
  })

  it('emits logInfo when cargarPorEvento succeeds with ventas count (success-path trace)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-a' }), mkVenta({ id: 'v-b' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
    })
    // The success log should come AFTER the start log (2 calls total).
    expect(infoSpy).toHaveBeenCalledTimes(2)
    const calls = infoSpy.mock.calls
    const startCall = calls[0]?.[0] ?? ''
    const successCall = calls[1]?.[0] ?? ''
    expect(String(startCall)).toMatch(/loading ventas/)
    expect(String(successCall)).toMatch(/^\[cargarPorEvento\]\s+ventas loaded/)
    const [, successCtx] = calls[1] ?? []
    expect(successCtx).toMatchObject({ eventoId: 'e-1', count: 2 })
    infoSpy.mockRestore()
  })

  it('emits a structured log when corregirVenta fails (issue #6)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1' })
      store.ventas = [venta]
      // Generic network failure (not a domain code) — the toast
      // surfaces the connection hint, but we still log the failure.
      __pushSupabaseResponse<unknown>({
        data: null,
        error: { code: 'PGRST301', message: 'connection lost' },
      })
      await store.corregirVenta({
        venta,
        nuevoTotal: 5,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 1, precio_unitario: 5, subtotal: 5 },
        ],
        motivo: 'fix',
      })
    })
    expect(spy).toHaveBeenCalled()
    const [tag, context] = spy.mock.calls[0] ?? []
    expect(String(tag)).toMatch(/^\[corregirVenta\]\s+failed to apply correction/)
    expect(context).toMatchObject({
      eventoId: 'e-1',
      ventaId: 'v-1',
    })
    spy.mockRestore()
  })

  // Trace events (observability): cargarPorEvento emits logTrace via
  // console.debug at flow boundaries so a developer can follow the
  // timeline. Each flow gets a correlation traceId.
  it('emits logTrace when cargarPorEvento starts (success-path trace)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-1' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
    })
    expect(debugSpy).toHaveBeenCalled()
    const calls = debugSpy.mock.calls
    const startCall = calls.find((c) => String(c[0]).includes('load-start'))
    const tag = String(startCall?.[0] ?? '')
    expect(tag).toMatch(/^\[cargarPorEvento\]\s+load-start/)
    const ctx = startCall?.[1] as Record<string, unknown> | undefined
    expect(ctx?.traceId).toBeDefined()
    expect(String(ctx?.traceId)).toMatch(/^trc_/)
    debugSpy.mockRestore()
  })

  it('emits logTrace when cargarPorEvento completes (success-path trace)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-a' }), mkVenta({ id: 'v-b' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
    })
    expect(debugSpy).toHaveBeenCalled()
    const calls = debugSpy.mock.calls
    const doneCall = calls.find((c) => String(c[0]).includes('load-done'))
    const tag = String(doneCall?.[0] ?? '')
    expect(tag).toMatch(/^\[cargarPorEvento\]\s+load-done/)
    const ctx = doneCall?.[1] as Record<string, unknown> | undefined
    expect(ctx?.traceId).toBeDefined()
    expect(ctx?.count).toBe(2)
    debugSpy.mockRestore()
  })

  it('emits logTrace on both start and done with the SAME traceId (correlation)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    __pushSupabaseResponse<VentaConItems[]>({
      data: [mkVenta({ id: 'v-1' })],
      error: null,
    })
    await conContexto(async () => {
      const store = useVentasStore()
      await store.cargarPorEvento('e-1')
    })
    const calls = debugSpy.mock.calls
    const startCall = calls.find((c) => String(c[0]).includes('load-start'))
    const doneCall = calls.find((c) => String(c[0]).includes('load-done'))
    const startCtx = startCall?.[1] as Record<string, unknown> | undefined
    const doneCtx = doneCall?.[1] as Record<string, unknown> | undefined
    expect(startCtx?.traceId).toBeDefined()
    expect(doneCtx?.traceId).toBe(startCtx?.traceId)
    debugSpy.mockRestore()
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
      // pos-redesign: the store calls generarComprobanteNumero first
      // (consumes the count query response). Pushed first so the
      // service reads it before the header insert.
      __pushSupabaseResponse<unknown>({ data: null, error: null })
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
      // pos-redesign: count query first.
      __pushSupabaseResponse<unknown>({ data: null, error: null })
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
      __pushSupabaseResponse<unknown>({ data: null, error: null })
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

      __pushSupabaseResponse<unknown>({ data: null, error: null })
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

// pos-redesign (REQ-POS-CAMBIO-4, REQ-POS-COMPROBANTE-4,
// REQ-POS-COMPROBANTE-5): MONTO_INSUFICIENTE guard, cambio persistence,
// comprobante_numero generation.
describe('useVentasStore — registrarVenta pos-redesign (REQ-POS-CAMBIO-4, REQ-POS-COMPROBANTE-4)', () => {
  it('returns MONTO_INSUFICIENTE when efectivo + montoRecibido < total (REQ-POS-CAMBIO-4)', async () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { margen: 0 }) // precio = costo = 5; cart total = 5
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)
      // Customer pays $3 for a $5 sale.
      const res = await store.registrarVenta('efectivo', 3)
      expect(res.error?.code).toBe('MONTO_INSUFICIENTE')
      // Cart must remain intact (revert on validation failure).
      expect(store.carrito).toHaveLength(1)
    })
  })

  it('forwards monto_recibido + cambio + comprobante_numero to the ventas insert (REQ-POS-CAMBIO-5, REQ-POS-COMPROBANTE-4)', async () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { margen: 0 })
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1) // total = 5

      // The store calls servicio.generarComprobanteNumero first (count
      // query), then the header insert. Mock both responses.
      __pushSupabaseResponse<unknown>({
        data: null,
        error: null,
        // `count` rides on the response when count: 'exact' is set on
        // the query — the mocked builder exposes it via a separate
        // `count` field; the service ignores it and reads
        // `respuesta.count`.
      })
      // The chainable mock in tests/setup doesn't capture the `count`
      // option, so we surface the number via a side-channel: pre-seed
      // the ventas array directly so generarComprobanteNumero reads
      // count = 0 and returns V-001. (We verify the wiring by reading
      // the insert payload, not the helper's return value.)

      __pushSupabaseResponse<VentaConItems>({
        data: {
          ...mkVenta({
            id: 'v-1',
            evento_id: 'e-1',
            total: 5,
            monto_recibido: 10,
            cambio: 5,
            comprobante_numero: 'V-001',
          }),
          items: [],
        },
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

      const res = await store.registrarVenta('efectivo', 10)
      expect(res.error).toBeNull()
      expect(res.data?.monto_recibido).toBe(10)
      expect(res.data?.cambio).toBe(5)
      expect(res.data?.comprobante_numero).toBe('V-001')

      const inserciones = __getSupabaseMockCalls().filter((l) => l.metodo === 'insert')
      const headerArgs = inserciones[0]?.args[0] as Record<string, unknown>
      expect(headerArgs.monto_recibido).toBe(10)
      expect(headerArgs.cambio).toBe(5)
      expect(headerArgs.comprobante_numero).toBe('V-001')
    })
  })

  it('persists null monto_recibido + cambio when metodo_pago is transferencia (REQ-POS-CAMBIO-5)', async () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { margen: 0 })
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1)

      __pushSupabaseResponse<unknown>({ data: null, error: null })
      __pushSupabaseResponse<VentaConItems>({
        data: {
          ...mkVenta({
            id: 'v-1',
            evento_id: 'e-1',
            total: 5,
            metodo_pago: 'transferencia',
            monto_recibido: null,
            cambio: null,
            comprobante_numero: 'V-001',
          }),
          items: [],
        },
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

      const res = await store.registrarVenta('transferencia')
      expect(res.error).toBeNull()

      const inserciones = __getSupabaseMockCalls().filter((l) => l.metodo === 'insert')
      const headerArgs = inserciones[0]?.args[0] as Record<string, unknown>
      expect(headerArgs.monto_recibido).toBeNull()
      expect(headerArgs.cambio).toBeNull()
      // comprobante_numero is always generated (the receipt dialog
      // shows for every sale, not just efectivo).
      expect(headerArgs.comprobante_numero).toBe('V-001')
    })
  })

  it('computes cambio = montoRecibido − total via calcularCambio (REQ-POS-CAMBIO-2)', async () => {
    sembrarEventoEnCurso()
    sembrarProducto('p-1', { margen: 0 }) // precio=5
    await conContexto(async () => {
      const store = useVentasStore()
      store.agregarAlCarrito('p-1', 1) // total = 5

      __pushSupabaseResponse<unknown>({ data: null, error: null })
      __pushSupabaseResponse<VentaConItems>({
        data: {
          ...mkVenta({
            id: 'v-1',
            evento_id: 'e-1',
            total: 5,
            monto_recibido: 10,
            cambio: 5,
            comprobante_numero: 'V-001',
          }),
          items: [],
        },
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

      await store.registrarVenta('efectivo', 10)
      const inserciones = __getSupabaseMockCalls().filter((l) => l.metodo === 'insert')
      const headerArgs = inserciones[0]?.args[0] as Record<string, unknown>
      // montoRecibido=10, total=5 → cambio=5
      expect(headerArgs.cambio).toBe(5)
    })
  })
})

// REQ-POS-CORRECCION-1..3: store-level orchestration for sale
// corrections. The store is the policy gate — the service is a thin
// persistence layer. Specifically:
//   - the EVENTO_CERRADO guard lives in the store (the service trusts
//     the caller's caller); closed eventos return EVENTO_CERRADO and
//     the local ventas array is untouched.
//   - the items are deleted + re-inserted by the store before the
//     service is called so the audit trail reflects the new items in
//     items_nuevos and the previous items in items_anteriores.
//   - the local ventas ref is updated on success so the history view
//     reflects the change without a re-fetch.
// REQ-POS-CORRECCION-1..3: store-level orchestration for sale
// corrections. The store is the UX gate — the service is a thin
// persistence layer that delegates to a single RPC. Specifically:
//   - the EVENTO_CERRADO guard lives in the store (fast feedback for
//     the operator) and is ALSO enforced by the RPC (defense in depth)
//   - MONTO_INSUFICIENTE is validated client-side (review finding #4)
//   - monto_recibido / cambio are normalized to null for non-efectivo
//     methods so a stale value from a previous effective payment does
//     not leak into the new record
//   - motivo is required (REQ-POS-CORRECCION-3)
//   - the local ventas ref is updated on success so the history view
//     reflects the change without a re-fetch
describe('useVentasStore — corregirVenta (REQ-POS-CORRECCION-1..3, v2 atomic RPC)', () => {
  it('returns EVENTO_CERRADO when the evento is cerrado (REQ-POS-CORRECCION-2, client-side guard)', async () => {
    sembrarProducto('p-1')
    await conContexto(async () => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { estado: 'cerrado' }))
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 })
      store.ventas = [venta]
      const res = await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'prueba',
      })
      expect(res.error?.code).toBe('EVENTO_CERRADO')
      // Local state must be unchanged — closed eventos are read-only.
      expect(store.ventas[0]?.total).toBe(5)
      expect(store.ventas[0]?.metodo_pago).toBe('efectivo')
      // No RPC should have been made — the client guard fired first.
      const rpcCalls = __getSupabaseMockCalls().filter((l) => l.metodo === 'rpc')
      expect(rpcCalls.length).toBe(0)
    })
  })

  it('returns MONTO_INSUFICIENTE when efectivo + nuevoMontoRecibido < nuevoTotal (finding #4)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 10 })
      store.ventas = [venta]
      const res = await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'efectivo',
        nuevoMontoRecibido: 5, // < total
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'pago corto',
      })
      expect(res.error?.code).toBe('MONTO_INSUFICIENTE')
      // No RPC call — the client guard fires first.
      const rpcCalls = __getSupabaseMockCalls().filter((l) => l.metodo === 'rpc')
      expect(rpcCalls.length).toBe(0)
      // Local state unchanged.
      expect(store.ventas[0]?.total).toBe(10)
    })
  })

  it('normalizes monto_recibido to null for non-efectivo methods (finding #4)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'efectivo',
        monto_recibido: 20, // stale value from a previous efectivo edit
        cambio: 10,
      })
      store.ventas = [venta]
      // The RPC returns the post-correction state.
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'transferencia',
        monto_recibido: null,
        cambio: null,
      })
      __pushSupabaseResponse<unknown>({
        data: { venta: rpcVenta, items: [] },
        error: null,
      })
      const res = await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        // Caller passes 20 by accident (stale UI value) — the store
        // must normalize this to null so the RPC doesn't receive a
        // cash-back value for a non-efectivo method.
        nuevoMontoRecibido: 20,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'cambio de método',
      })
      expect(res.error).toBeNull()
      const rpcCall = __getSupabaseMockCalls().find((l) => l.metodo === 'rpc')
      const payload = (rpcCall?.args[1] as { payload: { monto_recibido_nuevo: number | null } })
        .payload
      expect(payload.monto_recibido_nuevo).toBeNull()
    })
  })

  it('forwards a non-null monto_recibido_nuevo for efectivo (finding #4)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 10 })
      store.ventas = [venta]
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'efectivo',
        monto_recibido: 20,
        cambio: 10,
      })
      __pushSupabaseResponse<unknown>({
        data: { venta: rpcVenta, items: [] },
        error: null,
      })
      await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'efectivo',
        nuevoMontoRecibido: 20,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'ajuste',
      })
      const rpcCall = __getSupabaseMockCalls().find((l) => l.metodo === 'rpc')
      const payload = (rpcCall?.args[1] as { payload: { monto_recibido_nuevo: number | null } })
        .payload
      expect(payload.monto_recibido_nuevo).toBe(20)
    })
  })

  it('updates the local venta on success and returns the updated row', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 })
      store.ventas = [venta]
      // The v2 flow is a SINGLE RPC call. The RPC returns the
      // post-correction { venta, items } shape.
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'transferencia',
        monto_recibido: null,
        cambio: null,
      })
      __pushSupabaseResponse<unknown>({
        data: {
          venta: rpcVenta,
          items: [
            {
              id: 'vi-new-1',
              venta_id: 'v-1',
              producto_id: 'p-1',
              cantidad: 2,
              precio_unitario: 5,
              subtotal: 10,
              costo_unitario: null,
              margen_aplicado: null,
              evento_producto_id: null,
              created_at: '2026-07-07T00:00:00Z',
            },
          ],
        },
        error: null,
      })

      const res = await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          {
            producto_id: 'p-1',
            cantidad: 2,
            precio_unitario: 5,
            subtotal: 10,
          },
        ],
        motivo: 'fix',
      })
      expect(res.error).toBeNull()
      expect(res.data?.id).toBe('v-1')
      expect(res.data?.total).toBe(10)
      expect(res.data?.metodo_pago).toBe('transferencia')
      // Local state reflects the correction without a re-fetch.
      expect(store.ventas[0]?.total).toBe(10)
      expect(store.ventas[0]?.metodo_pago).toBe('transferencia')
      // Exactly ONE rpc call (atomicity invariant).
      const rpcCalls = __getSupabaseMockCalls().filter((l) => l.metodo === 'rpc')
      expect(rpcCalls).toHaveLength(1)
    })
  })

  it('returns CORRECCION_SIN_MOTIVO when motivo is empty (REQ-POS-CORRECCION-3)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1' })
      const res = await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: '   ',
      })
      expect(res.error?.code).toBe('CORRECCION_SIN_MOTIVO')
      // Nothing was sent to Supabase.
      const rpcCalls = __getSupabaseMockCalls().filter((l) => l.metodo === 'rpc')
      expect(rpcCalls.length).toBe(0)
    })
  })

  it('returns VENTA_SIN_ITEMS when nuevosItems is empty (defense in depth)', async () => {
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1' })
      const res = await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [],
        motivo: 'fix',
      })
      expect(res.error?.code).toBe('VENTA_SIN_ITEMS')
      // No RPC call.
      const rpcCalls = __getSupabaseMockCalls().filter((l) => l.metodo === 'rpc')
      expect(rpcCalls.length).toBe(0)
    })
  })

  // Triangulation: explicitly seeds the active evento in planificacion
  // state and verifies the correction succeeds — that state is also
  // editable per estadoEsEditable.
  it('allows corrections when the evento is planificacion (also editable)', async () => {
    sembrarProducto('p-1')
    await conContexto(async () => {
      const events = useEventsStore()
      // Set the active evento to planificacion — editable per the
      // estadoEsEditable invariant.
      events.eventos.length = 0
      events.eventos.push(mkEvento('e-1', { estado: 'planificacion' }))
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1' })
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 5,
        metodo_pago: 'efectivo',
      })
      __pushSupabaseResponse<unknown>({
        data: { venta: rpcVenta, items: [] },
        error: null,
      })
      const res = await store.corregirVenta({
        venta,
        nuevoTotal: 5,
        nuevoMetodoPago: 'efectivo',
        nuevoMontoRecibido: 5,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 1, precio_unitario: 5, subtotal: 5 },
        ],
        motivo: 'ajuste en planificación',
      })
      expect(res.error).toBeNull()
    })
  })

  it('emits logInfo when corregirVenta starts (success-path trace with delta summary)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 })
      store.ventas = [venta]
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'transferencia',
        monto_recibido: null,
        cambio: null,
      })
      __pushSupabaseResponse<unknown>({
        data: { venta: rpcVenta, items: [] },
        error: null,
      })
      await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'observability test',
      })
    })
    expect(infoSpy).toHaveBeenCalled()
    const [tag, context] = infoSpy.mock.calls[0] ?? []
    expect(String(tag)).toMatch(/^\[corregirVenta\]\s+correction started/)
    expect(context).toMatchObject({
      ventaId: 'v-1',
      eventoId: 'e-1',
      totalAnterior: 5,
      totalNuevo: 10,
      itemsCount: 1,
    })
    infoSpy.mockRestore()
  })

  it('emits logInfo when corregirVenta succeeds (success-path trace)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 })
      store.ventas = [venta]
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'transferencia',
        monto_recibido: null,
        cambio: null,
        comprobante_numero: 'V-042',
      })
      __pushSupabaseResponse<unknown>({
        data: { venta: rpcVenta, items: [] },
        error: null,
      })
      await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'observability success test',
      })
    })
    // Start log + success log = 2 calls
    expect(infoSpy).toHaveBeenCalledTimes(2)
    const successCall = infoSpy.mock.calls[1]?.[0] ?? ''
    expect(String(successCall)).toMatch(/^\[corregirVenta\]\s+correction applied/)
    const [, successCtx] = infoSpy.mock.calls[1] ?? []
    expect(successCtx).toMatchObject({
      ventaId: 'v-1',
      comprobanteNumero: 'V-042',
    })
    infoSpy.mockRestore()
  })

  // Trace events (observability): corregirVenta emits logTrace via
  // console.debug at flow boundaries so a developer can follow the
  // correction timeline end-to-end.
  it('emits logTrace when corregirVenta starts (trace with traceId)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 })
      store.ventas = [venta]
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'transferencia',
        monto_recibido: null,
        cambio: null,
      })
      __pushSupabaseResponse<unknown>({
        data: { venta: rpcVenta, items: [] },
        error: null,
      })
      await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'trace test',
      })
    })
    expect(debugSpy).toHaveBeenCalled()
    const reqCall = debugSpy.mock.calls.find((c) => String(c[0]).includes('correction-requested'))
    const tag = String(reqCall?.[0] ?? '')
    expect(tag).toMatch(/^\[corregirVenta\]\s+correction-requested/)
    const ctx = reqCall?.[1] as Record<string, unknown> | undefined
    expect(ctx?.traceId).toBeDefined()
    expect(String(ctx?.traceId)).toMatch(/^trc_/)
    expect(ctx?.ventaId).toBe('v-1')
    debugSpy.mockRestore()
  })

  it('emits logTrace when corregirVenta succeeds (trace with same traceId)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1', total: 5 })
      store.ventas = [venta]
      const rpcVenta = mkVenta({
        id: 'v-1',
        evento_id: 'e-1',
        total: 10,
        metodo_pago: 'transferencia',
        monto_recibido: null,
        cambio: null,
        comprobante_numero: 'V-042',
      })
      __pushSupabaseResponse<unknown>({
        data: { venta: rpcVenta, items: [] },
        error: null,
      })
      await store.corregirVenta({
        venta,
        nuevoTotal: 10,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 2, precio_unitario: 5, subtotal: 10 },
        ],
        motivo: 'trace success test',
      })
    })
    const reqCall = debugSpy.mock.calls.find((c) => String(c[0]).includes('correction-requested'))
    const doneCall = debugSpy.mock.calls.find((c) => String(c[0]).includes('correction-done'))
    const doneTag = String(doneCall?.[0] ?? '')
    expect(doneTag).toMatch(/^\[corregirVenta\]\s+correction-done/)
    const doneCtx = doneCall?.[1] as Record<string, unknown> | undefined
    expect(doneCtx?.traceId).toBeDefined()
    expect(doneCtx?.comprobanteNumero).toBe('V-042')
    const startCtx = reqCall?.[1] as Record<string, unknown> | undefined
    expect(doneCtx?.traceId).toBe(startCtx?.traceId)
    debugSpy.mockRestore()
  })

  it('emits logTrace when corregirVenta fails (trace with traceId)', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    sembrarEventoEnCurso()
    await conContexto(async () => {
      const store = useVentasStore()
      const venta = mkVenta({ id: 'v-1', evento_id: 'e-1' })
      store.ventas = [venta]
      __pushSupabaseResponse<unknown>({
        data: null,
        error: { code: 'PGRST301', message: 'connection lost' },
      })
      await store.corregirVenta({
        venta,
        nuevoTotal: 5,
        nuevoMetodoPago: 'transferencia',
        nuevoMontoRecibido: null,
        nuevosItems: [
          { producto_id: 'p-1', cantidad: 1, precio_unitario: 5, subtotal: 5 },
        ],
        motivo: 'trace fail test',
      })
    })
    const failCall = debugSpy.mock.calls.find((c) => String(c[0]).includes('correction-failed'))
    const tag = String(failCall?.[0] ?? '')
    expect(tag).toMatch(/^\[corregirVenta\]\s+correction-failed/)
    const ctx = failCall?.[1] as Record<string, unknown> | undefined
    expect(ctx?.traceId).toBeDefined()
    expect(String(ctx?.traceId)).toMatch(/^trc_/)
    debugSpy.mockRestore()
  })
})
