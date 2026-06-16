// REQ-CATALOG-17..20: cost calculator pure function + reactive composable.
// The pure function does the math; the composable wires it to the store
// (recipes.store.costoPorReceta). The composable is added in PR3 once the
// recipes store exists — PR1 only ships the pure function for unit tests.
import { computed, type ComputedRef } from 'vue'
import type { CalculoReceta, IngredienteReceta, MateriaPrima } from '@/types'
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
  const ingredientes = lineas.map<CalculoReceta['ingredientes'][number]>((linea) => {
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

// PR1 placeholder — the reactive binding to the store arrives in PR3 once
// `useRecipesStore` exists. Returning a `ComputedRef<CalculoReceta | null>`
// already typed so the view layer can adopt it without churn.
export function useCalculoReceta(
  _recetaId: string,
): ComputedRef<CalculoReceta | null> {
  return computed(() => null)
}
