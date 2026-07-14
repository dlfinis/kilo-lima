// REQ-STOCK-MOVEMENTS-1..4: setup-style Pinia store for stock movements.
// The factory-built service comes from the injected Supabase client (DIP).
// The store owns the reactive cache so multiple views share one fetch.
// Errors surface in Spanish to keep the view layer declarative.
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  DerivedStock,
  RegistrarAjusteInput,
  RegistrarCompraInput,
  RegistrarConsumoInput,
  RegistrarCorreccionInput,
  StockMovement,
} from '@/types'
import {
  crearStockMovementsService,
  type StockMovementsService,
} from '@/services/stockMovements.service'

// Friendly Spanish error messages — the store owns wording so all
// callers render the same message (REQ-CATALOG-8 pattern).
const MENSAJE_ERROR_CARGA = 'Error al cargar los movimientos de inventario'
const MENSAJE_ERROR_STOCK = 'Error al cargar el stock actual'
const MENSAJE_ERROR_OPERACION = 'Error en la operación de inventario'

export const useStockMovementsStore = defineStore('stockMovements', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')
  if (!supabase) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const servicio: StockMovementsService = crearStockMovementsService(supabase)

  const movements = ref<StockMovement[]>([])
  const stockActual = ref<DerivedStock[]>([])
  const cargando = ref<boolean>(false)
  const error = ref<string | null>(null)

  async function cargarMovimientos(): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listar()
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    movements.value = res.data ?? []
  }

  async function cargarMovimientosPorMateriaPrima(materiaPrimaId: string): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listarPorMateriaPrima(materiaPrimaId)
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return
    }
    movements.value = res.data ?? []
  }

  async function cargarStockActual(): Promise<void> {
    cargando.value = true
    error.value = null
    const res = await servicio.listarStockActual()
    cargando.value = false
    if (res.error) {
      error.value = MENSAJE_ERROR_STOCK
      return
    }
    stockActual.value = res.data ?? []
  }

  function obtenerStockPorMateria(materiaPrimaId: string): number {
    const entry = stockActual.value.find(
      (s) => s.materia_prima_id === materiaPrimaId,
    )
    return entry?.stock_actual ?? 0
  }

  async function registrarCompra(input: RegistrarCompraInput) {
    error.value = null
    const res = await servicio.registrarCompra(input)
    if (res.error) {
      error.value = res.error.message || MENSAJE_ERROR_OPERACION
      return res
    }
    // Refresh the full movements list after a successful write.
    await cargarMovimientos()
    return res
  }

  async function registrarConsumo(input: RegistrarConsumoInput) {
    error.value = null
    const res = await servicio.registrarConsumo(input)
    if (res.error) {
      error.value = res.error.message || MENSAJE_ERROR_OPERACION
      return res
    }
    await cargarMovimientos()
    return res
  }

  async function registrarCorreccion(input: RegistrarCorreccionInput) {
    error.value = null
    const res = await servicio.registrarCorreccion(input)
    if (res.error) {
      error.value = res.error.message || MENSAJE_ERROR_OPERACION
      return res
    }
    await cargarMovimientos()
    return res
  }

  async function registrarAjuste(input: RegistrarAjusteInput) {
    error.value = null
    const res = await servicio.registrarAjuste(input)
    if (res.error) {
      error.value = res.error.message || MENSAJE_ERROR_OPERACION
      return res
    }
    await cargarMovimientos()
    await cargarStockActual()
    return res
  }

  return {
    movements,
    stockActual,
    cargando,
    error,
    cargarMovimientos,
    cargarMovimientosPorMateriaPrima,
    cargarStockActual,
    obtenerStockPorMateria,
    registrarCompra,
    registrarConsumo,
    registrarCorreccion,
    registrarAjuste,
  }
})
