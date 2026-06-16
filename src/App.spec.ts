import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import App from './App.vue'

// Trivial smoke test added during PR1 verify (sdd-verify foundation PR1,
// SUGGESTION #1) so `pnpm test` exits 0 before the richer HomeView smoke
// test lands in PR4 Task 4.5. App.vue wraps its content in <v-app><v-main>,
// so we install a local Vuetify instance in the test's global plugins —
// mirroring what main.ts does at runtime, without touching src/main.ts.
const vuetify = createVuetify({ components, directives })

describe('App', () => {
  it('renders the Kilo-Lima heading', () => {
    const wrapper = mount(App, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.find('h1').text()).toContain('Kilo-Lima')
  })
})
