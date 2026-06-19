// REQ-PRICING-1, REQ-PRICING-7, REQ-FIN-18: per-evento product
// picker at `/eventos/:id/productos`. Renders a v-data-table with
// producto / receta / costo unitario / margen efectivo / precio
// sugerido / precio de venta (editable) + incluido checkbox. Bulk
// action "Inicializar desde catálogo" calls
// `inicializarDesdeCatalogo` for empty-evento workflows. Read-only
// when the evento is cerrado (`estadoEsEditable`).
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import type {
  Database,
  Evento,
  EventoProducto,
  MateriaPrima,
  RecetaConIngredientes,
} from '@/types'
import EventoProductosView from './EventoProductosView.vue'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useEventsStore } from '@/stores/events.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'

const vuetify = createVuetify({ components, directives })

const mkEvento = (id: string, estado: Evento['estado'] = 'planificacion'): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: 0.4,
  ubicacion: null,
  estado,
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

let aplicacion: App
let router: Router

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  document.body.innerHTML = ''
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/eventos', name: 'eventos', component: { template: '<div/>' } },
      { path: '/eventos/:id', name: 'evento-detalle', component: { template: '<div/>' } },
      {
        path: '/eventos/:id/productos',
        name: 'evento-productos',
        component: EventoProductosView,
        meta: { breadcrumb: ['Inicio', 'eventos', 'Productos'] },
      },
    ],
  })
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as unknown as { from: () => unknown } & Database['public']['Tables']['cierres_caja']['Row'])
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

async function prepararCatalogo() {
  await conContexto(async () => {
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
      created_at: '2026-06-20T00:00:00Z',
      updated_at: '2026-06-20T00:00:00Z',
    })
  })
}

async function mountView(id: string) {
  router.push(`/eventos/${id}/productos`)
  await router.isReady()
  return mount(EventoProductosView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('EventoProductosView', () => {
  it('exposes the route meta breadcrumb "Inicio / eventos / Productos"', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })

    await mountView('e-1')
    await flushPromises()

    // The global AppBar consumes `route.meta.breadcrumb` and renders
    // the trail. The view itself doesn't need to repeat it; just
    // assert the route is wired so the AppBar picks it up.
    const meta = router.currentRoute.value.meta.breadcrumb
    expect(meta).toEqual(['Inicio', 'eventos', 'Productos'])
  })

  it('renders the empty state with "Inicializar desde catálogo" when no productos are configured', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-productos-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="evento-productos-inicializar"]').exists()).toBe(true)
  })

  it('renders the DataTable with rows when productos exist', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      const epStore = useEventoProductosStore()
      evStore.eventos.push(mkEvento('e-1'))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: null }),
      ])
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: null })],
      error: null,
    })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-productos-tabla"]').exists()).toBe(true)
    const body = document.body.textContent ?? ''
    // producto_nombre surfaces through usePreciosEvento join.
    expect(body).toContain('Receta r-1')
  })

  it('renders the margen badge in the header', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-productos-margen"]').exists()).toBe(true)
    expect(document.body.textContent ?? '').toMatch(/40\s*%/)
  })

  it('shows the read-only alert when the evento is cerrado', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1', 'cerrado'))
      const epStore = useEventoProductosStore()
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4 }),
      ])
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4 })],
      error: null,
    })

    await mountView('e-1')
    await flushPromises()

    const body = document.body.textContent ?? ''
    expect(body).toContain('Evento cerrado')
  })

  it('renders the "Volver al evento" button', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-productos-volver"]').exists()).toBe(true)
  })

  it('shows the error state when supabase returns a failure', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    await mountView('e-1')
    await flushPromises()

    const body = document.body.textContent ?? ''
    expect(body).toContain('Error')
  })

  it('does not render the DataTable when empty', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-productos-tabla"]').exists()).toBe(false)
  })

  it('renders the producto row costo in the table', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      const epStore = useEventoProductosStore()
      evStore.eventos.push(mkEvento('e-1'))
      epStore.productosPorEvento.set('e-1', [
        mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: null }),
      ])
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1', margen: 0.4, precio_venta: null })],
      error: null,
    })

    await mountView('e-1')
    await flushPromises()

    const body = document.body.textContent ?? ''
    // costo unitario 10 shows somewhere in the table (formatted).
    expect(body).toMatch(/10[.,]00/)
  })
})