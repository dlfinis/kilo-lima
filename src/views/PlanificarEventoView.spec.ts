// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-22, REQ-EVENTS-35,
// REQ-EVENTS-36, REQ-EVENTS-38: the planning view composes the
// events + plans stores, renders the PlanProduccionGrid + the
// ProyeccionCostosCard, and gates on `estadoEsEditable` (REQ-
// EVENTS-16). If the evento is cerrado, the view redirects to
// the detail page with `?mensaje=evento-cerrado` (REQ-EVENTS-35).
// Handles the four states: loading, error, empty (no filas),
// populated.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'

import PlanificarEventoView from './PlanificarEventoView.vue'
import type { Evento, PlanProduccion } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: null,
  estado: 'planificacion',
  notas: null,
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkPlan = (id: string, overrides: Partial<PlanProduccion> = {}): PlanProduccion => ({
  id,
  evento_id: 'e-1',
  receta_id: 'r-1',
  unidades_a_producir: 10,
  created_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

let aplicacion: App
let router: Router

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  document.body.innerHTML = ''
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/eventos', name: 'eventos', component: { template: '<div/>' } },
      { path: '/eventos/:id', name: 'evento-detalle', component: { template: '<div/>' } },
      {
        path: '/eventos/:id/planificar',
        name: 'planificar-evento',
        component: PlanificarEventoView,
      },
    ],
  })
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

async function prepararStores(evento: Evento, plan: PlanProduccion[] = []) {
  const { useEventsStore } = await import('@/stores/events.store')
  const { usePlansStore } = await import('@/stores/plans.store')
  await aplicacion.runWithContext(() => {
    useEventsStore().eventos.push(evento)
    useEventsStore().eventoActual = evento
    usePlansStore().planesPorEvento.set(evento.id, plan)
  })
}

const montarVista = async (id: string) => {
  router.push(`/eventos/${id}/planificar`)
  await router.isReady()
  return mount(PlanificarEventoView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('PlanificarEventoView', () => {
  it('renders the header (evento name + status chip) + the grid + the projection card (REQ-EVENTS-15, REQ-EVENTS-22)', async () => {
    const evento = mkEvento('e-1', { nombre: 'Feria del Sol' })
    await prepararStores(evento, [mkPlan('p-1')])
    // Pushing a response so the view's cargarPorEvento() call doesn't
    // overwrite our prep with the default empty array.
    __pushSupabaseResponse<PlanProduccion[]>({
      data: [mkPlan('p-1')],
      error: null,
    })

    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Feria del Sol')
    // The grid renders one row per plan fila.
    expect(wrapper.findAll('[data-testid="plan-fila"]')).toHaveLength(1)
    // The projection card renders the totals block.
    expect(wrapper.find('[data-testid="proyeccion-card"]').exists()).toBe(true)
  })

  it('uses the planificar-rail CSS class instead of inline min-width: 360px (plan-fila-layout)', async () => {
    const evento = mkEvento('e-1')
    await prepararStores(evento, [mkPlan('p-1')])
    __pushSupabaseResponse<PlanProduccion[]>({
      data: [mkPlan('p-1')],
      error: null,
    })

    const wrapper = await montarVista('e-1')
    await flushPromises()

    const rail = wrapper.find('.planificar-rail')
    expect(rail.exists()).toBe(true)
    // The inline style was removed — the rail gets its sizing from
    // the scoped CSS class.
    expect(rail.attributes('style') ?? '').not.toContain('min-width: 360px')
  })

  it('redirects to /eventos/:id?mensaje=evento-cerrado when the evento is cerrado (REQ-EVENTS-35)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    await prepararStores(evento, [])

    await montarVista('e-1')
    // Wait for the redirect to fire.
    await flushPromises()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/eventos/e-1')
    expect(router.currentRoute.value.query.mensaje).toBe('evento-cerrado')
  })

  it('shows the error state with retry when the plan fetch fails (REQ-EVENTS-38)', async () => {
    const evento = mkEvento('e-1')
    await prepararStores(evento)
    __pushSupabaseResponse<PlanProduccion[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Error al cargar')
    expect(wrapper.text()).toContain('Reintentar')
  })
})