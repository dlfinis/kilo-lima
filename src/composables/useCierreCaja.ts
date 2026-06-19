// REQ-POS-30, REQ-POS-31, REQ-POS-33, REQ-POS-35, REQ-POS-36,
// REQ-POS-44, REQ-POS-51, REQ-POS-55: useCierreCaja composable.
// PR1 wired the reactive bridge between cierresCaja.store +
// events.store + ventas.store + gastosFijos.store +
// gastosImprevistos.store + the pure `calcularCierre` helper. PR4
// adds the `registrarCierre` action so the view can write the cierre
// snapshot and drive en_curso → cerrado in one call.
//
// Cross-store READS happen inside `computed()` per REQ-POS-51.
// Cross-store WRITES go through `eventsService.cambiarEstado`
// (called inside `cierresCajaStore.registrarCierre`), not via direct
// mutation of `eventsStore` from this composable.
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import type {
  CierreCaja,
  CierreCajaInput,
  CierreInput,
  CierreResultado,
  GastoFijo,
  GastoImprevisto,
  ServiceError,
  Venta,
} from '@/types'
import { useCierresCajaStore } from '@/stores/cierresCaja.store'
import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { calcularCierre } from '@/utils/cierre'

export { calcularCierre }

export function useCierreCaja(eventoId: MaybeRefOrGetter<string | null>): {
  cierre: ComputedRef<CierreCaja | null>
  cargando: ComputedRef<boolean>
  error: ComputedRef<string | null>
  resumen: ComputedRef<CierreResultado | null>
  cargarPorEvento: (eventoId: string) => Promise<void>
  registrarCierre: (
    input: CierreCajaInput,
  ) => Promise<{ data: CierreCaja | null; error: ServiceError | null }>
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
    const ventasDelEvento = ventasStore.ventas.filter((v) => v.evento_id === id)
    const ventas: Venta[] = ventasDelEvento.map((v) => {
      const { items: _items, ...rest } = v
      void _items
      return rest
    })
    // REQ-FIN-6: flatten venta_items so the cierre can aggregate COGS.
    const ventaItems = ventasDelEvento.flatMap((v) => v.items)
    const gastosFijos: GastoFijo[] = Array.isArray(gastosFijosStore.gastosPorEvento.get(id))
      ? (gastosFijosStore.gastosPorEvento.get(id) as GastoFijo[])
      : []
    const gastosImprevistos: GastoImprevisto[] = Array.isArray(
      gastosImprevistosStore.gastosPorEvento.get(id),
    )
      ? (gastosImprevistosStore.gastosPorEvento.get(id) as GastoImprevisto[])
      : []
    const input: CierreInput = {
      ventas,
      ventaItems,
      gastosFijos,
      gastosImprevistos,
      efectivoEsperado: cierre.value?.efectivo_esperado ?? null,
      efectivoReal: cierre.value?.efectivo_real ?? null,
    }
    void eventsStore
    return calcularCierre(input)
  })

  async function registrarCierre(input: CierreCajaInput) {
    return cierresStore.registrarCierre(input)
  }

  async function cargarPorEvento(id: string) {
    await cierresStore.cargarPorEvento(id)
  }

  return { cierre, cargando, error, resumen, cargarPorEvento, registrarCierre }
}