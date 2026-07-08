// mobile-ux-redesign Phase 5: InsightsBanner component.
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createWebHistory } from 'vue-router'
import { computed } from 'vue'

const mockInsights = computed(() => [
  { phrase: 'Ganaste S/ 150.00 hoy', color: 'green' as const, icon: 'mdi-cash', detailRoute: '/reportes/contabilidad' },
  { phrase: 'Tu margen fue 60%', color: 'green' as const, icon: 'mdi-percent', detailRoute: '/reportes/rentabilidad' },
  { phrase: 'Producto más vendido: #p-1', color: 'yellow' as const, icon: 'mdi-trophy', detailRoute: '/reportes/rentabilidad' },
  { phrase: 'Mayor gasto: Alquiler (S/ 150.00)', color: 'yellow' as const, icon: 'mdi-cash-minus', detailRoute: '/reportes/contabilidad' },
])

vi.mock('@/composables/useInsights', () => ({
  useInsights: () => ({
    insights: mockInsights,
  }),
}))

import InsightsBanner from './InsightsBanner.vue'

const vuetify = createVuetify({ components, directives })
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/reportes', name: 'reportes', component: { template: '<div>Reportes</div>' } },
    { path: '/reportes/contabilidad', name: 'contabilidad', component: { template: '<div>C</div>' } },
    { path: '/reportes/rentabilidad', name: 'rentabilidad', component: { template: '<div>R</div>' } },
  ],
})

describe('InsightsBanner', () => {
  it('renders correct number of insight cards', () => {
    const wrapper = mount(InsightsBanner, {
      global: { plugins: [vuetify, router] },
    })
    const cards = wrapper.findAll('[data-testid="insight-card"]')
    expect(cards).toHaveLength(4)
  })

  it('passes correct props to each InsightCard', () => {
    const wrapper = mount(InsightsBanner, {
      global: { plugins: [vuetify, router] },
    })
    expect(wrapper.text()).toContain('Ganaste S/ 150.00 hoy')
    expect(wrapper.text()).toContain('Tu margen fue 60%')
    expect(wrapper.text()).toContain('Producto más vendido')
    expect(wrapper.text()).toContain('Mayor gasto')
  })

  it('renders responsive grid with correct classes', () => {
    const wrapper = mount(InsightsBanner, {
      global: { plugins: [vuetify, router] },
    })
    const rows = wrapper.findAll('.v-row')
    expect(rows.length).toBeGreaterThan(0)
  })
})
