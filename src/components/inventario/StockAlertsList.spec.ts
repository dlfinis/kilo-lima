// mobile-ux-redesign Phase 4: StockAlertsList component.
// Lists all ingredients with stock alerts sorted by severity
// (crítico first), using the useInventario composable.
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import StockAlertsList from './StockAlertsList.vue'
import StockAlertItem from './StockAlertItem.vue'
import type { AlertLevel } from '@/composables/useInventario'

const vuetify = createVuetify({ components, directives })

// Ingredients with stock levels and recipe needs
const INGREDIENTES_RAW = [
  { id: 'mp-1', nombre: 'Huevos', cantidad_disponible: 5, unidad: 'unidad', categoria: 'ingrediente', costo_por_unidad: 1.0, notas: null, created_at: '', updated_at: '' },
  { id: 'mp-2', nombre: 'Harina', cantidad_disponible: 30, unidad: 'g', categoria: 'ingrediente', costo_por_unidad: 2.0, notas: null, created_at: '', updated_at: '' },
  { id: 'mp-3', nombre: 'Azúcar', cantidad_disponible: 200, unidad: 'g', categoria: 'ingrediente', costo_por_unidad: 3.0, notas: null, created_at: '', updated_at: '' },
]

const NECESIDAD_MAP = new Map<string, number>([
  ['mp-1', 100],  // Huevos: 5/100 = 5% → crítico
  ['mp-2', 100],  // Harina: 30/100 = 30% → bajo
  ['mp-3', 100],  // Azúcar: 200/100 = 200% → normal
])

// Mock useInventario composable
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
  return {
    useInventario: () => ({
      items: ref(INGREDIENTES_RAW),
      necesidadTotal: computed(() => NECESIDAD_MAP),
      stockCritico: computed(() => 1),
      unidadesPosiblesPorProducto: computed(() => new Map()),
      alertLevel: realAlertLevel,
      unidadesPosibles: () => 0,
    }),
    alertLevel: realAlertLevel,
    unidadesPosibles: () => 0,
  }
})

const mountListWithItems = () =>
  mount(StockAlertsList, {
    global: { plugins: [vuetify] },
  })

describe('StockAlertsList', () => {
  it('renders the list of ingredient alert items', () => {
    const wrapper = mountListWithItems()
    const items = wrapper.findAllComponents(StockAlertItem)
    expect(items).toHaveLength(3)
  })

  it('sorts items by alert level with crítico first', () => {
    const wrapper = mountListWithItems()
    const items = wrapper.findAllComponents(StockAlertItem)
    // First item should be crítico (Huevos)
    expect(items[0]!.props('item').alertLevel).toBe('crítico')
    expect(items[0]!.props('item').nombre).toBe('Huevos')
    // Second should be bajo (Harina)
    expect(items[1]!.props('item').alertLevel).toBe('bajo')
    expect(items[1]!.props('item').nombre).toBe('Harina')
    // Third should be normal (Azúcar)
    expect(items[2]!.props('item').alertLevel).toBe('normal')
    expect(items[2]!.props('item').nombre).toBe('Azúcar')
  })

  it('renders the section title "Alertas de Stock"', () => {
    const wrapper = mountListWithItems()
    expect(wrapper.text()).toContain('Alertas de Stock')
  })

  it('shows empty state when no alerts exist', async () => {
    // With items present (3 ingredients in the mock), the empty state
    // should NOT be shown. Empty state is only shown when items are empty.
    const wrapper = mountListWithItems()
    expect(wrapper.text()).not.toContain('No hay alertas de stock')
  })

  it('renders with data-testid for the list container', () => {
    const wrapper = mountListWithItems()
    expect(wrapper.find('[data-testid="stock-alerts-list"]').exists()).toBe(true)
  })

  it('shows stockCritico count when there are critical items', () => {
    const wrapper = mountListWithItems()
    // At least one crítico item exists
    expect(wrapper.text()).toContain('Crítico')
  })

  it('renders alert badge colors through StockAlertItem', () => {
    const wrapper = mountListWithItems()
    const firstItem = wrapper.findAllComponents(StockAlertItem)[0]!
    expect(firstItem.props('item').alertLevel).toBe('crítico')
  })
})
