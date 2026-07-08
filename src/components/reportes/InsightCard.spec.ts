// mobile-ux-redesign Phase 5: InsightCard presentational component.
// Displays a single plain-language insight: icon, phrase (large),
// color-coded background, and navigates to detailRoute on click.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createWebHistory } from 'vue-router'

import InsightCard from './InsightCard.vue'

const vuetify = createVuetify({ components, directives })

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/reportes/contabilidad', name: 'contabilidad', component: { template: '<div>Contabilidad</div>' } },
    { path: '/reportes/rentabilidad', name: 'rentabilidad', component: { template: '<div>Rentabilidad</div>' } },
    { path: '/reportes', name: 'reportes', component: { template: '<div>Reportes</div>' } },
  ],
})

const mountCard = (props = {}) =>
  mount(InsightCard, {
    props: {
      phrase: 'Ganaste S/ 150.00 hoy',
      color: 'green',
      icon: 'mdi-cash',
      detailRoute: '/reportes/contabilidad',
      ...props,
    },
    global: { plugins: [vuetify, router] },
  })

describe('InsightCard', () => {
  it('displays the phrase prominently', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Ganaste S/ 150.00 hoy')
  })

  it('displays the icon', () => {
    const wrapper = mountCard({ icon: 'mdi-trophy' })
    expect(wrapper.find('.mdi-trophy').exists()).toBe(true)
  })

  it('applies green color styling', () => {
    const wrapper = mountCard({ color: 'green' })
    // The color prop should be reflected in Vuetify's color classes
    expect(wrapper.html()).toContain('success')
  })

  it('applies yellow color styling', () => {
    const wrapper = mountCard({ color: 'yellow' })
    expect(wrapper.html()).toContain('warning')
  })

  it('applies red color styling', () => {
    const wrapper = mountCard({ color: 'red' })
    expect(wrapper.html()).toContain('error')
  })

  it('has correct aria-label with the phrase', () => {
    const wrapper = mountCard({ phrase: 'Ventas totales: S/ 500.00' })
    const card = wrapper.find('[data-testid="insight-card"]')
    expect(card.attributes('aria-label')).toBe('Ventas totales: S/ 500.00')
  })

  it('is clickable and navigates to detailRoute', async () => {
    const wrapper = mountCard({ detailRoute: '/reportes/rentabilidad' })
    const card = wrapper.find('[data-testid="insight-card"]')
    expect(card.exists()).toBe(true)
    // The card should be clickable (rendered as a router-link or clickable)
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/reportes/rentabilidad')
  })

  it('renders phrase as large text', () => {
    const wrapper = mountCard()
    const phraseEl = wrapper.find('[data-testid="insight-phrase"]')
    expect(phraseEl.exists()).toBe(true)
    expect(phraseEl.text()).toContain('Ganaste S/ 150.00 hoy')
  })
})
