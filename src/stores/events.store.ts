// REQ-EVENTS-1, REQ-EVENTS-2, REQ-EVENTS-3, REQ-EVENTS-4,
// REQ-EVENTS-5, REQ-EVENTS-6, REQ-EVENTS-7, REQ-EVENTS-26,
// REQ-EVENTS-40, REQ-EVENTS-42, REQ-EVENTS-44, REQ-EVENTS-46:
// setup-style Pinia store for `eventos`. SRP: this store owns eventos
// only — gastos_fijos lives in `gastosFijos.store` so multiple views
// can read gastos in O(1) via a `Map<eventoId, GastoFijo[]>`.
//
// `cambiarEstado` resolves the current `estado` from the local
// `eventos` cache (or `eventoActual`) and passes both endpoints to the
// service so the service-level gate (`transicionEstadoValida`) can
// reject invalid moves without an extra fetch. The new estado is
// mirrored on `eventoActual` so subsequent reactive reads see it.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  Evento,
  EventoInput,
  ServiceError,
} from '@/types'
import { crearEventsService, type EventsService } from '@/services/events.service'

const MENSAJE_ERROR_CARGA = 'Error al cargar los eventos'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar el evento'
const MENSAJE_ERROR_ESTADO = 'No se pudo cambiar el estado del evento'
const MENSAJE_ERROR_ELIMINAR = (nombre: string): string => `No se pudo eliminar "${nombre}"`

export const useEventsStore = defineStore('events', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: EventsService = crearEventsService(supabase)

  const eventos = ref<Evento[]>([])
  const eventoActual = ref<Evento | null>(null)
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
    eventos.value = res.data ?? []
  }

  async function cargarPorId(id: string): Promise<{ data: Evento | null; error: ServiceError | null }> {
    cargando.value = true
    error.value = null
    // The service.listar() already orders by fecha desc; for a single
    // evento we read from the cached array first, then fall back to a
    // direct eq().single() fetch so the detail view works on deep links
    // without requiring cargarTodas first.
    const cached = eventos.value.find((e) => e.id === id)
    if (cached) {
      eventoActual.value = cached
      cargando.value = false
      return { data: cached, error: null }
    }
    const respuesta = await supabase
      .from('eventos')
      .select('*')
      .eq('id', id)
      .single()
    cargando.value = false
    if (respuesta.error || !respuesta.data) {
      error.value = MENSAJE_ERROR_CARGA
      return { data: null, error: respuesta.error }
    }
    const evento = respuesta.data as Evento
    eventoActual.value = evento
    // Keep the cache coherent if the evento was loaded out of band.
    if (!eventos.value.some((e) => e.id === evento.id)) {
      eventos.value = [evento, ...eventos.value]
    }
    return { data: evento, error: null }
  }

  async function crear(input: EventoInput) {
    error.value = null
    const res = await servicio.crear(input)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) eventos.value = [res.data, ...eventos.value]
    return res
  }

  async function actualizar(id: string, cambios: EventoInput) {
    error.value = null
    const res = await servicio.actualizar(id, cambios)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) {
      eventos.value = eventos.value.map((e) => (e.id === id ? res.data! : e))
      if (eventoActual.value?.id === id) eventoActual.value = res.data
    }
    return res
  }

  async function cambiarEstado(
    id: string,
    hacia: Evento['estado'],
  ): Promise<{ data: Evento | null; error: ServiceError | null }> {
    error.value = null
    const evento = eventos.value.find((e) => e.id === id) ?? (eventoActual.value?.id === id ? eventoActual.value : null)
    if (!evento) {
      const err: ServiceError = { code: 'NO_ENCONTRADO', message: 'Evento no encontrado' }
      error.value = MENSAJE_ERROR_ESTADO
      return { data: null, error: err }
    }
    const res = await servicio.cambiarEstado(id, evento.estado, hacia)
    if (res.error) {
      error.value = res.error.code === 'TRANSICION_INVALIDA' ? res.error.message : MENSAJE_ERROR_ESTADO
      return res
    }
    if (res.data) {
      eventos.value = eventos.value.map((e) => (e.id === id ? res.data! : e))
      if (eventoActual.value?.id === id) eventoActual.value = res.data
    }
    return res
  }

  async function eliminar(id: string) {
    error.value = null
    const evento = eventos.value.find((e) => e.id === id)
    const res = await servicio.eliminar(id)
    if (res.error) {
      error.value = MENSAJE_ERROR_ELIMINAR(evento?.nombre ?? id)
      return res
    }
    eventos.value = eventos.value.filter((e) => e.id !== id)
    if (eventoActual.value?.id === id) eventoActual.value = null
    return res
  }

  return {
    eventos,
    eventoActual,
    cargando,
    error,
    cargarTodas,
    cargarPorId,
    crear,
    actualizar,
    cambiarEstado,
    eliminar,
  }
})
