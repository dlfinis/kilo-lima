// SideNavFull spec — tests the web sidebar navigation (>1024px).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import SideNavFull from './SideNavFull.vue'

const vuetify = createVuetify({ components, directives })

async function mkRouter(initialRoute: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/pos', component: { template: '<div/>' } },
      { path: '/productos', component: { template: '<div/>' } },
      { path: '/inventario', component: { template: '<div/>' } },
      { path: '/reportes', component: { template: '<div/>' } },
    ],
  })
  await router.push(initialRoute)
  await router.isReady()
  return router
}

vi.mock('@/composables/useBreakpoint', () => ({
  useBreakpoint: () => 'web',
}))

function mountSideNavFull(router: Awaited<ReturnType<typeof mkRouter>>) {
  return mount(SideNavFull, {
    global: {
      plugins: [vuetify, router],
    },
    props: {
      modelValue: true,
    },
  })
}

describe('SideNavFull', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders 5 navigation items', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    expect(wrapper.findAll('.v-list-item')).toHaveLength(5)
  })

  it('highlights the active route', async () => {
    const router = await mkRouter('/pos')
    const wrapper = mountSideNavFull(router)
    const items = wrapper.findAll('.v-list-item')
    const activeItems = items.filter((item) => item.classes('v-list-item--active'))
    expect(activeItems).toHaveLength(1)
  })

  it('navigates when clicking an item', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const items = wrapper.findAll('.v-list-item')
    await items[1].trigger('click')
    expect(router.currentRoute.value.path).toBe('/pos')
  })

  it('renders correct icons and labels', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const items = wrapper.findAll('.v-list-item')
    expect(items[0].text()).toContain('Inicio')
    expect(items[1].text()).toContain('Caja')
    expect(items[2].text()).toContain('Productos')
    expect(items[3].text()).toContain('Inventario')
    expect(items[4].text()).toContain('Reportes')
  })
})
