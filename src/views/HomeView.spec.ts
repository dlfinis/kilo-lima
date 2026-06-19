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
import { useAppStore } from '@/stores/app.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

// HomeView relies on Vuetify components and the Pinia store. The Vuetify
// instance is local to the test (same pattern as src/App.spec.ts) so we
// don't depend on src/plugins/vuetify. The router is a memory router
// with catch-all so the v-card :to props don't crash at mount.
const vuetify = createVuetify({ components, directives })

// One router shared across all tests. Initialized before the suite so the
// first navigation resolves before any test mounts the component (vue-router
// renders <v-btn :to="..."> as <a> only after `await router.isReady()`).
let router: ReturnType<typeof createRouter>

// HomeView now calls useResumen() in setup, which reads Pinia stores
// that `inject('supabase')`. We provide a stub client via global.provide
// so the home can mount without booting a real Supabase connection.
const pinia = createPinia()
const supabaseStub = createClient('http://x', 'anon') as SupabaseClient<Database>

beforeAll(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/materias-primas', component: { template: '<div />' } },
      { path: '/recetas', component: { template: '<div />' } },
      { path: '/eventos', component: { template: '<div />' } },
      { path: '/productos', component: { template: '<div />' } },
      { path: '/pos', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
})

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(pinia)
  })

  it('renders the Kilo-Lima heading and the 3-phase subtitle', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [createPinia(), vuetify, router, pinia],
        provide: { supabase: supabaseStub },
      },
    })
    await flushPromises()
    expect(wrapper.find('h1').text()).toContain('Kilo-Lima')
    expect(wrapper.text()).toContain('Pre-evento')
    expect(wrapper.text()).toContain('Durante evento')
    expect(wrapper.text()).toContain('Post-evento')
  })

  it('shows the 3 business-phase cards as a navigation hub', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [vuetify, router, pinia],
        provide: { supabase: supabaseStub },
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="home-card-pre-evento"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-card-durante-evento"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-card-post-evento"]').exists()).toBe(true)
    // Pre-evento card text shows the next-action CTA
    expect(wrapper.find('[data-testid="home-card-pre-evento"]').text()).toContain('Planificación')
    expect(wrapper.find('[data-testid="home-card-durante-evento"]').text()).toContain('Ventas en vivo')
  })

  it('shows quick-access buttons for catalog + eventos', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [vuetify, router, pinia],
        provide: { supabase: supabaseStub },
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="home-btn-materias-primas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-btn-recetas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-btn-productos"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-btn-eventos"]').exists()).toBe(true)
    // Verify the text of each button (proves the user sees the labels)
    expect(wrapper.find('[data-testid="home-btn-materias-primas"]').text()).toContain('Materias Primas')
    expect(wrapper.find('[data-testid="home-btn-recetas"]').text()).toContain('Recetas')
  })

  it('disables the post-evento card (analytics is a future slice)', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [vuetify, router, pinia],
        provide: { supabase: supabaseStub },
      },
    })
    await flushPromises()
    const card = wrapper.find('[data-testid="home-card-post-evento"]')
    // Vuetify v-card with `disabled` adds a `.v-card--disabled` class
    expect(card.classes()).toContain('v-card--disabled')
  })

  it('displays the appName from the app store', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [vuetify, router, pinia],
        provide: { supabase: supabaseStub },
      },
    })
    await flushPromises()
    const app = useAppStore()
    expect(wrapper.text()).toContain(app.appName)
  })

  it('shows the online status text from useOnlineStatus', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [vuetify, router, pinia],
        provide: { supabase: supabaseStub },
      },
    })
    await flushPromises()
    const texto = wrapper.text()
    const muestraEstado = texto.includes('En línea') || texto.includes('Sin conexión')
    expect(muestraEstado).toBe(true)
  })

  it('mounts the new PR2 ContadoresHome with skeleton state when cargado is false', async () => {
    // Stub cargar() to a never-resolving promise so the home stays
    // in the loading state. We assert the skeleton placeholders are
    // visible (REQ-UX-12) before the counters render.
    const useResumen = await import('@/composables/useResumen')
    const cargarSpy = vi.spyOn(useResumen, 'useResumen').mockReturnValueOnce({
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
        cargado: false,
        errores: [],
      })) as never,
      cargar: async () => {},
    })
    const wrapper = mount(HomeView, {
      global: {
        plugins: [vuetify, router, pinia],
        provide: { supabase: supabaseStub },
      },
    })
    const skeletons = wrapper.findAll('[data-testid="contador-skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
    cargarSpy.mockRestore()
  })
})
