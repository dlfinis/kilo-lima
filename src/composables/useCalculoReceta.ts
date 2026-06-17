// REQ-CATALOG-17..20: cost calculator pure function plus the reactive
// composable that wraps the recipes store's `costoPorReceta(id)` getter.
// The pure function is the unit-testable core (PR1, ~15 unit tests);
// the composable is the thin Vue-aware seam used by RecetaDetalleView.
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

import type { CalculoReceta, IngredienteReceta, MateriaPrima } from '@/types'
import { useRecipesStore } from '@/stores/recipes.store'
import { redondearCentavos } from '@/utils/moneda'

export type LineaInput = {
  ingrediente: IngredienteReceta
  materiaPrima: MateriaPrima | null
}

// REQ-CATALOG-20: single round at the end (not per-line) to avoid cumulative
// float-drift. Per-line `subtotal` stays at full float precision.
export function calcularCostoReceta(
  lineas: LineaInput[],
  rendimiento: number,
): CalculoReceta {
  const ingredientes = lineas.map<CalculoRecetaLinea>((linea) => {
    if (linea.materiaPrima === null) {
      return {
        ingrediente: linea.ingrediente,
        materiaPrima: null,
        subtotal: 0,
        advertencia: 'MATERIA_PRIMA_FALTANTE',
      }
    }
    return {
      ingrediente: linea.ingrediente,
      materiaPrima: linea.materiaPrima,
      subtotal: linea.ingrediente.cantidad * linea.materiaPrima.costo_por_unidad,
    }
  })

  const costoTotal = redondearCentavos(
    ingredientes.reduce((acc, l) => acc + l.subtotal, 0),
  )
  const costoPorUnidad = rendimiento > 0 ? redondearCentavos(costoTotal / rendimiento) : 0

  return { ingredientes, costoTotal, costoPorUnidad }
}

type CalculoRecetaLinea = CalculoReceta['ingredientes'][number]

// REQ-CATALOG-15: reactive seam between the recipes store and the view.
// The store's `costoPorReceta(id)` already returns a `computed()` that
// tracks the ingredients store; this composable adapts the id arg to
// accept refs/getters so `RecetaDetalleView` can pass `route.params.id`
// without losing reactivity on navigation.
export function useCalculoReceta(
  recetaId: MaybeRefOrGetter<string | null>,
): ComputedRef<CalculoReceta | null> {
  const recipesStore = useRecipesStore()
  return computed<CalculoReceta | null>(() => {
    const id = toValue(recetaId)
    if (!id) return null
    return recipesStore.costoPorReceta(id).value
  })
}

