// mobile-ux-redesign Phase 2: useKpis composable.
// Computes 4 KPIs for the HomeView dashboard from store data:
//   ventasHoy — sum of ventas whose fecha is today
//   gastosHoy — sum of all gastos for the active event
//   utilidadEstimada — ventasHoy - gastosHoy
//   stockCritico — placeholder (inventory phase not yet implemented)
import { computed, type ComputedRef } from 'vue'

import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import { hoyISO } from '@/utils/fecha'

export interface KpisDashboard {
  ventasHoy: ComputedRef<number>
  gastosHoy: ComputedRef<number>
  utilidadEstimada: ComputedRef<number>
  stockCritico: ComputedRef<number>
}

export function useKpis(): KpisDashboard {
  const eventsStore = useEventsStore()
  const ventasStore = useVentasStore()
  const gastosFijosStore = useGastosFijosStore()
  const gastosImprevistosStore = useGastosImprevistosStore()

  const activeEventId = computed<string | null>(() => {
    const noCerrados = eventsStore.eventos.filter((e) => e.estado !== 'cerrado')
    return noCerrados.length === 1 ? noCerrados[0]!.id : null
  })

  const ventasHoy = computed<number>(() => {
    const hoy = hoyISO()
    return ventasStore.ventas
      .filter((v) => v.fecha.startsWith(hoy))
      .reduce((sum, v) => sum + v.total, 0)
  })

  const gastosHoy = computed<number>(() => {
    const eventoId = activeEventId.value
    if (!eventoId) return 0
    const fijos = gastosFijosStore.gastosPorEvento.get(eventoId) ?? []
    const imprevistos = gastosImprevistosStore.gastosPorEvento.get(eventoId) ?? []
    const totalFijos = fijos.reduce((sum, g) => sum + g.monto, 0)
    const totalImprevistos = imprevistos.reduce((sum, g) => sum + g.monto, 0)
    return totalFijos + totalImprevistos
  })

  const utilidadEstimada = computed<number>(() => {
    return ventasHoy.value - gastosHoy.value
  })

  const stockCritico = computed<number>(() => {
    // Placeholder — inventory intelligence is Phase 4.
    return 0
  })

  return {
    ventasHoy,
    gastosHoy,
    utilidadEstimada,
    stockCritico,
  }
}
