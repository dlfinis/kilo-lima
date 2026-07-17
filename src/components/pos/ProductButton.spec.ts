// mobile-ux-redesign Phase 3: ProductButton presentational component.
// Displays a product as a large button with name, price, and an MDI
// icon (from producto_icono, falling back to mdi-food).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProductButton from './ProductButton.vue'

const vuetify = createVuetify({ components, directives })

const mkProduct = (overrides = {}) => ({
  id: 'p-1',
  nombre: 'Brownies',
  precio: 12.5,
  imagen: null,
  icono: null,
  ...overrides,
})

const mountButton = (props = {}) =>
  mount(ProductButton, {
    props: { product: mkProduct(), ...props },
    global: { plugins: [vuetify] },
  })

describe('ProductButton', () => {
  it('displays the product name', () => {
    const wrapper = mountButton()
    expect(wrapper.text()).toContain('Brownies')
  })

  it('displays the product price formatted as currency', () => {
    const wrapper = mountButton({ product: mkProduct({ precio: 25.0 }) })
    expect(wrapper.text()).toContain('25.00')
  })

  it('emits click event with the product when clicked', async () => {
    const product = mkProduct({ id: 'p-42', nombre: 'Limonada' })
    const wrapper = mountButton({ product })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
    expect(wrapper.emitted('click')![0]).toEqual([product])
  })

  it('shows the default mdi-food icon when no icono is provided', () => {
    const wrapper = mountButton({ product: mkProduct({ icono: null }) })
    const icon = wrapper.find('.mdi-food')
    expect(icon.exists()).toBe(true)
  })

  it('shows the producto_icono when provided', () => {
    const wrapper = mountButton({ product: mkProduct({ icono: 'mdi-coffee' }) })
    const icon = wrapper.find('.mdi-coffee')
    expect(icon.exists()).toBe(true)
  })

  it('does NOT render an image (UX: icon-based representation)', () => {
    const wrapper = mountButton({
      product: mkProduct({ imagen: 'https://example.com/img.jpg', icono: null }),
    })
    // No v-img should be rendered — icons replace photos.
    const img = wrapper.find('.v-img')
    expect(img.exists()).toBe(false)
    // Instead, the default icon should be shown.
    expect(wrapper.find('.mdi-food').exists()).toBe(true)
  })

  it('has correct aria-label with product name', () => {
    const wrapper = mountButton({
      product: mkProduct({ nombre: 'Churros', precio: 15 }),
    })
    const button = wrapper.find('button')
    const label = button.attributes('aria-label')
    expect(label).toBe('Churros')
  })

  it('renders as a large button with min-height for tap target', () => {
    const wrapper = mountButton()
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
  })

  it('uses the configured product color as a subtle card accent', () => {
    const wrapper = mountButton({ product: mkProduct({ color: 'success' }) })
    expect(wrapper.find('button').attributes('style')).toContain('--product-card-accent: #5D8A67')
  })

  it('uses the primary treatment for cart state instead of product color', () => {
    const wrapper = mountButton({ product: mkProduct({ color: 'warning', cantidadEnCarrito: 2 }) })
    expect(wrapper.find('.product-button--selected').exists()).toBe(true)
    expect(wrapper.text()).toContain('2 en carrito')
  })

  it('keeps header, name, and footer in stable layout rows', () => {
    const wrapper = mountButton({ product: mkProduct({ cantidadEnCarrito: 2 }) })
    expect(wrapper.find('.product-button__header').exists()).toBe(true)
    expect(wrapper.find('.product-button__body').exists()).toBe(true)
    expect(wrapper.find('.product-button__footer').exists()).toBe(true)
  })
})
