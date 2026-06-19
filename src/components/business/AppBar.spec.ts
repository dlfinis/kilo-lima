// REQ-UX-1..4 + REQ-UX-25: global AppBar. Asserted by:
//   1. title text comes from appStore.appName
//   2. back button is hidden on / (single-crumb root)
//   3. back button is visible on a nested route (multi-crumb trail)
//   4. breadcrumb items render via the BreadcrumbNav child
// Behaviour-only assertions — no CSS class coupling.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import AppBar from './AppBar.vue'
import BreadcrumbNav from './BreadcrumbNav.vue'

const vuetify = createVuetify({ components, directives })

const mkRouter = async (inicial: string): Promise<Router> => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: { template: '<div />' },
        meta: { breadcrumb: ['Inicio'] },
      },
      {
        path: '/materias-primas',
        name: 'materias-primas',
        component: { template: '<div />' },
        meta: { breadcrumb: ['Inicio', 'materias-primas'] },
      },
    ],
  })
  await router.push(inicial)
  await router.isReady()
  return router
}

const simularHistorialPrevio = (router: Router, rutaAnterior: string) => {
  const state = router.options.history.state as { back?: string } | null
  if (state) state.back = rutaAnterior
}

const mountAppBar = (router: Router) =>
  mount(
    {
      template: '<v-app><AppBar /></v-app>',
      components: { AppBar },
    },
    { global: { plugins: [vuetify, router] } },
  )

describe('AppBar', () => {
  it('renders the app store title (REQ-UX-4)', async () => {
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-title"]').text()).toBe('Kilo-Lima')
  })

  it('hides the back button on the root route (REQ-UX-2)', async () => {
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-back"]').exists()).toBe(false)
  })

  it('shows the back button on a nested route (REQ-UX-2)', async () => {
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    await router.push('/materias-primas')
    await router.isReady()
    simularHistorialPrevio(router, '/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-back"]').exists()).toBe(true)
  })

  it('renders the breadcrumb items via BreadcrumbNav (REQ-UX-5)', async () => {
    setActivePinia(createPinia())
    const router = await mkRouter('/materias-primas')
    const wrapper = mountAppBar(router)
    const bc = wrapper.findComponent(BreadcrumbNav)
    expect(bc.exists()).toBe(true)
    // Two crumbs → first is a link to /, second is the disabled
    // current page (REQ-UX-6).
    expect(bc.props('items')).toEqual([
      { title: 'Inicio', to: '/' },
      { title: 'Materias primas', disabled: true },
    ])
  })
})