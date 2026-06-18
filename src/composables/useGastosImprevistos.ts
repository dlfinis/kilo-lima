// REQ-POS-37, REQ-POS-39, REQ-POS-44, REQ-POS-46, REQ-POS-54:
// thin container/presentational seam between views
// (CierresCajaView, PosView) and the store. Mirrors the
// `useProductos` / `useGastosFijos` pattern.
import { storeToRefs } from 'pinia'

import { useGastosImprevistosStore } from '@/stores/gastosImprevistos.store'

export function useGastosImprevistos() {
  const store = useGastosImprevistosStore()
  const { gastosPorEvento, gastos, cargando, error } = storeToRefs(store)

  return {
    gastosPorEvento,
    gastos,
    cargando,
    error,
    cargarPorEvento: store.cargarPorEvento,
    crear: store.crear,
    actualizar: store.actualizar,
    eliminar: store.eliminar,
    totalPorEvento: store.totalPorEvento,
  }
}