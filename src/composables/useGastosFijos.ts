// REQ-EVENTS-14 / REQ-EVENTS-46: thin container/presentational seam.
// `storeToRefs` keeps `gastosPorEvento` (Map) reactive in templates.
// `totalPorEvento` is exposed as a method so views can pick the evento
// they care about — matches the `costoPorReceta(id)` pattern.
import { storeToRefs } from 'pinia'

import { useGastosFijosStore } from '@/stores/gastosFijos.store'

export function useGastosFijos() {
  const store = useGastosFijosStore()
  const { gastosPorEvento, cargando, error } = storeToRefs(store)

  return {
    gastosPorEvento,
    cargando,
    error,
    cargarPorEvento: store.cargarPorEvento,
    agregar: store.agregar,
    actualizar: store.actualizar,
    eliminar: store.eliminar,
    totalPorEvento: store.totalPorEvento,
  }
}
