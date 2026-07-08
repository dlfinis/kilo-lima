// mobile-ux-redesign Phase 3: ProductGrid — responsive grid of
// ProductButton components for the simplified POS mode. Emits
// 'add-to-cart' when a product is clicked. Includes a search bar.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProductGrid from './ProductGrid.vue'
import ProductButton from './ProductButton.vue'

const vuetify = createVuetify({ components, directives })

const mkProductos = () => [
  { id: 'p-1', nombre: 'Brownies', precio: 12.5, imagen: null },
  { id: 'p-2', nombre: 'Limonada', precio: 8.0, imagen: null },
  { id: 'p-3', nombre: 'Churros', precio: 6.5, imagen: null },
  { id: 'p-4', nombre: 'Palomitas', precio: 5.0, imagen: null },
  { id: 'p-5', nombre: 'Helado', precio: 10.0, imagen: null },
]

const mountGrid = (props = {}) =>
  mount(ProductGrid, {
    props: { productos: mkProductos(), ...props },
    global: { plugins: [vuetify] },
  })

describe('ProductGrid', () => {
  it('renders a ProductButton for each product', () => {
    const wrapper = mountGrid()
    const buttons = wrapper.findAllComponents(ProductButton)
    expect(buttons).toHaveLength(5)
  })

  it('emits add-to-cart with product id when a product button is clicked', async () => {
    const wrapper = mountGrid()
    const button = wrapper.findAllComponents(ProductButton)[0]!
    await button.vm.$emit('click', { id: 'p-1', nombre: 'Brownies', precio: 12.5 })
    expect(wrapper.emitted('add-to-cart')).toBeTruthy()
    expect(wrapper.emitted('add-to-cart')![0]).toEqual(['p-1'])
  })

  it('renders a search input at the top', () => {
    const wrapper = mountGrid()
    const searchInput = wrapper.find('input[type="text"]')
    expect(searchInput.exists()).toBe(true)
  })

  it('filters products by search text', async () => {
    const wrapper = mountGrid()
    const searchInput = wrapper.find('input[type="text"]')
    await searchInput.setValue('Brown')
    const buttons = wrapper.findAllComponents(ProductButton)
    expect(buttons).toHaveLength(1)
    expect(wrapper.text()).toContain('Brownies')
  })

  it('filters case-insensitively', async () => {
    const wrapper = mountGrid()
    const searchInput = wrapper.find('input[type="text"]')
    await searchInput.setValue('brown')
    const buttons = wrapper.findAllComponents(ProductButton)
    expect(buttons).toHaveLength(1)
  })

  it('shows all products when search is empty', async () => {
    const wrapper = mountGrid()
    const searchInput = wrapper.find('input[type="text"]')
    await searchInput.setValue('ch')
    expect(wrapper.findAllComponents(ProductButton)).toHaveLength(1)
    await searchInput.setValue('')
    expect(wrapper.findAllComponents(ProductButton)).toHaveLength(5)
  })

  it('shows empty state message when no products match search', async () => {
    const wrapper = mountGrid()
    const searchInput = wrapper.find('input[type="text"]')
    await searchInput.setValue('xyznotfound')
    expect(wrapper.findAllComponents(ProductButton)).toHaveLength(0)
    expect(wrapper.text()).toContain('Sin productos')
  })

  it('shows empty state message when productos array is empty', () => {
    const wrapper = mountGrid({ productos: [] })
    expect(wrapper.findAllComponents(ProductButton)).toHaveLength(0)
    expect(wrapper.text()).toContain('Sin productos')
  })

  it('uses responsive column classes on the grid container', () => {
    const wrapper = mountGrid()
    const gridContainer = wrapper.find('.product-grid')
    expect(gridContainer.exists()).toBe(true)
    // The row should exist containing the grid columns
    expect(wrapper.find('.v-row').exists()).toBe(true)
  })
})
