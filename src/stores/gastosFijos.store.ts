// REQ-EVENTS-10, REQ-EVENTS-11, REQ-EVENTS-14, REQ-EVENTS-26,
// REQ-EVENTS-40, REQ-EVENTS-42, REQ-EVENTS-44, REQ-EVENTS-46:
// gastos fijos store — keyed by `evento_id` in a Map so multiple
// views can read gastos in O(1). The freeze gate (`estadoEsEditable`)
// reads `useEventsStore().eventoActual.estado` for the parent evento
// (REQ-EVENTS-26) but never writes — cross-store READ only.
import { computed, inject, type ComputedRef, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  GastoFijo,
  GastoFijoInput,
  ServiceError,
} from '@/types'
import { estadoEsEditable } from '@/utils/estado'
import {
  crearGastosFijosService,
  type GastosFijosService,
} from '@/services/gastosFijos.service'
import { useEventsStore } from '@/stores/events.store'
import { redondearCentavos } from '@/utils/moneda'

const MENSAJE_ERROR_CARGA = 'Error al cargar los gastos fijos'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar el gasto'
const MENSAJE_ERROR_ELIMINAR = 'No se pudo eliminar el gasto'

export const useGastosFijosStore = defineStore('gastosFijos', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')
  if (!supabase) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const servicio: GastosFijosService = crearGastosFijosService(supabase)

  const gastosPorEvento = ref<Map<string, GastoFijo[]>>(new Map())
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  function asegurarLista(eventoId: string): GastoFijo[] {
    let lista = gastosPorEvento.value.get(eventoId)
    if (!lista) {
      lista = []
      gastosPorEvento.value.set(eventoId, lista)
    }
    return lista
  }

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
    gastosPorEvento.value.set(eventoId, res.data ?? [])
  }

  async function agregar(input: GastoFijoInput) {
    error.value = null
    if (eventoEstaCerrado(input.evento_id)) {
      const err: ServiceError = { code: 'EVENTO_CERRADO', message: 'Evento cerrado — no editable' }
      error.value = err.message
      return { data: null, error: err }
    }
    const res = await servicio.crear(input)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) {
      const lista = asegurarLista(input.evento_id)
      lista.unshift(res.data)
      gastosPorEvento.value.set(input.evento_id, [...lista])
    }
    return res
  }

  async function actualizar(id: string, cambios: Partial<GastoFijoInput>) {
    error.value = null
    // Resolve the parent evento_id from the Map so the gate works
    // without a separate query.
    let eventoId: string | undefined
    for (const [key, lista] of gastosPorEvento.value.entries()) {
      if (lista.some((g) => g.id === id)) {
        eventoId = key
        break
      }
    }
    if (eventoId && eventoEstaCerrado(eventoId)) {
      const err: ServiceError = { code: 'EVENTO_CERRADO', message: 'Evento cerrado — no editable' }
      error.value = err.message
      return { data: null, error: err }
    }
    const res = await servicio.actualizar(id, cambios)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data && eventoId) {
      const lista = asegurarLista(eventoId).map((g) => (g.id === id ? res.data! : g))
      gastosPorEvento.value.set(eventoId, lista)
    }
    return res
  }

  async function eliminar(id: string) {
    error.value = null
    let eventoId: string | undefined
    for (const [key, lista] of gastosPorEvento.value.entries()) {
      if (lista.some((g) => g.id === id)) {
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
      const lista = asegurarLista(eventoId).filter((g) => g.id !== id)
      gastosPorEvento.value.set(eventoId, lista)
    }
    return res
  }

  function totalPorEvento(eventoId: string): ComputedRef<number> {
    return computed<number>(() => {
      const lista = gastosPorEvento.value.get(eventoId) ?? []
      const suma = lista.reduce((acc, g) => acc + (Number.isFinite(g.monto) ? g.monto : 0), 0)
      return redondearCentavos(suma)
    })
  }

  return {
    gastosPorEvento,
    cargando,
    error,
    cargarPorEvento,
    agregar,
    actualizar,
    eliminar,
    totalPorEvento,
  }
})
