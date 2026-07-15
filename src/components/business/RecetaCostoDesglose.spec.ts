// REQ-CATALOG-14, REQ-CATALOG-16, REQ-CATALOG-45: pure presentation
// component that renders the cost breakdown for a `CalculoReceta`.
// It receives the pre-computed `CalculoReceta` via prop (no service /
// store / calculator calls inside the component) so the view can decide
// when to recompute and pass fresh data. The `MATERIA_PRIMA_FALTANTE`
// warning renders as a yellow v-alert above the table.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import RecetaCostoDesglose from './RecetaCostoDesglose.vue'
import type { CalculoReceta } from '@/types'

const vuetify = createVuetify({ components, directives })

const mkCalculo = (overrides: Partial<CalculoReceta> = {}): CalculoReceta => ({
  ingredientes: [],
  costoTotal: 0,
  costoPorUnidad: 0,
  ...overrides,
})

const mountDesglose = (calculo: CalculoReceta) =>
  mount(RecetaCostoDesglose, {
    props: { calculo },
    global: { plugins: [vuetify] },
  })

describe('RecetaCostoDesglose', () => {
  it('shows the totals row (REQ-CATALOG-14)', () => {
    const wrapper = mountDesglose(mkCalculo({ costoTotal: 2.5, costoPorUnidad: 1.25 }))

    expect(wrapper.text()).toContain('2.50')
    expect(wrapper.text()).toContain('1.25')
  })

  it('renders one row per ingredient with name, quantity, unit, cost, subtotal', () => {
    const calculo = mkCalculo({
      ingredientes: [
        {
          ingrediente: {
            id: 'ri-1',
            receta_id: 'r-1',
            materia_prima_id: 'mp-1',
            cantidad: 1,
            created_at: '2026-01-01T00:00:00Z',
          },
          materiaPrima: {
            id: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            costo_por_unidad: 2.5,
            notas: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          subtotal: 2.5,
        },
      ],
    })
    const wrapper = mountDesglose(calculo)

    const texto = wrapper.text()
    expect(texto).toContain('Harina')
    expect(texto).toContain('2.50')
  })

  it('shows a warning alert when an ingredient has MATERIA_PRIMA_FALTANTE (REQ-CATALOG-16)', () => {
    const calculo = mkCalculo({
      ingredientes: [
        {
          ingrediente: {
            id: 'ri-1',
            receta_id: 'r-1',
            materia_prima_id: 'mp-missing',
            cantidad: 1,
            created_at: '2026-01-01T00:00:00Z',
          },
          materiaPrima: null,
          subtotal: 0,
          advertencia: 'MATERIA_PRIMA_FALTANTE',
        },
      ],
    })
    const wrapper = mountDesglose(calculo)

    const texto = wrapper.text()
    expect(texto).toMatch(/Materia prima no disponible|no disponible/i)
  })

  // REQ-RECIPE-SCALE: scaling tests
  it('scales quantities and subtotals by factorEscala (2x projection)', () => {
    const calculo = mkCalculo({
      costoTotal: 5,
      costoPorUnidad: 0.5,
      ingredientes: [
        {
          ingrediente: {
            id: 'ri-1',
            receta_id: 'r-1',
            materia_prima_id: 'mp-1',
            cantidad: 1,
            created_at: '2026-01-01T00:00:00Z',
          },
          materiaPrima: {
            id: 'mp-1',
            nombre: 'Harina',
            unidad: 'kg',
            costo_por_unidad: 5,
            notas: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          subtotal: 5,
        },
      ],
    })
    const wrapper = mount(RecetaCostoDesglose, {
      props: { calculo, factorEscala: 2 },
      global: { plugins: [vuetify] },
    })

    const texto = wrapper.text()
    // Quantity scaled: 1 kg → 2 kg
    expect(texto).toContain('2')
    // Subtotal scaled: $5 → $10
    expect(texto).toContain('10')
    // Total scaled: $5 → $10
    expect(texto).toContain('10.00')
  })

  it('defaults to factor 1 when factorEscala is not provided', () => {
    const calculo = mkCalculo({
      costoTotal: 5,
      ingredientes: [
        {
          ingrediente: {
            id: 'ri-1',
            receta_id: 'r-1',
            materia_prima_id: 'mp-1',
            cantidad: 2.5,
            created_at: '2026-01-01T00:00:00Z',
          },
          materiaPrima: {
            id: 'mp-1',
            nombre: 'Azúcar',
            unidad: 'kg',
            costo_por_unidad: 3,
            notas: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          subtotal: 7.5,
        },
      ],
    })
    const wrapper = mountDesglose(calculo)

    const texto = wrapper.text()
    // No scaling: quantity stays 2.5, subtotal stays $7.50
    expect(texto).toContain('2.5')
    expect(texto).toContain('7.50')
  })
})
