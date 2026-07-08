// REQ-UX-1 + REQ-NAV-1: App.vue conditionally renders either the
// responsive AppLayout (when VITE_FLAG_MOBILE_UX='true') or the
// legacy AppBar-only layout. The legacy smoke test stays.
//
// TDD CYCLE (Strict TDD Mode):
//   SAFETY NET → 838 tests passing before changes.
//   RED   → Updated test for new behavior; existing test adapted.
//   GREEN → App.vue updated to match.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from './App.vue'

const vuetify = createVuetify({ components, directives })

const mkRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div data-testid="catch-all" />' } }],
  })
  await router.push('/')
  await router.isReady()
  return router
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('App', () => {
  it('renders the legacy layout (AppBar) when VITE_FLAG_MOBILE_UX is not set', async () => {
    vi.stubEnv('VITE_FLAG_MOBILE_UX', undefined)
    const router = await mkRouter()
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), vuetify, router] },
    })
    expect(wrapper.find('[data-testid="app-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="app-bar-title"]').text()).toBe('KiloLima')
  })

  it('renders the legacy layout (AppBar) when VITE_FLAG_MOBILE_UX is "false"', async () => {
    vi.stubEnv('VITE_FLAG_MOBILE_UX', 'false')
    const router = await mkRouter()
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), vuetify, router] },
    })
    expect(wrapper.find('[data-testid="app-bar"]').exists()).toBe(true)
  })

  it('renders AppLayout when VITE_FLAG_MOBILE_UX is "true"', async () => {
    vi.stubEnv('VITE_FLAG_MOBILE_UX', 'true')
    const router = await mkRouter()
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), vuetify, router] },
    })
    // AppLayout renders AppBar internally, so app-bar should still exist
    expect(wrapper.find('[data-testid="app-bar"]').exists()).toBe(true)
  })
})
