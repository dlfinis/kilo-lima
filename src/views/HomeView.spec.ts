// HomeView Phase 2 spec — tests the new operational dashboard with
// ActiveEventCard, EmptyStateEvent, KpiGrid, QuickActionsRow, and
// de-emphasized business phase cards.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { computed } from 'vue'

import HomeView from './HomeView.vue'
import { useEventsStore } from '@/stores/events.store'
import { useAppStore } from '@/stores/app.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento } from '@/types'

const vuetify = createVuetify({ components, directives })

let router: ReturnType<typeof createRouter>

const pinia = createPinia()
const supabaseStub = createClient('http://x', 'anon') as SupabaseClient<Database>

const mkEvento = (estado: Evento['estado'] = 'en_curso'): Evento => ({
  id: 'e-1',
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado,
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
})

beforeAll(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/materias-primas', component: { template: '<div />' } },
      { path: '/recetas', component: { template: '<div />' } },
      { path: '/eventos', component: { template: '<div />' } },
      { path: '/productos', component: { template: '<div />' } },
      { path: '/productos/nuevo', component: { template: '<div />' } },
      { path: '/inventario', component: { template: '<div />' } },
      { path: '/pos', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
})

// Stub useResumen to prevent cargar() from overwriting seeded store data
// with Supabase call results. The stub returns a "loaded" state so the
// home renders immediately without skeleton or async fetch.
function stubCargar() {
  return {
    contadores: computed(() => ({
      materiasPrimas: 0,
      recetas: 0,
      eventosTotal: 0,
      eventosEnCurso: 0,
      eventosPlanificacion: 0,
      eventosCerrados: 0,
      productos: 0,
      ventasHoy: 0,
      cierresCaja: 0,
      cargado: true,
      errores: [],
    })) as never,
    cargar: async () => {},
  }
}

const mountHome = () =>
  mount(HomeView, {
    global: {
      plugins: [vuetify, router, pinia],
      provide: { supabase: supabaseStub },
    },
  })

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(pinia)
  })

  it('renders the Kilo-Lima heading', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.find('h1').text()).toContain('Kilo-Lima')
    spy.mockRestore()
  })

  it('renders EmptyStateEvent when no active event exists', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    useEventsStore().eventos = []
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.find('[data-testid="empty-state-event"]').exists()).toBe(true)
    spy.mockRestore()
  })

  it('renders ActiveEventCard when exactly one active event exists', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    // Seed after mount so the store already has inject('supabase') context
    const wrapper = mountHome()
    useEventsStore().eventos = [mkEvento('en_curso')]
    await flushPromises()
    expect(wrapper.find('[data-testid="active-event-card"]').exists()).toBe(true)
    spy.mockRestore()
  })

  it('renders KpiGrid with KPI cards', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.find('[data-testid="kpi-grid"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="kpi-card"]').length).toBe(4)
    spy.mockRestore()
  })

  it('renders QuickActionsRow', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.find('[data-testid="quick-actions-row"]').exists()).toBe(true)
    spy.mockRestore()
  })

  it('renders the 3 business-phase cards (de-emphasized)', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    const wrapper = mountHome()
    await flushPromises()
    expect(wrapper.find('[data-testid="home-card-pre-evento"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-card-durante-evento"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-card-post-evento"]').exists()).toBe(true)
    spy.mockRestore()
  })

  it('displays the appName from the app store', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    const wrapper = mountHome()
    await flushPromises()
    const app = useAppStore()
    expect(wrapper.text()).toContain(app.appName)
    spy.mockRestore()
  })

  it('shows the online status', async () => {
    const useResumen = await import('@/composables/useResumen')
    const spy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce(stubCargar())
    const wrapper = mountHome()
    await flushPromises()
    const texto = wrapper.text()
    const muestraEstado = texto.includes('En línea') || texto.includes('Sin conexión')
    expect(muestraEstado).toBe(true)
    spy.mockRestore()
  })
})
