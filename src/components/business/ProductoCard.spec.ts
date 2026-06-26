// POS card redesign: toda la card es clickeable, icono grande,
// contribucion sutil, sin botones de editar/eliminar (eso vive en
// el catalogo, no en el POS).
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
  icono: 'mdi-food',
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mountCard = (props: { producto: Producto; nombreReceta?: string; contribucion?: number | null }) =>
  mount(ProductoCard, {
    props: {
      producto: props.producto,
      nombreReceta: props.nombreReceta ?? 'Pan basico',
      contribucion: props.contribucion ?? null,
    },
    global: { plugins: [vuetify] },
  })

describe('ProductoCard — POS redesign', () => {
  it('renders the recipe name and formatted price', () => {
    const wrapper = mountCard({ producto: mkProducto({ precio_venta: 5 }) })

    expect(wrapper.text()).toContain('Pan basico')
    expect(wrapper.text()).toMatch(/5[.,]00/)
  })

  it('renders the icon with default mdi-food', () => {
    const wrapper = mountCard({ producto: mkProducto() })
    expect(wrapper.find('[data-testid="producto-card-icono"]').exists()).toBe(true)
  })

  it('emits agregar when the card is clicked (toda la card es clickeable)', async () => {
    const wrapper = mountCard({ producto: mkProducto() })

    const card = wrapper.find('[data-testid="producto-card-active"]')
    expect(card.exists()).toBe(true)
    await card.trigger('click')

    expect(wrapper.emitted('agregar')).toBeTruthy()
    expect(wrapper.emitted('agregar')?.[0]).toEqual(['p-1'])
  })

  it('shows disabled overlay when product is unavailable', () => {
    const wrapper = mountCard({ producto: mkProducto({ disponible: false }) })

    expect(wrapper.find('[data-testid="producto-card-disabled"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="producto-card-active"]').exists()).toBe(false)
  })

  it('does NOT emit agregar when clicking a disabled card', async () => {
    const wrapper = mountCard({ producto: mkProducto({ disponible: false }) })

    const card = wrapper.find('[data-testid="producto-card-disabled"]')
    await card.trigger('click')

    expect(wrapper.emitted('agregar')).toBeFalsy()
  })

  it('does NOT render ContribucionBadge when no contribution prop is passed', () => {
    const wrapper = mountCard({ producto: mkProducto() })
    expect(wrapper.find('[data-testid="producto-card-contribucion"]').exists()).toBe(false)
  })

  it('renders contribucion text below the price when provided', () => {
    const wrapper = mountCard({
      producto: mkProducto({ precio_venta: 15 }),
      contribucion: 5,
    })
    const contribucion = wrapper.find('[data-testid="producto-card-contribucion"]')
    expect(contribucion.exists()).toBe(true)
    expect(contribucion.text()).toContain('5.00')
    expect(contribucion.classes()).toContain('text-success')
  })

  it('renders red contribucion text when contribution < 0', () => {
    const wrapper = mountCard({
      producto: mkProducto({ precio_venta: 3 }),
      contribucion: -2,
    })
    const contribucion = wrapper.find('[data-testid="producto-card-contribucion"]')
    expect(contribucion.exists()).toBe(true)
    expect(contribucion.classes()).toContain('text-error')
  })

  it('supports keyboard navigation (Enter/Space to add)', async () => {
    const wrapper = mountCard({ producto: mkProducto() })
    const card = wrapper.find('[data-testid="producto-card-active"]')

    await card.trigger('keydown.enter')
    expect(wrapper.emitted('agregar')).toBeTruthy()
  })
})
