// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-18: one row in the plan
// grid. The row pairs a SelectorReceta with a `unidades_a_producir`
// number input and renders the live cost formula "× {unidades} =
// ${costoLinea}" so the user sees the impact of their quantity
// decision before saving (REQ-EVENTS-18). The delete button is
// hidden when `editable` is false so the row is read-only on
// cerrado eventos (REQ-EVENTS-16).
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import PlanProduccionRow from './PlanProduccionRow.vue'
import type { PlanProduccionInput, RecetaConIngredientes } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkReceta = (id: string, overrides: Partial<RecetaConIngredientes> = {}): RecetaConIngredientes => ({
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

beforeEach(() => {
  setActivePinia(createPinia())
})

const mountRow = (props: {
  fila?: PlanProduccionInput
  recetas?: RecetaConIngredientes[]
  costoLinea?: number
  editable?: boolean
}) =>
  mount(PlanProduccionRow, {
    props: {
      fila: props.fila ?? mkFila(),
      recetas: props.recetas ?? [],
      costoLinea: props.costoLinea ?? 0,
      editable: props.editable ?? true,
    },
    global: { plugins: [vuetify] },
  })

describe('PlanProduccionRow', () => {
  it('renders SelectorReceta + unidades input + the live cost display (REQ-EVENTS-15, REQ-EVENTS-18)', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const wrapper = mountRow({ recetas, costoLinea: 15 })

    expect(wrapper.findComponent({ name: 'SelectorReceta' }).exists()).toBe(true)
    expect(wrapper.find('[data-testid="plan-fila-unidades"]').exists()).toBe(true)
    // The live cost formula appears as text. es-MX USD rendering uses
    // "USD" rather than "$" in the jsdom Intl environment, so we
    // assert the numeric value + the multiplier.
    const formula = wrapper.find('[data-testid="plan-fila-costo"]').text()
    expect(formula).toContain('× 1')
    expect(formula).toContain('15.00')
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
    expect(wrapper.emitted('eliminar')?.[0]).toBeTruthy()
  })

  it('passes an empty excludeIds so the pre-populated row keeps its selected receta visible', () => {
    const recetas = [
      mkReceta('r-1', { nombre: 'Pan de muerto' }),
      mkReceta('r-2', { nombre: 'Galletas' }),
    ]
    const fila = mkFila({ receta_id: 'r-1' })
    const wrapper = mountRow({ fila, recetas, costoLinea: 0 })

    const selector = wrapper.findComponent({ name: 'SelectorReceta' })
    expect(selector.props('modelValue')).toBe('r-1')
    expect(selector.props('excludeIds')).toEqual([])
    // The selected receta must be present in the selector's items so
    // the autocomplete can render its title (not blank).
    const items = selector.props('recetas') as RecetaConIngredientes[]
    expect(items.find((r) => r.id === 'r-1')?.nombre).toBe('Pan de muerto')
  })
})