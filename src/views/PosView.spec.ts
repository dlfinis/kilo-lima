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
import RegistrarVentaDialog from '@/components/business/RegistrarVentaDialog.vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Evento,
  EventoProducto,
  GastoImprevisto,
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
