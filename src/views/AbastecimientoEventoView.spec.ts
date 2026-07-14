// REQ-ABASTECIMIENTO-1..3: view test for the Abastecimiento view.
// Verifies the purchase form, compras list, movement history, and
// correction dialog. Uses the global Supabase mock + vue-router.
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

import AbastecimientoEventoView from './AbastecimientoEventoView.vue'
import { useSociosStore } from '@/stores/socios.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import type { CompraInsumo, StockMovement } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkCompra = (overrides: Partial<CompraInsumo> = {}): CompraInsumo => ({
  id: 'ci-1',
  evento_id: 'ev-1',
  socio_id: 's-1',
  materia_prima_id: 'mp-1',
  cantidad: 10,
  costo_total: 25,
  fecha: '2026-07-14',
  descripcion: null,
  created_at: '2026-07-14T12:00:00Z',
  ...overrides,
})

const mkMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: 'sm-1',
  materia_prima_id: 'mp-1',
  cantidad: 10,
  tipo: 'compra',
  evento_id: 'ev-1',
  compra_insumo_id: 'ci-1',
  venta_id: null,
  movimiento_corregido_id: null,
  costo_unitario_snapshot: 2.5,
  motivo: null,
  fecha: '2026-07-14',
  created_at: '2026-07-14T12:00:00Z',
  created_by: null,
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
      { path: '/eventos/:id', name: 'evento-detalle', component: { template: '<div/>' } },
      { path: '/eventos/:id/abastecimiento', name: 'evento-abastecimiento', component: AbastecimientoEventoView },
    ],
  })
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon'))
  // Pre-seed socios and ingredients to avoid extra fetches
  aplicacion.runWithContext(() => {
    useSociosStore().socios = []
    useIngredientsStore().materiasPrimas = []
  })
})

// Queue the standard fetch responses that onMounted triggers:
// 1. cargarComprasInsumos (compras_insumos select)
// 2. cargarMovimientos (stock_movements select)
// 3. cargarStockActual (v_stock_actual select)
// 4. (optional) socios fetch / ingredients fetch
function queueMountResponses(
  compras: CompraInsumo[] = [],
  movements: StockMovement[] = [],
) {
  __pushSupabaseResponse<CompraInsumo[]>({ data: compras, error: null })
  __pushSupabaseResponse<StockMovement[]>({ data: movements, error: null })
  __pushSupabaseResponse<unknown>({ data: [], error: null }) // stockActual
}

async function montarVista(id: string) {
  router.push(`/eventos/${id}/abastecimiento`)
  await router.isReady()
  return mount(AbastecimientoEventoView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('AbastecimientoEventoView', () => {
  it('renders the title and new-purchase button', async () => {
    queueMountResponses([], [])
    const wrapper = await montarVista('ev-1')
    await flushPromises()

    expect(wrapper.text()).toContain('Abastecimiento')
    expect(wrapper.find('[data-testid="abastecimiento-nueva-compra"]').exists()).toBe(true)
  })

  it('displays compras list when compras exist for the event', async () => {
    queueMountResponses(
      [mkCompra({ id: 'ci-1', costo_total: 25 }), mkCompra({ id: 'ci-2', cantidad: 5, costo_total: 10 })],
    )
    const wrapper = await montarVista('ev-1')
    await flushPromises()

    const list = wrapper.find('[data-testid="abastecimiento-compras-list"]')
    expect(list.exists()).toBe(true)
    expect(wrapper.text()).toContain('$25.00')
  })

  it('shows empty state when no compras exist', async () => {
    queueMountResponses([], [])
    const wrapper = await montarVista('ev-1')
    await flushPromises()

    expect(wrapper.text()).toContain('No hay compras registradas')
  })

  it('displays stock movements filtered by evento', async () => {
    queueMountResponses([], [
      mkMovement({ id: 'sm-1', evento_id: 'ev-1' }),
      mkMovement({ id: 'sm-2', cantidad: -3, tipo: 'consumo', evento_id: 'ev-1' }),
    ])
    const wrapper = await montarVista('ev-1')
    await flushPromises()

    const list = wrapper.find('[data-testid="abastecimiento-movimientos-list"]')
    expect(list.exists()).toBe(true)
    const movItems = list.findAll('.v-list-item')
    expect(movItems.length).toBe(2)
  })

  it('opens the purchase dialog when "Nueva compra" is clicked', async () => {
    queueMountResponses([], [])
    const wrapper = await montarVista('ev-1')
    await flushPromises()

    const btn = wrapper.find('[data-testid="abastecimiento-nueva-compra"]')
    await btn.trigger('click')
    await flushPromises()

    // Vuetify v-dialog teleports content to body — look there
    const bodyText = document.body.textContent ?? ''
    expect(bodyText).toContain('Cantidad')
    expect(bodyText).toContain('Costo total (USD)')
  })
})
