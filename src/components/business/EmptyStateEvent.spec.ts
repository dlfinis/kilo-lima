// mobile-ux-redesign Phase 2: EmptyStateEvent component.
// Shows a friendly message when no active event exists, with two
// variants: 0 events total vs >1 non-cerrado events.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'

import EmptyStateEvent from './EmptyStateEvent.vue'
import { useEventsStore } from '@/stores/events.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento } from '@/types'

const vuetify = createVuetify({ components, directives })
const pinia = createPinia()
const supabaseStub = createClient('http://x', 'anon') as SupabaseClient<Database>

const mkEvento = (
  estado: Evento['estado'] = 'en_curso',
  id = 'e-1',
): Evento => ({
  id,
  nombre: 'Feria',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado,
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
})

let router: Router

beforeEach(async () => {
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/eventos', component: { template: '<div />' } },
      { path: '/pos', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
})

const mountEmpty = () =>
  mount(EmptyStateEvent, {
    global: {
      plugins: [vuetify, router, pinia],
      provide: { supabase: supabaseStub },
    },
  })

describe('EmptyStateEvent', () => {
  it('shows "No hay eventos activos" when there are 0 events total', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = []
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-state-event"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No hay eventos activos')
  })

  it('shows "Crear evento" button that links to /eventos (0 events case)', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = []
    await wrapper.vm.$nextTick()

    const btn = wrapper.find('[data-testid="empty-state-cta"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toMatch(/crear evento/i)
    expect(wrapper.html()).toContain('href="/eventos"')
  })

  it('shows "Hay múltiples eventos sin cerrar" when >1 non-cerrado events exist', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = [mkEvento('en_curso', 'e-1'), mkEvento('planificacion', 'e-2')]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-state-event"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('múltiples eventos sin cerrar')
  })

  it('shows "Ver eventos" button when >1 non-cerrado events (links to /eventos)', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = [mkEvento('en_curso', 'e-1'), mkEvento('planificacion', 'e-2')]
    await wrapper.vm.$nextTick()

    const btn = wrapper.find('[data-testid="empty-state-cta"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toMatch(/ver eventos/i)
    expect(wrapper.html()).toContain('href="/eventos"')
  })

  it('is hidden when there is exactly 1 active event', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = [mkEvento('en_curso', 'e-1')]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-state-event"]').exists()).toBe(false)
  })

  it('is hidden when there is exactly 1 non-cerrado event among cerrados', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = [
      mkEvento('cerrado', 'e-1'),
      mkEvento('en_curso', 'e-2'),
      mkEvento('cerrado', 'e-3'),
    ]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-state-event"]').exists()).toBe(false)
  })

  it('shows empty state when all events are cerrados (total > 0 but 0 non-cerrado)', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = [mkEvento('cerrado', 'e-1'), mkEvento('cerrado', 'e-2')]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-state-event"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No hay eventos activos')
  })

  it('has a friendly, non-alarmist tone', async () => {
    const wrapper = mountEmpty()
    useEventsStore().eventos = []
    await wrapper.vm.$nextTick()

    // The message should start a friendly conversation, not a scary alert
    const texto = wrapper.text()
    expect(texto).toMatch(/eventos? activos?|eventos? sin cerrar/i)
    // Should NOT look like an error or alarm
    expect(texto).not.toMatch(/error|alarma|urgente|peligro/i)
  })
})
