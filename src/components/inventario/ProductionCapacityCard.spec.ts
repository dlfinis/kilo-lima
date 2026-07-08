// mobile-ux-redesign Phase 4: ProductionCapacityCard component.
// Shows max producible units for a product recipe and the
// limiting ingredient that determines the capacity.
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProductionCapacityCard from './ProductionCapacityCard.vue'
import type { AlertLevel } from '@/composables/useInventario'

const vuetify = createVuetify({ components, directives })

// Recipe with 2 ingredients
const PRODUCTO_EJEMPLO = {
  id: 'prod-1',
  nombre: 'Brownies',
  receta: [
    { materia_prima_id: 'mp-harina', cantidad: 200 },
    { materia_prima_id: 'mp-azucar', cantidad: 100 },
  ],
}

// Mock useInventario composable — provides stock levels and capacity calculation
vi.mock('@/composables/useInventario', () => {
  const { ref, computed } = require('vue')

  const realAlertLevel = (stock: number, need: number): AlertLevel => {
    if (need <= 0) return 'normal'
    if (stock <= 0) return 'crítico'
    const r = (stock / need) * 100
    if (r < 20) return 'crítico'
    if (r < 50) return 'bajo'
    return 'normal'
  }

  const realUnidadesPosibles = (stock: Map<string, number>, receta: readonly { materia_prima_id: string; cantidad: number }[]): number => {
    if (receta.length === 0) return 0
    let min = Infinity
    for (const ing of receta) {
      const d = stock.get(ing.materia_prima_id)
      if (d === undefined || d <= 0 || ing.cantidad <= 0) return 0
      const p = Math.floor(d / ing.cantidad)
      if (p < min) min = p
    }
    return min === Infinity ? 0 : min
  }

  // Stock: 500g harina, 200g azúcar
  const stock = new Map<string, number>([
    ['mp-harina', 500],
    ['mp-azucar', 200],
  ])

  // Ingredients list (MateriaPrima-shaped)
  const ingredientes = [
    { id: 'mp-harina', nombre: 'Harina', cantidad_disponible: 500, unidad: 'g', categoria: 'ingrediente', costo_por_unidad: 2.5, notas: null, created_at: '', updated_at: '' },
    { id: 'mp-azucar', nombre: 'Azúcar', cantidad_disponible: 200, unidad: 'g', categoria: 'ingrediente', costo_por_unidad: 3.0, notas: null, created_at: '', updated_at: '' },
  ]

  // necesidadTotal = 100 for both from recipe
  const necesidad = new Map<string, number>([
    ['mp-harina', 200],
    ['mp-azucar', 100],
  ])

  return {
    useInventario: () => ({
      items: ref(ingredientes),
      necesidadTotal: computed(() => necesidad),
      stockCritico: computed(() => 0),
      unidadesPosiblesPorProducto: computed(() => new Map()),
      alertLevel: realAlertLevel,
      unidadesPosibles: () => 0,
    }),
    alertLevel: realAlertLevel,
    unidadesPosibles: realUnidadesPosibles,
  }
})

const mountCard = (props = {}) =>
  mount(ProductionCapacityCard, {
    props: { producto: PRODUCTO_EJEMPLO, ...props },
    global: { plugins: [vuetify] },
  })

describe('ProductionCapacityCard', () => {
  it('calculates and displays the correct production capacity', () => {
    const wrapper = mountCard()
    // 500/200 = 2, 200/100 = 2 → min = 2
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('Brownies')
  })

  it('displays the limiting ingredient name', () => {
    const wrapper = mountCard()
    // Both ingredients allow 2 units, so both are limiting.
    // The first one in the recipe order (Harina) should be shown.
    expect(wrapper.text()).toContain('Harina')
  })

  it('shows zero when any ingredient is out of stock', () => {
    // Use a product where an ingredient has 0 stock
    const sinStock = {
      id: 'prod-2',
      nombre: 'Galletas',
      receta: [
        { materia_prima_id: 'mp-sin-existencia', cantidad: 100 },
      ],
    }
    const wrapper = mountCard({ producto: sinStock })
    expect(wrapper.text()).toContain('0')
  })

  it('shows the product name in the card', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Brownies')
  })

  it('handles a product without a recipe', () => {
    const sinReceta = { id: 'prod-3', nombre: 'Agua', receta: [] }
    const wrapper = mountCard({ producto: sinReceta })
    // Should show 0 units or a message about no recipe
    expect(wrapper.text()).toContain('0')
  })

  it('renders with a data-testid for the card', () => {
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="production-capacity-card"]').exists()).toBe(true)
  })

  it('displays the "Puedes producir" label', () => {
    const wrapper = mountCard()
    expect(wrapper.text().toLowerCase()).toContain('producir')
  })
})
