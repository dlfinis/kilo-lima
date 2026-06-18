// REQ-EVENTS-15, REQ-EVENTS-17, REQ-EVENTS-43: SelectorReceta wraps
// `v-autocomplete` for picking one receta. Separate file from
// SelectorMateriaPrima per ISP (REQ-EVENTS-43) — different domain,
// no shared prop coupling. The component emits `select` with the
// full Receta (per design §6 spec — caller can read `costoPorUnidad`
// directly without a second lookup). The component also emits
// `update:modelValue` with the receta_id so the parent can use
// v-model without binding to the full object.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import SelectorReceta from './SelectorReceta.vue'
import type { RecetaConIngredientes } from '@/types'

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

const mountSelector = (
  props: { modelValue?: string | null; recetas?: RecetaConIngredientes[]; excludeIds?: string[] } = {},
) => {
  setActivePinia(createPinia())
  return mount(SelectorReceta, {
    props: {
      modelValue: props.modelValue ?? null,
      recetas: props.recetas ?? [],
      excludeIds: props.excludeIds ?? [],
    },
    global: { plugins: [vuetify] },
  })
}

describe('SelectorReceta', () => {
  it('renders a v-autocomplete bound to modelValue with one item per receta (REQ-EVENTS-15, REQ-EVENTS-43)', () => {
    const recetas = [mkReceta('r-1', { nombre: 'Pan de muerto' })]
    const wrapper = mountSelector({ recetas })

    const auto = wrapper.findComponent({ name: 'VAutocomplete' })
    expect(auto.exists()).toBe(true)
    expect(auto.props('items')).toEqual([
      expect.objectContaining({ title: 'Pan de muerto', value: 'r-1' }),
    ])
  })

  it('emits update:modelValue with the receta id and select with the full Receta (REQ-EVENTS-15)', async () => {
    const recetas = [
      mkReceta('r-1', { nombre: 'Pan de muerto' }),
      mkReceta('r-2', { nombre: 'Galletas' }),
    ]
    const wrapper = mountSelector({ recetas })
    const auto = wrapper.findComponent({ name: 'VAutocomplete' })

    await auto.vm.$emit('update:modelValue', 'r-2')

    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    expect(updates?.[0]).toEqual(['r-2'])

    const selects = wrapper.emitted('select')
    expect(selects).toBeTruthy()
    expect(selects?.[0]?.[0]).toEqual(
      expect.objectContaining({ id: 'r-2', nombre: 'Galletas' }),
    )
  })

  it('filters out recetas whose id is in excludeIds from the items list (REQ-EVENTS-17)', () => {
    const recetas = [
      mkReceta('r-1', { nombre: 'Pan de muerto' }),
      mkReceta('r-2', { nombre: 'Galletas' }),
      mkReceta('r-3', { nombre: 'Bizcochos' }),
    ]
    const wrapper = mountSelector({ recetas, excludeIds: ['r-1', 'r-3'] })

    const auto = wrapper.findComponent({ name: 'VAutocomplete' })
    const items = auto.props('items') as { title: string; value: string }[]
    expect(items.map((it) => it.value)).toEqual(['r-2'])
  })
})