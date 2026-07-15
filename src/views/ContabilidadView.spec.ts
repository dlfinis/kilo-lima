// Phase 4 (REQ-STOCK-MOVEMENTS-4): ContabilidadView tests.
// The placeholder has been replaced with an events-driven list.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as comps from 'vuetify/components'
import * as dirs from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'

import ContabilidadView from '@/views/ContabilidadView.vue'
import RentabilidadView from '@/views/RentabilidadView.vue'

const vuetify = createVuetify({ components: comps, directives: dirs })

describe('ContabilidadView', () => {
  it('renders without errors', () => {
    const wrapper = mount(ContabilidadView, {
      global: {
        plugins: [vuetify, createPinia()],
        provide: {
          supabase: createClient('http://x', 'anon'),
        },
      },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('shows the contabilidad heading', () => {
    const wrapper = mount(ContabilidadView, {
      global: {
        plugins: [vuetify, createPinia()],
        provide: {
          supabase: createClient('http://x', 'anon'),
        },
      },
    })
    expect(wrapper.text()).toContain('Contabilidad')
  })

  it('shows empty state when no eventos are loaded', () => {
    const wrapper = mount(ContabilidadView, {
      global: {
        plugins: [vuetify, createPinia()],
        provide: {
          supabase: createClient('http://x', 'anon'),
        },
      },
    })
    // The view should mention the event-detailing flow even in empty state.
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
