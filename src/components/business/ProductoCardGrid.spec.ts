// REQ-POS-20, REQ-POS-21, REQ-POS-22, REQ-POS-23, REQ-POS-49,
// REQ-POS-54: presentational wrapper that renders the product grid
// (cols="12 sm=6 md=4 lg=3") with a search input and an empty state.
// The grid is intentionally dumb: it gets `productos` + `recetas` and
// emits `agregar` — the parent view owns the store wiring, the empty
// CTA, and the search debounce.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProductoCardGrid from './ProductoCardGrid.vue'
import type { Producto, RecetaConIngredientes } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkProducto = (id: string, overrides: Partial<Producto> = {}): Producto => ({
  id,
  receta_id: `r-${id}`,
  precio_venta: 5,
  disponible: true,
  orden: 0,
  descripcion: null,
  icono: 'mdi-food',
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

const mkReceta = (id: string, nombre: string): RecetaConIngredientes => ({
  id,
  nombre,
  descripcion: null,
  rendimiento_unidades: 1,
  notas: null,
  ingredientes: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const mountGrid = (props: {
  productos?: Producto[]
  recetas?: RecetaConIngredientes[]
  busqueda?: string
}) =>
  mount(ProductoCardGrid, {
    props: {
      productos: props.productos ?? [],
      recetas: props.recetas ?? [],
      busqueda: props.busqueda ?? '',
    },
    global: { plugins: [vuetify] },
  })

describe('ProductoCardGrid', () => {
  it('renders one card per producto (REQ-POS-20)', () => {
    const wrapper = mountGrid({
      productos: [mkProducto('p-1'), mkProducto('p-2')],
      recetas: [mkReceta('r-p-1', 'Pan basico'), mkReceta('r-p-2', 'Galleta')],
    })
    expect(wrapper.findAll('[data-testid="producto-card-active"]').length).toBe(2)
  })

  it('emits agregar with the productoId when a card is clicked (POS mode)', async () => {
    const wrapper = mountGrid({
      productos: [mkProducto('p-1')],
      recetas: [mkReceta('r-p-1', 'Pan basico')],
    })
    const card = wrapper.find('[data-testid="producto-card-active"]')
    await card.trigger('click')
    expect(wrapper.emitted('agregar')?.[0]).toEqual(['p-1'])
  })

  it('shows the empty state when productos is empty (REQ-POS-24)', () => {
    const wrapper = mountGrid({ productos: [], recetas: [] })
    expect(wrapper.find('[data-testid="producto-grid-empty"]').exists()).toBe(true)
  })

  it('filters by busqueda substring (REQ-POS-23)', () => {
    const wrapper = mountGrid({
      productos: [mkProducto('p-1'), mkProducto('p-2')],
      recetas: [mkReceta('r-p-1', 'Brownies'), mkReceta('r-p-2', 'Galletas')],
      busqueda: 'brow',
    })
    expect(wrapper.findAll('[data-testid="producto-card-active"]').length).toBe(1)
    expect(wrapper.text()).toContain('Brownies')
  })

  it('shows the no-results state when the busqueda matches nothing (REQ-POS-23)', () => {
    const wrapper = mountGrid({
      productos: [mkProducto('p-1')],
      recetas: [mkReceta('r-p-1', 'Brownies')],
      busqueda: 'zzz',
    })
    expect(wrapper.find('[data-testid="producto-grid-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No se encontraron productos')
  })
})
