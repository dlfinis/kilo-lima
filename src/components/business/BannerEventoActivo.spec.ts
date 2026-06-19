// REQ-UX-13..16 + REQ-UX-25: BannerEventoActivo. Renders a warning
// `<v-alert>` when there is an evento `en_curso`; hidden otherwise.
// Reads `ventasStore.eventoEnCurso` (cross-store computed per
// REQ-POS-51) — zero new queries. The alert surfaces the evento's
// nombre + formatted fecha + an "IR A CAJA →" button that routes to
// /pos. When the active evento transitions to `cerrado` the banner
// disappears automatically (computed returns null → v-if hides the
// alert).
//
// Pattern mirrors PlanProduccionGrid.spec.ts: provide supabase via
// `global.provide` so the store's `inject('supabase')` resolves
// during component setup. We seed AFTER mount because the store
// factory calls `inject('supabase')` at first use — seeding after
// mount ensures the active Pinia has the supabase provide in scope.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'

import BannerEventoActivo from './BannerEventoActivo.vue'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import type { Evento } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkEvento = (estado: Evento['estado']): Evento => ({
  id: 'e-1',
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  ubicacion: 'Plaza',
  estado,
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
})

let router: Router
const pinia = createPinia()
const supabaseStub = createClient('http://x', 'anon')

beforeEach(async () => {
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/pos', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
})

const mountBanner = () =>
  mount(BannerEventoActivo, {
    global: {
      plugins: [vuetify, router, pinia],
      provide: { supabase: supabaseStub },
    },
  })

describe('BannerEventoActivo', () => {
  it('is hidden when no evento is en_curso (REQ-UX-15, REQ-UX-16)', () => {
    const wrapper = mountBanner()
    expect(wrapper.find('[data-testid="banner-evento-activo"]').exists()).toBe(false)
  })

  it('shows the evento name, formatted fecha and IR A CAJA CTA (REQ-UX-13, REQ-UX-14)', async () => {
    const wrapper = mountBanner()
    // Seed after mount — the wrapper shares the active Pinia so
    // mutations land on the same store the component observes.
    useEventsStore().eventos.push(mkEvento('en_curso'))
    await wrapper.vm.$nextTick()
    const banner = wrapper.find('[data-testid="banner-evento-activo"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Feria del Sol')
    expect(banner.text()).toContain('15 jul 2026')
    const cta = wrapper.find('[data-testid="banner-evento-activo-cta"]')
    expect(cta.exists()).toBe(true)
    // CTA resolves to /pos
    expect(wrapper.html()).toContain('href="/pos"')
  })

  it('disappears reactively when evento transitions from en_curso to cerrado (REQ-UX-15)', async () => {
    useEventsStore().eventos.push(mkEvento('en_curso'))
    const wrapper = mountBanner()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="banner-evento-activo"]').exists()).toBe(true)
    // Drive the transition. Replace the array element (not mutate the
    // plain-object property) so Pinia's reactive proxy triggers the
    // computeds. ventasStore.eventoEnCurso is a cross-store computed
    // over eventsStore.eventos.
    const events = useEventsStore()
    events.eventos = events.eventos.map((e) =>
      e.id === 'e-1' ? { ...e, estado: 'cerrado' } : e,
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="banner-evento-activo"]').exists()).toBe(false)
    const ventas = useVentasStore()
    expect(ventas.eventoEnCurso).toBeNull()
  })
})
