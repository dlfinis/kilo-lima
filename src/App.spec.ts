import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from './App.vue'

// REQ-UX-1: App.vue mounts <AppBar> globally above the <router-view>
// so every route renders the same navigation surface. The previous
// inline <h1>Kilo-Lima</h1> was removed because the AppBar title now
// carries the brand. The smoke test still asserts the brand is visible
// (now via the AppBar title).
const vuetify = createVuetify({ components, directives })

const mkRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()
  return router
}

describe('App', () => {
  it('renders the AppBar with the Kilo-Lima title on mount', async () => {
    const router = await mkRouter()
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), vuetify, router] },
    })
    expect(wrapper.find('[data-testid="app-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="app-bar-title"]').text()).toBe('Kilo-Lima')
  })
})
