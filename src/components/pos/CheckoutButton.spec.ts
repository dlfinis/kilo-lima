// mobile-ux-redesign Phase 3: CheckoutButton — prominent "Cobrar"
// button for the simplified POS flow. Shows total, respects disabled
// prop, emits checkout.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import CheckoutButton from './CheckoutButton.vue'

const vuetify = createVuetify({ components, directives })

const mountBtn = (props = {}) =>
  mount(CheckoutButton, {
    props: { disabled: false, total: 45.0, ...props },
    global: { plugins: [vuetify] },
  })

describe('CheckoutButton', () => {
  it('displays "Cobrar" text', () => {
    const wrapper = mountBtn()
    expect(wrapper.text()).toContain('Cobrar')
  })

  it('displays the total amount formatted', () => {
    const wrapper = mountBtn({ total: 45.0 })
    expect(wrapper.text()).toContain('45.00')
  })

  it('formats totals with decimals', () => {
    const wrapper = mountBtn({ total: 12.5 })
    expect(wrapper.text()).toContain('12.50')
  })

  it('emits checkout event when clicked', async () => {
    const wrapper = mountBtn({ disabled: false })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('checkout')).toBeTruthy()
  })

  it('does not emit checkout when disabled', async () => {
    const wrapper = mountBtn({ disabled: true })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('checkout')).toBeFalsy()
  })

  it('renders as block (full width on mobile)', () => {
    const wrapper = mountBtn()
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    // Vuetify's v-btn with block prop should have btn-block class
    expect(btn.classes()).toContain('v-btn--block')
  })

  it('uses accent color (orange — the brief\'s "color de ventas")', () => {
    const wrapper = mountBtn()
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    // Vuetify accent class variant uses bg-accent
    expect(btn.classes().some((c) => c.includes('bg-accent'))).toBe(true)
  })

  it('renders with large sizing', () => {
    const wrapper = mountBtn()
    const btn = wrapper.find('button')
    expect(btn.classes()).toContain('v-btn--size-large')
  })

  it('shows disabled hint caption when disabled and hint is provided', () => {
    const wrapper = mountBtn({
      disabled: true,
      disabledHint: 'Agregar productos al carrito',
    })
    const hint = wrapper.find('[data-testid="checkout-disabled-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('Agregar productos al carrito')
  })

  it('does not show disabled hint caption when enabled', () => {
    const wrapper = mountBtn({
      disabled: false,
      disabledHint: 'Agregar productos al carrito',
    })
    expect(wrapper.find('[data-testid="checkout-disabled-hint"]').exists()).toBe(false)
  })
})
