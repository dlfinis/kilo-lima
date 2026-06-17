// REQ-CATALOG-46: thin container/presentational seam between the view
// and the store. Exposes the same surface as the store but with reactive
// `storeToRefs` so destructuring in the template keeps reactivity.
import { storeToRefs } from 'pinia'

import { useIngredientsStore } from '@/stores/ingredients.store'

export function useIngredients() {
  const store = useIngredientsStore()
  const { materiasPrimas, cargando, error } = storeToRefs(store)

  return {
    materiasPrimas,
    cargando,
    error,
    cargarTodas: store.cargarTodas,
    crear: store.crear,
    actualizar: store.actualizar,
    eliminar: store.eliminar,
  }
}
