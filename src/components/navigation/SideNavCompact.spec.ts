// REQ-NAV-1: SideNavCompact is the tablet sidebar (769–1024px).
// Renders 5 items with icons + short labels in a v-navigation-drawer
// with the `rail` prop. Active item tracks the current route.
// Hidden on mobile and web.
//
// TDD CYCLE (Strict TDD Mode):
//   RED   → This file was written before SideNavCompact.vue existed.
//   GREEN → SideNavCompact.vue must make ALL tests pass.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import SideNavCompact from './SideNavCompact.vue'

const vuetify = createVuetify({ components, directives })

// --------------- mock useBreakpoint ---------------
let _bp: 'mobile' | 'tablet' | 'web' = 'tablet'

vi.mock('@/composables/useBreakpoint', async () => {
  const { computed: _computed } = await import('vue')
  return {
    useBreakpoint: () => _computed(() => _bp),
  }
})

function setBreakpoint(bp: 'mobile' | 'tablet' | 'web') {
  _bp = bp
}

// --------------- router ---------------
const mkRouter = async (initial = '/'): Promise<Router> => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/pos', name: 'pos', component: { template: '<div>POS</div>' } },
      { path: '/productos', name: 'productos', component: { template: '<div>Productos</div>' } },
      { path: '/inventario', name: 'inventario', component: { template: '<div>Inventario</div>' } },
      { path: '/reportes', name: 'reportes', component: { template: '<div>Reportes</div>' } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  return router
}

const mountInApp = (router: Router) =>
  mount(
    {
      template: '<v-app><SideNavCompact /></v-app>',
      components: { SideNavCompact },
    },
    { global: { plugins: [vuetify, router] } },
  )

// --------------- tests ---------------
describe('SideNavCompact', () => {
  beforeEach(() => {
    setBreakpoint('tablet')
    setActivePinia(createPinia())
  })

  it('renders a v-navigation-drawer in rail mode', async () => {
    const router = await mkRouter()
    const wrapper = mountInApp(router)

    const drawer = wrapper.find('.v-navigation-drawer')
    expect(drawer.exists()).toBe(true)
  })

  it('renders 5 items with icons and labels', async () => {
    const router = await mkRouter()
    const wrapper = mountInApp(router)

    // The drawer should contain list items
    const items = wrapper.findAll('.v-list-item')
    expect(items).toHaveLength(5)

    const expected = ['Inicio', 'Caja', 'Productos', 'Inventario', 'Reportes']
    items.forEach((item, i) => {
      expect(item.text()).toContain(expected[i])
    })
  })

  it('highlights the active item based on the current route', async () => {
    const router = await mkRouter('/productos')
    const wrapper = mountInApp(router)

    const items = wrapper.findAll('.v-list-item')
    // Index 2 → Productos (/productos)
    const prodItem = items[2]
    expect(prodItem).toBeDefined()
    expect(prodItem!.classes()).toContain('v-list-item--active')
  })

  it('navigates to the correct route on click', async () => {
    const router = await mkRouter()
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mountInApp(router)

    const items = wrapper.findAll('.v-list-item')
    await items[2]!.trigger('click') // Click Productos

    expect(pushSpy).toHaveBeenCalledWith('/productos')
  })

  it('hides on mobile breakpoint', async () => {
    setBreakpoint('mobile')
    const router = await mkRouter()

    const wrapper = mountInApp(router)

    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false)
  })

  it('hides on web breakpoint', async () => {
    setBreakpoint('web')
    const router = await mkRouter()

    const wrapper = mountInApp(router)

    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false)
  })

  it('shows on tablet breakpoint', async () => {
    setBreakpoint('tablet')
    const router = await mkRouter()

    const wrapper = mountInApp(router)

    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(true)
  })
})
