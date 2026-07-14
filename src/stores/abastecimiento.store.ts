// REQ-ABASTECIMIENTO-1..3: setup-style Pinia store for abastecimiento.
// Extracts compras_insumos state from socios.store. Uses the same
// inject + runWithContext pattern as stockMovements.store.
// The store owns reactive caches for compras by evento and provides
// registrarCompra that wraps the atomic RPC.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CompraInsumo,
  CompraInsumoInput,
  Database,
  RegistrarCompraInput,
  RegistrarCompraInsumoInput,
} from '@/types'
import {
  crearAbastecimientoService,
  type AbastecimientoService,
} from '@/services/abastecimiento.service'

const MENSAJE_ERROR_CARGA = 'Error al cargar las compras de insumos'
const MENSAJE_ERROR_OPERACION = 'Error en la operación de abastecimiento'

export const useAbastecimientoStore = defineStore('abastecimiento', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')
  if (!supabase) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const servicio: AbastecimientoService = crearAbastecimientoService(supabase)

  const comprasInsumos = ref<Map<string, CompraInsumo[]>>(new Map())
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  async function cargarComprasInsumos(eventoId: string): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listarCompras(eventoId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    comprasInsumos.value.set(eventoId, res.data ?? [])
  }

  async function crearCompraInsumo(
    input: CompraInsumoInput,
  ): Promise<{ data: CompraInsumo | null; error: string | null }> {
    error.value = null
    const res = await servicio.crearCompra(input)
    if (res.error) {
      error.value = res.error.message || MENSAJE_ERROR_OPERACION
      return { data: null, error: res.error.message }
    }
    if (res.data) {
      const eventoKey = input.evento_id ?? '__global__'
      const lista = comprasInsumos.value.get(eventoKey) ?? []
      lista.unshift(res.data)
      comprasInsumos.value.set(eventoKey, [...lista])
    }
    return { data: res.data, error: null }
  }

  async function eliminarCompraInsumo(
    eventoId: string | null,
    id: string,
  ): Promise<{ data: null; error: string | null }> {
    error.value = null
    const res = await servicio.eliminarCompra(id)
    if (res.error) {
      error.value = 'No se pudo eliminar la compra'
      return { data: null, error: res.error.message }
    }
    const key = eventoId ?? '__global__'
    const lista = (comprasInsumos.value.get(key) ?? []).filter(
      (c) => c.id !== id,
    )
    comprasInsumos.value.set(key, lista)
    return { data: null, error: null }
  }

  // registrarCompra wraps the atomic registrar_compra RPC which creates
  // both a compras_insumos row and a stock_movements row. After success
  // we refresh the compras list so the view stays in sync.
  async function registrarCompra(input: RegistrarCompraInput) {
    error.value = null
    const rpcResult = await servicio.registrarCompra(input)
    if (rpcResult.error) {
      error.value = rpcResult.error.message || MENSAJE_ERROR_OPERACION
      return rpcResult
    }
    // Refresh the compras list for the relevant evento
    if (input.evento_id) {
      await cargarComprasInsumos(input.evento_id)
    }
    return rpcResult
  }

  // registrarCompraInsumo wraps the combined registrar_compra_insumo RPC.
  // This is the canonical Abastecimiento purchase: one call atomically
  // creates both compras_insumos and stock_movements rows.
  async function registrarCompraInsumo(input: RegistrarCompraInsumoInput) {
    error.value = null
    const rpcResult = await servicio.registrarCompraInsumo(input)
    if (rpcResult.error) {
      error.value = rpcResult.error.message || MENSAJE_ERROR_OPERACION
      return rpcResult
    }
    // Refresh the compras list for the relevant evento
    if (input.evento_id) {
      await cargarComprasInsumos(input.evento_id)
    }
    return rpcResult
  }

  return {
    comprasInsumos,
    cargando,
    error,
    cargarComprasInsumos,
    crearCompraInsumo,
    eliminarCompraInsumo,
    registrarCompra,
    registrarCompraInsumo,
  }
})
