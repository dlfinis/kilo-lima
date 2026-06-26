// REQ-POS-1, REQ-POS-46, REQ-POS-54: presentational card for a single
// producto. Shows recipe name, price, available toggle, and an
// "Agregar al carrito" button (disabled in PR2 — the cart store lands
// in PR3). Edit/Toggle/Eliminar actions are exposed via emits so the
// view layer can wire them to dialogs without coupling the card to
// any store.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProductoCard from './ProductoCard.vue'
import type { Producto } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkProducto = (overrides: Partial<Producto> = {}): Producto => ({
  id: 'p-1',
  receta_id: 'r-1',
  precio_venta: 5,
  disponible: true,
  orden: 0,
  descripcion: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mountCard = (props: { producto: Producto; nombreReceta?: string; contribucion?: number | null }) =>
  mount(ProductoCard, {
    props: {
      producto: props.producto,
      nombreReceta: props.nombreReceta ?? 'Pan básico',
      contribucion: props.contribucion ?? null,
    },
    global: { plugins: [vuetify] },
  })

describe('ProductoCard', () => {
  it('renders the recipe name and formatted price (REQ-POS-1, REQ-POS-48)', () => {
    const wrapper = mountCard({ producto: mkProducto({ precio_venta: 5 }) })

    expect(wrapper.text()).toContain('Pan básico')
    // Intl.NumberFormat('es-MX', USD) yields "USD 5.00" in some Node builds,
    // "$5.00" in others — assert the digits, not the currency glyph.
    expect(wrapper.text()).toMatch(/5[.,]00/)
  })

  it('emits agregar when the Agregar button is clicked (REQ-POS-1, REQ-POS-21)', async () => {
    const wrapper = mountCard({ producto: mkProducto() })

    const boton = wrapper.find('[data-testid="producto-card-agregar"]')
    expect(boton.exists()).toBe(true)
    await boton.trigger('click')

    expect(wrapper.emitted('agregar')).toBeTruthy()
    expect(wrapper.emitted('agregar')?.[0]).toEqual(['p-1'])
  })

  it('emits editar, toggle, eliminar when those buttons fire (REQ-POS-1)', async () => {
    const wrapper = mountCard({ producto: mkProducto() })

    await wrapper.find('[data-testid="producto-card-editar"]').trigger('click')
    await wrapper.find('[data-testid="producto-card-toggle"]').trigger('click')
    await wrapper.find('[data-testid="producto-card-eliminar"]').trigger('click')

    expect(wrapper.emitted('editar')).toBeTruthy()
    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('eliminar')).toBeTruthy()
  })

  it('hides the Agregar button when the product is unavailable (REQ-POS-3)', () => {
    const wrapper = mountCard({ producto: mkProducto({ disponible: false }) })

    expect(wrapper.find('[data-testid="producto-card-agregar"]').exists()).toBe(false)
  })

  it('does NOT render the ContribucionBadge when no contribution prop is passed (default)', () => {
    const wrapper = mountCard({ producto: mkProducto() })
    expect(wrapper.find('[data-testid="contribucion-badge"]').exists()).toBe(false)
  })

  it('renders the ContribucionBadge below the price when contribution prop is provided (REQ-CON-8)', () => {
    const wrapper = mountCard({
      producto: mkProducto({ precio_venta: 15 }),
      contribucion: 5,
    })
    const badge = wrapper.find('[data-testid="contribucion-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('Contribución')
    expect(badge.text()).toContain('5.00')
  })

  // productos-mejoras / producto-descripcion: descripcion renders
  // below the receta name when present, hidden when null.
  it('renders descripcion as a small caption when present (productos-mejoras)', () => {
    const wrapper = mountCard({
      producto: mkProducto({ descripcion: 'Pan de masa madre artesanal' }),
    })
    const caption = wrapper.find('[data-testid="producto-card-descripcion"]')
    expect(caption.exists()).toBe(true)
    expect(caption.text()).toBe('Pan de masa madre artesanal')
  })

  it('hides the descripcion caption when descripcion is null', () => {
    const wrapper = mountCard({ producto: mkProducto({ descripcion: null }) })
    expect(wrapper.find('[data-testid="producto-card-descripcion"]').exists()).toBe(false)
  })
})