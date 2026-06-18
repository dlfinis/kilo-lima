// REQ-POS-31, REQ-POS-34, REQ-POS-54: read-only review card for the
// cierre. Four sections per spec (Ventas, Gastos, Utilidad bruta,
// Diferencia). Yellow v-alert when diferencia !== 0 (REQ-POS-34).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import CierreResumenCard from './CierreResumenCard.vue'
import type { CierreResultado } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkResumen = (overrides: Partial<CierreResultado> = {}): CierreResultado => ({
  totalVentas: 100,
  totalGastosFijos: 30,
  totalGastosImprevistos: 20,
  utilidadBruta: 50,
  efectivoEsperado: null,
  efectivoReal: null,
  diferencia: null,
  ventasPorMetodoPago: {
    efectivo: 60,
    transferencia: 0,
    tarjeta: 40,
    mixto: 0,
  },
  cantidadVentas: 5,
  ...overrides,
})

const mountCard = (resumen: CierreResultado | null) =>
  mount(CierreResumenCard, {
    props: { resumen },
    global: { plugins: [vuetify] },
  })

describe('CierreResumenCard', () => {
  it('renders the four sections with values from the resumen (REQ-POS-34)', () => {
    const wrapper = mountCard(mkResumen())

    expect(wrapper.text()).toContain('Resumen del cierre')
    expect(wrapper.text()).toContain('Ventas')
    expect(wrapper.text()).toContain('5 venta(s)')
    expect(wrapper.text()).toContain('100.00')
    expect(wrapper.text()).toContain('Fijos')
    expect(wrapper.text()).toContain('30.00')
    expect(wrapper.text()).toContain('Imprevistos')
    expect(wrapper.text()).toContain('20.00')
    expect(wrapper.text()).toContain('Utilidad bruta')
    expect(wrapper.text()).toContain('50.00')
  })

  it('shows the per-metodo_pago breakdown (REQ-POS-34)', () => {
    const wrapper = mountCard(mkResumen())

    expect(wrapper.text()).toContain('Efectivo')
    expect(wrapper.text()).toContain('60.00')
    expect(wrapper.text()).toContain('Tarjeta')
    expect(wrapper.text()).toContain('40.00')
  })

  it('shows a yellow v-alert with "Faltante" when diferencia < 0 (REQ-POS-34)', () => {
    const wrapper = mountCard(
      mkResumen({
        efectivoEsperado: 100,
        efectivoReal: 95,
        diferencia: -5,
      }),
    )

    const alert = wrapper.findComponent({ name: 'VAlert' })
    expect(alert.exists()).toBe(true)
    expect(alert.props('type')).toBe('warning')
    expect(wrapper.text()).toContain('Faltante $5.00')
  })

  it('shows a yellow v-alert with "Sobrante" when diferencia > 0 (REQ-POS-34)', () => {
    const wrapper = mountCard(
      mkResumen({
        efectivoEsperado: 100,
        efectivoReal: 105,
        diferencia: 5,
      }),
    )

    expect(wrapper.text()).toContain('Sobrante $5.00')
  })

  it('shows "Cuadre exacto" and NO warning when diferencia is 0 (REQ-POS-34)', () => {
    const wrapper = mountCard(
      mkResumen({
        efectivoEsperado: 100,
        efectivoReal: 100,
        diferencia: 0,
      }),
    )

    expect(wrapper.find('[data-testid="cierre-diferencia-cuadre"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cierre-diferencia-alerta"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Cuadre exacto')
  })

  it('shows "Sin conteo de efectivo" when efectivoEsperado/Real are null (REQ-POS-31)', () => {
    const wrapper = mountCard(mkResumen())

    expect(wrapper.find('[data-testid="cierre-diferencia-skip"]').exists()).toBe(true)
  })

  it('renders the empty card when resumen is null', () => {
    const wrapper = mountCard(null)

    expect(wrapper.find('[data-testid="cierre-resumen-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sin datos para mostrar')
  })

  it('colors utilidadBruta red when negative', () => {
    const wrapper = mountCard(mkResumen({ utilidadBruta: -25 }))

    const utilidad = wrapper.find('[data-testid="cierre-utilidad"] .text-h5')
    expect(utilidad.classes()).toContain('text-error')
  })

  it('colors utilidadBruta green when positive', () => {
    const wrapper = mountCard(mkResumen({ utilidadBruta: 75 }))

    const utilidad = wrapper.find('[data-testid="cierre-utilidad"] .text-h5')
    expect(utilidad.classes()).toContain('text-success')
  })
})