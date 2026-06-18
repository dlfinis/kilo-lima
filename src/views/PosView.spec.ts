// REQ-POS-7, REQ-POS-14, REQ-POS-15, REQ-POS-16, REQ-POS-20,
// REQ-POS-24, REQ-POS-25, REQ-POS-28, REQ-POS-39, REQ-POS-40,
// REQ-POS-46, REQ-POS-49, REQ-POS-54, REQ-POS-55: the POS main view
// — wires useProductos + useVentas + useEvents + useOnlineStatus +
// useGastosImprevistos. 4-state handling (loading/error/empty/data
// per REQ-POS-49). Requires evento en_curso selected; without it,
// surfaces the no-evento guard. Carrito panel + product grid +
// collapsible Imprevistos section (REQ-POS-40 — deferred from PR3)
// + registrar venta flow.
import { beforeEach, describe, expect, it } from 'vitest'
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
import CarritoPanel from '@/components/business/CarritoPanel.vue'
import RegistrarVentaDialog from '@/components/business/RegistrarVentaDialog.vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Evento,
  GastoImprevisto,
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
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkReceta = (id: string, nombre: string): RecetaConIngredientes => ({
  id,
  nombre,
  descripcion: null,
  rendimiento_unidades: 1,
  notas: null,
  ingredientes: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  ubicacion: 'Plaza',
  estado: 'en_curso',
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

let aplicacion: App

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

async function mountView() {
  // v-chip + v-alert require the v-app shell so Vuetify's defaults
  // context is set — mirror App.vue's structure.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/pos', name: 'pos', component: PosView }],
  })
  await router.push('/pos')
  await router.isReady()
  const Shell = {
    template: '<v-app><v-main><router-view /></v-main></v-app>',
  }
  return mount(Shell, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') as SupabaseClient<Database> },
    },
  })
}

function sembrarEventoEnCurso(id = 'e-1'): void {
  conContexto(() => {
    const events = useEventsStore()
    events.eventos.push(mkEvento(id))
  })
  // Push the matching response so onMounted's cargarEventos returns
  // the seeded evento. The order in __mockCola matters: events load
  // first, then productos, then recetas.
  __pushSupabaseResponse<Evento[]>({
    data: [mkEvento(id)],
    error: null,
  })
}

describe('PosView', () => {
  it('shows the POS heading (REQ-POS-46, REQ-POS-48)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('h1').text()).toContain('POS')
    })
  })

  it('shows the no-evento guard when there is no evento en_curso (REQ-POS-16, REQ-POS-49)', async () => {
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-sin-evento"]').exists()).toBe(true)
    })
  })

  it('renders the empty grid state when no productos exist (REQ-POS-24)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="producto-grid-empty"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('No hay productos disponibles')
    })
  })

  it('renders one card per producto when data loads (REQ-POS-20, REQ-POS-49)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1'), mkProducto('p-2', { precio_venta: 7.5 })],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-p-1', 'Pan básico'), mkReceta('r-p-2', 'Galleta')],
      error: null,
    })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.findAll('[data-testid="producto-card"]').length).toBe(2)
      expect(wrapper.findComponent(CarritoPanel).exists()).toBe(true)
    })
  })

  it('shows the error state when the productos fetch fails (REQ-POS-49)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Reintentar')
    })
  })

  it('clicking a product Agregar adds it to the cart (REQ-POS-7, REQ-POS-20)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1')],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-p-1', 'Brownies')],
      error: null,
    })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      const agregar = wrapper.find('[data-testid="producto-card-agregar"]')
      expect(agregar.exists()).toBe(true)
      await agregar.trigger('click')
      const ventas = useVentasStore()
      expect(ventas.carrito).toHaveLength(1)
      expect(ventas.carrito[0]?.nombre).toBe('Brownies')
      expect(ventas.carrito[0]?.precio_unitario).toBe(5)
    })
  })

  it('clicking Registrar venta opens the confirmation dialog (REQ-POS-12, REQ-POS-25)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1')],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-p-1', 'Brownies')],
      error: null,
    })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      await wrapper.find('[data-testid="producto-card-agregar"]').trigger('click')
      const cart = wrapper.findComponent(CarritoPanel)
      await cart.vm.$emit('registrar-venta')
      await flushPromises()
      expect(wrapper.findComponent(RegistrarVentaDialog).exists()).toBe(true)
    })
  })

  it('confirming the dialog calls registrarVenta and clears the cart on success (REQ-POS-12, REQ-POS-14)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({
      data: [mkProducto('p-1')],
      error: null,
    })
    __pushSupabaseResponse<RecetaConIngredientes[]>({
      data: [mkReceta('r-p-1', 'Brownies')],
      error: null,
    })
    __pushSupabaseResponse<VentaConItems>({
      data: {
        id: 'v-1',
        evento_id: 'e-1',
        fecha: '2026-06-19T00:00:00Z',
        total: 5,
        metodo_pago: 'efectivo',
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
      const wrapper = await mountView()
      await flushPromises()
      await wrapper.find('[data-testid="producto-card-agregar"]').trigger('click')
      const cart = wrapper.findComponent(CarritoPanel)
      await cart.vm.$emit('registrar-venta')
      await flushPromises()
      const dialog = wrapper.findComponent(RegistrarVentaDialog)
      await dialog.vm.$emit('confirmar', 'efectivo')
      await flushPromises()
      const ventas = useVentasStore()
      expect(ventas.carrito).toEqual([])
      expect(ventas.ventas).toHaveLength(1)
    })
  })

  it('renders the Imprevistos collapsible section with the total chip (REQ-POS-40)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-imprevistos"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="pos-imprevistos-total"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Gastos imprevistos de esta feria')
      // v-show hides the body when collapsed but keeps the DOM node.
      const emptyNode = wrapper.find('[data-testid="pos-imprevistos-empty"]')
      expect(emptyNode.exists()).toBe(true)
      expect(emptyNode.isVisible()).toBe(false)
    })
  })

  it('expands the Imprevistos section and loads the list (REQ-POS-40)', async () => {
    sembrarEventoEnCurso()
    __pushSupabaseResponse<Producto[]>({ data: [], error: null })
    __pushSupabaseResponse<RecetaConIngredientes[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({
      data: [
        {
          id: 'gi-1',
          evento_id: 'e-1',
          monto: 50,
          motivo: 'Más vasos',
          categoria: 'insumos_extra',
          created_at: '2026-06-19T11:00:00Z',
        },
      ],
      error: null,
    })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      await wrapper.find('[data-testid="pos-imprevistos-titulo"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="pos-imprevistos-lista"]').exists()).toBe(true)
    })
  })
})