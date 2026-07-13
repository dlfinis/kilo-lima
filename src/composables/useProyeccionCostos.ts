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
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { usePlansStore } from '@/stores/plans.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductosStore } from '@/stores/productos.store'
import { useProductoProduccionStore } from '@/stores/productoProduccion.store'
import { calcularCostoReceta, type LineaInput } from '@/composables/useCalculoReceta'
import { redondearCentavos } from '@/utils/moneda'
import { calcularBreakEvenUnidades, calcularPrecioMinimoBreakEven, type ContribucionConVolumen } from '@/utils/contribucion'

// REQ-CON-4, REQ-CON-5, AC-6, AC-9: break-even + contribution fields.
// When the optional `productos` param is provided, the function computes
// the weighted-average contribution and break-even units. Without it,
// the new fields return null (backward-compatible).
export function calcularProyeccion(
  _evento: Evento,
  gastosFijos: GastoFijo[],
  plan: PlanProduccion[],
  recetas: RecetaConIngredientes[],
  materiasPrimas: MateriaPrima[],
  // Optional: priced products for this evento. When provided, the
  // function extends the result with break-even + contribution fields.
  productos?: { productoId: string; recetaId: string; precioVenta: number }[],
): ProyeccionResultado {
  // Recetas arrive with embedded `ingredientes` from the store's joined
  // query; cast to the catalog-shaped shape so the lookup stays typed.
  const recetasLista = Array.isArray(recetas) ? recetas : []
  const materiasLista = Array.isArray(materiasPrimas) ? materiasPrimas : []
  const planLista = Array.isArray(plan) ? plan : []
  const gastosLista = Array.isArray(gastosFijos) ? gastosFijos : []

  const recetaMap = new Map(recetasLista.map((r) => [r.id, r]))
  const materiaMap = new Map(materiasLista.map((m) => [m.id, m]))

  const lineas: LineaProyeccion[] = planLista.map((fila) => {
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

  const desgloseFijos: DesgloseFijo[] = gastosLista.map((g) => ({
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

  // REQ-CON-4: compute break-even and contribution when productos
  // pricing data is available. When omitted, fields stay null.
  let breakEvenUnidades: number | null = null
  let breakEvenIngreso: number | null = null
  let contribucionPromedioPonderada: number | null = null
  const precioMinimoSugeridoPorProducto: Record<string, number> = {}

  if (productos && productos.length > 0) {
    // Build a map of recetaId → precioVenta for the contribution calc.
    // Plan rows reference receta_id; we match productos by their receta.
    const precioPorReceta = new Map<string, number>()
    for (const p of productos) {
      if (p.recetaId && p.precioVenta > 0) {
        precioPorReceta.set(p.recetaId, p.precioVenta)
      }
    }

    // Build contribuciones array: for each plan row, find matching
    // producto price, compute contribution per unit.
    const contribuciones: ContribucionConVolumen[] = []
    for (const fila of planLista) {
      const precioVenta = precioPorReceta.get(fila.receta_id) ?? 0
      const linea = lineas.find((l) => l.recetaId === fila.receta_id)
      const costoPorUnidad = linea?.costoPorUnidad ?? 0
      contribuciones.push({
        contribucionUnidad: precioVenta - costoPorUnidad,
        unidades: fila.unidades_a_producir,
      })
    }

    breakEvenUnidades = calcularBreakEvenUnidades(costosFijos, contribuciones)
    // Break-even ingreso: unidades × avg precio
    if (Number.isFinite(breakEvenUnidades) && contribuciones.length > 0) {
      const totalUnidadesPlan = contribuciones.reduce((acc, c) => acc + c.unidades, 0)
      const ingresoPromedioPorUnidad = totalUnidadesPlan > 0
        ? contribuciones.reduce((acc, c) => acc + c.contribucionUnidad * c.unidades, 0) / totalUnidadesPlan + costosFijos / Math.max(1, totalUnidadesPlan)
        : 0
      breakEvenIngreso = redondearCentavos(breakEvenUnidades * ingresoPromedioPorUnidad)
    }

    // Weighted average contribution
    const totalUnidades = contribuciones.reduce((acc, c) => acc + c.unidades, 0)
    if (totalUnidades > 0) {
      contribucionPromedioPonderada = redondearCentavos(
        contribuciones.reduce((acc, c) => acc + c.contribucionUnidad * c.unidades, 0) / totalUnidades,
      )
    }

    // Per-product break-even minimum price
    for (const fila of planLista) {
      const linea = lineas.find((l) => l.recetaId === fila.receta_id)
      if (linea && linea.costoPorUnidad > 0 && fila.unidades_a_producir > 0) {
        precioMinimoSugeridoPorProducto[fila.receta_id] = calcularPrecioMinimoBreakEven(
          linea.costoPorUnidad,
          costosFijos,
          fila.unidades_a_producir,
        )
      }
    }
  }

  return {
    costosFijos,
    costosVariables,
    costoTotal,
    lineas,
    desgloseFijos,
    desgloseVariables,
    breakEvenUnidades,
    breakEvenIngreso,
    contribucionPromedioPonderada,
    precioMinimoSugeridoPorProducto,
  }
}

// REQ-EVENTS-21: reactive seam that reads from stores inside a
// `computed`. Returns null when eventoId is null/falsy (component
// gates mounting on this). The stores provide the evento, its gastos,
// its plan rows, plus the recipes and ingredients catalogs needed for
// the cost lookup. Cross-store reads inside `computed()` are tracked
// by Vue so any source change recomputes the projection.
//
// event-product-management-refactor: prefer `producto_produccion`
// (event-product-centric plan) over legacy `plan_produccion`. The
// pure function `calcularProyeccion` is unchanged — we normalize the
// new rows into the existing `PlanProduccion[]` shape before calling
// it, so the tested cost math stays intact.
export function useProyeccionCostos(
  eventoId: MaybeRefOrGetter<string | null>,
): ComputedRef<ProyeccionResultado | null> {
  const eventsStore = useEventsStore()
  const gastosStore = useGastosFijosStore()
  const plansStore = usePlansStore()
  const recipesStore = useRecipesStore()
  const ingredientsStore = useIngredientsStore()
  const epStore = useEventoProductosStore()
  const productosStore = useProductosStore()
  const ppStore = useProductoProduccionStore()

  return computed<ProyeccionResultado | null>(() => {
    const id = toValue(eventoId)
    if (!id) return null
    const evento: Evento | null =
      eventsStore.eventoActual?.id === id
        ? eventsStore.eventoActual
        : eventsStore.eventos.find((e: Evento) => e.id === id) ?? null
    if (!evento) return null
    // PR3: both gastos and plan live in their own stores, keyed by
    // evento_id in a Map for O(1) detail-view reads.
    const gastosFijos = gastosStore.gastosPorEvento.get(id) ?? []

    // event-product-management-refactor: prefer producto_produccion
    // (new event-product-centric plan) over legacy plan_produccion.
    // When producto_produccion rows exist for this event, normalize
    // them into PlanProduccion[] shape so the pure projection function
    // works unchanged. Fallback to plansStore when no new rows exist.
    const ppRows = ppStore.produccionPorEvento.get(id) ?? []
    let plan: PlanProduccion[]
    if (ppRows.length > 0) {
      // Normalize: pp → evento_producto → producto → receta_id.
      // Each producto_produccion row maps to one PlanProduccion entry
      // with receta_id derived from the linked product.
      const epRows = epStore.productosPorEvento.get(id) ?? []
      const epMap = new Map(epRows.map((ep) => [ep.id, ep]))
      const productoMap = new Map(productosStore.productos.map((p) => [p.id, p]))

      plan = ppRows
        .map((pp): PlanProduccion | null => {
          const ep = epMap.get(pp.evento_producto_id)
          if (!ep) return null
          const producto = productoMap.get(ep.producto_id)
          if (!producto) return null
          return {
            id: pp.id,
            evento_id: ep.evento_id,
            receta_id: producto.receta_id,
            unidades_a_producir: pp.unidades_a_producir,
            created_at: pp.created_at,
          }
        })
        .filter((row): row is PlanProduccion => row !== null)
    } else {
      // Fallback: legacy plan_produccion rows (backward compat).
      plan = plansStore.planesPorEvento.get(id) ?? []
    }

    // REQ-CON-4: pass priced products so the pure function can compute
    // break-even and contribution. Uses productoId → precio_venta from
    // the eventoProductos store (configured in EventoProductosView).
    const eps = epStore.productosPorEvento.get(id) ?? []
    const productos = eps.length > 0
      ? eps.map((ep) => {
          const prod = productosStore.productos.find((p) => p.id === ep.producto_id)
          return {
            productoId: ep.producto_id,
            recetaId: prod?.receta_id ?? '',
            precioVenta: ep.precio_venta ?? 0,
          }
        })
      : undefined

    return calcularProyeccion(
      evento,
      gastosFijos,
      plan,
      recipesStore.recetas,
      ingredientsStore.materiasPrimas,
      productos,
    )
  })
}
