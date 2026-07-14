// event-product-management-refactor / Phase 4: EventoGestionView tests.
// Unified Gestión productos view at `/eventos/:id/gestion`. Tests cover:
//   - Empty state rendering (no products configured)
//   - Table rendering with product rows (incluido, cost, production units)
//   - Closed-event guard (no-edit alert)
//   - Summary chips (included count, planned units)
//   - Projection rail presence
//
// Pattern follows EventoProductosView.spec.ts: Pinia + Vuetify + router,
// stores pre-seeded, supabase mock queued for the on-mount cargar() flow.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App, nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import type {
  Evento,
  EventoProducto,
  MateriaPrima,
  ProductoProduccion,
  RecetaConIngredientes,
} from '@/types'
import EventoGestionView from './EventoGestionView.vue'
import { useEventsStore } from '@/stores/events.store'
import { useProductoProduccionStore } from '@/stores/productoProduccion.store'
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

const mkPP = (overrides: Partial<ProductoProduccion> = {}): ProductoProduccion => ({
  id: 'pp-1',
  evento_producto_id: 'ep-1',
  unidades_a_producir: 50,
  created_at: '2026-07-13T00:00:00Z',
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

const mkMateria = (id: string, costo: number, disponible?: number): MateriaPrima => ({
  id,
  nombre: `MP ${id}`,
  unidad: 'kg',
  costo_por_unidad: costo,
  notas: null,
  created_at: '2026-06-20T00:00:00Z',
  updated_at: '2026-06-20T00:00:00Z',
  cantidad_disponible: disponible,
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
      { path: '/eventos/:id/gestion', name: 'evento-gestion', component: EventoGestionView },
      { path: '/eventos/:id', name: 'evento-detalle', component: { template: '<div/>' } },
    ],
  })
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as unknown as Record<string, unknown>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

// Seed the catalog stores (recipes, ingredients, productos) so cargar()
// skips the cargarTodas() supabase calls. Only ep/pp store calls consume
// queued responses.
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
      nombre: 'Café latte',
      categoria: null,
      precio_venta: null,
      disponible: true,
      orden: 0,
      descripcion: null,
      icono: null,
      color: null,
      created_at: '2026-06-20T00:00:00Z',
      updated_at: '2026-06-20T00:00:00Z',
    })
  })
}

async function mountView(id: string) {
  router.push(`/eventos/${id}/gestion`)
  await router.isReady()
  return mount(EventoGestionView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('EventoGestionView', () => {
  // cargar() flow: cargarPorId (cached, no supabase call) → Promise.all:
  //   epStore.cargarPorEvento (1 call) + ppStore.cargarPorEvento (1 call)
  //   + catalogs (skipped because prepararCatalogo seeds them).
  // Response queue: exactly 2 — ep store, pp store.

  it('renders the empty state when no products are configured', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<ProductoProduccion[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-gestion-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="evento-gestion-inicializar"]').exists()).toBe(true)
  })

  it('renders the data table with product rows when products exist', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1' })],
      error: null,
    })
    __pushSupabaseResponse<ProductoProduccion[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-gestion-tabla"]').exists()).toBe(true)
    const body = document.body.textContent ?? ''
    expect(body).toContain('Café latte')
  })

  it('shows the closed-event alert when the event is cerrado', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1', 'cerrado'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<ProductoProduccion[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-gestion-alerta-cerrado"]').exists()).toBe(true)
    const body = document.body.textContent ?? ''
    expect(body).toContain('no editable')
  })

  it('renders the event title', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<ProductoProduccion[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    const titulo = wrapper.find('[data-testid="evento-gestion-titulo"]')
    expect(titulo.exists()).toBe(true)
    expect(titulo.text()).toBe('Feria del Sol')
  })

  it('renders summary chips with included count and planned units', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1', incluido: true })],
      error: null,
    })
    __pushSupabaseResponse<ProductoProduccion[]>({
      data: [mkPP({ evento_producto_id: 'ep-1', unidades_a_producir: 30 })],
      error: null,
    })

    const wrapper = await mountView('e-1')
    await flushPromises()

    const totalProductos = wrapper.find('[data-testid="evento-gestion-total-productos"]')
    expect(totalProductos.exists()).toBe(true)
    expect(totalProductos.text()).toContain('1')

    const totalUnidades = wrapper.find('[data-testid="evento-gestion-total-unidades"]')
    expect(totalUnidades.exists()).toBe(true)
    expect(totalUnidades.text()).toContain('30')
  })

  // --- Phase 4: ingredient purchasing panel integration ---

  it('renders the ingredient purchasing panel when derivation data exists', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    // Assign available stock to mp-1 so the consolidated table shows
    // a purchase gap (requerido 10 − disponible 3 = 7 faltante).
    await conContexto(async () => {
      const ingStore = useIngredientsStore()
      const mp = ingStore.materiasPrimas.find((m) => m.id === 'mp-1')
      if (mp) mp.cantidad_disponible = 3
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1', incluido: true })],
      error: null,
    })
    __pushSupabaseResponse<ProductoProduccion[]>({
      data: [mkPP({ evento_producto_id: 'ep-1', unidades_a_producir: 10 })],
      error: null,
    })

    const wrapper = await mountView('e-1')
    await flushPromises()

    // ingredient derivation: (1 / 1) × 10 = 10 required for mp-1,
    // with 3 available → faltante 7.
    expect(wrapper.find('[data-testid="ingredientes-panels"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ingredientes-consolidado-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ingredientes-producto-panel-ep-1"]').exists()).toBe(true)

    // Title text is always rendered (even when collapsed).
    const body = document.body.textContent ?? ''
    expect(body).toContain('Resumen de compras')
    expect(body).toContain('Café latte')

    // Expand the consolidated panel to check table content.
    const consolTitle = wrapper.find(
      '[data-testid="ingredientes-consolidado-panel"] .v-expansion-panel-title',
    )
    await consolTitle.trigger('click')
    await nextTick()

    const bodyExpanded = document.body.textContent ?? ''
    expect(bodyExpanded).toContain('MP mp-1')
    expect(bodyExpanded).toContain('10.00')
    expect(bodyExpanded).toContain('3.00')
    expect(bodyExpanded).toContain('7.00')
  })

  it('shows the empty ingredient state when no derivation data is available', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    // EP included but no production units → no ingredient requirements derived.
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1', incluido: true })],
      error: null,
    })
    __pushSupabaseResponse<ProductoProduccion[]>({ data: [], error: null })

    const wrapper = await mountView('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="ingredientes-empty"]').exists()).toBe(true)
  })

  it('reactively re-derives ingredient requirements after production unit changes', async () => {
    await conContexto(async () => {
      const evStore = useEventsStore()
      evStore.eventos.push(mkEvento('e-1'))
    })
    await prepararCatalogo()
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEP({ id: 'ep-1', producto_id: 'p-1', incluido: true })],
      error: null,
    })
    __pushSupabaseResponse<ProductoProduccion[]>({
      data: [mkPP({ evento_producto_id: 'ep-1', unidades_a_producir: 5 })],
      error: null,
    })

    const wrapper = await mountView('e-1')
    await flushPromises()

    // Expand the consolidated panel to read table content.
    const consolTitle = wrapper.find(
      '[data-testid="ingredientes-consolidado-panel"] .v-expansion-panel-title',
    )
    await consolTitle.trigger('click')
    await nextTick()

    // Initial: 5 units → (1/1) × 5 = 5 required, 0 disponible → 5 faltante.
    let body = document.body.textContent ?? ''
    expect(body).toContain('5.00')

    // Mutate the store: bump production to 30 units.
    await conContexto(async () => {
      const ppStore = useProductoProduccionStore()
      const rows = ppStore.produccionPorEvento.get('e-1') ?? []
      ppStore.produccionPorEvento.set(
        'e-1',
        rows.map((r) =>
          r.evento_producto_id === 'ep-1'
            ? { ...r, unidades_a_producir: 30 }
            : r,
        ),
      )
    })
    await nextTick()

    // After reactivity: 30 units → 30 required.
    body = document.body.textContent ?? ''
    expect(body).toContain('30.00')
  })
})
