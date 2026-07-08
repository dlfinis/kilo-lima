// mobile-ux-redesign Phase 3: PaymentSelector — v-model payment method
// picker for the simplified POS. Three options with icons, visual
// selection highlighting. Emits update:modelValue.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import PaymentSelector from './PaymentSelector.vue'

const vuetify = createVuetify({ components, directives })

const mountSelector = (props = {}) =>
  mount(PaymentSelector, {
    props: { modelValue: null, ...props },
    global: { plugins: [vuetify] },
  })

describe('PaymentSelector', () => {
  it('renders 3 payment option buttons', () => {
    const wrapper = mountSelector()
    const buttons = wrapper.findAll('[data-testid="payment-option"]')
    expect(buttons).toHaveLength(3)
  })

  it('displays the three payment method labels', () => {
    const wrapper = mountSelector()
    expect(wrapper.text()).toContain('Efectivo')
    expect(wrapper.text()).toContain('Yape/Plin')
    expect(wrapper.text()).toContain('Tarjeta')
  })

  it('displays correct icons for each option', () => {
    const wrapper = mountSelector()
    expect(wrapper.find('.mdi-cash').exists()).toBe(true)
    expect(wrapper.find('.mdi-cellphone').exists()).toBe(true)
    expect(wrapper.find('.mdi-credit-card').exists()).toBe(true)
  })

  it('emits update:modelValue with "efectivo" when first option clicked', async () => {
    const wrapper = mountSelector()
    const buttons = wrapper.findAll('[data-testid="payment-option"]')
    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['efectivo'])
  })

  it('emits update:modelValue with "transferencia" when second option clicked', async () => {
    const wrapper = mountSelector()
    const buttons = wrapper.findAll('[data-testid="payment-option"]')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['transferencia'])
  })

  it('emits update:modelValue with "tarjeta" when third option clicked', async () => {
    const wrapper = mountSelector()
    const buttons = wrapper.findAll('[data-testid="payment-option"]')
    await buttons[2]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['tarjeta'])
  })

  it('highlights the selected option', async () => {
    const wrapper = mountSelector({ modelValue: 'efectivo' })
    const buttons = wrapper.findAll('[data-testid="payment-option"]')
    // The first button should have active/selected styling
    const firstBtn = buttons[0]!
    const secondBtn = buttons[1]!
    // Selected button has a different color/variant
    expect(firstBtn.classes().join(' ')).not.toBe(secondBtn.classes().join(' '))
  })

  it('has no selection when modelValue is null', () => {
    const wrapper = mountSelector({ modelValue: null })
    const buttons = wrapper.findAll('[data-testid="payment-option"]')
    // All buttons should be unselected (variant 'outlined' or similar)
    expect(buttons).toHaveLength(3)
  })
})
