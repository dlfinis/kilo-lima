// REQ-POS-26, REQ-POS-54: single cart line. Renders name, +/- qty
// controls, subtotal, and a remove (×) button. Pure presentational —
// every interaction is an emit, the parent owns the store mutation.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import VentaItem from './VentaItem.vue'
import type { LineaCarrito } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkLinea = (overrides: Partial<LineaCarrito> = {}): LineaCarrito => ({
  producto_id: 'p-1',
  nombre: 'Brownies',
  precio_unitario: 5,
  cantidad: 2,
  subtotal: 10,
  costo_unitario: null,
  margen_aplicado: null,
  ...overrides,
})

const mountItem = (props: { linea?: LineaCarrito; editable?: boolean }) =>
  mount(VentaItem, {
    props: { linea: props.linea ?? mkLinea(), editable: props.editable ?? true },
    global: { plugins: [vuetify] },
  })

describe('VentaItem', () => {
  it('renders the name and formatted subtotal (REQ-POS-26, REQ-POS-48)', () => {
    const wrapper = mountItem({ linea: mkLinea({ subtotal: 10 }) })
    expect(wrapper.text()).toContain('Brownies')
    // Subtotal is shown; exact currency glyph varies so match digits.
    expect(wrapper.text()).toMatch(/10[.,]00/)
  })

  it('emits update-cantidad with productoId and nuevaCantidad when + is clicked (REQ-POS-26)', async () => {
    const wrapper = mountItem({ linea: mkLinea({ cantidad: 1 }) })
    const botonMas = wrapper.find('[data-testid="venta-item-mas"]')
    expect(botonMas.exists()).toBe(true)
    await botonMas.trigger('click')
    expect(wrapper.emitted('update-cantidad')?.[0]).toEqual(['p-1', 2])
  })

  it('emits update-cantidad with cantidad-1 when - is clicked (REQ-POS-26)', async () => {
    const wrapper = mountItem({ linea: mkLinea({ cantidad: 3 }) })
    const botonMenos = wrapper.find('[data-testid="venta-item-menos"]')
    await botonMenos.trigger('click')
    expect(wrapper.emitted('update-cantidad')?.[0]).toEqual(['p-1', 2])
  })

  it('emits eliminar with productoId when × is clicked (REQ-POS-26)', async () => {
    const wrapper = mountItem({ linea: mkLinea() })
    const botonX = wrapper.find('[data-testid="venta-item-eliminar"]')
    expect(botonX.exists()).toBe(true)
    await botonX.trigger('click')
    expect(wrapper.emitted('eliminar')?.[0]).toEqual(['p-1'])
  })

  it('hides all controls when editable is false (REQ-POS-26 read-only fallback)', () => {
    const wrapper = mountItem({ linea: mkLinea(), editable: false })
    expect(wrapper.find('[data-testid="venta-item-mas"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="venta-item-menos"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="venta-item-eliminar"]').exists()).toBe(false)
  })
})