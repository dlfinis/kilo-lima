// mobile-ux-redesign Phase 4: Inventory intelligence composable.
// Connects materias_primas + recetas stores to surface stock alerts
// and production capacity. Pure functions exported for easy testing.
import { computed, type ComputedRef } from 'vue'
import type { MateriaPrima, RecetaConIngredientes } from '@/types'

import { useIngredientsStore } from '@/stores/ingredients.store'
import { useRecipesStore } from '@/stores/recipes.store'

// -----------------------------------------------------------------------
// Pure functions — exported for unit testing
// -----------------------------------------------------------------------

export type AlertLevel = 'crítico' | 'bajo' | 'normal'

/**
 * Calculates the alert level based on current stock vs needed stock.
 * - < 20%: crítico
 * - < 50%: bajo
 * - >= 50%: normal
 *
 * Edge cases:
 * - stockNecesario = 0 → 'normal' (no need = no alert)
 * - stockActual = 0 → 'crítico'
 */
export function alertLevel(stockActual: number, stockNecesario: number): AlertLevel {
  if (stockNecesario <= 0) return 'normal'
  if (stockActual <= 0) return 'crítico'

  const ratio = (stockActual / stockNecesario) * 100
  if (ratio < 20) return 'crítico'
  if (ratio < 50) return 'bajo'
  return 'normal'
}

/** Minimal ingredient-line shape for capacity calculation. */
export interface IngredienteLinea {
  materia_prima_id: string
  cantidad: number
}

/**
 * Calculates the maximum number of producible units given current stock
 * and a recipe's ingredient requirements.
 *
 * Returns floor(min(stock_i / recipe_i)) across all ingredients.
 * Returns 0 for empty recipes, missing ingredients, or zero stock.
 */
export function unidadesPosibles(
  stock: Map<string, number>,
  receta: readonly IngredienteLinea[],
): number {
  if (receta.length === 0) return 0

  let minUnidades = Infinity

  for (const ing of receta) {
    const disponible = stock.get(ing.materia_prima_id)
    if (disponible === undefined || disponible <= 0 || ing.cantidad <= 0) {
      return 0
    }
    const posibles = Math.floor(disponible / ing.cantidad)
    if (posibles < minUnidades) {
      minUnidades = posibles
    }
  }

  return minUnidades === Infinity ? 0 : minUnidades
}

// -----------------------------------------------------------------------
// Reactive composable — uses stores
// -----------------------------------------------------------------------

export function useInventario() {
  const ingredientsStore = useIngredientsStore()
  const recipesStore = useRecipesStore()

  /** All ingredients from the store. */
  const items = computed<MateriaPrima[]>(() => ingredientsStore.materiasPrimas)

  /**
   * Total ingredient need summed across all recipes.
   * For each materia_prima_id, sums `cantidad` from all receta_ingredientes.
   */
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

  /**
   * Count of ingredients whose alert level is 'crítico'.
   * Uses necesidadTotal as the stockNecesario parameter.
   * Ingredients not used in any recipe have necesidad=0 → alertLevel returns 'normal'.
   */
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

  /**
   * Map of receta_id → producible units.
   * For each recipe, computes min(stock_i / cantidad_i) across ingredients.
   * Recipes with no ingredients or missing stock return 0.
   */
  const unidadesPosiblesPorProducto = computed<Map<string, number>>(() => {
    const map = new Map<string, number>()
    const stock = new Map<string, number>()
    for (const mp of ingredientsStore.materiasPrimas) {
      stock.set(mp.id, mp.cantidad_disponible ?? 0)
    }
    for (const receta of recipesStore.recetas) {
      const units = unidadesPosibles(stock, receta.ingredientes)
      map.set(receta.id, units)
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
}
