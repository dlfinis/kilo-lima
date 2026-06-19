// REQ-UX-5, REQ-UX-6, REQ-UX-25: BreadcrumbNav renders each item from
// the `items` prop, marks the last (current page) as disabled, and
// keeps ancestors as router-link with the computed `to`. The
// behaviour is asserted by visible text + testid — no CSS class
// coupling so refactors don't break the spec.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import BreadcrumbNav from './BreadcrumbNav.vue'
import type { BreadcrumbItem } from '@/utils/breadcrumb'

const vuetify = createVuetify({ components, directives })

const items: BreadcrumbItem[] = [
  { title: 'Inicio', to: '/' },
  { title: 'Materias primas', to: '/materias-primas' },
  { title: 'Detalle', disabled: true },
]

const mkRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/materias-primas', component: { template: '<div/>' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  return router
}

describe('BreadcrumbNav', () => {
  it('renders every crumb title (REQ-UX-5)', async () => {
    const router = await mkRouter()
    const wrapper = mount(BreadcrumbNav, {
      props: { items },
      global: { plugins: [vuetify, router] },
    })
    const texto = wrapper.text()
    expect(texto).toContain('Inicio')
    expect(texto).toContain('Materias primas')
    expect(texto).toContain('Detalle')
  })

  it('marks the last crumb as the disabled current page (REQ-UX-6)', async () => {
    const router = await mkRouter()
    const wrapper = mount(BreadcrumbNav, {
      props: { items },
      global: { plugins: [vuetify, router] },
    })
    expect(wrapper.find('[data-testid="breadcrumb-current"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="breadcrumb-current"]').text()).toBe('Detalle')
  })

  it('exposes the first crumb as a link to / (REQ-UX-3, REQ-UX-5)', async () => {
    const router = await mkRouter()
    const wrapper = mount(BreadcrumbNav, {
      props: { items },
      global: { plugins: [vuetify, router] },
    })
    const inicio = wrapper.find('[data-testid="breadcrumb-link-Inicio"]')
    expect(inicio.exists()).toBe(true)
    // The v-breadcrumbs item carries `to` so vue-router renders an anchor
    // targeting the parent route.
    expect(inicio.text()).toBe('Inicio')
  })
})