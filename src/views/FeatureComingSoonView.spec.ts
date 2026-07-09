import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import FeatureComingSoonView from './FeatureComingSoonView.vue'

const vuetify = createVuetify({ components, directives })

function mkRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div/>' } },
      { path: '/ventas', name: 'ventas', component: FeatureComingSoonView, props: { title: 'Ventas', icon: 'mdi-cash-register', section: 'Operación' } },
    ],
  })
  return router
}

function mountView(router: ReturnType<typeof mkRouter>, props: { title: string; icon: string; section: string }) {
  return mount(FeatureComingSoonView, {
    global: { plugins: [vuetify, router] },
    props,
  })
}

describe('FeatureComingSoonView', () => {
  it('renders the title prop', () => {
    const router = mkRouter()
    const wrapper = mountView(router, { title: 'Ventas', icon: 'mdi-cash-register', section: 'Operación' })
    expect(wrapper.text()).toContain('Ventas')
  })

  it('renders the section prop as subtitle', () => {
    const router = mkRouter()
    const wrapper = mountView(router, { title: 'Gastos', icon: 'mdi-file-document-edit', section: 'Operación' })
    expect(wrapper.text()).toContain('Operación')
  })

  it('renders the icon prop', () => {
    const router = mkRouter()
    const wrapper = mountView(router, { title: 'Costos', icon: 'mdi-calculator', section: 'Planificación' })
    const html = wrapper.html()
    expect(html).toContain('mdi-calculator')
  })

  it('has a back button that links to /', async () => {
    const router = mkRouter()
    await router.push('/ventas')
    await router.isReady()
    const wrapper = mountView(router, { title: 'Ventas', icon: 'mdi-cash-register', section: 'Operación' })
    const backBtn = wrapper.find('a[href="/"]')
    expect(backBtn.exists()).toBe(true)
    expect(backBtn.text()).toContain('Volver al inicio')
  })
})
