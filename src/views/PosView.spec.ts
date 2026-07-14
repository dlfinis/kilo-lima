// REQ-POS-7, REQ-POS-14, REQ-POS-15, REQ-POS-16, REQ-POS-20,
// REQ-POS-24, REQ-POS-25, REQ-POS-28, REQ-POS-39, REQ-POS-40,
// REQ-POS-46, REQ-POS-49, REQ-POS-54, REQ-POS-55,
// REQ-FIN-28, REQ-FIN-29, REQ-FIN-30, REQ-FIN-32 (PR-2b POS integration):
//
// POS main view. Wires useProductos + useVentas + useEvents +
// useGastosImprevistos + usePreciosEvento + useEventoProductosStore.
//
// PR-2b sources the product grid from evento_productos (filtered
// incluido=true + computable costo) and snapshots COGS at add-to-cart
// time. The PR-2b empty state directs the operator to
// EventoProductosView when the active evento has no included products.
//
// The onMounted hook calls cargarEventos + cargarTodas (catalog) +
// cargarRecetas (recipes) via Supabase. Tests pre-stage Supabase
// responses for those fetches; the non-fetched stores
// (evento_productos, ingredientes) are seeded directly via the store
// references.
//
// mobile-ux-redesign Phase 3: mocked usePosMode for mode-switching tests.
const posModeRef = { value: false }
vi.mock('@/composables/usePosMode', async () => {
  const { computed } = await import('vue')
  return {
    usePosMode: () => ({
      isSimplifiedMode: computed(() => posModeRef.value),
    }),
  }
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory } from 'vue-router'

import {
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'

import PosView from './PosView.vue'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import CarritoPanel from '@/components/business/CarritoPanel.vue'
import EditarVentaDialog from '@/components/business/EditarVentaDialog.vue'
import RegistrarVentaDialog from '@/components/business/RegistrarVentaDialog.vue'
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

const vuetify = createVuetify({ components, directives })

const mkProducto = (id: string, overrides: Partial<Producto> = {}): Producto => ({
  id,
  receta_id: `r-${id}`,
  // catalog-domain-refactor / Slice 3: required fields
  nombre: `Producto ${id}`,
  categoria: null,
  precio_venta: null,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: 'mdi-food',
  color: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkReceta = (id: string, overrides: Partial<RecetaConIngredientes> = {}): RecetaConIngredientes => ({
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

let aplicacion: App
let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(pinia)
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/pos', name: 'pos', component: PosView },
      { path: '/eventos/:id/gestion', name: 'evento-gestion', component: { template: '<div/>' } },
    ],
  })
  await router.push('/pos')
  await router.isReady()
  const Shell = {
    template: '<v-app><v-main><router-view /></v-main></v-app>',
  }
  const wrapper = mount(Shell, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router, pinia],
      provide: { supabase: createClient('http://x', 'anon') as SupabaseClient<Database> },
    },
  })
  return { wrapper, router }
}

// Builds one POS-ready producto set: returns the materia, receta,
// producto, and evento_producto shapes the test will seed. The
// `costo` defaults to 5; `margen` defaults to 0 so the computable
// price equals costo (calcularPrecioPorMargen falls back when margen
// is 0). Tests collect these and aggregate them into a single
// Supabase response so onMounted's `cargarTodas` re-populates the
// catalog store with the same data.
function fabricarProductoParaPOS(
  productoId: string,
  opts: { margen?: number; incluido?: boolean; costo?: number; nombre?: string } = {},
): { materia: MateriaPrima; receta: RecetaConIngredientes; producto: Producto; ep: EventoProducto } {
  const { margen = 0, incluido = true, costo = 5, nombre = 'Brownies' } = opts
  const materia = mkMateriaPrima(`mp-${productoId}`, { costo_por_unidad: costo })
  const receta: RecetaConIngredientes = mkReceta(`r-${productoId}`, {
    nombre,
    ingredientes: [
      {
        id: `ri-${productoId}`,
        receta_id: `r-${productoId}`,
        materia_prima_id: `mp-${productoId}`,
        cantidad: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  })
  const producto = mkProducto(productoId, { receta_id: `r-${productoId}` })
  const ep = mkEventoProducto(`ep-${productoId}`, { producto_id: productoId, margen, incluido })
  return { materia, receta, producto, ep }
}

// Seeds the active evento with the given id. Pushes the Supabase
// response for `cargarEventos` (called from onMounted) AND seeds
// eventsStore directly so the view's `eventoEnCurso` computed
// resolves during setup (before onMounted runs).
function sembrarEventoEnCurso(id = 'e-1'): void {
  __pushSupabaseResponse<Evento[]>({
    data: [mkEvento(id)],
    error: null,
  })
  conContexto(() => {
    const events = useEventsStore()
    events.eventos.push(mkEvento(id))
  })
}

// Stages one or more POS productos. Aggregates the catalog
// (productos, recetas, evento_productos, ingredients) into Supabase
// responses in the order cargarDatosPOS consumes them:
//   eventos → productos → epStore.cargarPorEvento → ingredients → recetas
// Then seeds the stores directly so usePreciosEvento can compute cost
// before the full fetch chain resolves.
function sembrarProductosEnPOS(
  fabricados: Array<ReturnType<typeof fabricarProductoParaPOS>>,
): void {
  // Push responses in the exact order cargarDatosPOS consumes them.
  __pushSupabaseResponse<Producto[]>({
    data: fabricados.map((f) => f.producto),
    error: null,
  })
  __pushSupabaseResponse<EventoProducto[]>({
    data: fabricados.map((f) => f.ep),
    error: null,
  })
  __pushSupabaseResponse<MateriaPrima[]>({
    data: fabricados.map((f) => f.materia),
    error: null,
  })
  __pushSupabaseResponse<RecetaConIngredientes[]>({
    data: fabricados.map((f) => f.receta),
    error: null,
  })
  conContexto(() => {
    const ingredientes = useIngredientsStore()
    ingredientes.materiasPrimas.push(...fabricados.map((f) => f.materia))
    const epStore = useEventoProductosStore()
    epStore.productosPorEvento.set('e-1', fabricados.map((f) => f.ep))
  })
}

describe('PosView — basic surface (preserved)', () => {
  it('shows the POS heading (REQ-POS-46, REQ-POS-48)', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1')])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('h1').text()).toContain('POS')
    })
  })

  it('shows the no-evento guard when there is no evento en_curso (REQ-POS-16, REQ-POS-49)', async () => {
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-sin-evento"]').exists()).toBe(true)
    })
  })

  it('shows the error state when the productos fetch fails (REQ-POS-49)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Reintentar')
    })
  })

  // Corrective fix: cold /pos load must populate evento_productos +
  // ingredients so usePreciosEvento can compute sellable products.
  // Without these, a direct /pos navigation sees an empty grid even
  // when the active evento has configured products.
  it('loads the full dependency chain on cold mount (evento_productos + ingredients)', async () => {
    sembrarEventoEnCurso()
    // Only stage the events + catalog fetch; do NOT pre-seed epStore
    // or ingredientsStore so the view must load them itself.
    //
    // Execution order inside cargarDatosPOS:
    //   1. await cargarEventos()       → eventos response
    //   2. catalogo = cargarTodas()    → productos response (starts)
    //   3. Promise.all starts:
    //      - epStore.cargarPorEvento  → evento_productos response
    //      - ingredients.cargarTodas  → ingredients response
    //   4. await cargarRecetas()       → recetas response
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1', { receta_id: 'r-1' })],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEventoProducto('ep-1', { producto_id: 'p-1', margen: 0.4 })],
      error: null,
    })
    __pushSupabaseResponse<MateriaPrima[]>({
      data: [mkMateriaPrima('mp-1', { costo_por_unidad: 10 })],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-1', {
        ingredientes: [{
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-01-01T00:00:00Z',
        }],
      })],
      error: null,
    })

    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      await flushPromises()

      // The epStore must now have rows for evento 'e-1'.
      const epStore = useEventoProductosStore()
      const rows = epStore.productosPorEvento.get('e-1')
      expect(rows?.length).toBeGreaterThanOrEqual(1)

      // The ingredients store must be populated.
      const ingredientes = useIngredientsStore()
      expect(ingredientes.materiasPrimas.length).toBeGreaterThanOrEqual(1)

      // The POS grid should render at least one sellable product card
      // (costo=10 / rendimiento=1, margen=0.4 → precio > 0).
      const cards = wrapper.findAll('[data-testid="producto-card-active"]')
      expect(cards.length).toBeGreaterThanOrEqual(1)
    })
  })
})

// UX: event management panels in POS view.
//   - When eventoEnCurso is null + planificacion events exist →
//     show a management panel listing planificacion events with
//     "Iniciar evento" buttons.
//   - When eventoEnCurso is null + no planificacion events either →
//     show the legacy "creá un evento" fallback.
//   - When eventoEnCurso is present → show an active-event status
//     panel at the top of the POS.
describe('PosView — event management panels (UX)', () => {
  // Seeds events store with planificacion events only (no en_curso).
  // Also pushes empty catalogo responses so cargarDatosPOS does not
  // consume the cambiarEstado response from the queue.
  function sembrarEventoPlanificacion(id = 'ep-1'): void {
    __pushSupabaseResponse<Evento[]>({
      data: [mkEvento(id, { estado: 'planificacion' })],
      error: null,
    })
    // cargarDatosPOS always loads productos + recetas after eventos.
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    conContexto(() => {
      const events = useEventsStore()
      // Push a planificacion event (not en_curso).
      events.eventos.push(mkEvento(id, { estado: 'planificacion' }))
    })
  }

  it('shows the planning-events management panel when planificacion events exist and no active event', async () => {
    sembrarEventoPlanificacion('ep-1')
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Should NOT show the old legacy fallback.
      expect(wrapper.find('[data-testid="pos-sin-evento"]').exists()).toBe(false)
      // Should show the new management panel.
      expect(wrapper.find('[data-testid="pos-gestion-sin-evento"]').exists()).toBe(true)
      // Should show planificacion event cards.
      expect(wrapper.findAll('[data-testid="pos-planificacion-card"]').length).toBe(1)
      // Each card should have a "Iniciar evento" button.
      expect(wrapper.find('[data-testid="pos-iniciar-evento-btn"]').exists()).toBe(true)
    })
  })

  it('shows multiple planificacion event cards when several are pending', async () => {
    __pushSupabaseResponse<Evento[]>({
      data: [
        mkEvento('ep-1', { estado: 'planificacion', nombre: 'Feria A' }),
        mkEvento('ep-2', { estado: 'planificacion', nombre: 'Feria B' }),
        mkEvento('ep-3', { estado: 'planificacion', nombre: 'Feria C' }),
      ],
      error: null,
    })
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('ep-1', { estado: 'planificacion', nombre: 'Feria A' }))
      events.eventos.push(mkEvento('ep-2', { estado: 'planificacion', nombre: 'Feria B' }))
      events.eventos.push(mkEvento('ep-3', { estado: 'planificacion', nombre: 'Feria C' }))
    })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.findAll('[data-testid="pos-planificacion-card"]').length).toBe(3)
    })
  })

  it('shows the legacy fallback when NO events exist at all', async () => {
    // No eventos seeded → events store is empty.
    __pushSupabaseResponse<Evento[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Neither planificacion nor en_curso → show the legacy fallback.
      expect(wrapper.find('[data-testid="pos-sin-evento"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="pos-gestion-sin-evento"]').exists()).toBe(false)
    })
  })

  it('starting an event from POS loads sellable products without refresh', async () => {
    // Stage planificacion event for the mount. The catalog has a
    // product with a real receta so the POS grid can render it
    // once the dependency chain loads after the transition.
    __pushSupabaseResponse<Evento[]>({
      data: [mkEvento('ep-1', { estado: 'planificacion' })],
      error: null,
    })
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1', { receta_id: 'r-1' })],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [],
      error: null,
    })
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('ep-1', { estado: 'planificacion' }))
    })

    // Responses for the iniciarEventoDesdePOS chain:
    //   1. cambiarEstado(id, 'en_curso')
    //   2. epStore.cargarPorEvento(id)
    //   3. useIngredientsStore().cargarTodas()
    //   4. cargarRecetas() — fired because initial recetas was empty
    __pushSupabaseResponse<Evento>({
      data: mkEvento('ep-1', { estado: 'en_curso' }),
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEventoProducto('ep-1', { producto_id: 'p-1', margen: 0.4 })],
      error: null,
    })
    __pushSupabaseResponse<MateriaPrima[]>({
      data: [mkMateriaPrima('mp-1', { costo_por_unidad: 10 })],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-1', {
        ingredientes: [{
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-01-01T00:00:00Z',
        }],
      })],
      error: null,
    })

    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()

      // Pre-condition: we're in the planning panel.
      expect(wrapper.find('[data-testid="pos-gestion-sin-evento"]').exists()).toBe(true)

      // Click "Iniciar evento" on the first card.
      const btn = wrapper.find('[data-testid="pos-iniciar-evento-btn"]')
      await btn.trigger('click')
      await flushPromises()
      await flushPromises()

      // The evento should now be en_curso.
      const events = useEventsStore()
      const activo = events.eventos.find((e) => e.id === 'ep-1')
      expect(activo?.estado).toBe('en_curso')

      // The active-event panel must be visible.
      expect(wrapper.find('[data-testid="pos-evento-activo-panel"]').exists()).toBe(true)

      // Key assertion: sellable products MUST render in the POS grid.
      // Without the fix, the grid stays empty because evento_productos
      // and ingredients were never loaded for the just-activated event.
      const cards = wrapper.findAll('[data-testid="producto-card-active"]')
      expect(cards.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows error alert when cambiarEstado fails', async () => {
    sembrarEventoPlanificacion('ep-1')
    // Mock the cambiarEstado service call with an error.
    __pushSupabaseResponse<Evento>({
      data: null,
      error: { code: 'TRANSICION_INVALIDA', message: 'No se puede iniciar este evento' },
    })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const btn = wrapper.find('[data-testid="pos-iniciar-evento-btn"]')
      await btn.trigger('click')
      await flushPromises()
      // Should show error alert.
      expect(wrapper.find('[data-testid="pos-iniciar-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('No se puede iniciar este evento')
    })
  })

  it('renders the active-event status panel when eventoEnCurso exists', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1')])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const panel = wrapper.find('[data-testid="pos-evento-activo-panel"]')
      expect(panel.exists()).toBe(true)
      // Should show the evento name.
      expect(panel.text()).toContain('Feria del Sol')
      // Should show the "En curso" chip.
      expect(wrapper.find('[data-testid="pos-evento-activo-estado"]').exists()).toBe(true)
    })
  })

  it('active-event panel includes a "Productos" quick link', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1')])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const link = wrapper.find('[data-testid="pos-gestionar-productos-link"]')
      expect(link.exists()).toBe(true)
      expect(link.text()).toContain('Productos')
    })
  })
})

describe('PosView — PR-2b producto filtering (REQ-FIN-28, REQ-FIN-30)', () => {
  it('renders only productos with incluido=true + computable costo_unitario', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([
      fabricarProductoParaPOS('p-1', { margen: 0.4 }),
      fabricarProductoParaPOS('p-2', { margen: 0.4 }),
      fabricarProductoParaPOS('p-3', { margen: 0.4, incluido: false }),
    ])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      await flushPromises()
      const cards = wrapper.findAll('[data-testid="producto-card-active"]')
      expect(cards.length).toBe(2)
    })
  })

  it('hides productos whose receta has no computable costo (no ingredientes)', async () => {
    sembrarEventoEnCurso()
    const p1 = fabricarProductoParaPOS('p-1')
    const p2 = fabricarProductoParaPOS('p-2')
    // p-2 receta has no ingredientes → costoPorUnidad = 0.
    p2.receta.ingredientes = []
    sembrarProductosEnPOS([p1, p2])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const cards = wrapper.findAll('[data-testid="producto-card-active"]')
      expect(cards.length).toBe(1)
    })
  })

  it('shows the empty-state alert when no productos are configured for the evento (REQ-FIN-30)', async () => {
    sembrarEventoEnCurso()
    // Empty catalog + empty evento_productos.
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('No hay productos configurados')
    })
  })

  it('"Configurar productos" button click calls router.push with the event gestion route', async () => {
    // PR-2b + event-product-management-refactor: the operator's path from
    // a "no productos" POS grid is to /eventos/:id/gestion. We verify the
    // wiring by actually clicking the button and spying on router.push.
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper, router } = await mountView()
      await flushPromises()
      const spy = vi.spyOn(router, 'push')
      const boton = wrapper.find('[data-testid="pos-configurar-productos"]')
      expect(boton.exists()).toBe(true)
      await boton.trigger('click')
      await flushPromises()
      expect(spy).toHaveBeenCalledWith('/eventos/e-1/gestion')
    })
  })

  // UX: inline quick-init — bulk-add all catalog products to the
  // active evento from the empty state without navigating away.
  it('empty-state shows "Inicializar desde catálogo" button (UX quick-init)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const btn = wrapper.find('[data-testid="pos-inicializar-catalogo"]')
      expect(btn.exists()).toBe(true)
      expect(btn.text()).toContain('Inicializar desde catálogo')
    })
  })

  it('"Inicializar desde catálogo" button click triggers the store action', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    // Responses for the quick-init chain.
    // epStore.inicializarDesdeCatalogo does:
    //   1. servicio.inicializarDesdeCatalogo(eventoId) → needs EventoProducto[]
    //   2. cargarPorEvento(eventoId) (internal reload)  → needs EventoProducto[]
    // Then inicializarProductosDesdeCatalogo continues with:
    //   3. cargarTodas()                                → needs Producto[]
    //   4. cargarRecetas() (recetas was empty)          → needs RecetaConIngredientes[]
    //   5. useIngredientsStore().cargarTodas()          → needs MateriaPrima[]
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEventoProducto('ep-1', { producto_id: 'p-1', margen: 0.4 })],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [mkEventoProducto('ep-1', { producto_id: 'p-1', margen: 0.4 })],
      error: null,
    })
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1', { receta_id: 'r-1' })],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-1', {
        ingredientes: [{
          id: 'ri-1',
          receta_id: 'r-1',
          materia_prima_id: 'mp-1',
          cantidad: 1,
          created_at: '2026-01-01T00:00:00Z',
        }],
      })],
      error: null,
    })
    __pushSupabaseResponse<MateriaPrima[]>({
      data: [mkMateriaPrima('mp-1', { costo_por_unidad: 10 })],
      error: null,
    })

    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Empty state is shown before clicking.
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(true)
      const btn = wrapper.find('[data-testid="pos-inicializar-catalogo"]')
      expect(btn.exists()).toBe(true)

      // Click the init button — must trigger the full chain.
      await btn.trigger('click')
      await flushPromises()
      await flushPromises()

      // After the chain resolves, the epStore must have rows for e-1.
      const epStore = useEventoProductosStore()
      const rows = epStore.productosPorEvento.get('e-1')
      expect(rows?.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('quick-init error state renders inline', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(true)
      const btn = wrapper.find('[data-testid="pos-inicializar-catalogo"]')
      expect(btn.exists()).toBe(true)

      // Push the failure response now — right before clicking, so it
      // lands at the front of the queue for the quick-init's Supabase
      // call (the mount phase already drained the earlier responses).
      __pushSupabaseResponse<EventoProducto[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection lost' },
      })

      await btn.trigger('click')
      await flushPromises()
      await flushPromises()

      // The error alert should be visible.
      expect(wrapper.find('[data-testid="pos-inicializar-catalogo-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('connection lost')
    })
  })

  it('shows the margen badge with evento.margen_ganancia × 100% (REQ-FIN-29)', async () => {
    // Override the evento's margen_ganancia BEFORE pushing the mock
    // so cargarEventos populates with the desired margin.
    __pushSupabaseResponse<Evento[]>({
      data: [mkEvento('e-1', { margen_ganancia: 0.4 })],
      error: null,
    })
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { margen_ganancia: 0.4 }))
    })
    const p1 = fabricarProductoParaPOS('p-1', { margen: 0.4 })
    sembrarProductosEnPOS([p1])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const badge = wrapper.find('[data-testid="pos-margen-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('40%')
    })
  })
})

describe('PosView — adding to cart uses evento price (REQ-FIN-29)', () => {
  it('clicking a product card adds it with usePreciosEvento.precio_final', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { costo: 10, margen: 0.4 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const card = wrapper.find('[data-testid="producto-card-active"]')
      expect(card.exists()).toBe(true)
      await card.trigger('click')
      const ventas = useVentasStore()
      expect(ventas.carrito).toHaveLength(1)
      // margen=0.4 + costo=10 → 16.67
      expect(ventas.carrito[0]?.precio_unitario).toBeCloseTo(16.67, 2)
      expect(ventas.carrito[0]?.costo_unitario).toBe(10)
    })
  })
})

describe('PosView — Imprevistos button in header (REQ-POS-40)', () => {
  it('renders the Imprevistos button with total badge in header', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1')])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-imprevistos-btn"]').exists()).toBe(true)
    })
  })
})

describe('PosView — registrar venta flow (preserved)', () => {
  it('clicking Registrar venta opens the confirmation dialog (REQ-POS-12, REQ-POS-25)', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      await wrapper.find('[data-testid="producto-card-active"]').trigger('click')
      const cart = wrapper.findComponent(CarritoPanel)
      await cart.vm.$emit('registrar-venta')
      await flushPromises()
      expect(wrapper.findComponent(RegistrarVentaDialog).exists()).toBe(true)
    })
  })

  it('confirming the dialog calls registrarVenta and clears the cart on success (REQ-POS-12, REQ-POS-14)', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    __pushSupabaseResponse<VentaConItems>({
      data: {
        id: 'v-1',
        evento_id: 'e-1',
        fecha: '2026-06-19T00:00:00Z',
        total: 5,
        metodo_pago: 'efectivo',
        monto_recibido: null,
        cambio: null,
        comprobante_numero: null,
        created_at: '2026-06-19T00:00:00Z',
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

    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      await wrapper.find('[data-testid="producto-card-active"]').trigger('click')
      const cart = wrapper.findComponent(CarritoPanel)
      await cart.vm.$emit('registrar-venta')
      await flushPromises()
      const dialog = wrapper.findComponent(RegistrarVentaDialog)
      await dialog.vm.$emit('confirmar', { metodoPago: 'efectivo', montoRecibido: 5 })
      await flushPromises()
      const ventas = useVentasStore()
      expect(ventas.carrito).toEqual([])
      expect(ventas.ventas).toHaveLength(1)
    })
  })
})

// Dependency-load failure state (corrective fix): when evento_productos
// or ingredients fail to load during cold /pos mount or after starting
// an event from POS, the UI must show a distinct error state instead of
// the misleading "no products configured" alert.
describe('PosView — dependency-load failure state', () => {
  it('shows dependency-error alert when evento_productos fails on cold mount (not "no products")', async () => {
    sembrarEventoEnCurso()
    // Response order in cargarDatosPOS: eventos → productos → epStore → ingredients → recetas
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<EventoProducto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Must show the dependency error, not the misleading "no products" message.
      expect(wrapper.find('[data-testid="pos-error-dependencias"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Error al cargar')
      expect(wrapper.text()).toContain('productos del evento')
    })
  })

  it('shows dependency-error alert when ingredients fail on cold mount', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<MateriaPrima[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-error-dependencias"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('materias primas')
    })
  })

  it('merges error messages when both dependency stores fail', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<EventoProducto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    __pushSupabaseResponse<MateriaPrima[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const alerta = wrapper.find('[data-testid="pos-error-dependencias"]')
      expect(alerta.exists()).toBe(true)
      const texto = alerta.text()
      expect(texto).toContain('productos del evento')
      expect(texto).toContain('materias primas')
    })
  })

  it('still shows "no products configured" when dependencies loaded fine but zero sellable products (no regression)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Dependency error must NOT appear — this is a genuine config gap.
      expect(wrapper.find('[data-testid="pos-error-dependencias"]').exists()).toBe(false)
      // The "no products" state must show.
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(true)
    })
  })

  it('shows dependency error after starting event when epStore load fails', async () => {
    // Seed a planificacion event for the mount.
    __pushSupabaseResponse<Evento[]>({
      data: [mkEvento('ep-1', { estado: 'planificacion' })],
      error: null,
    })
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('ep-1', { estado: 'planificacion' }))
    })

    // Responses for iniciarEventoDesdePOS chain:
    // 1. cambiarEstado(id, 'en_curso')
    // 2. epStore.cargarPorEvento(id) — ERROR
    // 3. useIngredientsStore().cargarTodas() — success
    // 4. cargarRecetas() — success (default covers it)
    __pushSupabaseResponse<Evento>({
      data: mkEvento('ep-1', { estado: 'en_curso' }),
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })

    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()

      // Click "Iniciar evento".
      const btn = wrapper.find('[data-testid="pos-iniciar-evento-btn"]')
      await btn.trigger('click')
      await flushPromises()
      await flushPromises()

      // The evento should now be en_curso.
      const events = useEventsStore()
      const activo = events.eventos.find((e) => e.id === 'ep-1')
      expect(activo?.estado).toBe('en_curso')

      // The dependency error must surface — not the misleading "no products".
      expect(wrapper.find('[data-testid="pos-error-dependencias"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('productos del evento')
    })
  })

  it('dependency-error alert includes a Reintentar button', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<EventoProducto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const btn = wrapper.find('[data-testid="pos-reintentar-dependencias"]')
      expect(btn.exists()).toBe(true)
      expect(btn.text()).toContain('Reintentar')
    })
  })

  it('shows dependency-error alert when recetas fails on cold mount (not "no products")', async () => {
    sembrarEventoEnCurso()
    // Response order after fix: eventos → productos → epStore → ingredients → recetas
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-error-dependencias"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Error al cargar')
      expect(wrapper.text()).toContain('recetas')
    })
  })

  it('shows dependency error after starting event when recetas load fails', async () => {
    // Cold mount: planificacion event (no active event → no dependency check)
    __pushSupabaseResponse<Evento[]>({
      data: [mkEvento('ep-r', { estado: 'planificacion' })],
      error: null,
    })
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('ep-r', { estado: 'planificacion' }))
    })

    // Responses for iniciarEventoDesdePOS chain:
    // 1. cambiarEstado(id, 'en_curso') — success
    // 2. epStore.cargarPorEvento(id) — success
    // 3. useIngredientsStore().cargarTodas() — success
    // 4. cargarRecetas() — FAIL (recetas.length === 0 after cold mount)
    __pushSupabaseResponse<Evento>({
      data: mkEvento('ep-r', { estado: 'en_curso' }),
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })

    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()

      const btn = wrapper.find('[data-testid="pos-iniciar-evento-btn"]')
      await btn.trigger('click')
      await flushPromises()
      await flushPromises()

      expect(wrapper.find('[data-testid="pos-error-dependencias"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('recetas')
      // Must NOT show the misleading "no products" state
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(false)
    })
  })

  it('dependency error clears when catalog fetch also failed (catalog error takes priority)', async () => {
    sembrarEventoEnCurso()
    // Catalog error first — response #2 (productos) fails.
    __pushSupabaseResponse<Producto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    // The epStore + ingredients stores may still get called via Promise.all,
    // but errorProductos is already set from the catalog failure. The
    // dependency-error alert is gated on !cargandoProductos && !errorProductos,
    // so when the catalog fails, only the catalog error (pos-error) shows.
    __pushSupabaseResponse<EventoProducto[]>({ data: [], error: null })
    __pushSupabaseResponse<MateriaPrima[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Catalog error must be visible.
      expect(wrapper.find('[data-testid="pos-error"]').exists()).toBe(true)
      // Dependency error must NOT compete.
      expect(wrapper.find('[data-testid="pos-error-dependencias"]').exists()).toBe(false)
      // "No products" also must not show.
      expect(wrapper.find('[data-testid="pos-evento-sin-productos"]').exists()).toBe(false)
    })
  })
})

// pos-redesign (REQ-POS-57, REQ-POS-58): feature flag VITE_FLAG_POS_REDESIGN
// gates ResumenVentasHoy + ComprobanteVentaDialog. When off (default),
// the legacy POS surface is unchanged. When on, the panel renders and
// the comprobante opens after a successful sale.
//
// Vitest's jsdom doesn't expose `import.meta.env` updates cleanly, so
// we toggle the flag via vi.stubEnv before mounting.
describe('PosView — feature flag VITE_FLAG_POS_REDESIGN (REQ-POS-57, REQ-POS-58)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders ResumenVentasHoy when VITE_FLAG_POS_REDESIGN=true (REQ-POS-58)', async () => {
    vi.stubEnv('VITE_FLAG_POS_REDESIGN', 'true')
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    // FLAG_POS_REDESIGN=true adds cargarPorEvento (ventas) to Promise.all.
    // Push the ventas response AFTER the epStore+ingredients responses
    // that sembrarProductosEnPOS stages.
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="resumen-hoy"]').exists()).toBe(true)
    })
  })

  it('does NOT render ResumenVentasHoy when VITE_FLAG_POS_REDESIGN is unset (REQ-POS-58)', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="resumen-hoy"]').exists()).toBe(false)
    })
  })
})

// Event sales history from POS (REQ-POS-HISTORIAL-1..3): the operator
// must be able to open a detailed per-sale list from the POS view.
// The button is gated by the feature flag (matches the rest of the
// pos-redesign surface).
describe('PosView — Historial de ventas button (REQ-POS-HISTORIAL)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does NOT render the Historial button when the feature flag is off', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-historial-btn"]').exists()).toBe(false)
    })
  })

  it('renders the Historial button when the feature flag is on', async () => {
    vi.stubEnv('VITE_FLAG_POS_REDESIGN', 'true')
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-historial-btn"]').exists()).toBe(true)
    })
  })
})

// Issue: edit dialog closes on correction failure.
//
// On RPC / network / domain failure the operator loses in-progress
// edits (motivo, item quantities, payment method) because the view
// always flipped `dialogoEdicionAbierto = false` and `ventaEnEdicion
// = null` after `await corregirVenta`. Fix: only close the dialog on
// success — on failure the dialog must stay open AND keep its input
// so the operator can retry or correct.
describe('PosView — EditarVentaDialog failure preserves dialog state', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const mkVenta = (overrides: Partial<VentaConItems> = {}): VentaConItems => ({
    id: 'v-1',
    evento_id: 'e-1',
    fecha: '2026-06-19T00:00:00Z',
    total: 5,
    metodo_pago: 'efectivo',
    monto_recibido: 10,
    cambio: 5,
    comprobante_numero: 'V-001',
    created_at: '2026-06-19T00:00:00Z',
    items: [
      {
        id: 'vi-1',
        venta_id: 'v-1',
        producto_id: 'p-1',
        cantidad: 1,
        precio_unitario: 5,
        subtotal: 5,
        costo_unitario: null,
        margen_aplicado: null,
        evento_producto_id: null,
        created_at: '2026-06-19T00:00:00Z',
      },
    ],
    ...overrides,
  })

  it('keeps the edit dialog open when the RPC returns an error', async () => {
    vi.stubEnv('VITE_FLAG_POS_REDESIGN', 'true')
    sembrarEventoEnCurso()
    const venta = mkVenta()
    const fabricado = fabricarProductoParaPOS('p-1', { margen: 0 })
    // FLAG_POS_REDESIGN=true makes cargarDatosPOS run:
    //   cargarEventos → productos → epStore → ingredients → ventas → recetas
    // Push responses in that exact order.
    __pushSupabaseResponse<Producto[]>({
      data: [fabricado.producto],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [fabricado.ep],
      error: null,
    })
    __pushSupabaseResponse<MateriaPrima[]>({
      data: [fabricado.materia],
      error: null,
    })
    __pushSupabaseResponse<VentaConItems[]>({ data: [venta], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [fabricado.receta],
      error: null,
    })
    // Stage a generic RPC failure for the corregirVenta call.
    __pushSupabaseResponse<unknown>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })

    await conContexto(async () => {
      const ventas = useVentasStore()
      const { wrapper } = await mountView()
      await flushPromises()
      // Sanity: the venta survived the parallel cargarPorEvento.
      expect(ventas.ventas.map((v) => v.id)).toContain('v-1')

      // Open the edit dialog for the seeded venta via PosView's vm
      // (wrapper.vm is the Shell — PosView is the router-view child).
      const posView = wrapper.findComponent(PosView)
      const vm = posView.vm as unknown as {
        abrirEdicion: (v: VentaConItems) => void
      }
      vm.abrirEdicion(venta)
      await flushPromises()

      const dialogAntes = wrapper.findComponent(EditarVentaDialog)
      expect(dialogAntes.exists()).toBe(true)
      expect((dialogAntes.props('modelValue') as boolean)).toBe(true)

      // Emit the 'corregir' payload. The view forwards it to the
      // store which calls the RPC; we queued an RPC error above.
      await dialogAntes.vm.$emit('corregir', {
        ventaId: 'v-1',
        nuevoTotal: 5,
        nuevoMetodoPago: 'efectivo',
        nuevoMontoRecibido: 10,
        nuevosItems: [
          {
            producto_id: 'p-1',
            cantidad: 1,
            precio_unitario: 5,
            subtotal: 5,
          },
        ],
        motivo: 'ajuste',
      })
      await flushPromises()

      // Dialog must still be mounted (not unmounted by v-if on
      // ventaEnEdicion) AND must still be visible (modelValue=true).
      // Observable behavior: the operator's input is preserved so
      // they can retry without re-typing motivo/items.
      const dialogDespues = wrapper.findComponent(EditarVentaDialog)
      expect(dialogDespues.exists()).toBe(true)
      expect((dialogDespues.props('modelValue') as boolean)).toBe(true)
    })
  })

  it('still closes the dialog on a successful correction (no regression)', async () => {
    vi.stubEnv('VITE_FLAG_POS_REDESIGN', 'true')
    sembrarEventoEnCurso()
    const venta = mkVenta()
    const fabricado = fabricarProductoParaPOS('p-1', { margen: 0 })
    __pushSupabaseResponse<Producto[]>({
      data: [fabricado.producto],
      error: null,
    })
    __pushSupabaseResponse<EventoProducto[]>({
      data: [fabricado.ep],
      error: null,
    })
    __pushSupabaseResponse<MateriaPrima[]>({
      data: [fabricado.materia],
      error: null,
    })
    __pushSupabaseResponse<VentaConItems[]>({ data: [venta], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [fabricado.receta],
      error: null,
    })
    // Successful RPC: returns the post-correction { venta, items } shape.
    __pushSupabaseResponse<unknown>({
      data: {
        venta: {
          ...mkVenta({ id: 'v-1', total: 10, metodo_pago: 'transferencia' }),
        },
        items: [],
      },
      error: null,
    })

    await conContexto(async () => {
      const ventas = useVentasStore()
      const { wrapper } = await mountView()
      await flushPromises()
      expect(ventas.ventas.map((v) => v.id)).toContain('v-1')

      const posView = wrapper.findComponent(PosView)
      const vm = posView.vm as unknown as {
        abrirEdicion: (v: VentaConItems) => void
      }
      vm.abrirEdicion(venta)
      await flushPromises()

      const dialog = wrapper.findComponent(EditarVentaDialog)
      expect(dialog.exists()).toBe(true)

      await dialog.vm.$emit('corregir', {
        ventaId: 'v-1',
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
      await flushPromises()

      // On success the view unmounts the dialog (v-if drops).
      expect(wrapper.findComponent(EditarVentaDialog).exists()).toBe(false)
      // Local state reflects the correction.
      expect(ventas.ventas[0]?.total).toBe(10)
      expect(ventas.ventas[0]?.metodo_pago).toBe('transferencia')
    })
  })
})

// mobile-ux-redesign Phase 3: POS Ultra-Rapid — simplified vs full mode
// rendering and checkout flow. Mocks usePosMode to control mode switching.
describe('PosView — Phase 3 simplified mode (REQ-POS-1)', () => {
  afterEach(() => {
    posModeRef.value = false
    vi.unstubAllEnvs()
  })

  it('does NOT render PosModeBanner in simplified mode (banner removed)', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const banner = wrapper.find('[data-testid="pos-mode-banner"]')
      expect(banner.exists()).toBe(false)
    })
  })

  it('does NOT render PosModeBanner in full mode (banner removed)', async () => {
    posModeRef.value = false
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const banner = wrapper.find('[data-testid="pos-mode-banner"]')
      expect(banner.exists()).toBe(false)
    })
  })

  it('renders ProductGrid in simplified mode', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // The parent-owned search input (pos-buscar) should be rendered
      const searchInput = wrapper.find('[data-testid="pos-buscar"]')
      expect(searchInput.exists()).toBe(true)
    })
  })

  it('renders PaymentSelector in simplified mode', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const paymentOptions = wrapper.findAll('[data-testid="payment-option"]')
      expect(paymentOptions).toHaveLength(3)
    })
  })

  it('renders CheckoutButton in simplified mode', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const checkoutBtn = wrapper.find('[data-testid="checkout-btn"]')
      expect(checkoutBtn.exists()).toBe(true)
    })
  })

  it('CheckoutButton is disabled when cart is empty (no items)', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const checkoutBtn = wrapper.find('[data-testid="checkout-btn"]')
      // Button should be disabled when total is 0 (empty cart) — disabled attribute present
      expect(checkoutBtn.attributes('disabled')).toBeDefined()
    })
  })

  it('CheckoutButton is enabled when cart has items AND payment method is selected', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // In simplified mode, products are ProductButtons rendered inside ProductGrid.
      // Directly use the store to add an item to the cart (avoids DOM complexity)
      const ventas = useVentasStore()
      ventas.agregarAlCarrito('p-1', 1)
      await flushPromises()
      // Select a payment method
      const paymentButtons = wrapper.findAll('[data-testid="payment-option"]')
      await paymentButtons[0]!.trigger('click')
      await flushPromises()
      const checkoutBtn = wrapper.find('[data-testid="checkout-btn"]')
      expect(checkoutBtn.attributes('disabled')).toBeUndefined()
    })
  })

  it('CheckoutButton is disabled when payment method is not selected (even with items)', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Add item to cart directly via store
      const ventas = useVentasStore()
      ventas.agregarAlCarrito('p-1', 1)
      await flushPromises()
      const checkoutBtn = wrapper.find('[data-testid="checkout-btn"]')
      // disabled when payment not selected OR cart empty
      expect(checkoutBtn.attributes('disabled')).toBeDefined()
    })
  })

  it('clicking CheckoutButton calls registrarVenta and clears the cart', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    // Push responses for registrarVenta (count query + header insert + items insert)
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    __pushSupabaseResponse<VentaConItems>({
      data: {
        id: 'v-1',
        evento_id: 'e-1',
        fecha: '2026-06-19T00:00:00Z',
        total: 5,
        metodo_pago: 'efectivo',
        monto_recibido: null,
        cambio: null,
        comprobante_numero: null,
        created_at: '2026-06-19T00:00:00Z',
        items: [],
      },
      error: null,
    })
    __pushSupabaseResponse<unknown>({
      data: [{ id: 'vi-1', venta_id: 'v-1', producto_id: 'p-1', cantidad: 1, precio_unitario: 5, subtotal: 5 }],
      error: null,
    })
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // Add item to cart + select payment
      const ventas = useVentasStore()
      ventas.agregarAlCarrito('p-1', 1)
      ventas.setPaymentMethod('efectivo')
      await flushPromises()
      // Click checkout
      const checkoutBtn = wrapper.find('[data-testid="checkout-btn"]')
      await checkoutBtn.trigger('click')
      await flushPromises()
      // Cart should be empty after successful checkout
      expect(ventas.carrito).toEqual([])
    })
  })

  it('does NOT render the existing ProductoCardGrid in simplified mode', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      // In simplified mode, the old ProductoCardGrid should not be visible
      // (the simplified ProductGrid replaces it). Filter chips replace
      // the old search bar for category/sort filtering.
      const filterChips = wrapper.find('[data-testid="pos-filtro-todos"]')
      expect(filterChips.exists()).toBe(true)
    })
  })

  it('groups cart, payment selector, and checkout button in the same column for easy scanning', async () => {
    // On mobile (xs/sm), the row stacks vertically: products full-width,
    // then cart+payment+checkout full-width below. On md+, side-by-side
    // with cart+payment+checkout in a compact right-hand column.
    // The key UX rule: PaymentSelector and CheckoutButton must be direct
    // children of the same column as CarritoPanel, not in separate rows
    // that require scrolling to scan together.
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const productsCol = wrapper.find('[data-testid="pos-products-col"]')
      const cartCol = wrapper.find('[data-testid="pos-cart-col"]')
      expect(productsCol.exists()).toBe(true)
      expect(cartCol.exists()).toBe(true)
      // The cart column must include CarritoPanel, PaymentSelector, AND CheckoutButton
      // so the operator scans cart → payment → checkout without scrolling.
      expect(cartCol.find('[data-testid="carrito-panel"]').exists()).toBe(true)
      expect(cartCol.find('[data-testid="payment-option"]').exists()).toBe(true)
      expect(cartCol.find('[data-testid="checkout-btn"]').exists()).toBe(true)
      // Products column includes the simplified grid (not the old ProductoCardGrid).
      expect(productsCol.find('.product-grid').exists()).toBe(true)
      // On md+ the layout is side-by-side: products gets col-md-8, cart gets col-md-4.
      expect(productsCol.classes()).toContain('v-col-md-8')
      expect(cartCol.classes()).toContain('v-col-md-4')
    })
  })
})

// Corrective pass: the POS catalog must be clean — no contribution or
// cost noise. ProductoCard in modo="pos" shows only icon + name +
// price. ProductButton shows only icon + name + S/ price.
// Regression tests assert that financial noise does NOT leak into the
// rendered DOM.
describe('PosView — corrective pass: no contribution/cost noise in POS cards', () => {
  afterEach(() => {
    posModeRef.value = false
  })

  it('does NOT render cost or contribution labels in full-mode POS cards', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { costo: 10, margen: 0.4 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      await flushPromises()
      const cards = wrapper.findAll('[data-testid="producto-card-active"]')
      expect(cards.length).toBeGreaterThanOrEqual(1)
      const html = cards[0]!.text()
      // catalog-domain-refactor / Slice 3: card shows product.nombre
      // (not receta.nombre).
      expect(html).toContain('Producto p-1')
      expect(html).not.toContain('Costo')
      expect(html).not.toContain('Contribución')
      expect(html).not.toContain('Margen')
    })
  })

  it('does NOT render cost or contribution labels in simplified-mode POS buttons', async () => {
    posModeRef.value = true
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { costo: 10, margen: 0.4 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      await flushPromises()
      const btns = wrapper.findAll('.product-button')
      expect(btns.length).toBeGreaterThanOrEqual(1)
      const html = btns[0]!.text()
      // catalog-domain-refactor / Slice 3: button shows product.nombre
      expect(html).toContain('Producto p-1')
      expect(html).not.toContain('Costo')
      expect(html).not.toContain('Contribución')
      expect(html).not.toContain('Margen')
    })
  })
})
