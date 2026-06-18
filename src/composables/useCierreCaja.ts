// REQ-POS-30, REQ-POS-31, REQ-POS-33, REQ-POS-35, REQ-POS-36, REQ-POS-44,
// REQ-POS-51, REQ-POS-55: useCierreCaja composable. PR1 ships the
// reactive bridge between `cierresCaja.store` + `events.store` + the
// pure `calcularCierre` helper. Full registrarCierre (insert +
// cambiarEstado + redirect) lands in PR4; PR1 wires the pure export
// so views can render the resumen as data arrives.
//
// Cross-store READS happen inside `computed()` per REQ-POS-51.
// Cross-store WRITES are forbidden — PR4's `registrarCierre` will
// call `events.service.cambiarEstado` directly, NOT mutate the events
// store from this composable.
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import type {
  CierreCaja,
  CierreInput,
  CierreResultado,
  GastoFijo,
  GastoImprevisto,
  Venta,
} from '@/types'
import { useCierresCajaStore } from '@/stores/cierresCaja.store'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { calcularCierre } from '@/utils/cierre'

// Pure export — wrapped in a function so callers can pass typed
// arrays without touching Pinia. Mirrors `calcularProyeccion` from
// events PR1.
export { calcularCierre }

export function useCierreCaja(
  eventoId: MaybeRefOrGetter<string | null>,
): {
  cierre: ComputedRef<CierreCaja | null>
  cargando: ComputedRef<boolean>
  error: ComputedRef<string | null>
  resumen: ComputedRef<CierreResultado | null>
} {
  const cierresStore = useCierresCajaStore()
  const eventsStore = useEventsStore()
  const ventasStore = useVentasStore()
  const gastosImprevistosStore = useGastosImprevistosStore()
  const gastosFijosStore = useGastosFijosStore()

  const cierre = computed(() => {
    const id = toValue(eventoId)
    if (!id) return null
    const existente = cierresStore.cierre
    return existente?.evento_id === id ? existente : null
  })

  const cargando = computed(() => cierresStore.cargando)
  const error = computed(() => cierresStore.error)

  const resumen = computed<CierreResultado | null>(() => {
    const id = toValue(eventoId)
    if (!id) return null
    const ventas: Venta[] = ventasStore.ventas
      .filter((v) => v.evento_id === id)
      .map((v) => {
        const { items: _items, ...rest } = v
        void _items
        return rest
      })
    const gastosFijos: GastoFijo[] = gastosFijosStore.gastosPorEvento.get(id) ?? []
    const gastosImprevistos: GastoImprevisto[] = gastosImprevistosStore.gastos
    const input: CierreInput = {
      ventas,
      gastosFijos,
      gastosImprevistos,
      efectivoEsperado: cierre.value?.efectivo_esperado ?? null,
      efectivoReal: cierre.value?.efectivo_real ?? null,
    }
    void eventsStore // events store is consumed by PR4 for the transition gate
    return calcularCierre(input)
  })

  return { cierre, cargando, error, resumen }
}
