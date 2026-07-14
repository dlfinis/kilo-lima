// REQ-EVENT-INGREDIENT-PURCHASING: component tests for the IngredientesEventoPanel.
// Covers: rendering per-product rows, consolidated shortage with stock gap,
// covered-stock zero-gap, empty state, warning badges.
//
// Follows the same mount pattern as ProyeccionCostosCard.spec.ts: createVuetify
// with all components + directives, and mount with global plugins.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import IngredientesEventoPanel from './IngredientesEventoPanel.vue'
import type { IngredientesEventoResultado } from '@/composables/useIngredientesEvento'

const vuetify = createVuetify({ components, directives })

const mountPanel = (resultado: IngredientesEventoResultado | null) =>
  mount(IngredientesEventoPanel, {
    props: { resultado },
    global: { plugins: [vuetify] },
  })

const mkResultado = (
  overrides: Partial<IngredientesEventoResultado> = {},
): IngredientesEventoResultado => ({
  porProducto: [],
  consolidado: [],
  advertencias: [],
  ...overrides,
})

describe('IngredientesEventoPanel', () => {
  // -----------------------------------------------------------------------
  // Empty states
  // -----------------------------------------------------------------------

  it('renders empty state when resultado is null', () => {
    const wrapper = mountPanel(null)
    expect(wrapper.find('[data-testid="ingredientes-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sin datos de ingredientes')
    expect(wrapper.find('[data-testid="ingredientes-panels"]').exists()).toBe(false)
  })

  it('renders empty state when resultado has no data', () => {
    const wrapper = mountPanel(mkResultado())
    expect(wrapper.find('[data-testid="ingredientes-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sin ingredientes para planificar')
  })

  // -----------------------------------------------------------------------
  // Consolidated summary table
  // -----------------------------------------------------------------------

  it('renders consolidated "to buy" summary table with available, required, and faltante', async () => {
    const wrapper = mountPanel(
      mkResultado({
        consolidado: [
          {
            materiaPrimaId: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            requerido: 50,
            disponible: 30,
            faltante: 20,
          },
          {
            materiaPrimaId: 'mp-2',
            nombre: 'Azúcar',
            unidad: 'kg',
            requerido: 10,
            disponible: 15,
            faltante: 0,
          },
        ],
      }),
    )

    // Consolidated panel exists
    const panel = wrapper.find('[data-testid="ingredientes-consolidado-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('Resumen de compras')
    expect(panel.text()).toContain('2 ítems')

    // Expand the consolidated panel so the table renders
    const btn = panel.find('button')
    await btn.trigger('click')
    await wrapper.vm.$nextTick()

    const text = wrapper.text()
    // Harina: requerido 50, disponible 30, faltante 20
    expect(text).toContain('50.00')
    expect(text).toContain('30.00')
    expect(text).toContain('20.00')

    // Azúcar: faltante = 0 → "—", disponible still visible
    expect(text).toContain('15.00')
  })

  // -----------------------------------------------------------------------
  // Shortage (stock gap) visualisation
  // -----------------------------------------------------------------------

  it('shows faltante in red when stock is insufficient', async () => {
    const wrapper = mountPanel(
      mkResultado({
        consolidado: [
          {
            materiaPrimaId: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            requerido: 40,
            disponible: 10,
            faltante: 30,
          },
        ],
      }),
    )

    // Expand the panel first
    const panel = wrapper.find('[data-testid="ingredientes-consolidado-panel"]')
    const btn = panel.find('button')
    await btn.trigger('click')
    await wrapper.vm.$nextTick()

    // The red "A comprar" cell should be visible
    const faltanteCell = wrapper.find('.text-error')
    expect(faltanteCell.exists()).toBe(true)
    expect(faltanteCell.text()).toContain('30.00')
  })

  it('shows covered-stock zero-gap as green dash when faltante is zero', async () => {
    const wrapper = mountPanel(
      mkResultado({
        consolidado: [
          {
            materiaPrimaId: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            requerido: 10,
            disponible: 20,
            faltante: 0,
          },
        ],
      }),
    )

    // Expand the panel first
    const panel = wrapper.find('[data-testid="ingredientes-consolidado-panel"]')
    const btn = panel.find('button')
    await btn.trigger('click')
    await wrapper.vm.$nextTick()

    const successCell = wrapper.find('.text-success')
    expect(successCell.exists()).toBe(true)
    expect(successCell.text()).toBe('—')
  })

  // -----------------------------------------------------------------------
  // Per-product breakdown
  // -----------------------------------------------------------------------

  it('renders per-product expansion panels with ingredient tables', () => {
    const wrapper = mountPanel(
      mkResultado({
        porProducto: [
          {
            eventoProductoId: 'ep-1',
            productoNombre: 'Pan de muerto',
            ingredientes: [
              {
                materiaPrimaId: 'mp-1',
                nombre: 'Harina',
                unidad: 'kg',
                requerido: 5,
              },
              {
                materiaPrimaId: 'mp-2',
                nombre: 'Azúcar',
                unidad: 'kg',
                requerido: 2,
              },
            ],
          },
          {
            eventoProductoId: 'ep-2',
            productoNombre: 'Galletas',
            ingredientes: [
              {
                materiaPrimaId: 'mp-1',
                nombre: 'Harina',
                unidad: 'kg',
                requerido: 3,
              },
            ],
          },
        ],
      }),
    )

    // Two per-product panels exist
    expect(wrapper.find('[data-testid="ingredientes-producto-panel-ep-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ingredientes-producto-panel-ep-2"]').exists()).toBe(true)

    // Panel titles show product name and ingredient count
    const ep1 = wrapper.find('[data-testid="ingredientes-producto-panel-ep-1"]')
    expect(ep1.text()).toContain('Pan de muerto')
    // Ingredient count chip
    expect(ep1.text()).toContain('2')

    const ep2 = wrapper.find('[data-testid="ingredientes-producto-panel-ep-2"]')
    expect(ep2.text()).toContain('Galletas')
    expect(ep2.text()).toContain('1')
  })

  it('per-product table shows individual ingredient requirements', async () => {
    const wrapper = mountPanel(
      mkResultado({
        porProducto: [
          {
            eventoProductoId: 'ep-1',
            productoNombre: 'Pan de muerto',
            ingredientes: [
              {
                materiaPrimaId: 'mp-1',
                nombre: 'Harina',
                unidad: 'kg',
                requerido: 7.5,
              },
            ],
          },
        ],
      }),
    )

    // Click to expand the panel so the table renders
    const btn = wrapper.find('[data-testid="ingredientes-producto-panel-ep-1"] button')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')

    const text = wrapper.text()
    expect(text).toContain('Harina')
    expect(text).toContain('7.50')
    expect(text).toContain('kg')
  })

  // -----------------------------------------------------------------------
  // Warning badges
  // -----------------------------------------------------------------------

  it('shows yellow v-alert with advertencia details when warnings exist', () => {
    const wrapper = mountPanel(
      mkResultado({
        consolidado: [
          {
            materiaPrimaId: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            requerido: 10,
            disponible: 5,
            faltante: 5,
          },
        ],
        advertencias: [
          { codigo: 'PRODUCTO_FALTANTE', referenciaId: 'prod-no-existe' },
          { codigo: 'RECETA_FALTANTE', referenciaId: 'receta-ausente' },
        ],
      }),
    )

    const alert = wrapper.findComponent({ name: 'VAlert' })
    expect(alert.exists()).toBe(true)
    expect(alert.props('type')).toBe('warning')

    const alertText = alert.text()
    expect(alertText).toContain('2 advertencia(s)')
    expect(alertText).toContain('Producto faltante en catálogo')
    expect(alertText).toContain('Receta faltante')
    expect(alertText).toContain('prod-no-existe')
    expect(alertText).toContain('receta-ausente')
  })

  it('does not render alert when no advertencias exist', () => {
    const wrapper = mountPanel(
      mkResultado({
        consolidado: [
          {
            materiaPrimaId: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            requerido: 10,
            disponible: 5,
            faltante: 5,
          },
        ],
        advertencias: [],
      }),
    )

    expect(wrapper.findComponent({ name: 'VAlert' }).exists()).toBe(false)
  })

  // -----------------------------------------------------------------------
  // Combined scenario: consolidated + per-product + warnings together
  // -----------------------------------------------------------------------

  it('renders full panel: consolidated table + per-product panels + warnings', () => {
    const wrapper = mountPanel(
      mkResultado({
        porProducto: [
          {
            eventoProductoId: 'ep-1',
            productoNombre: 'Pan dulce',
            ingredientes: [
              { materiaPrimaId: 'mp-1', nombre: 'Harina', unidad: 'kg', requerido: 10 },
            ],
          },
        ],
        consolidado: [
          {
            materiaPrimaId: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            requerido: 10,
            disponible: 0,
            faltante: 10,
          },
        ],
        advertencias: [{ codigo: 'MATERIA_PRIMA_FALTANTE', referenciaId: 'mp-orphan' }],
      }),
    )

    // All three sections present
    expect(wrapper.find('[data-testid="ingredientes-consolidado-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ingredientes-producto-panel-ep-1"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'VAlert' }).exists()).toBe(true)

    const text = wrapper.text()
    expect(text).toContain('Resumen de compras')
    expect(text).toContain('Pan dulce')
    expect(text).toContain('Materia prima faltante en catálogo')
  })

  // -----------------------------------------------------------------------
  // Edge: empty perProducto but consolidated present (warnings only)
  // -----------------------------------------------------------------------

  it('renders consolidated panel even when porProducto is empty', () => {
    const wrapper = mountPanel(
      mkResultado({
        porProducto: [],
        consolidado: [
          {
            materiaPrimaId: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            requerido: 0,
            disponible: 0,
            faltante: 0,
          },
        ],
        advertencias: [],
      }),
    )

    expect(wrapper.find('[data-testid="ingredientes-consolidado-panel"]').exists()).toBe(true)
    // No per-product panels
    const ppPanels = wrapper.findAll('[data-testid^="ingredientes-producto-panel-"]')
    expect(ppPanels.length).toBe(0)
  })
})
