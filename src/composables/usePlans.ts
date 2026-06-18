// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-46: thin container/
// presentational seam. `storeToRefs` keeps `planesPorEvento` (Map)
// reactive in templates. `unidadesPorReceta` and `costoTotalPlan`
// are cross-store computeds that derive totals from the catalog
// recetas store + the local plan — read-only consumers (no writes
// to other stores per REQ-EVENTS-40).
import { computed, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'

import { usePlansStore } from '@/stores/plans.store'
import { useRecipesStore } from '@/stores/recipes.store'

export interface UnidadesPorReceta {
  recetaId: string
  unidades: number
}

export function usePlans() {
  const store = usePlansStore()
  const recipesStore = useRecipesStore()
  const { planesPorEvento, cargando, error } = storeToRefs(store)

  // REQ-EVENTS-15: total unidades per receta across all eventos.
  // Consumers that need a single evento's plan use
  // `planesPorEvento.get(eventoId)` directly.
  const unidadesPorReceta: ComputedRef<UnidadesPorReceta[]> = computed(() => {
    const mapa = new Map<string, number>()
    for (const filas of planesPorEvento.value.values()) {
      for (const fila of filas) {
        mapa.set(fila.receta_id, (mapa.get(fila.receta_id) ?? 0) + fila.unidades_a_producir)
      }
    }
    return Array.from(mapa.entries()).map(([recetaId, unidades]) => ({ recetaId, unidades }))
  })

  // REQ-EVENTS-15 / REQ-EVENTS-20: sum of (unidades × costoPorUnidad)
  // across every plan row in every evento. Each plan's per-evento
  // breakdown is served via useProyeccionCostos; this is the app-wide
  // total. Reuses the recipes store's `costoPorReceta(id)` computed
  // getter — single source of truth for cost math.
  const costoTotalPlan: ComputedRef<number> = computed(() => {
    let total = 0
    for (const filas of planesPorEvento.value.values()) {
      for (const fila of filas) {
        const calculo = recipesStore.costoPorReceta(fila.receta_id).value
        total += calculo.costoPorUnidad * fila.unidades_a_producir
      }
    }
    return total
  })

  return {
    planesPorEvento,
    cargando,
    error,
    cargarPorEvento: store.cargarPorEvento,
    guardarPlan: store.guardarPlan,
    eliminar: store.eliminar,
    unidadesPorReceta,
    costoTotalPlan,
  }
}