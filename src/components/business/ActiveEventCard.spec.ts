// mobile-ux-redesign Phase 2: ActiveEventCard component.
// Displays the active event's name, date, status badge, and a
// prominent "Ir a caja →" CTA button that navigates to /pos.
// Follows BannerEventoActivo.spec.ts pattern: mount first to get Vue
// context for inject, then seed the real events store.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'

import ActiveEventCard from './ActiveEventCard.vue'
import { useEventsStore } from '@/stores/events.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento } from '@/types'

const vuetify = createVuetify({ components, directives })
const pinia = createPinia()
const supabaseStub = createClient('http://x', 'anon') as SupabaseClient<Database>

const mkEvento = (
  estado: Evento['estado'] = 'en_curso',
  overrides: Partial<Evento> = {},
): Evento => ({
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
  ...overrides,
})

let router: Router

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

const mountCard = () =>
  mount(ActiveEventCard, {
    global: {
      plugins: [vuetify, router, pinia],
      provide: { supabase: supabaseStub },
    },
  })

describe('ActiveEventCard', () => {
  it('displays event name prominently when exactly one active event exists', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('en_curso')]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="active-event-card"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Feria del Sol')
    const nameEl = wrapper.find('[data-testid="active-event-name"]')
    expect(nameEl.exists()).toBe(true)
    expect(nameEl.classes()).toContain('text-h5')
  })

  it('displays formatted event date', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('en_curso')]
    await wrapper.vm.$nextTick()

    // formatearFechaCorta('2026-07-15') → '15 jul 2026'
    expect(wrapper.text()).toContain('15 jul 2026')
  })

  it('displays the event status via EventoStatusChip', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('en_curso')]
    await wrapper.vm.$nextTick()

    // EventoStatusChip renders the estado text
    expect(wrapper.text().toLowerCase()).toContain('en curso')
  })

  it('renders "Ir a caja" CTA button that links to /pos', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('en_curso')]
    await wrapper.vm.$nextTick()

    const cta = wrapper.find('[data-testid="active-event-cta"]')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toMatch(/ir a caja/i)
    // Vuetify v-btn with `to` prop renders as an <a> with href
    expect(wrapper.html()).toContain('href="/pos"')
  })

  it('button is prominently styled (large size)', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('en_curso')]
    await wrapper.vm.$nextTick()

    const cta = wrapper.find('[data-testid="active-event-cta"]')
    expect(cta.exists()).toBe(true)
    expect(cta.classes()).toContain('v-btn--size-x-large')
  })

  it('is hidden when no non-cerrado event exists', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('cerrado')]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="active-event-card"]').exists()).toBe(false)
  })

  it('is hidden when >1 non-cerrado events exist', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('en_curso'), mkEvento('planificacion')]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="active-event-card"]').exists()).toBe(false)
  })

  it('shows when there is exactly one planificacion event', async () => {
    const wrapper = mountCard()
    useEventsStore().eventos = [mkEvento('planificacion')]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="active-event-card"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Feria del Sol')
    expect(wrapper.text().toLowerCase()).toContain('planificación')
  })
})
