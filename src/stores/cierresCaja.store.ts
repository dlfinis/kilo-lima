// REQ-POS-32, REQ-POS-33, REQ-POS-35, REQ-POS-36, REQ-POS-44,
// REQ-POS-52, REQ-POS-53, REQ-POS-55, REQ-POS-56: cierresCaja store —
// full implementation. PR1 shipped the reactive state shape (single
// `cierre` ref) so PR4 can plug in `cargarPorEvento`, `buscarPorEvento`,
// and `registrarCierre`.
//
// `registrarCierre` flow:
//   1. Insert cierre_caja row (snapshots totals).
//   2. If evento is en_curso, call `eventsService.cambiarEstado` to
//      drive en_curso → cerrado.
//   3. Retroactive cierres (evento already cerrado) skip step 2.
//
// Cross-store READS happen inside `computed()` per REQ-POS-51.
// Cross-store WRITES go through `eventsService.cambiarEstado` so the
// state machine gate (`transicionEstadoValida`) remains the single
// source of truth.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CierreCaja,
  CierreCajaInput,
  Database,
  ServiceError,
} from '@/types'
import {
  crearCierresCajaService,
  type CierresCajaService,
} from '@/services/cierresCaja.service'
import { crearEventsService, type EventsService } from '@/services/events.service'
import { useEventsStore } from '@/stores/events.store'

const MENSAJE_ERROR_CARGA = 'Error al cargar el cierre de caja'
const MENSAJE_ERROR_REGISTRAR = 'No se pudo registrar el cierre'

export const useCierresCajaStore = defineStore('cierresCaja', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: CierresCajaService = crearCierresCajaService(supabase)
  const eventsServicio: EventsService = crearEventsService(supabase)

  const cierre = ref<CierreCaja | null>(null)
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  async function cargarPorEvento(eventoId: string): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.buscarPorEvento(eventoId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    cierre.value = res.data ?? null
  }

  async function listarPorEvento(eventoId: string): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listarPorEvento(eventoId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    // Keep the most recent cierre in `cierre` so the composable can
    // pick it up; full history is one row per evento (UNIQUE) so this
    // is just `[first] | null`.
    cierre.value = res.data?.[0] ?? null
  }

  async function buscarPorEvento(eventoId: string): Promise<void> {
    await cargarPorEvento(eventoId)
  }

  async function registrarCierre(
    input: CierreCajaInput,
  ): Promise<{ data: CierreCaja | null; error: ServiceError | null }> {
    error.value = null
    const res = await servicio.registrar(input)
    if (res.error || !res.data) {
      error.value =
        res.error?.code === 'DUPLICATE_CIERRE' ? res.error.message : MENSAJE_ERROR_REGISTRAR
      return res
    }
    cierre.value = res.data

    // Drive en_curso → cerrado if the evento is still open. If the
    // evento is already cerrado (retroactive case, REQ-POS-33), leave
    // the estado alone.
    const eventsStore = useEventsStore()
    const evento = eventsStore.eventos.find((e) => e.id === input.evento_id)
    if (evento && evento.estado === 'en_curso') {
      const cambio = await eventsServicio.cambiarEstado(
        input.evento_id,
        'en_curso',
        'cerrado',
      )
      if (cambio.error) {
        // The cierre row is in; surface the estado transition failure
        // but keep the cierre (UNIQUE prevents retries).
        const err: ServiceError = {
          code: 'ESTADO_NO_ACTUALIZADO',
          message: 'Cierre registrado pero no se pudo cerrar el evento',
        }
        error.value = err.message
        return { data: res.data, error: err }
      }
      // Mirror the new estado on the local cache.
      if (cambio.data) {
        eventsStore.eventos = eventsStore.eventos.map((e) =>
          e.id === cambio.data!.id ? cambio.data! : e,
        )
        if (eventsStore.eventoActual?.id === cambio.data.id) {
          eventsStore.eventoActual = cambio.data
        }
      }
    }

    return { data: res.data, error: null }
  }

  function limpiar() {
    cierre.value = null
    error.value = null
  }

  return {
    cierre,
    cargando,
    error,
    cargarPorEvento,
    listarPorEvento,
    buscarPorEvento,
    registrarCierre,
    limpiar,
  }
})