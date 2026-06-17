// REQ-CATALOG-46: thin container/presentational seam between the view
// and the store. Mirrors `useIngredients` — exposes the same surface
// as the store but with `storeToRefs` so destructuring in the template
// keeps reactivity.
import { storeToRefs } from 'pinia'

import { useRecipesStore } from '@/stores/recipes.store'

export function useRecipes() {
  const store = useRecipesStore()
  const { recetas, cargando, error } = storeToRefs(store)

  return {
    recetas,
    cargando,
    error,
    cargarTodas: store.cargarTodas,
    crear: store.crear,
    actualizar: store.actualizar,
    eliminar: store.eliminar,
    costoPorReceta: store.costoPorReceta,
  }
}
