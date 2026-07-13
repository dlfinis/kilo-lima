// event-product-management-refactor: composable that provides derived
// production rows for an event. Joins `producto_produccion` (planned
// units) with `evento_productos` (pricing, inclusion), `productos`
// (commercial identity, receta_id), and recipe cost calculations.
//
// This is the data layer for the unified `Gestión productos` view
// (Phase 3). No view/routing changes in this phase — the composable
// is created here so the future view can wire it directly.
//
// Pattern follows `usePreciosEvento`: takes `MaybeRefOrGetter<string |
// null>`, reads stores inside `computed()` for free Vue reactivity.
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'

import type {
  ProductoProduccion,
  ProductoProduccionConDetalle,
  ServiceError,
} from '@/types'
import { useProductoProduccionStore } from '@/stores/productoProduccion.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { calcularCostoReceta, type LineaInput } from '@/composables/useCalculoReceta'

export interface UseProductoProduccionReturn {
  /** Derived rows: one per producto_produccion, joined with EP + product + cost. */
  filasProduccion: ComputedRef<ProductoProduccionConDetalle[]>
  cargando: ComputedRef<boolean>
  error: ComputedRef<string | null>
  cargarPorEvento: (eventoId: string) => Promise<void>
  upsert: (
    eventoId: string,
    eventoProductoId: string,
    unidades: number,
  ) => Promise<{ data: ProductoProduccion | null; error: ServiceError | null }>
}

export function useProductoProduccion(
  eventoId: MaybeRefOrGetter<string | null>,
): UseProductoProduccionReturn {
  const ppStore = useProductoProduccionStore()
  const epStore = useEventoProductosStore()
  const productosStore = useProductosStore()
  const recipesStore = useRecipesStore()
  const ingredientsStore = useIngredientsStore()

  const idRef = computed(() => toValue(eventoId))

  // Derived rows: join producto_produccion → evento_producto → producto
  // → receta cost. Same cost-calculation pattern as usePreciosEvento
  // (inline calcularCostoReceta from ingredients × matter prima map)
  // so the composable stays independent of store getter shapes.
  const filasProduccion = computed<ProductoProduccionConDetalle[]>(() => {
    const id = idRef.value
    if (!id) return []

    const produccionRows = ppStore.produccionPorEvento.get(id) ?? []
    if (produccionRows.length === 0) return []

    const epRows = epStore.productosPorEvento.get(id) ?? []
    const epMap = new Map(epRows.map((ep) => [ep.id, ep]))
    const productoMap = new Map(productosStore.productos.map((p) => [p.id, p]))
    const recetaMap = new Map(recipesStore.recetas.map((r) => [r.id, r]))
    const materiaMap = new Map(ingredientsStore.materiasPrimas.map((m) => [m.id, m]))

    return produccionRows
      .map<ProductoProduccionConDetalle | null>((pp) => {
        const ep = epMap.get(pp.evento_producto_id)
        if (!ep) return null

        const producto = productoMap.get(ep.producto_id)
        const receta = producto ? recetaMap.get(producto.receta_id) : null

        // Compute unit cost from receta ingredients (same pattern as
        // usePreciosEvento). No receta → no derived variable cost
        // (spec: "Producto sin preparación vinculada").
        let costo = 0
        if (receta && receta.ingredientes.length > 0) {
          const lineas: LineaInput[] = receta.ingredientes.map((ing) => ({
            ingrediente: ing,
            materiaPrima: materiaMap.get(ing.materia_prima_id) ?? null,
          }))
          const calculo = calcularCostoReceta(lineas, receta.rendimiento_unidades)
          costo = calculo.costoPorUnidad
        }

        return {
          // producto_produccion
          id: pp.id,
          evento_producto_id: pp.evento_producto_id,
          unidades_a_producir: pp.unidades_a_producir,
          created_at: pp.created_at,
          // evento_producto
          evento_id: ep.evento_id,
          producto_id: ep.producto_id,
          incluido: ep.incluido,
          precio_venta: ep.precio_venta,
          margen: ep.margen,
          // producto
          producto_nombre: producto?.nombre ?? '(producto sin nombre)',
          producto_categoria: producto?.categoria ?? null,
          producto_icono: producto?.icono ?? null,
          producto_color: producto?.color ?? null,
          receta_id: producto?.receta_id ?? '',
          // preparación
          receta_nombre: receta?.nombre ?? '',
          // derived
          costo_unitario: costo,
        }
      })
      .filter((row): row is ProductoProduccionConDetalle => row !== null)
  })

  return {
    filasProduccion,
    cargando: computed(() => ppStore.cargando),
    error: computed(() => ppStore.error),
    cargarPorEvento: ppStore.cargarPorEvento,
    upsert: ppStore.upsert,
  }
}
