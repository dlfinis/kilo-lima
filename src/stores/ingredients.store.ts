// REQ-CATALOG-1..5, REQ-CATALOG-7, REQ-CATALOG-8, REQ-CATALOG-42, REQ-CATALOG-46:
// setup-style Pinia store for `materias_primas`. The factory-built service
// comes from `inject('supabase')` (DIP, REQ-CATALOG-46); the store owns the
// reactive cache so multiple views share one fetch. Errors surface in
// Spanish to keep the view layer declarative.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, MateriaPrima, MateriaPrimaInput } from '@/types'
import { crearIngredientsService, type IngredientsService } from '@/services/ingredients.service'

// Friendly Spanish error prefix used by the view layer's `v-alert`. Keeping
// the message in the store (vs. the view) ensures all callers render the
// same wording, satisfying REQ-CATALOG-8 / REQ-CATALOG-35.
const MENSAJE_ERROR_CARGA = 'Error al cargar las materias primas'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar la materia prima'
const MENSAJE_ERROR_ELIMINAR = (nombre: string): string =>
  `No se puede eliminar "${nombre}" porque está en uso en una receta`

export const useIngredientsStore = defineStore('ingredients', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')
  if (!supabase) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const servicio: IngredientsService = crearIngredientsService(supabase)

  const materiasPrimas = ref<MateriaPrima[]>([])
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
    materiasPrimas.value = res.data ?? []
  }

  async function crear(input: MateriaPrimaInput) {
    error.value = null
    const res = await servicio.crear(input)
    if (res.error) {
      error.value = res.error.code === 'DUPLICADO' ? res.error.message : MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) materiasPrimas.value = [res.data, ...materiasPrimas.value]
    return res
  }

  async function actualizar(id: string, cambios: Partial<MateriaPrimaInput>) {
    error.value = null
    const res = await servicio.actualizar(id, cambios)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) {
      materiasPrimas.value = materiasPrimas.value.map((m) => (m.id === id ? res.data! : m))
    }
    return res
  }

  async function eliminar(id: string) {
    error.value = null
    const materia = materiasPrimas.value.find((m) => m.id === id)
    const res = await servicio.eliminar(id)
    if (res.error) {
      // 23503 = foreign_key_violation in Postgres; RESTRICT on
      // receta_ingredientes.materia_prima_id surfaces here.
      error.value =
        res.error.code === '23503' && materia
          ? MENSAJE_ERROR_ELIMINAR(materia.nombre)
          : MENSAJE_ERROR_ELIMINAR(materia?.nombre ?? id)
      return res
    }
    materiasPrimas.value = materiasPrimas.value.filter((m) => m.id !== id)
    return res
  }

  return {
    materiasPrimas,
    cargando,
    error,
    cargarTodas,
    crear,
    actualizar,
    eliminar,
  }
})
