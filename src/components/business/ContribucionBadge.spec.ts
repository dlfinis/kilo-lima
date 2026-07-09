// REQ-CON-6 (PR-2 brief): color-coded v-chip rendering the monetary
// contribution per producto. Green when contribution >= 0 (selling
// above cost), red when < 0 (selling at a loss). The chip is purely
// presentational — the parent (ProductoCard / PosView) decides what
// data to feed it.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ContribucionBadge from './ContribucionBadge.vue'

const vuetify = createVuetify({ components, directives })

const mountBadge = (contribucion: number) =>
  mount(ContribucionBadge, {
    props: { contribucion },
    global: { plugins: [vuetify] },
  })

describe('ContribucionBadge (REQ-CON-6)', () => {
  it('renders the chip with formatted USD contribution when contribucion > 0', () => {
    const wrapper = mountBadge(3.33)
    const chip = wrapper.find('[data-testid="contribucion-badge"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('Contribución')
    expect(chip.text()).toContain('3.33')
  })

  it('renders red color when contribucion < 0 (selling at a loss)', () => {
    const wrapper = mountBadge(-1.5)
    const chip = wrapper.findComponent({ name: 'VChip' })
    expect(chip.exists()).toBe(true)
    expect(chip.props('color')).toBe('error')
  })

  it('renders green color when contribucion >= 0 (covers cost or better)', () => {
    const wrapper = mountBadge(0)
    const chip = wrapper.findComponent({ name: 'VChip' })
    expect(chip.exists()).toBe(true)
    expect(chip.props('color')).toBe('success')
  })

  it('renders green color when contribucion is positive', () => {
    const wrapper = mountBadge(5)
    const chip = wrapper.findComponent({ name: 'VChip' })
    expect(chip.exists()).toBe(true)
    expect(chip.props('color')).toBe('success')
  })

  it('formats the contribution using the shared formatearUSD helper', () => {
    const wrapper = mountBadge(1234.5)
    expect(wrapper.text()).toContain('1234.50')
  })
})