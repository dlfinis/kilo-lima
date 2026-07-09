// REQ-UX-1..4 + REQ-UX-25: global AppBar. Asserted by:
//   1. hamburger visible on mobile/tablet (hidden on web)
//   2. back button is hidden on / (single-crumb root)
//   3. back button is visible on a nested route (multi-crumb trail)
//   4. breadcrumb items render via the BreadcrumbNav child
//   5. hamburger and back button are mutually exclusive
//   6. rail toggle visible only on web (REQ-NAV-X)
// Behaviour-only assertions — no CSS class coupling.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, type Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import AppBar from './AppBar.vue'
import BreadcrumbNav from './BreadcrumbNav.vue'

const vuetify = createVuetify({ components, directives })

// --------------- mock useBreakpoint ---------------
let _bp: 'mobile' | 'tablet' | 'web' = 'web'

vi.mock('@/composables/useBreakpoint', async () => {
  const { computed: _computed } = await import('vue')
  return {
    useBreakpoint: () => _computed(() => _bp),
  }
})

function setBreakpoint(bp: 'mobile' | 'tablet' | 'web') {
  _bp = bp
}

// --------------- mock useSidebarRail ---------------
let _rail: Ref<boolean> = ref(false)
const _toggleMock = vi.fn(() => {
  _rail.value = !_rail.value
})

vi.mock('@/composables/useSidebarRail', () => ({
  useSidebarRail: () => ({ rail: _rail, toggle: _toggleMock }),
}))

function setRail(value: boolean) {
  _rail.value = value
}

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
  beforeEach(() => {
    localStorage.clear()
    setBreakpoint('web')
    setRail(false)
    _toggleMock.mockClear()
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
    expect(bc.props('items')).toEqual([
      { title: 'Inicio', to: '/' },
      { title: 'Materias primas', disabled: true },
    ])
  })

  it('back button is present on nested routes for all breakpoints', async () => {
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    await router.push('/materias-primas')
    await router.isReady()
    simularHistorialPrevio(router, '/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-back"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="app-bar-menu"]').exists()).toBe(false)
  })

  it('does not render hamburger when bp is web', async () => {
    setBreakpoint('web')
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-menu"]').exists()).toBe(false)
  })

  it('renders hamburger when bp is mobile and cannot go back', async () => {
    setBreakpoint('mobile')
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-menu"]').exists()).toBe(true)
  })

  it('renders hamburger when bp is tablet and cannot go back', async () => {
    setBreakpoint('tablet')
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-menu"]').exists()).toBe(true)
  })

  it('does NOT render hamburger when bp is mobile but puedeVolver is true (back button wins)', async () => {
    setBreakpoint('mobile')
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    await router.push('/materias-primas')
    await router.isReady()
    simularHistorialPrevio(router, '/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="app-bar-back"]').exists()).toBe(true)
  })

  it('does NOT render app-bar-title anymore', async () => {
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-title"]').exists()).toBe(false)
  })

  it('does NOT render app name text in the app bar', async () => {
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    const bar = wrapper.find('[data-testid="app-bar"]')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).not.toContain('KiloLima')
  })

  // --------------- rail toggle (REQ-NAV-X) ---------------

  it('shows rail toggle button on web breakpoint', async () => {
    setBreakpoint('web')
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-rail-toggle"]').exists()).toBe(true)
  })

  it('does not show rail toggle button on mobile breakpoint', async () => {
    setBreakpoint('mobile')
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-rail-toggle"]').exists()).toBe(false)
  })

  it('does not show rail toggle button on tablet breakpoint', async () => {
    setBreakpoint('tablet')
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    expect(wrapper.find('[data-testid="app-bar-rail-toggle"]').exists()).toBe(false)
  })

  it('rail toggle has aria-label "Colapsar menú" when sidebar is expanded', async () => {
    setRail(false)
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    const btn = wrapper.find('[data-testid="app-bar-rail-toggle"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-label')).toBe('Colapsar menú')
  })

  it('rail toggle has aria-label "Expandir menú" when sidebar is collapsed', async () => {
    setRail(true)
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    const btn = wrapper.find('[data-testid="app-bar-rail-toggle"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-label')).toBe('Expandir menú')
  })

  it('clicking rail toggle calls toggle() and toggles state', async () => {
    setRail(false)
    setActivePinia(createPinia())
    const router = await mkRouter('/')
    const wrapper = mountAppBar(router)
    const btn = wrapper.find('[data-testid="app-bar-rail-toggle"]')
    expect(btn.exists()).toBe(true)
    expect(_toggleMock).not.toHaveBeenCalled()
    await btn.trigger('click')
    expect(_toggleMock).toHaveBeenCalledTimes(1)
    // toggleMock toggles _rail.value in the mock
    expect(_rail.value).toBe(true)
  })
})
