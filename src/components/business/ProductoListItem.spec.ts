// REQ-POS-46, REQ-POS-54: presentational list-row variant of the
// product card (used on mobile or in dense list contexts). Same
// emits as ProductoCard minus `agregar` — the list-row always sits
// inside a list that supports taps.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProductoListItem from './ProductoListItem.vue'
import type { Producto } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkProducto = (overrides: Partial<Producto> = {}): Producto => ({
  id: 'p-1',
  receta_id: 'r-1',
  // catalog-domain-refactor / Slice 1
  nombre: 'Producto de prueba',
  categoria: null,
  precio_venta: null,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: null,
  color: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mountItem = (props: { producto: Producto; nombreReceta?: string }) =>
  mount(ProductoListItem, {
    props: { producto: props.producto, nombreReceta: props.nombreReceta ?? 'Pan básico' },
    global: { plugins: [vuetify] },
  })

describe('ProductoListItem', () => {
  it('renders the recipe name and price (REQ-POS-46)', () => {
    const wrapper = mountItem({ producto: mkProducto({ precio_venta: 7.5 }) })

    expect(wrapper.text()).toContain('Pan básico')
    expect(wrapper.text()).toMatch(/7[.,]50/)
  })

  it('shows a "No disponible" badge when the product is hidden (REQ-POS-3)', () => {
    const wrapper = mountItem({ producto: mkProducto({ disponible: false }) })

    expect(wrapper.text()).toContain('No disponible')
  })

  it('emits toggle and eliminar when those buttons fire (REQ-POS-46)', async () => {
    const wrapper = mountItem({ producto: mkProducto() })

    await wrapper.find('[data-testid="producto-item-toggle"]').trigger('click')
    await wrapper.find('[data-testid="producto-item-eliminar"]').trigger('click')

    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('eliminar')).toBeTruthy()
  })

  // productos-mejoras / producto-descripcion: descripcion surfaces as
  // a secondary subtitle line when present, falling back to price-only
  // when null.
  it('renders descripcion as the subtitle when present (productos-mejoras)', () => {
    const wrapper = mountItem({
      producto: mkProducto({ descripcion: 'Pan de masa madre' }),
    })
    expect(wrapper.text()).toContain('Pan de masa madre')
    // The price line is rendered as a separate small caption so the
    // subtitle slot stays for descripcion.
    expect(wrapper.find('[data-testid="producto-item-precio-p-1"]').exists()).toBe(true)
  })

  it('hides the descripcion subtitle when descripcion is null', () => {
    const wrapper = mountItem({ producto: mkProducto({ descripcion: null }) })
    // No descripcion subtitle line is rendered when descripcion is null.
    expect(
      wrapper.find('[data-testid="producto-item-descripcion-p-1"]').exists(),
    ).toBe(false)
    // Price line lives in the original subtitle slot (no descripcion).
    const precio = wrapper.find('[data-testid="producto-item-precio-p-1"]')
    expect(precio.exists()).toBe(true)
  })
})