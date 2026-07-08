// mobile-ux-redesign Phase 4: Inventory store.
// Thin reactive wrapper around the useInventario composable.
// Exposes Pinia-style reactive state: items, stockCritico,
// and unidadesPosiblesPorProducto for cross-view consumption.
import { computed, inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, MateriaPrima, RecetaConIngredientes } from '@/types'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { alertLevel, unidadesPosibles, type AlertLevel } from '@/composables/useInventario'

export const useInventarioStore = defineStore('inventario', () => {
  // Supabase is required for store initialization but delegations go
  // through ingredients/recipes stores, not direct Supabase calls.
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }

  const ingredientsStore = useIngredientsStore()
  const recipesStore = useRecipesStore()

  /** All ingredients (reactive via ingredients store). */
  const items = computed<MateriaPrima[]>(() => ingredientsStore.materiasPrimas)

  /** Total ingredient need summed across all recipes. */
  const necesidadTotal = computed<Map<string, number>>(() => {
    const map = new Map<string, number>()
    for (const receta of recipesStore.recetas) {
      for (const ing of receta.ingredientes) {
        const actual = map.get(ing.materia_prima_id) ?? 0
        map.set(ing.materia_prima_id, actual + ing.cantidad)
      }
    }
    return map
  })

  /** Count of ingredients with alert level 'crítico'. */
  const stockCritico = computed<number>(() => {
    let count = 0
    for (const mp of ingredientsStore.materiasPrimas) {
      const disponible = mp.cantidad_disponible ?? 0
      const necesidad = necesidadTotal.value.get(mp.id) ?? 0
      if (alertLevel(disponible, necesidad) === 'crítico') {
        count++
      }
    }
    return count
  })

  /** Map of receta_id → producible units. */
  const unidadesPosiblesPorProducto = computed<Map<string, number>>(() => {
    const map = new Map<string, number>()
    const stock = new Map<string, number>()
    for (const mp of ingredientsStore.materiasPrimas) {
      stock.set(mp.id, mp.cantidad_disponible ?? 0)
    }
    for (const receta of recipesStore.recetas) {
      map.set(receta.id, unidadesPosibles(stock, receta.ingredientes))
    }
    return map
  })

  return {
    items,
    necesidadTotal,
    stockCritico,
    unidadesPosiblesPorProducto,
    alertLevel,
    unidadesPosibles,
  }
})
