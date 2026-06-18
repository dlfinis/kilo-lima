// REQ-CATALOG-46 / REQ-EVENTS-46: thin container/presentational seam.
// Exposes the same surface as the store but with reactive `storeToRefs`
// so destructuring in the template keeps reactivity. Matches the
// `useIngredients` / `useRecipes` catalog pattern.
import { storeToRefs } from 'pinia'

import { useEventsStore } from '@/stores/events.store'

export function useEvents() {
  const store = useEventsStore()
  const { eventos, eventoActual, cargando, error } = storeToRefs(store)

  return {
    eventos,
    eventoActual,
    cargando,
    error,
    cargarTodas: store.cargarTodas,
    cargarPorId: store.cargarPorId,
    crear: store.crear,
    actualizar: store.actualizar,
    cambiarEstado: store.cambiarEstado,
    eliminar: store.eliminar,
  }
}
