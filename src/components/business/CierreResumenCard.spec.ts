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
  totalCogs: 0,
  totalGastosFijos: 30,
  totalGastosImprevistos: 20,
  utilidadBruta: 100,
  utilidadNeta: 50,
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
  desgloseProductos: [],
  desgloseDias: [],
  ...overrides,
})

const mountCard = (resumen: CierreResultado | null) =>
  mount(CierreResumenCard, {
    props: { resumen },
    global: { plugins: [vuetify] },
  })

describe('CierreResumenCard', () => {
  it('renders the four sections with values from the resumen (REQ-POS-34, REQ-FIN-11)', () => {
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
    // utilidadBruta = ventas - COGS = 100 - 0 = 100.
    expect(wrapper.text()).toContain('100.00')
    // REQ-FIN-11: utilidadNeta = utilidadBruta - gastosOp = 100 - 30 - 20 = 50.
    expect(wrapper.text()).toContain('Utilidad neta')
    expect(wrapper.text()).toContain('50.00')
  })

  it('renders utilidadBruta from ventas - COGS (corrected formula, REQ-FIN-6, REQ-FIN-11)', () => {
    const wrapper = mountCard(
      mkResumen({ totalVentas: 200, totalCogs: 100, utilidadBruta: 100, utilidadNeta: 70 }),
    )

    expect(wrapper.text()).toContain('Utilidad bruta')
    expect(wrapper.text()).toContain('100.00')
    expect(wrapper.text()).toContain('Utilidad neta')
    expect(wrapper.text()).toContain('70.00')
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

// REQ-CON-15 (PR-2): informational "Margen de contribución" line.
// Surfaces total utilidadBruta against total gastos fijos + a
// "Cubiertos: N%" indicator. Does NOT affect utilidadNeta — this is
// a read-only informational row.
describe('CierreResumenCard — Margen de contribución (REQ-CON-15)', () => {
  it('renders the contribution margin section with totals + cubiertos percentage', () => {
    const wrapper = mountCard(
      mkResumen({
        utilidadBruta: 150,
        totalGastosFijos: 100,
        totalGastosImprevistos: 0,
      }),
    )

    const section = wrapper.find('[data-testid="cierre-margen"]')
    expect(section.exists()).toBe(true)
    // 150/100 = 1.5 → 150% cubiertos.
    expect(section.text()).toContain('Cubiertos')
    expect(section.text()).toContain('150')
    expect(section.text()).toContain('100.00')
  })

  it('renders 0% cubiertos when utilidadBruta is 0', () => {
    const wrapper = mountCard(
      mkResumen({
        utilidadBruta: 0,
        totalGastosFijos: 100,
        totalGastosImprevistos: 0,
      }),
    )

    const section = wrapper.find('[data-testid="cierre-margen"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain('Cubiertos')
    expect(section.text()).toContain('0%')
  })

  it('handles zero gastos fijos gracefully (Math guard — no divide-by-zero)', () => {
    const wrapper = mountCard(
      mkResumen({
        utilidadBruta: 50,
        totalGastosFijos: 0,
        totalGastosImprevistos: 0,
      }),
    )

    const section = wrapper.find('[data-testid="cierre-margen"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain('Cubiertos')
    // When gastosFijos = 0, the percentage is N/A or Infinity-safe.
    // We assert the section renders without crashing.
  })

  it('does NOT alter utilidadNeta (read-only informational row)', () => {
    const wrapper = mountCard(
      mkResumen({
        utilidadBruta: 100,
        totalGastosFijos: 30,
        totalGastosImprevistos: 20,
        utilidadNeta: 50,
      }),
    )

    // utilidadNeta stays exactly as supplied.
    expect(wrapper.text()).toContain('Utilidad neta')
    expect(wrapper.text()).toContain('50.00')
    // The margin section is independent of utilidadNeta.
    expect(wrapper.find('[data-testid="cierre-margen"]').exists()).toBe(true)
  })
})