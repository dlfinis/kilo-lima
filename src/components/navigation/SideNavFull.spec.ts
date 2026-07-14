import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, type Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import SideNavFull from './SideNavFull.vue'

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

const routes = [
  { path: '/', name: 'home', component: { template: '<div/>' }, meta: { breadcrumb: ['Inicio'] } },
  { path: '/pos', name: 'pos', component: { template: '<div/>' } },
  { path: '/ventas', name: 'ventas', component: { template: '<div/>' } },
  { path: '/gastos', name: 'gastos', component: { template: '<div/>' } },
  { path: '/productos', name: 'productos', component: { template: '<div/>' } },
  { path: '/productos/preparaciones', name: 'recetas', component: { template: '<div/>' } },
  { path: '/inventario', name: 'inventario', component: { template: '<div/>' } },
  { path: '/eventos', name: 'eventos', component: { template: '<div/>' } },
  { path: '/reportes', name: 'reportes-resumen', component: { template: '<div/>' } },
  { path: '/reportes/rentabilidad', name: 'reportes-rentabilidad', component: { template: '<div/>' } },
  { path: '/ajustes', name: 'ajustes', component: { template: '<div/>' } },
  { path: '/equipo', name: 'equipo', component: { template: '<div/>' } },
]

async function mkRouter(initialRoute = '/'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  await router.push(initialRoute)
  await router.isReady()
  return router
}

function mountSideNavFull(router: Router) {
  return mount(
    {
      template: '<v-app><SideNavFull /></v-app>',
      components: { SideNavFull },
    },
    { global: { plugins: [vuetify, router] } },
  )
}

describe('SideNavFull (polymorphic permanent/temporary sidebar)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setBreakpoint('web')
    setRail(false)
    _toggleMock.mockClear()
  })

  it('renders 4 section headers', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const text = wrapper.text()
    expect(text).toContain('Operación')
    expect(text).toContain('Planificación')
    expect(text).toContain('Análisis')
    expect(text).toContain('Configuración')
  })

  it('renders all required nav items per spec', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const text = wrapper.text()
    const items = ['Inicio', 'Caja', 'Ventas', 'Gastos', 'Productos', 'Preparaciones', 'Materia prima', 'Eventos', 'Reportes', 'Rentabilidad', 'Ajustes', 'Equipo']
    for (const item of items) {
      expect(text).toContain(item)
    }
  })

  it('does not render deprecated Costos nav item', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const text = wrapper.text()
    expect(text).not.toContain('Costos')
  })

  it('highlights active route at /', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const activeItems = wrapper.findAll('.v-list-item--active')
    expect(activeItems.length).toBeGreaterThanOrEqual(1)
    expect(activeItems[0]!.text()).toContain('Inicio')
  })

  it('highlights active route at /pos', async () => {
    const router = await mkRouter('/pos')
    const wrapper = mountSideNavFull(router)
    const activeItems = wrapper.findAll('.v-list-item--active')
    expect(activeItems.length).toBeGreaterThanOrEqual(1)
    expect(activeItems[0]!.text()).toContain('Caja')
  })

  it('highlights active route at /productos/preparaciones (nested)', async () => {
    const router = await mkRouter('/productos/preparaciones')
    const wrapper = mountSideNavFull(router)
    const activeItems = wrapper.findAll('.v-list-item--active,.v-list-group--active')
    expect(activeItems.length).toBeGreaterThanOrEqual(1)
    const text = wrapper.text()
    expect(text).toContain('Preparaciones')
  })

  it('highlights active route at /reportes/rentabilidad (nested)', async () => {
    const router = await mkRouter('/reportes/rentabilidad')
    const wrapper = mountSideNavFull(router)
    const activeItems = wrapper.findAll('.v-list-item--active,.v-list-group--active')
    expect(activeItems.length).toBeGreaterThanOrEqual(1)
  })

  it('uses permanent drawer mode on web (no temporary class)', async () => {
    setBreakpoint('web')
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const drawer = wrapper.find('.v-navigation-drawer')
    expect(drawer.exists()).toBe(true)
    const classes = drawer.classes()
    expect(classes).not.toContain('v-navigation-drawer--temporary')
  })

  it('renders without requiring modelValue prop', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(true)
  })

  it('renders as temporary when bp is mobile', async () => {
    setBreakpoint('mobile')
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const drawer = wrapper.find('.v-navigation-drawer')
    expect(drawer.exists()).toBe(true)
    const classes = drawer.classes()
    expect(classes).toContain('v-navigation-drawer--temporary')
  })

  it('renders as temporary when bp is tablet', async () => {
    setBreakpoint('tablet')
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const drawer = wrapper.find('.v-navigation-drawer')
    expect(drawer.exists()).toBe(true)
    const classes = drawer.classes()
    expect(classes).toContain('v-navigation-drawer--temporary')
  })

  it('renders nav items with icons and labels in mobile mode', async () => {
    setBreakpoint('mobile')
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const listItems = wrapper.findAll('.v-list-item')
    expect(listItems.length).toBeGreaterThanOrEqual(12)
    for (const item of listItems) {
      expect(item.find('.v-icon').exists() || item.find('.mdi').exists()).toBe(true)
    }
  })

  it('clicking a nav item in temporary mode closes the drawer', async () => {
    setBreakpoint('mobile')
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const drawer = wrapper.findComponent({ name: 'VNavigationDrawer' })
    expect(drawer.exists()).toBe(true)
    drawer.vm.$emit('update:modelValue', true)
    await wrapper.vm.$nextTick()
    expect(drawer.props('modelValue')).toBe(true)
    const posItem = wrapper.findAll('.v-list-item').find((el) => el.text().includes('Caja'))
    expect(posItem).toBeDefined()
    posItem!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(drawer.props('modelValue')).toBe(false)
  })

  it('clicking a nav item in permanent mode keeps the drawer open', async () => {
    setBreakpoint('web')
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const drawer = wrapper.findComponent({ name: 'VNavigationDrawer' })
    expect(drawer.exists()).toBe(true)
    expect(drawer.props('modelValue')).toBe(true)
    const posItem = wrapper.findAll('.v-list-item').find((el) => el.text().includes('Caja'))
    expect(posItem).toBeDefined()
    posItem!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(drawer.props('modelValue')).toBe(true)
  })

  it('each item has an icon and label', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const listItems = wrapper.findAll('.v-list-item')
    expect(listItems.length).toBeGreaterThanOrEqual(12)
    for (const item of listItems) {
      expect(item.find('.v-icon').exists() || item.find('.mdi').exists()).toBe(true)
    }
  })

  it('uses semantic nav role for ARIA', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const navs = wrapper.findAll('nav')
    expect(navs.length).toBeGreaterThanOrEqual(1)
  })

  // --------------- rail prop (REQ-NAV-X) ---------------

  it('applies rail prop when breakpoint is web and sidebar is in rail mode', async () => {
    setBreakpoint('web')
    setRail(true)
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const drawer = wrapper.findComponent({ name: 'VNavigationDrawer' })
    expect(drawer.exists()).toBe(true)
    expect(drawer.props('rail')).toBe(true)
  })

  it('does not apply rail prop on mobile even when rail is true', async () => {
    setBreakpoint('mobile')
    setRail(true)
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const drawer = wrapper.findComponent({ name: 'VNavigationDrawer' })
    expect(drawer.exists()).toBe(true)
    expect(drawer.props('rail')).toBe(false)
  })

  it('hides section headers when web and rail is true', async () => {
    setBreakpoint('web')
    setRail(true)
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const text = wrapper.text()
    expect(text).not.toContain('Operación')
    expect(text).not.toContain('Planificación')
    expect(text).not.toContain('Análisis')
    expect(text).not.toContain('Configuración')
  })

  // --------------- fluid prop (REQ-NAV-FLUID) ---------------

  it('applies fluid prop to both v-list-group components to reduce subitem indentation', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const groups = wrapper.findAllComponents({ name: 'VListGroup' })
    expect(groups.length).toBe(2)
    for (const group of groups) {
      expect(group.props('fluid')).toBe(true)
    }
  })

  // --------------- group value fix (REQ-GROUP-STABLE-IDS) ---------------

  it('uses stable string IDs as v-list-group values (not booleans)', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const groups = wrapper.findAllComponents({ name: 'VListGroup' })
    expect(groups.length).toBe(2)
    const values = groups.map((g) => g.props('value'))
    expect(values).toContain('productos')
    expect(values).toContain('reportes')
    expect(values.every((v) => typeof v === 'string')).toBe(true)
  })

  it('auto-opens the reportes group on /reportes/rentabilidad', async () => {
    const router = await mkRouter('/reportes/rentabilidad')
    const wrapper = mountSideNavFull(router)
    const groups = wrapper.findAllComponents({ name: 'VListGroup' })
    const reportesGroup = groups.find((g) => g.props('value') === 'reportes')
    expect(reportesGroup).toBeDefined()
    expect(reportesGroup!.classes()).toContain('v-list-group--open')
  })

  it('auto-opens the productos group on /productos/preparaciones', async () => {
    const router = await mkRouter('/productos/preparaciones')
    const wrapper = mountSideNavFull(router)
    const groups = wrapper.findAllComponents({ name: 'VListGroup' })
    const productosGroup = groups.find((g) => g.props('value') === 'productos')
    expect(productosGroup).toBeDefined()
    expect(productosGroup!.classes()).toContain('v-list-group--open')
  })

  it('opening reportes does not open productos (no boolean collision)', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)

    // Find VList component to access its open method
    const vlist = wrapper.findComponent({ name: 'VList' })
    expect(vlist.exists()).toBe(true)

    // Groups should be closed initially on /
    const groups = wrapper.findAllComponents({ name: 'VListGroup' })
    const reportesGroup = groups.find((g) => g.props('value') === 'reportes')
    const productosGroup = groups.find((g) => g.props('value') === 'productos')
    expect(reportesGroup!.classes()).not.toContain('v-list-group--open')
    expect(productosGroup!.classes()).not.toContain('v-list-group--open')

    // Programmatically open just reportes (simulates user clicking the activator)
    ;(vlist.vm as any).open('reportes', true, new MouseEvent('click'))
    await wrapper.vm.$nextTick()

    // Only reportes should be open — no boolean collision
    expect(reportesGroup!.classes()).toContain('v-list-group--open')
    expect(productosGroup!.classes()).not.toContain('v-list-group--open')
  })

  it('sets indent=8 on v-list for subtle subitem indentation', async () => {
    const router = await mkRouter('/')
    const wrapper = mountSideNavFull(router)
    const list = wrapper.findComponent({ name: 'VList' })
    expect(list.exists()).toBe(true)
    expect(list.props('indent')).toBe(8)
  })
})
