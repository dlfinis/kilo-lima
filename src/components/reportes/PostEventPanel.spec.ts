// mobile-ux-redesign Phase 5: PostEventPanel component.
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as comps from 'vuetify/components'
import * as dirs from 'vuetify/directives'
import { computed, ref } from 'vue'

vi.mock('@/composables/useReporteEvento', () => ({
  useReporteEvento: () => ({
    reportePorDia: computed(() => [
      { fecha: '2026-07-15', ventas: 500, cantidad: 15, cogs: 200, utilidadBruta: 300, utilidadNeta: 300 },
    ]),
    reportePorProducto: computed(() => [
      { productoId: 'p-1', productoNombre: 'Ceviche', unidades: 5, ingresoTotal: 400, cogsTotal: 160, margenReal: 0.6, utilidadBruta: 240 },
      { productoId: 'p-2', productoNombre: 'Chicha', unidades: 10, ingresoTotal: 100, cogsTotal: 40, margenReal: 0.6, utilidadBruta: 60 },
    ]),
    cierre: computed(() => null),
    cargando: computed(() => false),
    error: computed(() => null),
    cargar: async () => {},
  }),
}))

import PostEventPanel from './PostEventPanel.vue'

const vuetify = createVuetify({ components: comps, directives: dirs })

describe('PostEventPanel', () => {
  it('displays full analysis sections', () => {
    const wrapper = mount(PostEventPanel, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Resumen')
  })

  it('shows totals for ventas, COGS, utilidad', () => {
    const wrapper = mount(PostEventPanel, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Ventas')
    expect(wrapper.text()).toContain('COGS')
    expect(wrapper.text()).toContain('Utilidad')
  })

  it('shows top products list', () => {
    const wrapper = mount(PostEventPanel, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Ceviche')
    expect(wrapper.text()).toContain('Chicha')
  })
})
