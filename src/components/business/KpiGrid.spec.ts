// mobile-ux-redesign Phase 2: KpiGrid component.
// Renders an array of KPI data objects in a responsive grid.
// 1 col mobile, 2 cols tablet, 4 cols web.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import KpiGrid from './KpiGrid.vue'
import type { KpiTrend } from './KpiCard.vue'

const vuetify = createVuetify({ components, directives })

interface KpiDato {
  title: string
  value: string | number
  icon: string
  color: string
  trend?: KpiTrend | null
}

const KPIS_EJEMPLO: KpiDato[] = [
  { title: 'Ventas Hoy', value: '$1,250', icon: 'mdi-cash-register', color: 'primary' },
  { title: 'Gastos Hoy', value: '$450', icon: 'mdi-file-document-edit', color: 'warning' },
  { title: 'Utilidad Est.', value: '$800', icon: 'mdi-chart-line', color: 'success' },
  { title: 'Stock Crítico', value: 3, icon: 'mdi-alert-circle', color: 'error' },
]

const mountGrid = (props = {}) =>
  mount(KpiGrid, {
    props: { kpis: KPIS_EJEMPLO, ...props },
    global: { plugins: [vuetify] },
  })

describe('KpiGrid', () => {
  it('renders the correct number of KPI cards', () => {
    const wrapper = mountGrid()
    const cards = wrapper.findAll('[data-testid="kpi-card"]')
    expect(cards).toHaveLength(4)
  })

  it('passes correct props to each KpiCard', () => {
    const wrapper = mountGrid()
    // First card — Ventas Hoy
    expect(wrapper.text()).toContain('Ventas Hoy')
    expect(wrapper.text()).toContain('$1,250')
    // Second card — Gastos Hoy
    expect(wrapper.text()).toContain('Gastos Hoy')
    expect(wrapper.text()).toContain('$450')
    // Third card — Utilidad Est.
    expect(wrapper.text()).toContain('Utilidad Est.')
    expect(wrapper.text()).toContain('$800')
    // Fourth card — Stock Crítico
    expect(wrapper.text()).toContain('Stock Crítico')
    expect(wrapper.text()).toContain('3')
  })

  it('renders responsive grid with correct number of columns', () => {
    const wrapper = mountGrid()
    // Query v-col components — Vuetify renders them as div.v-col
    // or we can verify the grid structure via data-testid
    const grid = wrapper.find('[data-testid="kpi-grid"]')
    expect(grid.exists()).toBe(true)
    // The grid renders a v-row with children
    const row = wrapper.findComponent({ name: 'VRow' })
    expect(row.exists()).toBe(true)
    const colComponents = row.findAllComponents({ name: 'VCol' })
    // We have 4 KPI data objects → expect 4 v-col children
    expect(colComponents).toHaveLength(4)
  })

  it('renders each col with data-testid for the grid', () => {
    const wrapper = mountGrid()
    expect(wrapper.find('[data-testid="kpi-grid"]').exists()).toBe(true)
  })

  it('renders an empty grid when kpis array is empty', () => {
    const wrapper = mountGrid({ kpis: [] })
    const cards = wrapper.findAll('[data-testid="kpi-card"]')
    expect(cards).toHaveLength(0)
  })

  it('handles KPIs with trend data', () => {
    const kpisConTrend: KpiDato[] = [
      { title: 'Ventas', value: '$100', icon: 'mdi-cart', color: 'primary', trend: { value: 5, label: 'ayer' } },
    ]
    const wrapper = mountGrid({ kpis: kpisConTrend })
    expect(wrapper.text()).toContain('Ventas')
    // The trend element should be rendered inside a KpiCard
    expect(wrapper.find('[data-testid="kpi-trend"]').exists()).toBe(true)
  })
})
