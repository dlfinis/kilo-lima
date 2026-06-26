// REQ-UX-9, REQ-UX-10 + REQ-UX-25: useResumen composable.
//
// Aggregates 6 stores (ingredients, recipes, events, productos,
// ventas, cierresCaja) into a single `contadores` computed so the
// home view can render counters without knowing the underlying
// stores. `cargar()` orchestrates parallel fetches via
// `Promise.allSettled` so a single store's failure does NOT blank
// the entire home (REQ-UX-10). `ventas` is fetched LAZILY — only
// when there's an active evento (REQ-UX-10 "ventas lazy").
//
// Tests use the chainable Supabase mock from tests/setup.ts so each
// store sees the same builder. We seed the stores' reactive arrays
// directly (no real fetch) and verify the computed aggregation. The
// `cargar()` flow is exercised end-to-end via __resetSupabaseMock +
// __pushSupabaseResponse so we don't depend on network.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import { useEventsStore } from '@/stores/events.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useResumen, type Contadores } from './useResumen'
import type { Database, Evento, MateriaPrima, Producto, RecetaConIngredientes, VentaConItems } from '@/types'

let aplicacion: App

const mkEvento = (id: string, estado: Evento['estado']): Evento => ({
  id,
  nombre: 'Feria',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado,
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
})

const mkMateria = (id: string): MateriaPrima => ({
  id,
  nombre: 'Azúcar',
  unidad: 'kg',
  costo_por_unidad: 1,
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
})

const mkReceta = (id: string): RecetaConIngredientes => ({
  id,
  nombre: 'Brownie',
  descripcion: null,
  rendimiento_unidades: 10,
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ingredientes: [],
})

const mkProducto = (id: string): Producto => ({
  id,
  receta_id: 'r-1',
  precio_venta: 5,
  disponible: true,
  orden: 0,
  descripcion: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
})

const mkVenta = (id: string): VentaConItems => ({
  id,
  evento_id: 'e-curso',
  fecha: '2026-06-19T00:00:00Z',
  total: 10,
  metodo_pago: 'efectivo',
  monto_recibido: null,
  cambio: null,
  comprobante_numero: null,
  created_at: '2026-06-19T00:00:00Z',
  items: [],
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

// Helper: read contadores.value from inside the Pinia + supabase
// injection context (stores need both to initialise).
function leerContadores(): Contadores {
  return conContexto(() => {
    const { contadores } = useResumen()
    return contadores.value
  })
}

describe('useResumen', () => {
  it('returns zero counters and cargado=false on first read (REQ-UX-9)', () => {
    const c = leerContadores()
    expect(c.materiasPrimas).toBe(0)
    expect(c.recetas).toBe(0)
    expect(c.eventosTotal).toBe(0)
    expect(c.eventosEnCurso).toBe(0)
    expect(c.eventosPlanificacion).toBe(0)
    expect(c.eventosCerrados).toBe(0)
    expect(c.productos).toBe(0)
    expect(c.ventasHoy).toBe(0)
    expect(c.cargado).toBe(false)
  })

  it('aggregates populated stores into the computed contadores (REQ-UX-9, REQ-UX-10)', async () => {
    await nextTick()
    conContexto(() => {
      const ing = useIngredientsStore()
      const rec = useRecipesStore()
      const ev = useEventsStore()
      const prod = useProductosStore()
      ing.materiasPrimas.push(mkMateria('m-1'), mkMateria('m-2'))
      rec.recetas.push(mkReceta('r-1'))
      ev.eventos.push(mkEvento('e-1', 'planificacion'), mkEvento('e-2', 'en_curso'), mkEvento('e-3', 'cerrado'))
      prod.productos.push(mkProducto('p-1'))
    })
    const c = leerContadores()
    expect(c.materiasPrimas).toBe(2)
    expect(c.recetas).toBe(1)
    expect(c.eventosTotal).toBe(3)
    expect(c.eventosPlanificacion).toBe(1)
    expect(c.eventosEnCurso).toBe(1)
    expect(c.eventosCerrados).toBe(1)
    expect(c.productos).toBe(1)
  })

  it('counts ventasHoy from the ventas store (REQ-UX-9)', async () => {
    await nextTick()
    conContexto(() => {
      const ventas = useVentasStore()
      ventas.ventas.push(mkVenta('v-1'), mkVenta('v-2'))
    })
    const c = leerContadores()
    expect(c.ventasHoy).toBe(2)
  })

  it('cargar() flips cargado to true after parallel fetches resolve (REQ-UX-10)', async () => {
    // Queue responses for each store's listar() call (4 calls: ing, rec, ev, prod).
    // The default Supabase mock returns { data: [], error: null } when
    // the queue is empty — that's fine, we only care that cargar()
    // resolves and sets cargado=true.
    await conContexto(async () => {
      const { cargar } = useResumen()
      await cargar()
    })
    const c = leerContadores()
    expect(c.cargado).toBe(true)
    expect(c.errores).toEqual([])
  })

  it('isolates failures via Promise.allSettled — one rejected store does not blank the home (REQ-UX-10)', async () => {
    // Push 3 success responses and 1 error so the rejection is real.
    // The Supabase mock returns whatever the queue says; Promise.allSettled
    // wraps rejections in { status: 'rejected' } so useResumen records
    // an error but still completes cargar().
    __resetSupabaseMock()
    // 3 successes + 1 error — the store will record MENSAJE_ERROR_CARGA
    // in its own `error` ref but useResumen sees the rejection.
    __pushSupabaseResponse({ data: [], error: null })
    __pushSupabaseResponse({ data: [], error: null })
    __pushSupabaseResponse({ data: [], error: null })
    __pushSupabaseResponse({ data: null, error: { code: 'FETCH_FAIL', message: 'fail' } })
    await conContexto(async () => {
      const { cargar } = useResumen()
      await cargar()
    })
    const c = leerContadores()
    expect(c.cargado).toBe(true)
    // The error message is the Spanish fallback from useResumen.
    expect(c.errores.length).toBeGreaterThan(0)
  })

  it('skips ventas fetch when no evento is en_curso (REQ-UX-10 ventas lazy)', async () => {
    await conContexto(async () => {
      const { cargar } = useResumen()
      await cargar()
    })
    // After cargar with no active evento, ventas remains empty (no fetch).
    const ventasCount = conContexto(() => useVentasStore().ventas.length)
    expect(ventasCount).toBe(0)
  })

  it('fetches ventas for the active evento when one exists (REQ-UX-10 ventas lazy)', async () => {
    // cargar() fans out 5 supabase reads: ing/rec/ev/prod + ventas.
    // The events response MUST include the en_curso evento or the
    // ventas lazy branch never triggers (the seed-push via
    // `events.eventos.push(...)` is wiped by `eventos.value = res.data`).
    // Push 5 responses — the 3rd (events) carries the evento so the
    // lazy ventas branch picks it up.
    __resetSupabaseMock()
    __pushSupabaseResponse({ data: [], error: null })
    __pushSupabaseResponse({ data: [], error: null })
    __pushSupabaseResponse({ data: [mkEvento('e-curso', 'en_curso')], error: null })
    __pushSupabaseResponse({ data: [], error: null })
    __pushSupabaseResponse({ data: [mkVenta('v-x')], error: null })
    await conContexto(async () => {
      const { cargar } = useResumen()
      await cargar()
    })
    const ventasCount = await conContexto(async () => {
      const v = useVentasStore()
      return v.ventas.length
    })
    expect(ventasCount).toBe(1)
  })

  it('cargar() only flips cargado to true once — second call is idempotent', async () => {
    await conContexto(async () => {
      const { cargar } = useResumen()
      await cargar()
      await cargar()
    })
    const c = leerContadores()
    expect(c.cargado).toBe(true)
  })
})
