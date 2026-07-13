// event-product-management-refactor: Pinia store for producto_produccion.
// Setup-style (matches existing stores). State is
// `produccionPorEvento: Map<eventoId, ProductoProduccion[]>` for O(1)
// lookups by the composable and view layers.
//
// Editable guard reads `useEventsStore()` for the parent evento's
// estado (cross-store READ only). When the evento is cerrado, mutations
// short-circuit with `{ code: 'EVENTO_CERRADO' }` before any Supabase call.
import { computed, inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  ProductoProduccion,
  ServiceError,
} from '@/types'
import {
  crearProductoProduccionService,
  type ProductoProduccionService,
} from '@/services/productoProduccion.service'
import { estadoEsEditable } from '@/utils/estado'
import { useEventsStore } from './events.store'

const MENSAJE_ERROR_CARGA = 'Error al cargar la producción de productos'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar la producción del producto'
const CODIGO_EVENTO_CERRADO: ServiceError = {
  code: 'EVENTO_CERRADO',
  message: 'El evento está cerrado',
}

export const useProductoProduccionStore = defineStore('productoProduccion', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: ProductoProduccionService = crearProductoProduccionService(supabase)

  const produccionPorEvento = ref<Map<string, ProductoProduccion[]>>(new Map())
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  // Single source of truth for the freeze-on-cerrado rule. Mirrors the
  // pattern in eventoProductos.store.ts.
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
      produccionPorEvento.value.delete(eventoId)
      return
    }
    produccionPorEvento.value.set(eventoId, res.data ?? [])
  }

  async function upsert(
    eventoId: string,
    eventoProductoId: string,
    unidadesAProducir: number,
  ): Promise<{ data: ProductoProduccion | null; error: ServiceError | null }> {
    const cerrado = asegurarEditable(eventoId)
    if (cerrado) {
      error.value = cerrado.error.message
      return cerrado
    }
    error.value = null
    const res = await servicio.upsertByEventoProductoId(eventoProductoId, unidadesAProducir)
    if (res.error || !res.data) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    // Reconcile the in-memory map with the server snapshot.
    const lista = produccionPorEvento.value.get(eventoId) ?? []
    const idx = lista.findIndex((p) => p.evento_producto_id === eventoProductoId)
    if (idx >= 0) {
      lista[idx] = res.data
    } else {
      lista.push(res.data)
    }
    produccionPorEvento.value.set(eventoId, [...lista])
    return res
  }

  // Getters — same pattern as eventoProductos store.
  const produccionDelEvento = computed(() => (eventoId: string): ProductoProduccion[] => {
    return produccionPorEvento.value.get(eventoId) ?? []
  })

  return {
    produccionPorEvento,
    cargando,
    error,
    produccionDelEvento,
    cargarPorEvento,
    upsert,
  }
})
