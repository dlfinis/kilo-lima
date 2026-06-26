// REQ-POS-HOY-1..4: per-metodo_pago totals panel for the active
// evento. Pure presentational — receives `ventas` (VentaConItems[])
// and renders chips with count + total per metodo_pago.
//
// Skeleton state when `cargando: true` (REQ-POS-HOY-4). Empty state
// when no ventas (REQ-POS-HOY-2).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ResumenVentasHoy from './ResumenVentasHoy.vue'
import type { VentaConItems } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkVenta = (overrides: Partial<VentaConItems> = {}): VentaConItems => ({
  id: 'v-1',
  evento_id: 'e-1',
  fecha: '2026-06-19T12:00:00Z',
  total: 10,
  metodo_pago: 'efectivo',
  monto_recibido: null,
  cambio: null,
  comprobante_numero: null,
  created_at: '2026-06-19T12:00:00Z',
  items: [],
  ...overrides,
})

let wrappersActivos: VueWrapper[] = []

beforeEach(() => {
  wrappersActivos = []
})

afterEach(() => {
  for (const w of wrappersActivos) w.unmount()
  wrappersActivos = []
})

const mountResumen = (props: { ventas: VentaConItems[]; cargando?: boolean }) => {
  // Vuetify components (v-card, v-chip) require a v-app ancestor.
  // Wrap the component in a minimal shell so the template renders.
  const Shell = {
    components: { ResumenVentasHoy },
    template: '<v-app><ResumenVentasHoy :ventas="ventas" :cargando="cargando" /></v-app>',
    props: ['ventas', 'cargando'],
  }
  const wrapper = mount(Shell, {
    props: { ventas: props.ventas, cargando: props.cargando ?? false },
    global: { plugins: [vuetify] },
  })
  wrappersActivos.push(wrapper)
  return wrapper
}

describe('ResumenVentasHoy — aggregation (REQ-POS-HOY-1, REQ-POS-HOY-2)', () => {
  it('renders one chip per metodo_pago with count + total', () => {
    const ventas: VentaConItems[] = [
      mkVenta({ id: 'v-1', metodo_pago: 'efectivo', total: 30 }),
      mkVenta({ id: 'v-2', metodo_pago: 'efectivo', total: 20 }),
      mkVenta({ id: 'v-3', metodo_pago: 'transferencia', total: 50 }),
    ]
    const wrapper = mountResumen({ ventas })
    // Grouped by metodo_pago: 2 efectivo @ $50, 1 transferencia @ $50.
    expect(wrapper.text()).toContain('Efectivo')
    expect(wrapper.text()).toContain('Transferencia')
    // 50.00 appears at least twice (efectivo total + transferencia total).
    const matches = (wrapper.text() ?? '').match(/50[.,]00/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('renders the empty state when there are no ventas (REQ-POS-HOY-2)', () => {
    const wrapper = mountResumen({ ventas: [] })
    expect(wrapper.find('[data-testid="resumen-hoy-empty"]').exists()).toBe(true)
  })

  it('renders the loading skeleton when cargando is true (REQ-POS-HOY-4)', () => {
    const wrapper = mountResumen({ ventas: [], cargando: true })
    expect(wrapper.find('[data-testid="resumen-hoy-cargando"]').exists()).toBe(true)
  })

  it('surfaces the panel title', () => {
    const wrapper = mountResumen({ ventas: [] })
    expect(wrapper.text()).toContain('Ventas de hoy')
  })
})
