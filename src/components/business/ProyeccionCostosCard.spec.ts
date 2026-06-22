// REQ-EVENTS-22, REQ-EVENTS-23, REQ-EVENTS-24, REQ-EVENTS-36: the
// card renders the full projection breakdown per design §6 —
// totales (costosFijos + costosVariables + costoTotal), per-gasto
// desgloseFijos, per-receta desgloseVariables, and a yellow
// `v-alert` when any line carries a MATERIA_PRIMA_FALTANTE /
// RECETA_FALTANTE advertencia. Empty state shows a friendly
// Spanish message (REQ-EVENTS-23).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ProyeccionCostosCard from './ProyeccionCostosCard.vue'
import type { ProyeccionResultado } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkProyeccion = (overrides: Partial<ProyeccionResultado> = {}): ProyeccionResultado => ({
  costosFijos: 0,
  costosVariables: 0,
  costoTotal: 0,
  lineas: [],
  desgloseFijos: [],
  desgloseVariables: [],
  breakEvenUnidades: null,
  breakEvenIngreso: null,
  contribucionPromedioPonderada: null,
  precioMinimoSugeridoPorProducto: {},
  ...overrides,
})

const mountCard = (proyeccion: ProyeccionResultado | null) =>
  mount(ProyeccionCostosCard, {
    props: { proyeccion },
    global: { plugins: [vuetify] },
  })

describe('ProyeccionCostosCard', () => {
  it('renders the three sections (fijos, variables, total) with the projection values (REQ-EVENTS-22)', () => {
    const proyeccion = mkProyeccion({
      costosFijos: 800,
      costosVariables: 150,
      costoTotal: 950,
      desgloseFijos: [
        { gastoId: 'g-1', categoria: 'renta', monto: 500, descripcion: 'Alquiler' },
        { gastoId: 'g-2', categoria: 'servicios', monto: 300, descripcion: null },
      ],
      desgloseVariables: [
        { recetaId: 'r-1', recetaNombre: 'Pan de muerto', costoLinea: 150 },
      ],
      lineas: [
        {
          recetaId: 'r-1',
          recetaNombre: 'Pan de muerto',
          unidades: 10,
          costoPorUnidad: 15,
          costoLinea: 150,
        },
      ],
    })

    const wrapper = mountCard(proyeccion)

    expect(wrapper.text()).toContain('Costos fijos')
    expect(wrapper.text()).toContain('800.00')
    expect(wrapper.text()).toContain('Costos variables')
    expect(wrapper.text()).toContain('150.00')
    expect(wrapper.text()).toContain('Total')
    expect(wrapper.text()).toContain('950.00')
    // Per-gasto breakdown shows the categoria label.
    expect(wrapper.text()).toContain('Renta')
    expect(wrapper.text()).toContain('Servicios')
    // Per-receta breakdown shows the receta name.
    expect(wrapper.text()).toContain('Pan de muerto')
  })

  it('shows a friendly empty-state message when the projection is null or all zeros (REQ-EVENTS-23)', () => {
    const wrapper = mountCard(null)
    expect(wrapper.text()).toContain('Sin gastos ni plan')

    const wrapperVacio = mountCard(mkProyeccion())
    expect(wrapperVacio.text()).toContain('Sin gastos ni plan')
  })

  it('triggers a yellow v-alert when a line has MATERIA_PRIMA_FALTANTE advertencia (REQ-EVENTS-24)', () => {
    const proyeccion = mkProyeccion({
      costosFijos: 0,
      costosVariables: 0,
      costoTotal: 0,
      desgloseVariables: [
        { recetaId: 'r-1', recetaNombre: 'Galletas', costoLinea: 0 },
      ],
      lineas: [
        {
          recetaId: 'r-1',
          recetaNombre: 'Galletas',
          unidades: 10,
          costoPorUnidad: 0,
          costoLinea: 0,
          advertencia: 'MATERIA_PRIMA_FALTANTE',
        },
      ],
    })
    const wrapper = mountCard(proyeccion)

    const alert = wrapper.findComponent({ name: 'VAlert' })
    expect(alert.exists()).toBe(true)
    expect(alert.props('type')).toBe('warning')
    expect(wrapper.text()).toContain('Galletas')
  })
})