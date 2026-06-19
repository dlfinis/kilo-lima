// REQ-POS-15, REQ-POS-25, REQ-POS-26, REQ-POS-27, REQ-POS-28,
// REQ-POS-29, REQ-POS-54: cart sidebar/bottom-sheet panel. Renders
// the cart lines, the total, and the two CTAs (Registrar venta +
// Vaciar carrito with confirmation dialog). Pure presentational —
// every action is an emit so the parent view owns the store calls.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import CarritoPanel from './CarritoPanel.vue'
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
  evento_producto_id: null,
  ...overrides,
})

const mountPanel = (props?: { carrito?: LineaCarrito[]; total?: number }) => {
  const p = props ?? {}
  return mount(CarritoPanel, {
    props: { carrito: p.carrito ?? [], total: p.total ?? 0 },
    global: { plugins: [vuetify] },
  })
}

describe('CarritoPanel', () => {
  it('renders an empty-state message when the cart is empty (REQ-POS-25, REQ-POS-28)', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Carrito vacío')
  })

  it('renders one VentaItem per cart line (REQ-POS-25, REQ-POS-26)', () => {
    const wrapper = mountPanel({
      carrito: [mkLinea({ producto_id: 'p-1' }), mkLinea({ producto_id: 'p-2', nombre: 'Galletas', precio_unitario: 3, subtotal: 3 })],
      total: 13,
    })
    const items = wrapper.findAllComponents(VentaItem)
    expect(items.length).toBe(2)
  })

  it('displays the total formatted as USD (REQ-POS-27, REQ-POS-48)', () => {
    const wrapper = mountPanel({ carrito: [mkLinea()], total: 25 })
    expect(wrapper.find('[data-testid="carrito-total"]').text()).toMatch(/25[.,]00/)
  })

  it('disables the Registrar venta button when the cart is empty (REQ-POS-15, REQ-POS-28)', () => {
    const wrapper = mountPanel({ carrito: [], total: 0 })
    const boton = wrapper.find('[data-testid="carrito-registrar"]')
    expect(boton.exists()).toBe(true)
    expect(boton.attributes('disabled')).toBeDefined()
  })

  it('enables the Registrar venta button when the cart has items (REQ-POS-28)', () => {
    const wrapper = mountPanel({ carrito: [mkLinea()], total: 10 })
    const boton = wrapper.find('[data-testid="carrito-registrar"]')
    expect(boton.attributes('disabled')).toBeUndefined()
  })

  it('emits registrar-venta when the Registrar button is clicked (REQ-POS-28)', async () => {
    const wrapper = mountPanel({ carrito: [mkLinea()], total: 10 })
    await wrapper.find('[data-testid="carrito-registrar"]').trigger('click')
    expect(wrapper.emitted('registrar-venta')).toBeTruthy()
  })

  it('opens the Vaciar confirmation dialog when Vaciar is clicked (REQ-POS-29)', async () => {
    const wrapper = mountPanel({ carrito: [mkLinea()], total: 10 })
    await wrapper.find('[data-testid="carrito-vaciar"]').trigger('click')
    expect(document.body.textContent).toContain('¿Vaciar el carrito?')
  })

  it('emits vaciar only after the confirmation is accepted (REQ-POS-29)', async () => {
    const wrapper = mountPanel({ carrito: [mkLinea()], total: 10 })
    await wrapper.find('[data-testid="carrito-vaciar"]').trigger('click')
    // The confirmation dialog lives in a Teleport — drive the emit
    // directly via the wrapper's $emit (the visible UI is verified
    // by the previous test; the full click chain is exercised at the
    // integration level in PosView.spec.ts).
    const vm = wrapper.vm as unknown as { confirmarVaciar: () => void }
    vm.confirmarVaciar()
    expect(wrapper.emitted('vaciar')).toBeTruthy()
  })

  it('does not emit vaciar when the confirmation is cancelled (REQ-POS-29)', async () => {
    const wrapper = mountPanel({ carrito: [mkLinea()], total: 10 })
    await wrapper.find('[data-testid="carrito-vaciar"]').trigger('click')
    const vm = wrapper.vm as unknown as { cancelarVaciar: () => void }
    vm.cancelarVaciar()
    expect(wrapper.emitted('vaciar')).toBeUndefined()
  })

  it('forwards update-cantidad and eliminar from VentaItem (REQ-POS-26, REQ-POS-54)', async () => {
    const wrapper = mountPanel({ carrito: [mkLinea()], total: 10 })
    const item = wrapper.findComponent(VentaItem)
    await item.vm.$emit('update-cantidad', 'p-1', 5)
    await item.vm.$emit('eliminar', 'p-1')
    expect(wrapper.emitted('update-cantidad')?.[0]).toEqual(['p-1', 5])
    expect(wrapper.emitted('eliminar')?.[0]).toEqual(['p-1'])
  })
})