// plan-fila-layout: one row in the plan grid. Three-zone CSS grid
// (identity, units, cost) with a stable data-testid per zone. The
// row shows the commercial product name as primary identity when
// available, the preparation name as secondary context, and keeps
// production cost as the dominant economic signal. Optional pricing
// chips (event price + margin) render only when valid data exists.
//
// The `update` and `eliminar` emits remain unchanged — the save
// contract with the grid is preserved (REQ-EVENTS-15, REQ-EVENTS-19).
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import PlanProduccionRow from './PlanProduccionRow.vue'
import type {
  EventoProductoConDetalle,
  PlanProduccionInput,
  RecetaConIngredientes,
} from '@/types'

const vuetify = createVuetify({ components, directives })

// Helper produces an enriched row option matching the grid's
// `RecetaPlanOption` shape. The extra fields are optional on the
// row's prop, so plain `RecetaConIngredientes` still works for
// backward-compatible tests.
const mkReceta = (
  id: string,
  overrides: Partial<RecetaConIngredientes> & {
    recetaNombre?: string
    productoId?: string | null
    productoNombre?: string | null
  } = {},
): RecetaConIngredientes & {
  recetaNombre?: string
  productoId?: string | null
  productoNombre?: string | null
} => ({
  id,
  nombre: id,
  descripcion: null,
  rendimiento_unidades: 4,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ingredientes: [],
  ...overrides,
})

const mkFila = (overrides: Partial<PlanProduccionInput> = {}): PlanProduccionInput => ({
  evento_id: 'e-1',
  receta_id: 'r-1',
  unidades_a_producir: 1,
  ...overrides,
})

const mkPricingEntry = (
  overrides: Partial<EventoProductoConDetalle> = {},
): EventoProductoConDetalle => ({
  id: 'ep-1',
  evento_id: 'e-1',
  producto_id: 'p-1',
  precio_venta: null,
  margen: null,
  incluido: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  producto_nombre: 'Pan de muerto 6-pack',
  producto_categoria: null,
  receta_id: 'r-1',
  receta_nombre: 'Pan de muerto',
  costo_unitario: 3,
  precio_sugerido: 5,
  margen_efectivo: 0.4,
  precio_final: 5,
  producto_icono: null,
  producto_color: null,
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

const mountRow = (props: {
  fila?: PlanProduccionInput
  recetas?: (RecetaConIngredientes & {
    recetaNombre?: string
    productoId?: string | null
    productoNombre?: string | null
  })[]
  costoLinea?: number
  costoUnitario?: number
  editable?: boolean
  pricingData?: EventoProductoConDetalle[]
}) =>
  mount(PlanProduccionRow, {
    props: {
      fila: props.fila ?? mkFila(),
      recetas: props.recetas ?? [],
      costoLinea: props.costoLinea ?? 0,
      costoUnitario: props.costoUnitario ?? 0,
      editable: props.editable ?? true,
      pricingData: props.pricingData,
    },
    global: { plugins: [vuetify] },
  })

describe('PlanProduccionRow', () => {
  it('renders the three zone structure: identity, units, and cost (plan-fila-layout)', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const wrapper = mountRow({ recetas, costoLinea: 15, costoUnitario: 3 })

    expect(wrapper.find('[data-testid="plan-fila-identity"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-fila-unidades"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-fila-costo"]').exists()).toBe(true)
    // The cost zone shows the dominant total production cost.
    const costZone = wrapper.find('[data-testid="plan-fila-costo"]').text()
    expect(costZone).toContain('15.00')
    // Unit cost is visible as supporting context.
    expect(costZone).toContain('3.00')
  })

  it('shows the secondary identity label when a commercial product exists', () => {
    const recetas = [
      mkReceta('r-1', {
        nombre: 'Pan de muerto 6-pack',
        recetaNombre: 'Pan de muerto',
        productoId: 'p-1',
        productoNombre: 'Pan de muerto 6-pack',
      }),
    ]
    const wrapper = mountRow({ recetas, costoLinea: 15 })

    // The secondary line shows the preparation name.
    const secondary = wrapper.find('.plan-fila-secondary')
    expect(secondary.exists()).toBe(true)
    expect(secondary.text()).toBe('Pan de muerto')
  })

  it('does not show a secondary identity label when no product exists', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const wrapper = mountRow({ recetas, costoLinea: 15 })

    expect(wrapper.find('.plan-fila-secondary').exists()).toBe(false)
  })

  it('shows the missing-product badge when editable is false and no product is linked', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto', productoId: null })]
    const wrapper = mountRow({ recetas, costoLinea: 15, editable: false })

    expect(wrapper.find('[data-testid="plan-fila-sin-producto"]').exists()).toBe(true)
  })

  it('hides the missing-product badge when editable is true', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto', productoId: null })]
    const wrapper = mountRow({ recetas, costoLinea: 15, editable: true })

    expect(wrapper.find('[data-testid="plan-fila-sin-producto"]').exists()).toBe(false)
  })

  it('renders pricing chips when pricingData matches the row receta_id', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const pricingData = [mkPricingEntry({ receta_id: 'r-1', precio_final: 8, costo_unitario: 3 })]
    const wrapper = mountRow({ recetas, costoLinea: 15, pricingData })

    expect(wrapper.find('[data-testid="plan-fila-precio-evento"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-fila-precio-evento"]').text()).toContain('8.00')
    expect(wrapper.find('[data-testid="plan-fila-contribucion"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-fila-contribucion"]').text()).toContain('5.00')
  })

  it('omits pricing chips when pricingData is undefined', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const wrapper = mountRow({ recetas, costoLinea: 15 })

    expect(wrapper.find('[data-testid="plan-fila-precio-evento"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="plan-fila-contribucion"]').exists()).toBe(false)
  })

  it('omits pricing chips when no pricingData entry matches the row receta_id', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const pricingData = [mkPricingEntry({ receta_id: 'r-other', precio_final: 8 })]
    const wrapper = mountRow({ recetas, costoLinea: 15, pricingData })

    expect(wrapper.find('[data-testid="plan-fila-precio-evento"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="plan-fila-contribucion"]').exists()).toBe(false)
  })

  it('omits pricing chips when precio_final is zero or NaN', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const pricingData = [mkPricingEntry({ receta_id: 'r-1', precio_final: 0 })]
    const wrapper = mountRow({ recetas, costoLinea: 15, pricingData })

    expect(wrapper.find('[data-testid="plan-fila-precio-evento"]').exists()).toBe(false)
  })

  it('emits update with the patched fila when unidades changes (REQ-EVENTS-15)', async () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const wrapper = mountRow({ recetas, costoLinea: 0 })
    const unidadesInput = wrapper.find('[data-testid="plan-fila-unidades"] input')

    await unidadesInput.setValue('5')

    const updates = wrapper.emitted('update')
    expect(updates).toBeTruthy()
    const payload = updates?.[0]?.[0] as PlanProduccionInput
    expect(payload.unidades_a_producir).toBe(5)
    expect(payload.receta_id).toBe('r-1')
  })

  it('hides the delete button when editable is false (REQ-EVENTS-16)', () => {
    const recetas = [mkReceta('r-1')]
    const wrapper = mountRow({ recetas, costoLinea: 0, editable: false })

    expect(wrapper.find('[data-testid="plan-fila-eliminar"]').exists()).toBe(false)
  })

  it('emits eliminar with the row identifier when the delete button is clicked (REQ-EVENTS-15)', async () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const wrapper = mountRow({ recetas, costoLinea: 0 })
    const eliminarBtn = wrapper.find('[data-testid="plan-fila-eliminar"]')

    await eliminarBtn.trigger('click')

    expect(wrapper.emitted('eliminar')).toBeTruthy()
    expect(wrapper.emitted('eliminar')?.[0]?.[0]).toBe('r-1')
  })
})
