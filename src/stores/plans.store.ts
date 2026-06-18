// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-17, REQ-EVENTS-19,
// REQ-EVENTS-26, REQ-EVENTS-40, REQ-EVENTS-42, REQ-EVENTS-44,
// REQ-EVENTS-46: setup-style Pinia store for `plan_produccion`.
// State is `planesPorEvento: Map<eventoId, PlanProduccion[]>` so
// multiple views can read a plan in O(1) — mirrors the gastosFijos
// store's keying strategy and gives the projection composable a
// direct lookup (REQ-EVENTS-40 SRP).
//
// `guardarPlan` delegates to the service's `reemplazarTodos` (the
// delete-then-insert two-call flow per REQ-EVENTS-19). On insert
// failure the local Map is cleared so the user sees an empty grid
// and can retry — matching the design §2 spec.
//
// The freeze gate (`estadoEsEditable`) reads `useEventsStore()` for
// the parent evento's estado (cross-store READ only, REQ-EVENTS-40 /
// REQ-EVENTS-46). When the evento is cerrado, both `guardarPlan` and
// `eliminar` short-circuit with `{ code: 'EVENTO_CERRADO' }` before
// any Supabase call.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  PlanProduccion,
  PlanProduccionInput,
  ServiceError,
} from '@/types'
import { estadoEsEditable } from '@/utils/estado'
import { crearPlansService, type PlansService } from '@/services/plans.service'
import { useEventsStore } from '@/stores/events.store'

const MENSAJE_ERROR_CARGA = 'Error al cargar el plan de producción'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar el plan de producción'
const MENSAJE_ERROR_ELIMINAR = 'No se pudo eliminar la fila del plan'

export const usePlansStore = defineStore('plans', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: PlansService = crearPlansService(supabase)

  const planesPorEvento = ref<Map<string, PlanProduccion[]>>(new Map())
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  function eventoEstaCerrado(eventoId: string): boolean {
    const events = useEventsStore()
    const actual = events.eventoActual?.id === eventoId ? events.eventoActual : null
    const cached = actual ?? events.eventos.find((e) => e.id === eventoId) ?? null
    return cached ? !estadoEsEditable(cached.estado) : false
  }

  async function cargarPorEvento(eventoId: string): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listarPorEvento(eventoId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    planesPorEvento.value.set(eventoId, res.data ?? [])
  }

  async function guardarPlan(eventoId: string, filas: PlanProduccionInput[]) {
    error.value = null
    if (eventoEstaCerrado(eventoId)) {
      const err: ServiceError = { code: 'EVENTO_CERRADO', message: 'Evento cerrado — no editable' }
      error.value = err.message
      return { data: null, error: err }
    }
    const res = await servicio.reemplazarTodos(eventoId, filas)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      // Per REQ-EVENTS-19 contract the local plan shows as empty after
      // a destructive failure so the user can retry.
      planesPorEvento.value.set(eventoId, [])
      return res
    }
    planesPorEvento.value.set(eventoId, res.data ?? [])
    return res
  }

  async function eliminar(id: string) {
    error.value = null
    let eventoId: string | undefined
    for (const [key, lista] of planesPorEvento.value.entries()) {
      if (lista.some((p) => p.id === id)) {
        eventoId = key
        break
      }
    }
    if (eventoId && eventoEstaCerrado(eventoId)) {
      const err: ServiceError = { code: 'EVENTO_CERRADO', message: 'Evento cerrado — no editable' }
      error.value = err.message
      return { data: null, error: err }
    }
    const res = await servicio.eliminar(id)
    if (res.error) {
      error.value = MENSAJE_ERROR_ELIMINAR
      return res
    }
    if (eventoId) {
      const lista = (planesPorEvento.value.get(eventoId) ?? []).filter((p) => p.id !== id)
      planesPorEvento.value.set(eventoId, lista)
    }
    return res
  }

  return {
    planesPorEvento,
    cargando,
    error,
    cargarPorEvento,
    guardarPlan,
    eliminar,
  }
})