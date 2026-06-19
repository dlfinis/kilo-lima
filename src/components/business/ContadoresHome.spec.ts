// REQ-UX-9..12, REQ-UX-25: ContadoresHome — 5 clickable counter cards
// linking to each domain route. The component is presentational: it
// receives the precomputed `contadores` from HomeView (which delegates
// aggregation to useResumen) and renders a chip per domain. While
// `cargado === false` it shows a Vuetify v-skeleton-loader per card so
// the home never flashes empty counters.
//
// Tests mount with a local Vuetify instance (same pattern as
// EventoStatusChip.spec.ts) and stub `useRouter` so the link targets
// are observable without booting a real router.
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ContadoresHome from './ContadoresHome.vue'
import type { Contadores } from '@/composables/useResumen'

const vuetify = createVuetify({ components, directives })

const mkContadores = (overrides: Partial<Contadores> = {}): Contadores => ({
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
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ContadoresHome', () => {
  it('renders 5 counter cards with the expected labels and numbers (REQ-UX-9, REQ-UX-11)', () => {
    const wrapper = mount(ContadoresHome, {
      props: {
        contadores: mkContadores({
          materiasPrimas: 5,
          recetas: 3,
          eventosTotal: 2,
          eventosEnCurso: 1,
          productos: 4,
          ventasHoy: 7,
          cargado: true,
        }),
      },
      global: { plugins: [vuetify] },
    })
    expect(wrapper.find('[data-testid="contador-materias-primas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="contador-recetas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="contador-eventos"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="contador-productos"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="contador-ventas-hoy"]').exists()).toBe(true)

    expect(wrapper.find('[data-testid="contador-materias-primas"]').text()).toContain('5')
    expect(wrapper.find('[data-testid="contador-recetas"]').text()).toContain('3')
    expect(wrapper.find('[data-testid="contador-eventos"]').text()).toContain('2')
    expect(wrapper.find('[data-testid="contador-productos"]').text()).toContain('4')
    expect(wrapper.find('[data-testid="contador-ventas-hoy"]').text()).toContain('7')

    expect(wrapper.find('[data-testid="contador-materias-primas"]').text()).toContain('Materias primas')
    expect(wrapper.find('[data-testid="contador-recetas"]').text()).toContain('Recetas')
    expect(wrapper.find('[data-testid="contador-eventos"]').text()).toContain('Eventos')
  })

  it('shows skeleton placeholders while cargado is false (REQ-UX-12)', () => {
    const wrapper = mount(ContadoresHome, {
      props: { contadores: mkContadores({ cargado: false }) },
      global: { plugins: [vuetify] },
    })
    // Skeleton loader is rendered instead of counter numbers.
    const skeletons = wrapper.findAll('[data-testid="contador-skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
    // No number rendered while loading.
    expect(wrapper.find('[data-testid="contador-materias-primas"]').exists()).toBe(false)
  })

  it('links each counter card to its domain route (REQ-UX-11)', async () => {
    // Provide a real router so `<v-card to="...">` renders as <a href>
    // (otherwise vue-router refuses to mount and the link is unwired).
    const router = await import('vue-router').then((m) =>
      m.createRouter({
        history: m.createMemoryHistory(),
        routes: [
          { path: '/', component: { template: '<div />' } },
          { path: '/materias-primas', component: { template: '<div />' } },
          { path: '/recetas', component: { template: '<div />' } },
          { path: '/eventos', component: { template: '<div />' } },
          { path: '/productos', component: { template: '<div />' } },
          { path: '/pos', component: { template: '<div />' } },
        ],
      }),
    )
    await router.push('/')
    await router.isReady()
    const wrapper = mount(ContadoresHome, {
      props: {
        contadores: mkContadores({
          materiasPrimas: 5,
          recetas: 3,
          eventosTotal: 2,
          eventosEnCurso: 1,
          productos: 4,
          ventasHoy: 7,
        }),
      },
      global: { plugins: [vuetify, router] },
    })
    // Each counter renders as a v-card with `to` — assert the resolved
    // href on each card so the test stays behavior-focused.
    const html = wrapper.html()
    expect(html).toContain('href="/materias-primas"')
    expect(html).toContain('href="/recetas"')
    expect(html).toContain('href="/eventos"')
    expect(html).toContain('href="/productos"')
    expect(html).toContain('href="/pos"')
  })
})
