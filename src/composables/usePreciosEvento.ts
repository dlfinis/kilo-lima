// REQ-PRICING-7, REQ-FIN-18, REQ-FIN-28/29, REQ-PRICING-3,
// REQ-CON-8 (PR-2): usePreciosEvento joins evento_productos +
// productos + recetas to surface per-producto computed prices. The
// POS grid (PR-2b) reads from `productosDelEvento` (filtered
// `incluido = true`); the EventoProductosView reads the same joined
// list to render the table. PR-2 adds two contribution getters:
//
//   - `contribucionParaProducto(productoId)` → precio_final − costo
//   - `precioMinimoParaProducto(productoId)` → break-even minimum
//
// Cross-store READS inside `computed()`:
//   - eventoProductosStore.productosPorEvento (Map<eventoId, ...>)
//   - productosStore.productos
//   - recipesStore.recetas (with embedded `ingredientes`)
//   - ingredientsStore.materiasPrimas (cost lookup)
//   - eventsStore.eventos (margen_ganancia fallback)
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

import type { EventoProductoConDetalle } from '@/types'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useEventsStore } from '@/stores/events.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { calcularCostoReceta } from '@/composables/useCalculoReceta'
import { calcularPrecioPorMargen } from '@/utils/pricing'
import { calcularContribucionUnitaria, calcularPrecioMinimoBreakEven } from '@/utils/contribucion'

export interface UsePreciosEvento {
  /** Per-evento joined list (only `incluido = true` rows). */
  productosDelEvento: ComputedRef<EventoProductoConDetalle[]>
  /** Lookup the evento-specific price for a producto (fallback: producto.precio_venta). */
  precioParaProducto: ComputedRef<(productoId: string) => number>
  /** Lookup the effective margen (product override → evento fallback). */
  margenParaProducto: ComputedRef<(productoId: string) => number | null>
  /** REQ-CON-8: monetary contribution (precio − costo) for a producto. */
  contribucionParaProducto: ComputedRef<(productoId: string) => number | null>
  /** REQ-CON-8: break-even minimum price for a producto. */
  precioMinimoParaProducto: ComputedRef<(productoId: string) => number | null>
  /** Whether the store has loaded data for this evento. */
  cargado: ComputedRef<boolean>
}

export function usePreciosEvento(
  eventoId: MaybeRefOrGetter<string | null>,
): UsePreciosEvento {
  const epStore = useEventoProductosStore()
  const eventsStore = useEventsStore()
  const productosStore = useProductosStore()
  const recipesStore = useRecipesStore()
  const ingredientsStore = useIngredientsStore()

  const idRef = computed(() => toValue(eventoId))

  const productosDelEvento = computed<EventoProductoConDetalle[]>(() => {
    const id = idRef.value
    if (!id) return []
    const lista = epStore.productosPorEvento.get(id) ?? []
    const evento = eventsStore.eventos.find((e) => e.id === id)
    const margenEvento = evento?.margen_ganancia ?? null
    const productoMap = new Map(productosStore.productos.map((p) => [p.id, p]))
    const recetaMap = new Map(recipesStore.recetas.map((r) => [r.id, r]))
    const materiaMap = new Map(ingredientsStore.materiasPrimas.map((m) => [m.id, m]))

    return lista
      .filter((ep) => ep.incluido)
      .map<EventoProductoConDetalle>((ep) => {
        const producto = productoMap.get(ep.producto_id)
        const receta = producto ? recetaMap.get(producto.receta_id) : null
        // Compute costo_unitario from the receta's ingredients × materia
        // prima costs, divided by the rendimiento_unidades. Matches
        // `recipesStore.costoPorReceta(id)` but inlined to keep this
        // composable independent of getter shapes.
        let costo = 0
        if (receta && receta.ingredientes.length > 0) {
          const calculo = calcularCostoReceta(
            receta.ingredientes.map((ing) => ({
              ingrediente: ing,
              materiaPrima: materiaMap.get(ing.materia_prima_id) ?? null,
            })),
            receta.rendimiento_unidades,
          )
          costo = calculo.costoPorUnidad
        }
        const margenEfectivo = ep.margen ?? margenEvento
        const precioSugerido =
          margenEfectivo !== null ? calcularPrecioPorMargen(costo, margenEfectivo) : 0
        const precioFinal = ep.precio_venta ?? precioSugerido
        return {
          ...ep,
          producto_nombre: receta?.nombre ?? '(producto sin receta)',
          receta_id: producto?.receta_id ?? '',
          receta_nombre: receta?.nombre ?? '',
          costo_unitario: costo,
          precio_sugerido: precioSugerido,
          margen_efectivo: margenEfectivo ?? 0,
          precio_final: precioFinal,
          producto_icono: producto?.icono ?? null,
          producto_color: producto?.color ?? null,
        }
      })
  })

  const precioParaProducto = computed<(productoId: string) => number>(() => {
    return (productoId: string): number => {
      const id = idRef.value
      if (!id) return 0
      const fila = productosDelEvento.value.find((ep) => ep.producto_id === productoId)
      if (fila) return fila.precio_final
      // Fallback to the catalog price when no evento_producto exists.
      const producto = productosStore.productos.find((p) => p.id === productoId)
      return producto?.precio_venta ?? 0
    }
  })

  const margenParaProducto = computed<(productoId: string) => number | null>(() => {
    return (productoId: string): number | null => {
      const id = idRef.value
      if (!id) return null
      const fila = productosDelEvento.value.find((ep) => ep.producto_id === productoId)
      return fila?.margen_efectivo ?? null
    }
  })

  // REQ-CON-8 (PR-2): monetary contribution per producto.
  // Delegates to `calcularContribucionUnitaria` (already single-rounded).
  // Returns null when the producto is not configured for the evento so
  // the view can show a fallback / hide the badge.
  const contribucionParaProducto = computed<(productoId: string) => number | null>(() => {
    return (productoId: string): number | null => {
      const id = idRef.value
      if (!id) return null
      const fila = productosDelEvento.value.find((ep) => ep.producto_id === productoId)
      if (!fila) return null
      return calcularContribucionUnitaria(fila.precio_final, fila.costo_unitario)
    }
  })

  // REQ-CON-8 (PR-2): break-even minimum price per producto. We
  // surface a defensive buffer (costo + gastosFijos/unidadesEstimadas)
  // computed by `calcularPrecioMinimoBreakEven`. For PR-2 we pass
  // gastosFijos=0 and unidadesEstimadas=1 so the "minimum" equals the
  // costo; full break-even integration with `useProyeccionCostos` lands
  // later. The function never returns Infinity because of the
  // `Math.max(1, ...)` defensive guard.
  const precioMinimoParaProducto = computed<(productoId: string) => number | null>(() => {
    return (productoId: string): number | null => {
      const id = idRef.value
      if (!id) return null
      const fila = productosDelEvento.value.find((ep) => ep.producto_id === productoId)
      if (!fila) return null
      return calcularPrecioMinimoBreakEven(fila.costo_unitario, 0, 1)
    }
  })

  const cargado = computed<boolean>(() => {
    const id = idRef.value
    if (!id) return false
    return epStore.productosPorEvento.has(id)
  })

  return {
    productosDelEvento,
    precioParaProducto,
    margenParaProducto,
    contribucionParaProducto,
    precioMinimoParaProducto,
    cargado,
  }
}