// mobile-ux-redesign Phase 4: StockAlertItem component.
// Displays a single ingredient with name, stock level, alert badge,
// and optional production capacity indicator.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import StockAlertItem from './StockAlertItem.vue'
import type { AlertLevel } from '@/composables/useInventario'

const vuetify = createVuetify({ components, directives })

interface ItemProps {
  nombre: string
  cantidad_disponible: number
  unidad: string
  alertLevel: AlertLevel
  unidadesPosibles?: number
}

const mountItem = (props: ItemProps) =>
  mount(StockAlertItem, {
    props: { item: props },
    global: { plugins: [vuetify] },
  })

describe('StockAlertItem', () => {
  it('displays the ingredient name', () => {
    const wrapper = mountItem({
      nombre: 'Harina',
      cantidad_disponible: 500,
      unidad: 'g',
      alertLevel: 'normal',
    })
    expect(wrapper.text()).toContain('Harina')
  })

  it('displays the stock value and unit', () => {
    const wrapper = mountItem({
      nombre: 'Harina',
      cantidad_disponible: 500,
      unidad: 'g',
      alertLevel: 'normal',
    })
    expect(wrapper.text()).toContain('500')
    expect(wrapper.text()).toContain('g')
  })

  it('shows correct alert badge for crítico level', () => {
    const wrapper = mountItem({
      nombre: 'Harina',
      cantidad_disponible: 10,
      unidad: 'g',
      alertLevel: 'crítico',
    })
    // The badge should show "Crítico" text
    expect(wrapper.text().toLowerCase()).toContain('crítico')
  })

  it('shows correct alert badge for bajo level', () => {
    const wrapper = mountItem({
      nombre: 'Harina',
      cantidad_disponible: 30,
      unidad: 'g',
      alertLevel: 'bajo',
    })
    expect(wrapper.text().toLowerCase()).toContain('bajo')
  })

  it('shows correct alert badge for normal level', () => {
    const wrapper = mountItem({
      nombre: 'Harina',
      cantidad_disponible: 80,
      unidad: 'g',
      alertLevel: 'normal',
    })
    expect(wrapper.text().toLowerCase()).toContain('normal')
  })

  it('shows production capacity when unidadesPosibles is provided', () => {
    const wrapper = mountItem({
      nombre: 'Harina',
      cantidad_disponible: 500,
      unidad: 'g',
      alertLevel: 'normal',
      unidadesPosibles: 12,
    })
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text().toLowerCase()).toContain('unidades')
  })

  it('hides production capacity when unidadesPosibles is not provided', () => {
    const wrapper = mountItem({
      nombre: 'Harina',
      cantidad_disponible: 500,
      unidad: 'g',
      alertLevel: 'normal',
    })
    expect(wrapper.text().toLowerCase()).not.toContain('alcanza')
  })

  it('renders with a data-testid for the item', () => {
    const wrapper = mountItem({
      nombre: 'Sal',
      cantidad_disponible: 0,
      unidad: 'kg',
      alertLevel: 'crítico',
    })
    expect(wrapper.find('[data-testid="stock-alert-item"]').exists()).toBe(true)
  })
})
