// REQ-ROUTE-1: ProductosLayout wraps child routes under /productos
// with sub-navigation tabs: Productos (default) and Recetas.
//
// TDD CYCLE (Strict TDD Mode):
//   RED   → This file is written BEFORE ProductosLayout.vue exists.
//   GREEN → ProductosLayout.vue must make ALL tests pass.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

import ProductosLayout from './ProductosLayout.vue'

const vuetify = createVuetify({ components, directives })

function mkRouter(initialPath = '/productos'): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/productos',
        component: ProductosLayout,
        children: [
          {
            path: '',
            name: 'productos',
            component: { template: '<div data-testid="productos-page">Productos Page</div>' },
          },
          {
            path: 'recetas',
            name: 'recetas',
            component: { template: '<div data-testid="recetas-page">Recetas Page</div>' },
          },
          {
            path: 'recetas/:id',
            name: 'receta-detalle',
            component: { template: '<div data-testid="receta-detalle-page">Receta Detalle Page</div>' },
          },
        ],
      },
    ],
  })
  return router
}

const mountLayout = (router: Router) =>
  mount(
    {
      template: '<v-app><router-view /></v-app>',
    },
    {
      global: { plugins: [vuetify, router] },
    },
  )

describe('ProductosLayout', () => {
  let router: Router

  beforeEach(async () => {
    router = mkRouter()
    await router.push('/productos')
    await router.isReady()
  })

  it('renders sub-navigation with 2 tabs: Productos and Recetas', async () => {
    const wrapper = mountLayout(router)

    const tabs = wrapper.findAll('.v-tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].text()).toContain('Productos')
    expect(tabs[1].text()).toContain('Recetas')
  })

  it('highlights the Productos tab as active when on /productos', async () => {
    const wrapper = mountLayout(router)

    const tabs = wrapper.findAll('.v-tab')
    const productosTab = tabs[0]
    expect(productosTab.classes()).toContain('v-tab--selected')
  })

  it('highlights the Recetas tab as active when on /productos/recetas', async () => {
    await router.push('/productos/recetas')
    const wrapper = mountLayout(router)

    const tabs = wrapper.findAll('.v-tab')
    const recetasTab = tabs[1]
    expect(recetasTab.classes()).toContain('v-tab--selected')
  })

  it('renders the child route via router-view (ProductosView at /productos)', async () => {
    const wrapper = mountLayout(router)

    // The default child (ProductosView) should be rendered
    expect(wrapper.find('[data-testid="productos-page"]').exists()).toBe(true)
  })

  it('renders the child route via router-view (RecetasView at /productos/recetas)', async () => {
    await router.push('/productos/recetas')
    const wrapper = mountLayout(router)

    expect(wrapper.find('[data-testid="recetas-page"]').exists()).toBe(true)
  })

  it('renders the child route via router-view (RecetaDetalleView at /productos/recetas/:id)', async () => {
    await router.push('/productos/recetas/r-1')
    const wrapper = mountLayout(router)

    expect(wrapper.find('[data-testid="receta-detalle-page"]').exists()).toBe(true)
  })

  it('Productos tab links to /productos', async () => {
    const wrapper = mountLayout(router)

    const tabs = wrapper.findAll('.v-tab')
    const productosTab = tabs[0]
    // Vuetify v-tab with :to renders a router-link — the href should target /productos
    expect(productosTab.attributes('href')).toBe('/productos')
  })

  it('Recetas tab links to /productos/recetas', async () => {
    const wrapper = mountLayout(router)

    const tabs = wrapper.findAll('.v-tab')
    const recetasTab = tabs[1]
    expect(recetasTab.attributes('href')).toBe('/productos/recetas')
  })
})
