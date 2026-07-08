// mobile-ux-redesign Phase 2: KpiCard presentational component.
// Displays a single KPI metric: icon, title, value (large), optional trend.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import KpiCard from './KpiCard.vue'

const vuetify = createVuetify({ components, directives })

const mountCard = (props = {}) =>
  mount(KpiCard, {
    props: {
      title: 'Ventas Hoy',
      value: '$1,250',
      icon: 'mdi-cash-register',
      color: 'primary',
      ...props,
    },
    global: { plugins: [vuetify] },
  })

describe('KpiCard', () => {
  it('displays title and value', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Ventas Hoy')
    expect(wrapper.text()).toContain('$1,250')
  })

  it('displays the icon', () => {
    const wrapper = mountCard({ icon: 'mdi-chart-line' })
    // Vuetify renders v-icon as an element containing the mdi class
    expect(wrapper.find('.mdi-chart-line').exists()).toBe(true)
  })

  it('displays numeric values correctly', () => {
    const wrapper = mountCard({ title: 'Stock', value: 42 })
    expect(wrapper.text()).toContain('Stock')
    expect(wrapper.text()).toContain('42')
  })

  it('displays trend with up arrow when trend value is positive', () => {
    const wrapper = mountCard({
      trend: { value: 12.5, label: 'vs ayer' },
    })
    const trendEl = wrapper.find('[data-testid="kpi-trend"]')
    expect(trendEl.exists()).toBe(true)
    expect(trendEl.text()).toContain('12.5')
    expect(trendEl.text()).toContain('vs ayer')
    // Up arrow icon for positive trend
    expect(wrapper.find('.mdi-arrow-up').exists()).toBe(true)
  })

  it('displays trend with down arrow when trend value is negative', () => {
    const wrapper = mountCard({
      trend: { value: -5, label: 'vs ayer' },
    })
    expect(wrapper.find('[data-testid="kpi-trend"]').exists()).toBe(true)
    // Down arrow icon for negative trend
    expect(wrapper.find('.mdi-arrow-down').exists()).toBe(true)
  })

  it('uses green color for positive trend', () => {
    const wrapper = mountCard({
      trend: { value: 10, label: 'ayer' },
    })
    const trendEl = wrapper.find('[data-testid="kpi-trend"]')
    expect(trendEl.exists()).toBe(true)
    expect(trendEl.classes()).toContain('text-success')
  })

  it('uses red color for negative trend', () => {
    const wrapper = mountCard({
      trend: { value: -3, label: 'ayer' },
    })
    const trendEl = wrapper.find('[data-testid="kpi-trend"]')
    expect(trendEl.exists()).toBe(true)
    expect(trendEl.classes()).toContain('text-error')
  })

  it('hides trend when not provided', () => {
    const wrapper = mountCard({ trend: undefined })
    expect(wrapper.find('[data-testid="kpi-trend"]').exists()).toBe(false)
  })

  it('applies the color prop to the card', () => {
    const wrapper = mountCard({ color: 'warning' })
    // Vuetify variant="tonal" applies the color through the card
    const card = wrapper.find('[data-testid="kpi-card"]')
    expect(card.exists()).toBe(true)
    // The color is applied via Vuetify's color prop — verify the
    // rendered HTML contains the color reference (Vuetify uses it
    // for tonal variant styling)
    expect(wrapper.html()).toContain('warning')
  })

  it('renders with the value displayed prominently', () => {
    const wrapper = mountCard({ value: '$99,999' })
    const valueEl = wrapper.find('[data-testid="kpi-value"]')
    expect(valueEl.exists()).toBe(true)
    expect(valueEl.text()).toContain('$99,999')
    // Value should be large and bold
    expect(valueEl.classes()).toContain('text-h4')
  })
})
