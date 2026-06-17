// REQ-CATALOG-9..12, REQ-CATALOG-15, REQ-CATALOG-42, REQ-CATALOG-46:
// setup-style Pinia store for `recetas`. SRP: this store never holds a
// `materiasPrimas` array — the cross-store `costoPorReceta(id)` getter
// reads `useIngredientsStore().materiasPrimas` inside a `computed()`
// so Vue's reactivity propagates price changes without manual watchers.
import { computed, inject, ref, type ComputedRef } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CalculoReceta,
  Database,
  RecetaConIngredientes,
  RecetaInputCompleto,
} from '@/types'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { crearRecipesService, type RecipesService } from '@/services/recipes.service'
import { calcularCostoReceta } from '@/composables/useCalculoReceta'

const MENSAJE_ERROR_CARGA = 'Error al cargar las recetas'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar la receta'
const MENSAJE_ERROR_ELIMINAR = (nombre: string): string => `No se pudo eliminar "${nombre}"`

export const useRecipesStore = defineStore('recipes', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')
  if (!supabase) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const servicio: RecipesService = crearRecipesService(supabase)

  const recetas = ref<RecetaConIngredientes[]>([])
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  async function cargarTodas(): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listar()
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    recetas.value = res.data ?? []
  }

  async function crear(input: RecetaInputCompleto) {
    error.value = null
    const res = await servicio.crear(input)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) {
      const nueva: RecetaConIngredientes = {
        ...res.data,
        ingredientes: input.ingredientes.map((i, idx) => ({
          id: `ri-new-${idx}`,
          receta_id: res.data!.id,
          materia_prima_id: i.materia_prima_id,
          cantidad: i.cantidad,
          created_at: new Date().toISOString(),
        })),
      }
      recetas.value = [nueva, ...recetas.value]
    }
    return res
  }

  async function actualizar(id: string, cambios: RecetaInputCompleto) {
    error.value = null
    const res = await servicio.actualizar(id, cambios)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) {
      const actualizada: RecetaConIngredientes = {
        ...res.data,
        ingredientes: cambios.ingredientes.map((i, idx) => ({
          id: `ri-upd-${idx}`,
          receta_id: id,
          materia_prima_id: i.materia_prima_id,
          cantidad: i.cantidad,
          created_at: new Date().toISOString(),
        })),
      }
      recetas.value = recetas.value.map((r) => (r.id === id ? actualizada : r))
    }
    return res
  }

  async function eliminar(id: string) {
    error.value = null
    const receta = recetas.value.find((r) => r.id === id)
    const res = await servicio.eliminar(id)
    if (res.error) {
      error.value = MENSAJE_ERROR_ELIMINAR(receta?.nombre ?? id)
      return res
    }
    recetas.value = recetas.value.filter((r) => r.id !== id)
    return res
  }

  // REQ-CATALOG-15 / REQ-CATALOG-42: cross-store computed. Reading
  // `useIngredientsStore().materiasPrimas` inside `computed()` wires
  // Vue's dep tracking so any ingredient price change triggers a
  // recompute without watchers or events. Pinia auto-unwraps the
  // ref so we read the array directly.
  function costoPorReceta(id: string): ComputedRef<CalculoReceta> {
    const ingredientsStore = useIngredientsStore()
    return computed<CalculoReceta>(() => {
      const receta = recetas.value.find((r) => r.id === id)
      if (!receta) {
        return { ingredientes: [], costoTotal: 0, costoPorUnidad: 0 }
      }
      const mapa = new Map(ingredientsStore.materiasPrimas.map((m) => [m.id, m]))
      return calcularCostoReceta(
        receta.ingredientes.map((ing) => ({
          ingrediente: ing,
          materiaPrima: mapa.get(ing.materia_prima_id) ?? null,
        })),
        receta.rendimiento_unidades,
      )
    })
  }

  return {
    recetas,
    cargando,
    error,
    cargarTodas,
    crear,
    actualizar,
    eliminar,
    costoPorReceta,
  }
})
