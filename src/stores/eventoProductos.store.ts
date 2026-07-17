// REQ-PRICING-7, REQ-FIN-13, REQ-FIN-18: Pinia store for evento-scoped
// product config. Setup-style (matches the rest of the stores) so the
// action surface and the reactive refs share a closure.
//
// State: productosPorEvento: Map<eventoId, EventoProducto[]>
//        cargando: boolean
//        error:   string | null
//
// Cross-store READ: eventsStore.eventos + useEvents().eventoActual to
// check `estadoEsEditable` before any mutation (REQ-PRICING-7 blocks
// updates on a cerrado evento). Cross-store WRITES are forbidden —
// the events store doesn't see the config store.
import { computed, inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  EventoProducto,
  ServiceError,
} from '@/types'
import {
  crearEventoProductosService,
  type EventoProductosService,
} from '@/services/eventoProductos.service'
import { estadoEsEditable } from '@/utils/estado'
import { useEventsStore } from './events.store'

const MENSAJE_ERROR_CARGA = 'Error al cargar los productos del evento'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar el producto del evento'
const CODIGO_EVENTO_CERRADO: ServiceError = {
  code: 'EVENTO_CERRADO',
  message: 'El evento está cerrado',
}

export const useEventoProductosStore = defineStore('eventoProductos', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: EventoProductosService = crearEventoProductosService(supabase)

  const productosPorEvento = ref<Map<string, EventoProducto[]>>(new Map())
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  // REQ-PRICING-7: every mutation path runs through this guard so
  // there's a single source of truth. `estadoEsEditable('cerrado')` is
  // `false`; everything else passes.
  function asegurarEditable(eventoId: string): { data: null; error: ServiceError } | null {
    const eventsStore = useEventsStore()
    const evento =
      eventsStore.eventoActual?.id === eventoId
        ? eventsStore.eventoActual
        : eventsStore.eventos.find((e) => e.id === eventoId) ?? null
    if (evento && !estadoEsEditable(evento.estado)) {
      return { data: null, error: CODIGO_EVENTO_CERRADO }
    }
    return null
  }

  async function cargarPorEvento(eventoId: string): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listarPorEvento(eventoId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      productosPorEvento.value.delete(eventoId)
      return
    }
    productosPorEvento.value.set(eventoId, res.data ?? [])
  }

  async function toggleIncluido(
    eventoId: string,
    productoId: string,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }> {
    const cerrado = asegurarEditable(eventoId)
    if (cerrado) {
      error.value = cerrado.error.message
      return cerrado
    }
    const lista = productosPorEvento.value.get(eventoId) ?? []
    const ep = lista.find((p) => p.producto_id === productoId)
    if (!ep) {
      const err: ServiceError = { code: 'NO_ENCONTRADO', message: 'Producto del evento no encontrado' }
      error.value = MENSAJE_ERROR_GUARDAR
      return { data: null, error: err }
    }
    // Optimistic flip → reconcile on response.
    const targetIncluido = !ep.incluido
    ep.incluido = targetIncluido
    error.value = null
    const res = await servicio.toggleIncluido(ep.id, targetIncluido)
    if (res.error || !res.data) {
      ep.incluido = !targetIncluido
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    // Replace with the server snapshot.
    const idx = lista.findIndex((p) => p.id === ep.id)
    if (idx >= 0) lista[idx] = res.data
    productosPorEvento.value.set(eventoId, [...lista])
    return res
  }

  async function actualizarPrecio(
    eventoId: string,
    productoId: string,
    // productos-mejoras / evento-producto-pricing: nullable inputs.
    // Slider must send null when there is no manual override — coercing
    // to 0 used to overwrite the override semantics in the DB row.
    precioVenta: number | null,
    margen: number | null,
    gananciaMarkup: number,
    contribucionMarkup: number,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }> {
    const cerrado = asegurarEditable(eventoId)
    if (cerrado) {
      error.value = cerrado.error.message
      return cerrado
    }
    const lista = productosPorEvento.value.get(eventoId) ?? []
    const ep = lista.find((p) => p.producto_id === productoId)
    if (!ep) {
      const err: ServiceError = { code: 'NO_ENCONTRADO', message: 'Producto del evento no encontrado' }
      error.value = MENSAJE_ERROR_GUARDAR
      return { data: null, error: err }
    }
    error.value = null
    const res = await servicio.actualizarPrecio(ep.id, precioVenta, margen, gananciaMarkup, contribucionMarkup)
    if (res.error || !res.data) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    const idx = lista.findIndex((p) => p.id === ep.id)
    if (idx >= 0) lista[idx] = res.data
    productosPorEvento.value.set(eventoId, [...lista])
    return res
  }

  // productos-mejoras / evento-producto-agregar: high-level action
  // that adds a single producto to an existing evento. Wraps the
  // existing `servicio.upsert` with the "auto-calc from evento
  // default margin" defaults so the new row shows up in the POS grid
  // immediately. Idempotent via UNIQUE(evento_id, producto_id) — the
  // UPSERT updates the existing row in place, no duplicate.
  async function agregar(
    eventoId: string,
    productoId: string,
  ): Promise<{ data: EventoProducto | null; error: ServiceError | null }> {
    const cerrado = asegurarEditable(eventoId)
    if (cerrado) {
      error.value = cerrado.error.message
      return cerrado
    }
    error.value = null
    const res = await servicio.upsert(eventoId, productoId, {
      incluido: true,
      precio_venta: null,
      margen: null,
      ganancia_markup: null,
      contribucion_markup: null,
    })
    if (res.error || !res.data) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    // Refresh the in-memory map so the table shows the new row without
    // a full reload. Replace by id (UPSERT may return same row id).
    const lista = productosPorEvento.value.get(eventoId) ?? []
    const idx = lista.findIndex((p) => p.producto_id === productoId)
    if (idx >= 0) {
      lista[idx] = res.data
    } else {
      lista.push(res.data)
    }
    productosPorEvento.value.set(eventoId, [...lista])
    return res
  }

  async function inicializarDesdeCatalogo(
    eventoId: string,
  ): Promise<{ data: EventoProducto[] | null; error: ServiceError | null }> {
    const cerrado = asegurarEditable(eventoId)
    if (cerrado) {
      error.value = cerrado.error.message
      return cerrado
    }
    cargando.value = true
    error.value = null
    const res = await servicio.inicializarDesdeCatalogo(eventoId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    // Refresh from the DB so the map reflects server-side rows
    // (idempotent UPSERT may include rows we didn't have locally).
    await cargarPorEvento(eventoId)
    return res
  }

  // REQ-FIN-18: get-by-evento + has-any getter surface.
  const productosDelEvento = computed(() => (eventoId: string): EventoProducto[] => {
    return productosPorEvento.value.get(eventoId) ?? []
  })
  const tieneProductosConfigurados = computed(() => (eventoId: string): boolean => {
    return (productosPorEvento.value.get(eventoId) ?? []).length > 0
  })

  return {
    productosPorEvento,
    cargando,
    error,
    productosDelEvento,
    tieneProductosConfigurados,
    cargarPorEvento,
    toggleIncluido,
    actualizarPrecio,
    agregar,
    inicializarDesdeCatalogo,
  }
})
