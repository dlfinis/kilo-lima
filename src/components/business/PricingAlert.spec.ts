// REQ-CON-7 (PR-2 brief): 3-tier pricing alert for the
// EventoProductosView. Renders a red v-alert when precio < costo
// (selling at a loss), an amber v-alert when precio < precioMinimo
// (below break-even), and nothing otherwise. The alert is purely
// advisory — saving the new price still proceeds.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import PricingAlert from './PricingAlert.vue'

const vuetify = createVuetify({ components, directives })

const mountAlert = (props: {
  precio: number
  costoProduccion: number
  precioMinimo: number | null
}) => mount(PricingAlert, { props, global: { plugins: [vuetify] } })

describe('PricingAlert (REQ-CON-7)', () => {
  it('renders a red v-alert when precio < costoProduccion (selling at loss)', () => {
    const wrapper = mountAlert({ precio: 4, costoProduccion: 5, precioMinimo: null })
    const alert = wrapper.findComponent({ name: 'VAlert' })
    expect(alert.exists()).toBe(true)
    expect(alert.props('type')).toBe('error')
    expect(wrapper.text()).toContain('por debajo del costo de producción')
    expect(wrapper.text()).toContain('5.00')
    expect(wrapper.text()).toContain('pérdida')
  })

  it('renders an amber v-alert when precio < precioMinimo (below break-even)', () => {
    const wrapper = mountAlert({ precio: 6, costoProduccion: 5, precioMinimo: 7 })
    const alert = wrapper.findComponent({ name: 'VAlert' })
    expect(alert.exists()).toBe(true)
    expect(alert.props('type')).toBe('warning')
    expect(wrapper.text()).toContain('Precio bajo')
    expect(wrapper.text()).toContain('gastos fijos')
  })

  it('renders nothing when precio >= precioMinimo and precio >= costo', () => {
    const wrapper = mountAlert({ precio: 10, costoProduccion: 5, precioMinimo: 7 })
    expect(wrapper.find('[data-testid="pricing-alert-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pricing-alert-warning"]').exists()).toBe(false)
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('renders nothing when precio >= costo and precioMinimo is null (no break-even reference)', () => {
    const wrapper = mountAlert({ precio: 6, costoProduccion: 5, precioMinimo: null })
    expect(wrapper.find('[data-testid="pricing-alert-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pricing-alert-warning"]').exists()).toBe(false)
  })

  it('red alert takes priority over amber when precio < costo AND precio < precioMinimo', () => {
    const wrapper = mountAlert({ precio: 4, costoProduccion: 5, precioMinimo: 6 })
    const error = wrapper.find('[data-testid="pricing-alert-error"]')
    const warning = wrapper.find('[data-testid="pricing-alert-warning"]')
    expect(error.exists()).toBe(true)
    expect(warning.exists()).toBe(false)
  })

  it('amber alert wins when precio covers costo but is below precioMinimo', () => {
    const wrapper = mountAlert({ precio: 5.5, costoProduccion: 5, precioMinimo: 7 })
    const error = wrapper.find('[data-testid="pricing-alert-error"]')
    const warning = wrapper.find('[data-testid="pricing-alert-warning"]')
    expect(error.exists()).toBe(false)
    expect(warning.exists()).toBe(true)
  })
})