// REQ-UX-17..19 + REQ-UX-25: SiguientePasoCta. Receives the
// aggregated `contadores` from HomeView, runs them through
// `obtenerSiguientePaso` (pure util), and renders a colour-coded
// `<v-card>` with the recommended step's text + a CTA button.
// Returns nothing when `obtenerSiguientePaso` returns null (user is
// in motion — REQ-UX-19).
//
// Tests mount with a local Vuetify + a memory router (same pattern
// as ContadoresHome.spec.ts) so the `<v-btn to="...">` CTA resolves
// to an observable href.
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import SiguientePasoCta from './SiguientePasoCta.vue'
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

let router: Router

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/materias-primas', component: { template: '<div />' } },
      { path: '/recetas', component: { template: '<div />' } },
      { path: '/eventos', component: { template: '<div />' } },
      { path: '/pos', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
})

const mountCta = (contadores: Contadores) =>
  mount(SiguientePasoCta, {
    props: { contadores },
    global: { plugins: [vuetify, router] },
  })

describe('SiguientePasoCta', () => {
  it('renders CREAR MATERIA PRIMA when materiasPrimas===0 (REQ-UX-17 branch 1)', () => {
    const wrapper = mountCta(mkContadores({ materiasPrimas: 0 }))
    const cta = wrapper.find('[data-testid="siguiente-paso-crear-materia-prima"]')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('CREAR MATERIA PRIMA')
    // Routed to /materias-primas
    expect(wrapper.html()).toContain('href="/materias-primas"')
  })

  it('renders IR A CAJA (success) when ventasHoy===0 with active evento (REQ-UX-17 branch 5)', () => {
    const wrapper = mountCta(
      mkContadores({
        materiasPrimas: 5,
        recetas: 3,
        eventosTotal: 2,
        eventosEnCurso: 1,
        productos: 4,
        ventasHoy: 0,
      }),
    )
    const cta = wrapper.find('[data-testid="siguiente-paso-ir-caja"]')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('IR A CAJA')
    expect(wrapper.html()).toContain('href="/pos"')
  })

  it('renders nothing when all counters are non-zero (REQ-UX-19)', () => {
    const wrapper = mountCta(
      mkContadores({
        materiasPrimas: 5,
        recetas: 3,
        eventosTotal: 2,
        eventosEnCurso: 1,
        productos: 4,
        ventasHoy: 7,
      }),
    )
    // No CTA card rendered when the recommended step is null.
    expect(wrapper.find('[data-testid^="siguiente-paso-"]').exists()).toBe(false)
    // Sanity: empty content body (no orphan text).
    expect(wrapper.text().trim()).toBe('')
  })
})
