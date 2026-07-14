import { computed, inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Aporte,
  AporteInput,
  Database,
  EventoSocio,
  EventoSocioInput,
  Socio,
  SocioInput,
} from '@/types'
import {
  crearSociosService,
  type SociosService,
} from '@/services/socios.service'

const MENSAJE_ERROR_SOCIOS = 'Error al cargar socios'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar'

export const useSociosStore = defineStore('socios', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')
  if (!supabase) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const servicio: SociosService = crearSociosService(supabase)

  const socios = ref<Socio[]>([])
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  const sociosPorId = computed<Map<string, Socio>>(() => {
    const mapa = new Map<string, Socio>()
    for (const s of socios.value) mapa.set(s.id, s)
    return mapa
  })

  async function cargarTodos() {
    cargando.value = true
    error.value = null
    const res = await servicio.listarTodos()
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_SOCIOS
      return
    }
    socios.value = res.data ?? []
  }

  async function crear(input: SocioInput) {
    error.value = null
    const res = await servicio.crear(input)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) socios.value.push(res.data)
    return res
  }

  async function actualizar(id: string, cambios: Partial<SocioInput>) {
    error.value = null
    const res = await servicio.actualizar(id, cambios)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) {
      const idx = socios.value.findIndex((s) => s.id === id)
      if (idx !== -1) socios.value[idx] = res.data
    }
    return res
  }

  async function eliminar(id: string) {
    error.value = null
    const res = await servicio.eliminar(id)
    if (res.error) {
      error.value = 'No se pudo eliminar el socio'
      return res
    }
    socios.value = socios.value.filter((s) => s.id !== id)
    return res
  }

  function nombreSocio(id: string | null): string {
    if (!id) return '—'
    return sociosPorId.value.get(id)?.nombre ?? '—'
  }

  const evento_socios = ref<Map<string, EventoSocio[]>>(new Map())

  async function cargarSociosEvento(eventoId: string) {
    const res = await servicio.listarPorEvento(eventoId)
    if (!res.error) {
      evento_socios.value.set(eventoId, res.data ?? [])
    }
  }

  async function vincularSocio(input: EventoSocioInput) {
    const res = await servicio.vincular(input)
    if (res.data) {
      const lista = evento_socios.value.get(input.evento_id) ?? []
      lista.push(res.data)
      evento_socios.value.set(input.evento_id, [...lista])
    }
    return res
  }

  async function actualizarVinculacion(id: string, cambios: Partial<EventoSocioInput>) {
    const res = await servicio.actualizarVinculacion(id, cambios)
    return res
  }

  async function desvincularSocio(eventoId: string, id: string) {
    const res = await servicio.desvincular(id)
    if (!res.error) {
      const lista = (evento_socios.value.get(eventoId) ?? []).filter((es) => es.id !== id)
      evento_socios.value.set(eventoId, lista)
    }
    return res
  }

  const aportes = ref<Map<string, Aporte[]>>(new Map())

  async function cargarAportes(eventoId: string) {
    const res = await servicio.listarAportes(eventoId)
    if (!res.error) {
      aportes.value.set(eventoId, res.data ?? [])
    }
  }

  async function crearAporte(input: AporteInput) {
    const res = await servicio.crearAporte(input)
    if (res.data) {
      const lista = aportes.value.get(input.evento_id) ?? []
      lista.unshift(res.data)
      aportes.value.set(input.evento_id, [...lista])
    }
    return res
  }

  async function eliminarAporte(eventoId: string, id: string) {
    const res = await servicio.eliminarAporte(id)
    if (!res.error) {
      const lista = (aportes.value.get(eventoId) ?? []).filter((a) => a.id !== id)
      aportes.value.set(eventoId, lista)
    }
    return res
  }

  return {
    socios,
    cargando,
    error,
    sociosPorId,
    cargarTodos,
    crear,
    actualizar,
    eliminar,
    nombreSocio,
    evento_socios,
    cargarSociosEvento,
    vincularSocio,
    actualizarVinculacion,
    desvincularSocio,
    aportes,
    cargarAportes,
    crearAporte,
    eliminarAporte,
  }
})
