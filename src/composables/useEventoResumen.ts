// Resumen ejecutivo para la lista de eventos: planificación de producción
// + punto de equilibrio. Calcula por evento:
// - Unidades totales a producir (del plan)
// - Costo total (fijos + variables)
// - Break-even en unidades y en ingresos
// - Contribución promedio ponderada
import { computed, type ComputedRef } from 'vue'
import { useEventsStore } from '@/stores/events.store'
import { useGastosFijosStore } from '@/stores/gastosFijos.store'
import { usePlansStore } from '@/stores/plans.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductosStore } from '@/stores/productos.store'
import { calcularProyeccion } from '@/composables/useProyeccionCostos'

export interface EventoResumen {
  eventoId: string
  unidadesPlanificadas: number
  costoTotal: number
  breakEvenUnidades: number | null
  breakEvenIngreso: number | null
  contribucionPromedio: number | null
}

export function useEventoResumen(): ComputedRef<Map<string, EventoResumen>> {
  const eventsStore = useEventsStore()
  const gastosStore = useGastosFijosStore()
  const plansStore = usePlansStore()
  const recipesStore = useRecipesStore()
  const ingredientsStore = useIngredientsStore()
  const epStore = useEventoProductosStore()
  const productosStore = useProductosStore()

  return computed(() => {
    const resumenMap = new Map<string, EventoResumen>()

    for (const evento of eventsStore.eventos) {
      const eventoId = evento.id
      const gastosFijos = gastosStore.gastosPorEvento.get(eventoId) ?? []
      const plan = plansStore.planesPorEvento.get(eventoId) ?? []

      // Calcular unidades totales del plan
      const unidadesPlanificadas = plan.reduce((acc, fila) => acc + fila.unidades_a_producir, 0)

      // Productos del evento para cálculo de break-even
      const eps = epStore.productosPorEvento.get(eventoId) ?? []
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

      const proyeccion = calcularProyeccion(
        evento,
        gastosFijos,
        plan,
        recipesStore.recetas,
        ingredientsStore.materiasPrimas,
        productos,
      )

      resumenMap.set(eventoId, {
        eventoId,
        unidadesPlanificadas,
        costoTotal: proyeccion.costoTotal,
        breakEvenUnidades: proyeccion.breakEvenUnidades,
        breakEvenIngreso: proyeccion.breakEvenIngreso,
        contribucionPromedio: proyeccion.contribucionPromedioPonderada,
      })
    }

    return resumenMap
  })
}
