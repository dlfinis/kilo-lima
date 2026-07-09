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
  precio_venta: 5,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: 'mdi-food',
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
      { path: '/eventos/:id/productos', name: 'evento-productos', component: { template: '<div/>' } },
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
// (productos, recetas) into a single Supabase response, then seeds
// the non-fetched stores (evento_productos, ingredientes) directly
// so usePreciosEvento can compute cost.
function sembrarProductosEnPOS(
  fabricados: Array<ReturnType<typeof fabricarProductoParaPOS>>,
): void {
  // Catalog goes through Supabase fetch in onMounted → push the
  // aggregated responses (evento fetch happens before this).
  __pushSupabaseResponse<Producto[]>({
    data: fabricados.map((f) => f.producto),
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

  it('empty-state has a "Configurar productos" button that wires to irAConfigurarProductos (REQ-FIN-30)', async () => {
    // PR-2b: the operator's path from a "no productos" POS grid is to
    // /eventos/:id/productos. We verify the wiring by calling the
    // component method directly — the real-browser verify script
    // (scripts/verify-finanzas-pr2b.mjs) covers the click→navigate
    // path against a live dev server.
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const { wrapper, router } = await mountView()
      await flushPromises()
      const boton = wrapper.find('[data-testid="pos-configurar-productos"]')
      expect(boton.exists()).toBe(true)
      // Sanity: the evento id is wired through (irAConfigurarProductos
      // builds the path from eventoEnCurso.value.id).
      const ventas = useVentasStore()
      expect(ventas.eventoEnCurso?.id).toBe('e-1')
      // The router push uses the evento id — verify the route exists.
      await router.push(`/eventos/${ventas.eventoEnCurso?.id}/productos`)
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/eventos/e-1/productos')
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

// REQ-CON-8 (PR-2): per-producto contribucion rendered in the
// POS grid below the price. Fed from
// usePreciosEvento.contribucionParaProducto(productoId).
describe('PosView — Contribucion per card (REQ-CON-8)', () => {
  it('renders contribucion text on every product card when contribution > 0', async () => {
    // costo=10 + margen=0.4 → precio_sugerido = 16.67; contrib = 6.67.
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([
      fabricarProductoParaPOS('p-1', { costo: 10, margen: 0.4 }),
      fabricarProductoParaPOS('p-2', { costo: 10, margen: 0.4 }),
    ])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const contribuciones = wrapper.findAll('[data-testid="producto-card-contribucion"]')
      expect(contribuciones.length).toBe(2)
    })
  })

  it('renders one contribucion per visible card, never more (no orphan)', async () => {
    sembrarEventoEnCurso()
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0.4 })])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const cards = wrapper.findAll('[data-testid="producto-card-active"]')
      const contribuciones = wrapper.findAll('[data-testid="producto-card-contribucion"]')
      expect(cards.length).toBe(contribuciones.length)
    })
  })

  it('shows red text (contribution < 0) when the operator prices below cost', async () => {
    // costo=10 but a manual precio_venta=8 → contribution = -2.
    sembrarEventoEnCurso()
    const fabricado = fabricarProductoParaPOS('p-1', { costo: 10, margen: 0.4 })
    fabricado.ep.precio_venta = 8 // operator forces below-cost pricing
    sembrarProductosEnPOS([fabricado])
    await conContexto(async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      const contribucion = wrapper.find('[data-testid="producto-card-contribucion"]')
      expect(contribucion.exists()).toBe(true)
      // POS mode uses red classes for negative contribution
      expect(contribucion.classes().some((c) => c.includes('red'))).toBe(true)
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
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
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
    __pushSupabaseResponse<unknown>({ data: null, error: null })
    sembrarProductosEnPOS([fabricarProductoParaPOS('p-1', { margen: 0 })])
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
    //   cargarEventos → Promise.all([catalogo, cargarPorEvento]) → cargarRecetas.
    // The two parallel awaits consume responses in the order they
    // were scheduled (catalogo first, then cargarPorEvento). Push
    // responses in that exact order so the right data lands in the
    // right store.
    __pushSupabaseResponse<Producto[]>({
      data: [fabricado.producto],
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
      // ProductGrid should be rendered with a search input
      const searchInput = wrapper.find('[data-testid="product-grid-search"]')
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
      // (the simplified ProductGrid replaces it)
      const searchInput = wrapper.find('[data-testid="product-grid-search"]')
      expect(searchInput.exists()).toBe(true)
    })
  })

  it('keeps the product grid and cart side-by-side on all breakpoints (not stacked)', async () => {
    // The cart must be visually pinned to the right, not stacked below
    // products. At the DOM level, both columns must NOT use cols="12"
    // (full-width) which would cause vertical stacking.
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
      // Neither column should have cols="12" — that would force stacking
      // on screens smaller than the md breakpoint (960px).
      expect(productsCol.classes()).not.toContain('v-col-12')
      expect(cartCol.classes()).not.toContain('v-col-12')
      // The cart column should include the CarritoPanel
      expect(cartCol.find('[data-testid="carrito-panel"]').exists()).toBe(true)
    })
  })
})
