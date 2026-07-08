// mobile-ux-redesign Phase 5: Placeholder view tests.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as comps from 'vuetify/components'
import * as dirs from 'vuetify/directives'

import ContabilidadView from '@/views/ContabilidadView.vue'
import RentabilidadView from '@/views/RentabilidadView.vue'

const vuetify = createVuetify({ components: comps, directives: dirs })

describe('ContabilidadView', () => {
  it('renders without errors', () => {
    const wrapper = mount(ContabilidadView, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('shows placeholder content', () => {
    const wrapper = mount(ContabilidadView, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Contabilidad')
  })
})

describe('RentabilidadView', () => {
  it('renders without errors', () => {
    const wrapper = mount(RentabilidadView, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('shows placeholder content', () => {
    const wrapper = mount(RentabilidadView, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Rentabilidad')
  })
})
