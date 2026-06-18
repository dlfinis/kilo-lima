// REQ-POS-37, REQ-POS-39, REQ-POS-54: presentational row for the
// gastos imprevistos list. Renders categoria label + motivo + monto.
// `editable=false` hides the delete button.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import GastoImprevistoListItem from './GastoImprevistoListItem.vue'
import type { GastoImprevisto } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkGasto = (overrides: Partial<GastoImprevisto> = {}): GastoImprevisto => ({
  id: 'gi-1',
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  created_at: '2026-06-19T11:00:00Z',
  ...overrides,
})

const mountItem = (props: { gasto: GastoImprevisto; editable?: boolean }) =>
  mount(GastoImprevistoListItem, {
    props: { gasto: props.gasto, editable: props.editable ?? true },
    global: { plugins: [vuetify] },
  })

describe('GastoImprevistoListItem', () => {
  it('renders categoria label, motivo, and monto (REQ-POS-37)', () => {
    const wrapper = mountItem({ gasto: mkGasto({ monto: 75 }) })

    expect(wrapper.text()).toContain('Insumos extra')
    expect(wrapper.text()).toContain('Compramos más vasos')
    expect(wrapper.text()).toMatch(/75[.,]00/)
  })

  it('falls back to "Sin categoría" when categoria is null (REQ-POS-37)', () => {
    const wrapper = mountItem({ gasto: mkGasto({ categoria: null }) })

    expect(wrapper.text()).toContain('Sin categoría')
  })

  it('emits eliminar when the delete button fires (REQ-POS-37)', async () => {
    const wrapper = mountItem({ gasto: mkGasto() })

    await wrapper.find('[data-testid="imprevisto-eliminar-gi-1"]').trigger('click')

    expect(wrapper.emitted('eliminar')).toBeTruthy()
    expect(wrapper.emitted('eliminar')?.[0]).toEqual(['gi-1'])
  })

  it('hides the delete button when editable is false (REQ-POS-39)', () => {
    const wrapper = mountItem({ gasto: mkGasto(), editable: false })

    expect(wrapper.find('[data-testid="imprevisto-eliminar-gi-1"]').exists()).toBe(false)
  })
})