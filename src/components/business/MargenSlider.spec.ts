// REQ-PRICING-8, REQ-FIN-19: MargenSlider — reusable 0..1 margin
// slider/input with live price preview. Accepts 0..1 (DB) and
// renders 0%..90% to the user via v-slider's `model-value` in
// percentage. The conversion UI ↔ DB lives inside the component so
// the parent only sees 0..1 (REQ-FIN-19 contract).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import MargenSlider from './MargenSlider.vue'

const vuetify = createVuetify({ components, directives })

const mountSlider = (props: { modelValue: number; costo: number; disabled?: boolean }) =>
  mount(MargenSlider, {
    props,
    global: { plugins: [vuetify] },
  })

describe('MargenSlider', () => {
  it('renders the percentage (40%) and the live price ($16.67) for costo=10, modelValue=0.40', () => {
    const wrapper = mountSlider({ modelValue: 0.4, costo: 10 })

    expect(wrapper.text()).toContain('40%')
    expect(wrapper.text()).toContain('$16.67')
  })

  it('updates the displayed percentage and price when modelValue changes', async () => {
    const wrapper = mountSlider({ modelValue: 0.4, costo: 10 })

    await wrapper.setProps({ modelValue: 0.5 })
    expect(wrapper.text()).toContain('50%')
    expect(wrapper.text()).toContain('$20.00')
  })

  it('emits update:modelValue as a 0..1 decimal when the slider changes', async () => {
    const wrapper = mountSlider({ modelValue: 0.4, costo: 10 })

    // Find the slider input and trigger input event with the UI % value.
    const slider = wrapper.find('[data-testid="margen-slider-input"]')
    expect(slider.exists()).toBe(true)
    await slider.setValue(50) // UI 50%
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([0.5])
  })

  it('disables the slider when the prop is set', () => {
    const wrapper = mountSlider({ modelValue: 0.4, costo: 10, disabled: true })

    const slider = wrapper.find('[data-testid="margen-slider-input"]')
    expect(slider.exists()).toBe(true)
    expect(slider.attributes('disabled')).toBeDefined()
  })

  it('handles costo=0 without crashing — shows 0% and $0.00', () => {
    const wrapper = mountSlider({ modelValue: 0.4, costo: 0 })

    expect(wrapper.text()).toContain('40%')
    expect(wrapper.text()).toContain('$0.00')
  })
})