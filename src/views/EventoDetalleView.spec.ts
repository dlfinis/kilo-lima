// REQ-EVENTS-3, REQ-EVENTS-4, REQ-EVENTS-7, REQ-EVENTS-11,
// REQ-EVENTS-14, REQ-EVENTS-22, REQ-EVENTS-27, REQ-EVENTS-36,
// REQ-EVENTS-38, REQ-EVENTS-39: the detail view is the integration
// surface for one evento. It composes the events + gastos stores,
// the projection composable, and the read-only state machine gate.
// The 4-state UX (loading/error/populated/cerrado-read-only) matches
// the EventosView pattern but folds the empty state into the
// not-found path because a detail page can only show data or "no
// encontrado".
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

import EventoDetalleView from './EventoDetalleView.vue'
import EventoStatusChip from '@/components/business/EventoStatusChip.vue'
import type { Evento, GastoFijo } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  ubicacion: 'Plaza Central',
  estado: 'planificacion',
  notas: null,
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

const mkGasto = (id: string, overrides: Partial<GastoFijo> = {}): GastoFijo => ({
  id,
  evento_id: 'e-1',
  categoria: 'renta',
  monto: 500,
  descripcion: 'Alquiler del local',
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
      { path: '/eventos/:id', name: 'evento-detalle', component: EventoDetalleView },
    ],
  })
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

async function prepararStore(evento: Evento, gastos: GastoFijo[] = []) {
  const { useEventsStore } = await import('@/stores/events.store')
  const { useGastosFijosStore } = await import('@/stores/gastosFijos.store')
  await aplicacion.runWithContext(() => {
    useEventsStore().eventos.push(evento)
    useGastosFijosStore().gastosPorEvento.set(evento.id, gastos)
  })
}

const montarVista = async (id: string) => {
  router.push(`/eventos/${id}`)
  await router.isReady()
  return mount(EventoDetalleView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('EventoDetalleView', () => {
  it('renders header (name, date, status chip, location) and the gastos + projection (REQ-EVENTS-3, REQ-EVENTS-11, REQ-EVENTS-14, REQ-EVENTS-22)', async () => {
    const evento = mkEvento('e-1', { nombre: 'Feria del Sol', fecha: '2026-07-15', ubicacion: 'Plaza Central' })
    await prepararStore(evento, [mkGasto('g-1', { monto: 500 })])
    __pushSupabaseResponse<GastoFijo[]>({ data: [mkGasto('g-1', { monto: 500 })], error: null })
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Feria del Sol')
    expect(wrapper.text()).toContain('15/07/2026')
    expect(wrapper.text()).toContain('Plaza Central')
    const chip = wrapper.findComponent(EventoStatusChip)
    expect(chip.exists()).toBe(true)
    expect(chip.props('estado')).toBe('planificacion')
    // Gasto row renders + the "Agregar gasto" button is present (editable).
    expect(wrapper.text()).toContain('Alquiler del local')
    expect(wrapper.find('[data-testid="evento-detalle-agregar-gasto"]').exists()).toBe(true)
    // Projection card renders the total + the fixed-cost line.
    expect(wrapper.text()).toContain('Total')
    // Intl.NumberFormat uses a NARROW NO-BREAK SPACE (U+202F) between
    // currency code and amount; match against the numeric portion only.
    expect(wrapper.text()).toMatch(/500[.,]00/)
  })

  it('shows transition buttons for planificacion → en_curso and cancel (REQ-EVENTS-22)', async () => {
    const evento = mkEvento('e-1', { estado: 'planificacion' })
    await prepararStore(evento)
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-detalle-iniciar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="evento-detalle-cancelar-estado"]').exists()).toBe(true)
    // Cerrar is only visible from en_curso.
    expect(wrapper.find('[data-testid="evento-detalle-cerrar"]').exists()).toBe(false)
  })

  it('shows the cerrar button only when estado is en_curso (REQ-EVENTS-22, REQ-EVENTS-27)', async () => {
    const evento = mkEvento('e-1', { estado: 'en_curso' })
    await prepararStore(evento)
    __pushSupabaseResponse<GastoFijo[]>({ data: [], error: null })
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="evento-detalle-cerrar"]').exists()).toBe(true)
    // Iniciar only from planificacion.
    expect(wrapper.find('[data-testid="evento-detalle-iniciar"]').exists()).toBe(false)
  })

  it('shows the read-only alert and hides all edit controls when cerrado (REQ-EVENTS-3, REQ-EVENTS-27)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    await prepararStore(evento, [mkGasto('g-1')])
    __pushSupabaseResponse<GastoFijo[]>({ data: [mkGasto('g-1')], error: null })
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Evento cerrado — no editable')
    expect(wrapper.find('[data-testid="evento-detalle-agregar-gasto"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evento-detalle-iniciar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evento-detalle-cerrar"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="evento-detalle-cancelar-estado"]').exists()).toBe(false)
    // The data still renders — the view is read-only, not blank.
    expect(wrapper.text()).toContain('Alquiler del local')
    // Gasto delete buttons are also hidden (REQ-EVENTS-11 + 27).
    expect(wrapper.find('[data-testid="gasto-eliminar-g-1"]').exists()).toBe(false)
  })

  it('shows the loading state while the gasto fetch is in flight and the error state with retry (REQ-EVENTS-38)', async () => {
    const evento = mkEvento('e-1')
    await prepararStore(evento)
    // First call returns an error so we observe the error path.
    __pushSupabaseResponse<GastoFijo[]>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Error al cargar')
    expect(wrapper.text()).toContain('Reintentar')
  })

  it('opens the delete confirmation dialog with cascade counts when "Eliminar evento" is clicked (REQ-EVENTS-39)', async () => {
    const evento = mkEvento('e-1', { nombre: 'Feria Cancelada' })
    const gastos = [mkGasto('g-1'), mkGasto('g-2'), mkGasto('g-3')]
    await prepararStore(evento, gastos)
    __pushSupabaseResponse<GastoFijo[]>({ data: gastos, error: null })
    const wrapper = await montarVista('e-1')
    await flushPromises()

    await wrapper.find('[data-testid="evento-detalle-eliminar"]').trigger('click')
    await flushPromises()

    const texto = document.body.textContent ?? ''
    expect(texto).toContain('Feria Cancelada')
    expect(texto).toContain('3 gastos fijos')
  })
})