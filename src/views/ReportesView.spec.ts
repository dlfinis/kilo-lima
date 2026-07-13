// mobile-ux-redesign Phase 5: ReportesView.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as comps from 'vuetify/components'
import * as dirs from 'vuetify/directives'
import { createPinia, setActivePinia } from 'pinia'
import { computed } from 'vue'

// Mock composables
const mockContext = { reportContext: computed<'during' | 'post'>(() => 'during') }
vi.mock('@/composables/useReportContext', () => ({
  useReportContext: () => mockContext,
}))

// Mock useEventoActivo (used by ReportesView for activeEventId)
vi.mock('@/composables/useEventoActivo', () => ({
  useEventoActivo: () => ({
    activeEvent: computed(() => null),
  }),
}))

vi.mock('@/composables/useInsights', () => ({
  useInsights: () => ({
    insights: computed(() => []),
  }),
}))

vi.mock('@/composables/useReporteEvento', () => ({
  useReporteEvento: () => ({
    reportePorDia: computed(() => []),
    reportePorProducto: computed(() => []),
    rankingContribucion: computed(() => []),
    productosPagaronOperacion: computed(() => []),
    productosGananciaPura: computed(() => []),
    cierre: computed(() => null),
    cargando: computed(() => false),
    error: computed(() => null),
    cargar: async () => {},
  }),
}))

vi.mock('@/composables/useKpis', () => ({
  useKpis: () => ({
    ventasHoy: computed(() => 0),
    gastosHoy: computed(() => 0),
    utilidadEstimada: computed(() => 0),
    stockCritico: computed(() => 0),
  }),
}))

import ReportesView from '@/views/ReportesView.vue'

const vuetify = createVuetify({ components: comps, directives: dirs })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ReportesView', () => {
  it('renders InsightsBanner at top', () => {
    const wrapper = mount(ReportesView, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.find('[data-testid="insights-banner"]').exists()).toBe(true)
  })

  it('renders DuringEventPanel when context is during', () => {
    mockContext.reportContext = computed(() => 'during' as const)
    const wrapper = mount(ReportesView, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.find('[data-testid="during-event-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="post-event-panel"]').exists()).toBe(false)
  })

  it('renders PostEventPanel when context is post', () => {
    mockContext.reportContext = computed(() => 'post' as const)
    const wrapper = mount(ReportesView, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.find('[data-testid="post-event-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="during-event-panel"]').exists()).toBe(false)
  })
})
