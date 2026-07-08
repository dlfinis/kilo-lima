// mobile-ux-redesign Phase 2: QuickActionsRow component.
// Displays 4 action buttons: Ir a caja, Registrar gasto, Ver stock, Nuevo producto.
// Each button has an icon, label, and navigates to its respective route.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import QuickActionsRow from './QuickActionsRow.vue'

const vuetify = createVuetify({ components, directives })

let router: Router

beforeEach(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/pos', component: { template: '<div />' } },
      { path: '/inventario', component: { template: '<div />' } },
      { path: '/productos/nuevo', component: { template: '<div />' } },
      { path: '/eventos', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
})

const mountRow = () =>
  mount(QuickActionsRow, {
    global: { plugins: [vuetify, router] },
  })

describe('QuickActionsRow', () => {
  it('renders 4 action buttons', () => {
    const wrapper = mountRow()
    const buttons = wrapper.findAll('[data-testid^="quick-action-"]')
    expect(buttons).toHaveLength(4)
  })

  it('shows "Ir a caja" button that links to /pos', () => {
    const wrapper = mountRow()
    const btn = wrapper.find('[data-testid="quick-action-pos"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toMatch(/ir a caja|Caja/i)
    expect(wrapper.html()).toContain('href="/pos"')
  })

  it('shows "Registrar gasto" button that links to /eventos', () => {
    const wrapper = mountRow()
    const btn = wrapper.find('[data-testid="quick-action-gasto"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toMatch(/registrar gasto|Gasto/i)
    expect(wrapper.html()).toContain('href="/eventos"')
  })

  it('shows "Ver stock" button that links to /inventario', () => {
    const wrapper = mountRow()
    const btn = wrapper.find('[data-testid="quick-action-stock"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toMatch(/ver stock|Inventario/i)
    expect(wrapper.html()).toContain('href="/inventario"')
  })

  it('shows "Nuevo producto" button that links to /productos/nuevo', () => {
    const wrapper = mountRow()
    const btn = wrapper.find('[data-testid="quick-action-producto"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toMatch(/nuevo producto|Producto/i)
    expect(wrapper.html()).toContain('href="/productos/nuevo"')
  })

  it('renders each button with an icon', () => {
    const wrapper = mountRow()
    // Each quick action button has an icon prepend
    const iconEls = wrapper.findAll('.mdi')
    expect(iconEls.length).toBeGreaterThanOrEqual(4)
  })

  it('renders as a row container', () => {
    const wrapper = mountRow()
    expect(wrapper.find('[data-testid="quick-actions-row"]').exists()).toBe(true)
  })
})
