// mobile-ux-redesign Phase 5: ReportesLayout with sub-navigation tabs.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as comps from 'vuetify/components'
import * as dirs from 'vuetify/directives'
import { createRouter, createWebHistory } from 'vue-router'

import ReportesLayout from '@/components/layout/ReportesLayout.vue'

const vuetify = createVuetify({ components: comps, directives: dirs })
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/reportes',
      component: ReportesLayout,
      children: [
        { path: '', name: 'reportes-resumen', component: { template: '<div>Resumen</div>' } },
        { path: 'contabilidad', name: 'reportes-contabilidad', component: { template: '<div>Contabilidad</div>' } },
        { path: 'rentabilidad', name: 'reportes-rentabilidad', component: { template: '<div>Rentabilidad</div>' } },
      ],
    },
  ],
})

describe('ReportesLayout', () => {
  it('renders sub-navigation with 3 tabs', async () => {
    await router.push('/reportes')
    const wrapper = mount(ReportesLayout, {
      global: { plugins: [vuetify, router] },
    })
    const tabs = wrapper.findAll('.v-tab')
    expect(tabs.length).toBeGreaterThanOrEqual(3)
  })

  it('has Resumen, Contabilidad, Rentabilidad tabs', async () => {
    await router.push('/reportes')
    const wrapper = mount(ReportesLayout, {
      global: { plugins: [vuetify, router] },
    })
    const text = wrapper.text()
    expect(text).toContain('Resumen')
    expect(text).toContain('Contabilidad')
    expect(text).toContain('Rentabilidad')
  })

  it('renders router-view for child routes', async () => {
    await router.push('/reportes')
    const wrapper = mount(ReportesLayout, {
      global: { plugins: [vuetify, router] },
    })
    // Vuetify tabs with router integration should have an active tab
    expect(wrapper.find('.v-tab--selected').exists()).toBe(true)
  })
})
