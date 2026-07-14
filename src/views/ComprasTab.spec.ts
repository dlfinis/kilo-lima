// inventory-tabs-redesign / Work Unit 3: ComprasTab integration tests.
// Covers purchase history display, registration dialog, and UX states
// (loading/error/empty/filtered-empty). Uses the global Supabase mock
// (tests/setup.ts) — same pattern as MovimientosTab.spec.ts.
//
// CompraStockForm is always rendered (no v-if); dialog visibility is
// controlled via the modelValue prop. Tests assert on the prop value
// and rendered DOM content, not component existence.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'

import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'

import CompraStockForm from '@/components/inventario/CompraStockForm.vue'
import ComprasTab from './ComprasTab.vue'
import type { MateriaPrima, StockMovement } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: 'sm-1',
  materia_prima_id: 'mp-1',
  cantidad: 10,
  tipo: 'compra',
  evento_id: null,
  compra_insumo_id: null,
  venta_id: null,
  movimiento_corregido_id: null,
  costo_unitario_snapshot: 2.5,
  motivo: null,
  fecha: '2026-07-14',
  created_at: '2026-07-14T12:00:00Z',
  created_by: null,
  ...overrides,
})

const mkMateria = (overrides: Partial<MateriaPrima> = {}): MateriaPrima => ({
  id: 'mp-1',
  nombre: 'Harina',
  unidad: 'kg',
  costo_por_unidad: 2.5,
  categoria: 'ingrediente',
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  document.body.innerHTML = ''
})

const montarVista = () =>
  mount({
    components: { ComprasTab },
    template: '<v-app><ComprasTab /></v-app>',
  }, {
    attachTo: document.body,
    global: {
      plugins: [vuetify],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })

async function esperarCargaInicial() {
  await flushPromises()
}

describe('ComprasTab', () => {
  it('shows empty state when no movements exist', async () => {
    __resetSupabaseMock({ data: [], error: null })
    const wrapper = montarVista()
    await esperarCargaInicial()
    await esperarCargaInicial()
    expect(wrapper.find('[data-testid="compra-empty-global"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="movement-list"]').exists()).toBe(false)
  })

  it('renders only purchase-type movements', async () => {
    const movements: StockMovement[] = [
      mkMovement({ id: 'sm-1', tipo: 'compra', cantidad: 50, materia_prima_id: 'mp-1', motivo: 'Compra — Responsable: María' }),
      mkMovement({ id: 'sm-2', tipo: 'compra', cantidad: 20, materia_prima_id: 'mp-2', motivo: null }),
      mkMovement({ id: 'sm-3', tipo: 'consumo', cantidad: -10, materia_prima_id: 'mp-1', motivo: null }),
      mkMovement({ id: 'sm-4', tipo: 'ajuste', cantidad: 5, materia_prima_id: 'mp-1', motivo: 'Conteo físico' }),
    ]
    const materias: MateriaPrima[] = [
      mkMateria({ id: 'mp-1', nombre: 'Harina' }),
      mkMateria({ id: 'mp-2', nombre: 'Azúcar' }),
    ]
    __resetSupabaseMock([
      { data: materias as unknown as StockMovement[], error: null },
      { data: movements, error: null },
    ])
    const wrapper = montarVista()
    await esperarCargaInicial()
    await esperarCargaInicial()

    // Only 2 purchase rows should render
    const rows = wrapper.findAll('[data-testid^="movement-row-"]')
    expect(rows.length).toBe(2)
    expect(wrapper.find('[data-testid="movement-row-sm-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="movement-row-sm-2"]').exists()).toBe(true)
    // Non-purchase movements should NOT render
    expect(wrapper.find('[data-testid="movement-row-sm-3"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="movement-row-sm-4"]').exists()).toBe(false)
  })

  it('shows empty filter state when movements exist but none are purchases', async () => {
    const movements: StockMovement[] = [
      mkMovement({ id: 'sm-1', tipo: 'consumo', cantidad: -5 }),
      mkMovement({ id: 'sm-2', tipo: 'ajuste', cantidad: 3, motivo: 'Conteo' }),
    ]
    const materias: MateriaPrima[] = [
      mkMateria({ id: 'mp-1', nombre: 'Harina' }),
    ]
    __resetSupabaseMock([
      { data: materias as unknown as StockMovement[], error: null },
      { data: movements, error: null },
    ])
    const wrapper = montarVista()
    await esperarCargaInicial()
    await esperarCargaInicial()

    expect(wrapper.find('[data-testid="compra-empty-filter"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No hay compras registradas')
  })

  it('opens registration dialog when "Registrar compra" is clicked', async () => {
    const movements: StockMovement[] = [
      mkMovement({ id: 'sm-1', tipo: 'compra', cantidad: 10 }),
    ]
    const materias: MateriaPrima[] = [
      mkMateria({ id: 'mp-1', nombre: 'Harina', unidad: 'kg' }),
    ]
    __resetSupabaseMock([
      { data: materias, error: null },
      { data: movements, error: null },
    ])
    const wrapper = montarVista()
    await esperarCargaInicial()
    await esperarCargaInicial()

    // Dialog modelValue should be false initially
    const form = wrapper.findComponent(CompraStockForm)
    expect(form.props('modelValue')).toBe(false)

    // Click "Registrar compra" button
    await wrapper.find('[data-testid="compra-nueva"]').trigger('click')
    await flushPromises()

    // Dialog should now be open
    expect(form.props('modelValue')).toBe(true)
    // v-dialog teleports content to body — verify
    const dialogEl = document.querySelector('[data-testid="compra-stock-form"]')
    expect(dialogEl).not.toBeNull()
    expect(dialogEl!.textContent).toContain('Registrar compra')
  })

  it('cancel emit closes dialog', async () => {
    const materias: MateriaPrima[] = [
      mkMateria({ id: 'mp-1', nombre: 'Harina' }),
    ]
    __resetSupabaseMock([
      { data: materias, error: null },
      { data: [], error: null },
    ])
    const wrapper = montarVista()
    await esperarCargaInicial()
    await esperarCargaInicial()

    // Open dialog
    await wrapper.find('[data-testid="compra-nueva"]').trigger('click')
    await flushPromises()
    const form = wrapper.findComponent(CompraStockForm)
    expect(form.props('modelValue')).toBe(true)

    // Emit cancel through the form
    form.vm.$emit('cancel')
    await flushPromises()

    // modelValue should be false after cancel
    expect(form.props('modelValue')).toBe(false)
  })

  it('submits a purchase and refreshes the list', async () => {
    const movements: StockMovement[] = [
      mkMovement({ id: 'sm-1', tipo: 'compra', cantidad: 10, materia_prima_id: 'mp-1' }),
    ]
    const materias: MateriaPrima[] = [
      mkMateria({ id: 'mp-1', nombre: 'Harina', unidad: 'kg', costo_por_unidad: 2.5 }),
    ]
    const newMovement: StockMovement = mkMovement({ id: 'sm-2', tipo: 'compra', cantidad: 15, materia_prima_id: 'mp-1', motivo: null })
    const updatedMovements = [...movements, newMovement]
    __resetSupabaseMock([
      { data: materias, error: null },                           // 1. cargarTodas
      { data: movements, error: null },                          // 2. cargarMovimientos (initial)
    ])

    const wrapper = montarVista()
    await esperarCargaInicial()
    await esperarCargaInicial()

    // Initially 1 purchase row
    expect(wrapper.findAll('[data-testid^="movement-row-"]').length).toBe(1)

    // Open dialog
    await wrapper.find('[data-testid="compra-nueva"]').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(CompraStockForm).props('modelValue')).toBe(true)

    // Queue responses the submit flow will consume:
    __pushSupabaseResponse<StockMovement>({ data: newMovement, error: null })
    __pushSupabaseResponse<StockMovement[]>({ data: updatedMovements, error: null })
    const stockEntry = { materia_prima_id: 'mp-1', nombre: 'Harina', unidad: 'kg', stock_actual: 25 }
    __pushSupabaseResponse<typeof stockEntry[]>({ data: [stockEntry], error: null })

    // Emit submit through the form component
    const form = wrapper.findComponent(CompraStockForm)
    form.vm.$emit('submit', {
      materia_prima_id: 'mp-1',
      cantidad: 15,
      costo_unitario: 3.0,
      evento_id: null,
      compra_insumo_id: null,
    })
    await flushPromises()

    // Dialog should close after successful submit
    expect(wrapper.findComponent(CompraStockForm).props('modelValue')).toBe(false)
    await flushPromises()

    // After refresh: 2 purchase rows
    const rows = wrapper.findAll('[data-testid^="movement-row-"]')
    expect(rows.length).toBe(2)
    expect(wrapper.find('[data-testid="movement-row-sm-2"]').exists()).toBe(true)
  })

  it('shows error state with retry button', async () => {
    const materias: MateriaPrima[] = [
      mkMateria({ id: 'mp-1', nombre: 'Harina' }),
    ]
    __resetSupabaseMock([
      { data: materias as unknown as StockMovement[], error: null },
      { data: null, error: { code: 'TEST_ERROR', message: 'Error al cargar los movimientos de inventario' } },
    ])
    const wrapper = montarVista()
    await esperarCargaInicial()
    await esperarCargaInicial()

    const alert = wrapper.find('[data-testid="compra-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Error al cargar los movimientos de inventario')
    expect(alert.text()).toContain('Reintentar')
  })
})
