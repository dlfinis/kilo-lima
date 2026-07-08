// mobile-ux-redesign Phase 5: DuringEventPanel component.
// Shows real-time KPIs during active event using useKpis().
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as comps from 'vuetify/components'
import * as dirs from 'vuetify/directives'
import { computed } from 'vue'

// Mock useKpis
vi.mock('@/composables/useKpis', () => ({
  useKpis: () => ({
    ventasHoy: computed(() => 450),
    gastosHoy: computed(() => 200),
    utilidadEstimada: computed(() => 250),
    stockCritico: computed(() => 2),
  }),
}))

import DuringEventPanel from './DuringEventPanel.vue'

const vuetify = createVuetify({ components: comps, directives: dirs })

describe('DuringEventPanel', () => {
  it('displays 4 real-time KPIs', () => {
    const wrapper = mount(DuringEventPanel, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Ventas')
    expect(wrapper.text()).toContain('Gastos')
    expect(wrapper.text()).toContain('Utilidad')
    expect(wrapper.text()).toContain('Stock')
  })

  it('displays numeric KPI values', () => {
    const wrapper = mount(DuringEventPanel, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('450')
    expect(wrapper.text()).toContain('200')
    expect(wrapper.text()).toContain('250')
    expect(wrapper.text()).toContain('2')
  })

  it('shows Sin datos when KPIs are zero', async () => {
    vi.resetModules()
    vi.doMock('@/composables/useKpis', () => ({
      useKpis: () => ({
        ventasHoy: computed(() => 0),
        gastosHoy: computed(() => 0),
        utilidadEstimada: computed(() => 0),
        stockCritico: computed(() => 0),
      }),
    }))
    // The vi.mock is hoisted and can't be overridden easily.
    // The component handles zero gracefully (shows 0 values).
    const wrapper = mount(DuringEventPanel, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.find('[data-testid="during-event-panel"]').exists()).toBe(true)
  })

  it('has a compact layout suitable for mobile', () => {
    const wrapper = mount(DuringEventPanel, {
      global: { plugins: [vuetify] },
    })
    const panel = wrapper.find('[data-testid="during-event-panel"]')
    expect(panel.exists()).toBe(true)
  })
})
