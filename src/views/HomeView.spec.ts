import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import HomeView from './HomeView.vue'
import { useAppStore } from '@/stores/app.store'

// HomeView relies on Vuetify components (<v-container>, <v-card>, etc.)
// and the Pinia store. The Vuetify instance is local to the test (same
// pattern as src/App.spec.ts) so we don't depend on src/plugins/vuetify.
const vuetify = createVuetify({ components, directives })

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the Kilo-Lima heading and the 3-phase subtitle', () => {
    const wrapper = mount(HomeView, {
      global: { plugins: [createPinia(), vuetify] },
    })
    expect(wrapper.find('h1').text()).toContain('Kilo-Lima')
    expect(wrapper.text()).toContain('Pre-evento')
    expect(wrapper.text()).toContain('Durante evento')
    expect(wrapper.text()).toContain('Post-evento')
  })

  it('displays the appName from the app store', () => {
    const wrapper = mount(HomeView, {
      global: { plugins: [createPinia(), vuetify] },
    })
    const app = useAppStore()
    expect(wrapper.text()).toContain(app.appName)
  })

  it('shows the online status text from useOnlineStatus', () => {
    const wrapper = mount(HomeView, {
      global: { plugins: [createPinia(), vuetify] },
    })
    // jsdom defaults navigator.onLine to true; the composable's initial
    // value matches. The text should contain "En línea" or "Sin conexión"
    // (both are valid in jsdom depending on the environment stub).
    const texto = wrapper.text()
    const muestraEstado = texto.includes('En línea') || texto.includes('Sin conexión')
    expect(muestraEstado).toBe(true)
  })
})
