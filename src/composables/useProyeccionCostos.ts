// REQ-EVENTS-20..24: cost projection. Two exports from one file
// (matches catalog's useCalculoReceta precedent):
//   - calcularProyeccion(evento, gastos, plan, recetas, materias):
//     pure function, unit-testable with zero Vue/Supabase setup.
//   - useProyeccionCostos(eventoId): reactive composable that reads
//     from 4 stores inside a `computed`. Reactive for free via Vue
//     dependency tracking (REQ-EVENTS-21). Returns null when eventoId
//     is null/undefined.
//
// The pure function reuses catalog's `calcularCostoReceta` verbatim
// so any catalog cost-algorithm change propagates here for free.
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

import type {
  DesgloseFijo,
  DesgloseVariable,
  Evento,
  GastoFijo,
  LineaProyeccion,
  MateriaPrima,
  PlanProduccion,
  ProyeccionResultado,
  RecetaConIngredientes,
} from '@/types'
import { useEventsStore } from '@/stores/events.store'
import { usePlansStore } from '@/stores/plans.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { calcularCostoReceta, type LineaInput } from '@/composables/useCalculoReceta'
import { redondearCentavos } from '@/utils/moneda'

// REQ-EVENTS-20: pure function. Inputs are plain domain types so the
// test can pass fixtures without touching Pinia/Vue. Per design §5:
//   1. Build lookup maps (receta, materia).
//   2. For each plan row: look up receta → call calcularCostoReceta
//      → multiply costoPorUnidad × unidades for costoLinea.
//   3. Sum gastos for costosFijos.
//   4. Sum lineas for costosVariables.
//   5. costoTotal = fijos + variables. Three top-level totals each
//      rounded once via redondearCentavos to avoid cumulative ±$0.01
//      drift (REQ-EVENTS-20, matches catalog REQ-CATALOG-20 policy).
export function calcularProyeccion(
  _evento: Evento,
  gastosFijos: GastoFijo[],
  plan: PlanProduccion[],
  recetas: RecetaConIngredientes[],
  materiasPrimas: MateriaPrima[],
): ProyeccionResultado {
  // Recetas arrive with embedded `ingredientes` from the store's joined
  // query; cast to the catalog-shaped shape so the lookup stays typed.
  const recetaMap = new Map(recetas.map((r) => [r.id, r]))
  const materiaMap = new Map(materiasPrimas.map((m) => [m.id, m]))

  const lineas: LineaProyeccion[] = plan.map((fila) => {
    const receta = recetaMap.get(fila.receta_id)
    if (!receta) {
      return {
        recetaId: fila.receta_id,
        recetaNombre: '(receta faltante)',
        unidades: fila.unidades_a_producir,
        costoPorUnidad: 0,
        costoLinea: 0,
        advertencia: 'RECETA_FALTANTE',
      }
    }
    const ingredientes = receta.ingredientes
    const lineasInput: LineaInput[] = ingredientes.map((ing: { id: string; receta_id: string; materia_prima_id: string; cantidad: number; created_at: string }) => ({
      ingrediente: {
        id: `${fila.id}-${ing.materia_prima_id}`,
        receta_id: fila.receta_id,
        materia_prima_id: ing.materia_prima_id,
        cantidad: ing.cantidad,
        created_at: '2026-01-01T00:00:00Z',
      },
      materiaPrima: materiaMap.get(ing.materia_prima_id) ?? null,
    }))
    const calculo = calcularCostoReceta(lineasInput, receta.rendimiento_unidades)
    return {
      recetaId: fila.receta_id,
      recetaNombre: receta.nombre,
      unidades: fila.unidades_a_producir,
      costoPorUnidad: calculo.costoPorUnidad,
      costoLinea: calculo.costoPorUnidad * fila.unidades_a_producir,
      advertencia: calculo.ingredientes.some(
        (l) => l.advertencia === 'MATERIA_PRIMA_FALTANTE',
      )
        ? 'MATERIA_PRIMA_FALTANTE'
        : undefined,
    }
  })

  const desgloseFijos: DesgloseFijo[] = gastosFijos.map((g) => ({
    gastoId: g.id,
    categoria: g.categoria,
    monto: g.monto,
    descripcion: g.descripcion,
  }))
  const desgloseVariables: DesgloseVariable[] = lineas
    .filter((l) => l.advertencia !== 'RECETA_FALTANTE')
    .map((l) => ({
      recetaId: l.recetaId,
      recetaNombre: l.recetaNombre,
      costoLinea: l.costoLinea,
    }))

  const costosFijos = redondearCentavos(desgloseFijos.reduce((acc, g) => acc + g.monto, 0))
  const costosVariables = redondearCentavos(lineas.reduce((acc, l) => acc + l.costoLinea, 0))
  const costoTotal = redondearCentavos(costosFijos + costosVariables)

  return { costosFijos, costosVariables, costoTotal, lineas, desgloseFijos, desgloseVariables }
}

// REQ-EVENTS-21: reactive seam that reads from 4 stores inside a
// `computed`. Returns null when eventoId is null/falsy (component
// gates mounting on this). The stores provide the evento, its gastos,
// its plan rows, plus the recipes and ingredients catalogs needed for
// the cost lookup. Cross-store reads inside `computed()` are tracked
// by Vue so any source change recomputes the projection.
export function useProyeccionCostos(
  eventoId: MaybeRefOrGetter<string | null>,
): ComputedRef<ProyeccionResultado | null> {
  const eventsStore = useEventsStore()
  const plansStore = usePlansStore()
  const recipesStore = useRecipesStore()
  const ingredientsStore = useIngredientsStore()

  return computed<ProyeccionResultado | null>(() => {
    const id = toValue(eventoId)
    if (!id) return null
    const evento: Evento | null =
      eventsStore.eventoActual?.id === id
        ? eventsStore.eventoActual
        : eventsStore.eventos.find((e: Evento) => e.id === id) ?? null
    if (!evento) return null
    const gastosFijos = eventsStore.gastosFijos.filter((g: GastoFijo) => g.evento_id === id)
    const plan = plansStore.plan.filter((p: PlanProduccion) => p.evento_id === id)
    return calcularProyeccion(
      evento,
      gastosFijos,
      plan,
      recipesStore.recetas,
      ingredientsStore.materiasPrimas,
    )
  })
}
