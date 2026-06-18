// REQ-POS-30, REQ-POS-31, REQ-POS-33, REQ-POS-34, REQ-POS-35,
// REQ-POS-36, REQ-POS-37, REQ-POS-40, REQ-POS-44, REQ-POS-46,
// REQ-POS-49, REQ-POS-54, REQ-POS-55: CierresCajaView — close review
// screen with CierreResumenCard + breakdown + imprevistos list +
// ventas count + "Registrar cierre" button gated on estadoEsEditable.
// 4 states: loading / error / empty-no-evento / data.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory } from 'vue-router'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import CierresCajaView from './CierresCajaView.vue'
import { useEventsStore } from '@/stores/events.store'
import { useCierresCajaStore } from '@/stores/cierresCaja.store'
import type {
  CierreCaja,
  Database,
  Evento,
  GastoFijo,
  GastoImprevisto,
  VentaConItems,
} from '@/types'

const vuetify = createVuetify({ components, directives })

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

const mkVenta = (id: string, eventoId: string, total: number): VentaConItems => ({
  id,
  evento_id: eventoId,
  fecha: '2026-06-19T10:00:00Z',
  total,
  metodo_pago: 'efectivo',
  created_at: '2026-06-19T10:00:00Z',
  items: [],
})

const mkGastoFijo = (id: string, eventoId: string, monto: number): GastoFijo => ({
  id,
  evento_id: eventoId,
  categoria: 'renta',
  monto,
  descripcion: null,
  created_at: '2026-06-19T09:00:00Z',
})

const mkImprevisto = (id: string, eventoId: string, monto: number): GastoImprevisto => ({
  id,
  evento_id: eventoId,
  monto,
  motivo: 'Más vasos',
  categoria: 'insumos_extra',
  created_at: '2026-06-19T11:00:00Z',
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
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/pos/cierre', name: 'pos-cierre', component: CierresCajaView },
      { path: '/eventos/:id', name: 'evento-detalle', component: { template: '<div/>' } },
    ],
  })
  await router.push('/pos/cierre')
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

describe('CierresCajaView', () => {
  it('shows the Cierre heading (REQ-POS-46, REQ-POS-48)', async () => {
    __pushSupabaseResponse<Evento[]>({ data: [], error: null })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('h1').text()).toContain('Cierre de caja')
    })
  })

  it('shows the no-evento guard when there are no eventos (REQ-POS-49)', async () => {
    __pushSupabaseResponse<Evento[]>({ data: [], error: null })
    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="cierre-sin-evento"]').exists()).toBe(true)
    })
  })

  it('renders the data state when an evento en_curso exists (REQ-POS-30, REQ-POS-49)', async () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1'))
    })
    __pushSupabaseResponse<Evento[]>({ data: [mkEvento('e-1')], error: null })
    __pushSupabaseResponse<VentaConItems[]>({ data: [mkVenta('v-1', 'e-1', 50)], error: null })
    __pushSupabaseResponse<GastoFijo[]>({ data: [mkGastoFijo('g-1', 'e-1', 10)], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({ data: [mkImprevisto('gi-1', 'e-1', 5)], error: null })
    __pushSupabaseResponse<CierreCaja>({ data: null, error: null })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="cierre-evento-info"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="cierre-resumen"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="cierre-boton-registrar"]').exists()).toBe(true)
    })
  })

  it('hides the "Registrar cierre" button when a cierre already exists (REQ-POS-35)', async () => {
    // Pre-seed only the cierre. The view will reload all data from
    // the mocks (cargarTodas overwrites eventos, etc).
    conContexto(() => {
      const cierresStore = useCierresCajaStore()
      cierresStore.cierre = {
        id: 'cc-1',
        evento_id: 'e-1',
        fecha_cierre: '2026-06-19T20:00:00Z',
        total_ventas: 100,
        total_gastos_fijos: 30,
        total_gastos_imprevistos: 20,
        utilidad_bruta: 50,
        efectivo_esperado: null,
        efectivo_real: null,
        diferencia: null,
        notas: null,
        created_at: '2026-06-19T20:00:00Z',
      }
    })
    __pushSupabaseResponse<Evento[]>({ data: [mkEvento('e-1')], error: null })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja>({
      data: {
        id: 'cc-1',
        evento_id: 'e-1',
        fecha_cierre: '2026-06-19T20:00:00Z',
        total_ventas: 100,
        total_gastos_fijos: 30,
        total_gastos_imprevistos: 20,
        utilidad_bruta: 50,
        efectivo_esperado: null,
        efectivo_real: null,
        diferencia: null,
        notas: null,
        created_at: '2026-06-19T20:00:00Z',
      },
      error: null,
    })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="cierre-boton-registrar"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="cierre-ya-registrado"]').exists()).toBe(true)
    })
  })

  it('shows the zero-ventas warning when no ventas exist (REQ-POS-35)', async () => {
    __pushSupabaseResponse<Evento[]>({ data: [mkEvento('e-1')], error: null })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja>({ data: null, error: null })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="cierre-zero-ventas-alerta"]').exists()).toBe(true)
    })
  })

  it('shows the read-only alert when the evento is cerrado (REQ-POS-39)', async () => {
    __pushSupabaseResponse<Evento[]>({
      data: [mkEvento('e-1', { estado: 'cerrado' })],
      error: null,
    })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja>({ data: null, error: null })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="cierre-boton-registrar"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="cierre-bloqueado"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="cierre-imprevistos-nuevo"]').exists()).toBe(false)
    })
  })

  it('renders the data state when resumen has zero values', async () => {
    __pushSupabaseResponse<Evento[]>({ data: [mkEvento('e-1')], error: null })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja>({ data: null, error: null })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="cierre-resumen"]').exists()).toBe(true)
    })
  })

  it('shows the error state when cierres fetch fails (REQ-POS-49)', async () => {
    __pushSupabaseResponse<Evento[]>({ data: [mkEvento('e-1')], error: null })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja>({
      data: null,
      error: { code: 'PGRST301', message: 'connection lost' },
    })

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      expect(wrapper.find('[data-testid="cierre-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Reintentar')
    })
  })

  it('shows the loading state while cargando (REQ-POS-49)', async () => {
    // Push only the first 4 responses — the cierres fetch will then
    // consume the default which is `{ data: [], error: null }`, so we
    // set cargando=true on the store post-mount via direct mutation.
    __pushSupabaseResponse<Evento[]>({ data: [mkEvento('e-1')], error: null })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    __pushSupabaseResponse<GastoImprevisto[]>({ data: [], error: null })
    // No cierre response — keep cargando=true post-load by setting it
    // after the view's onMounted finishes.

    await conContexto(async () => {
      const wrapper = await mountView()
      await flushPromises()
      const cierresStore = useCierresCajaStore()
      cierresStore.cargando = true
      await flushPromises()
      expect(cierresStore.cargando).toBe(true)
      expect(wrapper.find('[data-testid="cierre-cargando"]').exists()).toBe(true)
    })
  })
})