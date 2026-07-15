// Phase 4 (REQ-STOCK-MOVEMENTS-4): ContabilidadEventoView tests.
// Verifies:
//   - Purchase controls ("+ Compra insumo") are removed from accounting view
//   - Aporte capital button remains
//   - COGS section can render movement-backed data
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

import ContabilidadEventoView from './ContabilidadEventoView.vue'

const vuetify = createVuetify({ components, directives })

let aplicacion: App
let router: Router

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  document.body.innerHTML = ''

  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/eventos/:id', name: 'evento-detalle', component: { template: '<div/>' } },
      { path: '/eventos/:id/contabilidad', name: 'contabilidad-evento', component: ContabilidadEventoView },
    ],
  })

  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
})

function queueMountResponses() {
  // cargarSociosEvento, cargarAportes, cargarComprasInsumos, cargarMovimientos
  __pushSupabaseResponse<unknown>({ data: [], error: null }) // socios
  __pushSupabaseResponse<unknown>({ data: [], error: null }) // aportes
  __pushSupabaseResponse<unknown>({ data: [], error: null }) // compras
  __pushSupabaseResponse<unknown>({ data: [], error: null }) // stock movements
}

async function mountView(eventoId: string) {
  router.push(`/eventos/${eventoId}/contabilidad`)
  await router.isReady()
  return mount(ContabilidadEventoView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('ContabilidadEventoView — Phase 4 accounting cleanup', () => {
  it('renders the view with event id from route', async () => {
    queueMountResponses()
    const wrapper = await mountView('ev-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Contabilidad')
    expect(wrapper.text()).toContain('Gestionar socios')
  })

  it('does NOT render purchase controls ("+ Compra insumo")', async () => {
    queueMountResponses()
    const wrapper = await mountView('ev-1')
    await flushPromises()

    // The purchase button "Compra insumo" must NOT be present.
    const allButtons = wrapper.findAll('.v-btn')
    const purchaseButton = allButtons.filter(
      (btn) => btn.text().includes('Compra insumo'),
    )
    expect(purchaseButton.length).toBe(0)
  })

  it('renders "+ Aporte capital" button (financial controls remain)', async () => {
    queueMountResponses()
    const wrapper = await mountView('ev-1')
    await flushPromises()

    const allButtons = wrapper.findAll('.v-btn')
    const aporteButton = allButtons.filter(
      (btn) => btn.text().includes('Aporte capital'),
    )
    expect(aporteButton.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the timeline movements section', async () => {
    queueMountResponses()
    const wrapper = await mountView('ev-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Movimientos')
  })

  it('does NOT import or render CompraInsumoForm dialog', async () => {
    queueMountResponses()
    const wrapper = await mountView('ev-1')
    await flushPromises()

    // The CompraInsumoForm dialog should not exist in the DOM.
    // Only the AporteForm dialog should be present.
    // If there were a compra dialog, the card title "Registrar compra de insumo"
    // would appear.
    expect(wrapper.text()).not.toContain('Registrar compra de insumo')
  })

  it('shows error state when eventoId is missing', async () => {
    router.push('/eventos/')
    await router.isReady()
    const wrapper = mount(ContabilidadEventoView, {
      global: {
        plugins: [vuetify, router],
        provide: { supabase: createClient('http://x', 'anon') },
      },
    })

    expect(wrapper.text()).toContain('No se encontró el evento')
  })
})
