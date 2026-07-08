// REQ-NAV-1: AppLayout is the responsive shell. It wraps <router-view>
// and conditionally renders BottomNav (mobile), SideNavCompact (tablet),
// or SideNavFull (web) based on useBreakpoint(). The AppBar renders at
// the top for all breakpoints.
//
// TDD CYCLE (Strict TDD Mode):
//   RED   → This file was written before AppLayout.vue existed.
//   GREEN → AppLayout.vue must make ALL tests pass.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import AppLayout from './AppLayout.vue'

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
const mkRouter = async (): Promise<Router> => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: { template: '<div data-testid="home-page">Home Page</div>' },
      },
      {
        path: '/pos',
        name: 'pos',
        component: { template: '<div data-testid="pos-page">POS Page</div>' },
      },
    ],
  })
  await router.push('/')
  await router.isReady()
  return router
}

const mountAppLayout = (router: Router) =>
  mount(
    {
      template: '<v-app><AppLayout /></v-app>',
      components: { AppLayout },
    },
    { global: { plugins: [vuetify, router] } },
  )

// --------------- tests ---------------
describe('AppLayout', () => {
  beforeEach(() => {
    setBreakpoint('mobile')
    setActivePinia(createPinia())
  })

  it('renders router-view content', async () => {
    const router = await mkRouter()
    const wrapper = mountAppLayout(router)

    // The router-view renders the matched component (Home at /)
    expect(wrapper.html()).toContain('Home Page')
  })

  it('renders AppBar at the top', async () => {
    const router = await mkRouter()
    const wrapper = mountAppLayout(router)

    expect(wrapper.find('[data-testid="app-bar"]').exists()).toBe(true)
  })

  it('renders BottomNav on mobile breakpoint', async () => {
    setBreakpoint('mobile')
    const router = await mkRouter()
    const wrapper = mountAppLayout(router)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(true)
  })

  it('does not render BottomNav on tablet breakpoint', async () => {
    setBreakpoint('tablet')
    const router = await mkRouter()
    const wrapper = mountAppLayout(router)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
  })

  it('renders SideNavCompact on tablet breakpoint', async () => {
    setBreakpoint('tablet')
    const router = await mkRouter()
    const wrapper = mountAppLayout(router)

    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(true)
  })

  it('does not render SideNavCompact on mobile breakpoint', async () => {
    setBreakpoint('mobile')
    const router = await mkRouter()
    const wrapper = mountAppLayout(router)

    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false)
  })

  it('renders existing layout (AppBar + main) on web breakpoint', async () => {
    setBreakpoint('web')
    const router = await mkRouter()
    const wrapper = mountAppLayout(router)

    // AppBar should still be present
    expect(wrapper.find('[data-testid="app-bar"]').exists()).toBe(true)
    // Neither bottom nav nor side nav should render on web
    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false)
  })
})
