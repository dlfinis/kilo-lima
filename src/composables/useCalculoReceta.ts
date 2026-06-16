// REQ-CATALOG-17..20: cost calculator pure function.
// PR1 ships only the pure function (unit-testable without Vue/Pinia).
// The reactive `useCalculoReceta(recetaId)` composable wires the function
// to the recipes store; it lands in PR3 once that store exists.
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
  const ingredientes = lineas.map<CalcaoRecetaLinea>((linea) => {
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

type CalcaoRecetaLinea = CalculoReceta['ingredientes'][number]

