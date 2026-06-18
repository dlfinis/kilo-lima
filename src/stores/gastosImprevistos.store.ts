// REQ-POS-37, REQ-POS-38, REQ-POS-39, REQ-POS-44, REQ-POS-52,
// REQ-POS-53, REQ-POS-55, REQ-POS-56: gastosImprevistos store —
// setup-style Pinia store wiring the factory service. Per-evento
// list kept in a `Map<eventoId, GastoImprevisto[]>` for O(1) reads
// across multiple views (cierre summary, POS view, etc). The
// freeze-on-cerrado gate (REQ-POS-39) lives here where the parent
// evento's estado is reachable via `useEventsStore`.
//
// `gastosPorEvento` is the primary state; a computed `gastos` flat
// list is exposed so consumers like `useCierreCaja` can iterate
// without re-keying — backwards-compat with PR1's surface.
import { computed, inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  GastoImprevisto,
  GastoImprevistoInput,
  ServiceError,
} from '@/types'
import { estadoEsEditable } from '@/utils/estado'
import {
  crearGastosImprevistosService,
  type GastosImprevistosService,
} from '@/services/gastosImprevistos.service'
import { useEventsStore } from '@/stores/events.store'
import { redondearCentavos } from '@/utils/moneda'

const MENSAJE_ERROR_CARGA = 'Error al cargar los gastos imprevistos'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar el gasto imprevisto'
const MENSAJE_ERROR_ELIMINAR = 'No se pudo eliminar el gasto imprevisto'

export const useGastosImprevistosStore = defineStore('gastosImprevistos', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: GastosImprevistosService = crearGastosImprevistosService(supabase)

  const gastosPorEvento = ref<Map<string, GastoImprevisto[]>>(new Map())
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  // Backwards-compat: flat list of all gastos for the current active
  // evento (first non-empty key). useCierreCaja consumed `gastos`
  // directly in PR1 — keep the same surface.
  const gastos = computed<GastoImprevisto[]>(() => {
    for (const lista of gastosPorEvento.value.values()) {
      if (lista.length > 0) return lista
    }
    return []
  })

  function asegurarLista(eventoId: string): GastoImprevisto[] {
    let lista = gastosPorEvento.value.get(eventoId)
    if (!lista) {
      lista = []
      gastosPorEvento.value.set(eventoId, lista)
    }
    return lista
  }

  function eventoEstaCerrado(eventoId: string): boolean {
    const events = useEventsStore()
    const actual =
      events.eventoActual?.id === eventoId ? events.eventoActual : null
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

  async function crear(input: GastoImprevistoInput) {
    error.value = null
    if (eventoEstaCerrado(input.evento_id)) {
      const err: ServiceError = {
        code: 'EVENTO_CERRADO',
        message: 'Evento cerrado — no editable',
      }
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

  async function actualizar(id: string, cambios: Partial<GastoImprevistoInput>) {
    error.value = null
    let eventoId: string | undefined
    for (const [key, lista] of gastosPorEvento.value.entries()) {
      if (lista.some((g) => g.id === id)) {
        eventoId = key
        break
      }
    }
    if (eventoId && eventoEstaCerrado(eventoId)) {
      const err: ServiceError = {
        code: 'EVENTO_CERRADO',
        message: 'Evento cerrado — no editable',
      }
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
      const err: ServiceError = {
        code: 'EVENTO_CERRADO',
        message: 'Evento cerrado — no editable',
      }
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

  function totalPorEvento(eventoId: string) {
    return computed<number>(() => {
      const raw = gastosPorEvento.value.get(eventoId)
      const lista = Array.isArray(raw) ? raw : []
      const suma = lista.reduce((acc, g) => acc + (Number.isFinite(g.monto) ? g.monto : 0), 0)
      return redondearCentavos(suma)
    })
  }

  return {
    gastosPorEvento,
    gastos,
    cargando,
    error,
    cargarPorEvento,
    crear,
    actualizar,
    eliminar,
    totalPorEvento,
  }
})