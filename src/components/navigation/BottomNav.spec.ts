// REQ-NAV-1: BottomNav is the mobile navigation bar (≤768px). It
// renders 5 destination buttons, highlights the active route, and
// navigates on tap. Hidden on tablet/web via useBreakpoint.
//
// TDD CYCLE (Strict TDD Mode):
//   RED   → This file was written before BottomNav.vue existed.
//   GREEN → BottomNav.vue must make ALL tests pass.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import BottomNav from './BottomNav.vue'

const vuetify = createVuetify({ components, directives })

// --------------- mock useBreakpoint ---------------
let _bp: 'mobile' | 'tablet' | 'web' = 'mobile'

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

// Follows AppBar.spec.ts pattern: mount inside <v-app> for layout context.
const mountBottomNav = (router: Router) =>
  mount(
    {
      template: '<v-app><BottomNav /></v-app>',
      components: { BottomNav },
    },
    { global: { plugins: [vuetify, router] } },
  )

// --------------- tests ---------------
describe('BottomNav', () => {
  beforeEach(() => {
    setBreakpoint('mobile')
    setActivePinia(createPinia())
  })

  it('renders 5 navigation items on mobile', async () => {
    const router = await mkRouter()
    const wrapper = mountBottomNav(router)

    const buttons = wrapper.findAll('.v-bottom-navigation .v-btn')
    expect(buttons).toHaveLength(5)
  })

  it('renders each nav item with the correct label', async () => {
    const router = await mkRouter()
    const wrapper = mountBottomNav(router)

    const expected = ['Inicio', 'Caja', 'Productos', 'Inventario', 'Reportes']
    const buttons = wrapper.findAll('.v-bottom-navigation .v-btn')
    expect(buttons).toHaveLength(expected.length)

    buttons.forEach((btn, i) => {
      expect(btn.text()).toContain(expected[i])
    })
  })

  it('highlights the active item based on the current route', async () => {
    const router = await mkRouter('/pos')
    const wrapper = mountBottomNav(router)

    const buttons = wrapper.findAll('.v-bottom-navigation .v-btn')
    // Index 1 → Caja (/pos)
    const cajaBtn = buttons[1]
    expect(cajaBtn).toBeDefined()
    expect(cajaBtn!.classes()).toContain('v-btn--active')
  })

  it('navigates to the correct route on click', async () => {
    const router = await mkRouter()
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mountBottomNav(router)

    const buttons = wrapper.findAll('.v-bottom-navigation .v-btn')
    await buttons[1]!.trigger('click') // Click Caja

    expect(pushSpy).toHaveBeenCalledWith('/pos')
  })

  it('hides on tablet breakpoint', async () => {
    setBreakpoint('tablet')
    const router = await mkRouter()

    const wrapper = mountBottomNav(router)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
  })

  it('hides on web breakpoint', async () => {
    setBreakpoint('web')
    const router = await mkRouter()

    const wrapper = mountBottomNav(router)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
  })

  it('shows on mobile breakpoint', async () => {
    setBreakpoint('mobile')
    const router = await mkRouter()

    const wrapper = mountBottomNav(router)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(true)
  })
})
