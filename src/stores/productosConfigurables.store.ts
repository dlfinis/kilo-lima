import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { inject } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'

import { crearProductosConfigurablesService, type ProductosConfigurablesService } from '@/services/productosConfigurables.service'
import type {
  AdicionalDisponibleConMateriaPrima,
  Database,
  GrupoOpcionesInput,
  OpcionGrupoInput,
  ProductoConfigurable,
  ProductoConfigurableConGrupos,
  ProductoConfigurableInput,
  AdicionalDisponibleInput,
} from '@/types'
import { createTraceId, logError, logInfo, logTrace } from '@/utils/logger'

const MENSAJE_ERROR_CARGA = 'Error al cargar productos configurables'

export const useProductosConfigurablesStore = defineStore('productosConfigurables', () => {
  const supabase = inject<SupabaseClient<Database>>('supabase')
  if (!supabase) throw new Error('Supabase client not provided')

  const servicio: ProductosConfigurablesService = crearProductosConfigurablesService(supabase)

  const configurables = ref<ProductoConfigurableConGrupos[]>([])
  const adicionales = ref<AdicionalDisponibleConMateriaPrima[]>([])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  const configurablesMap = computed(() => {
    const map = new Map<string, ProductoConfigurableConGrupos>()
    configurables.value.forEach((c) => map.set(c.id, c))
    return map
  })

  const adicionalesMap = computed(() => {
    const map = new Map<string, AdicionalDisponibleConMateriaPrima>()
    adicionales.value.forEach((a) => map.set(a.materia_prima_id, a))
    return map
  })

  async function cargar(): Promise<void> {
    const traceId = createTraceId()
    cargando.value = true
    error.value = null
    logTrace('cargar', 'load-start', { traceId })

    try {
      const [configurablesResp, adicionalesResp] = await Promise.all([
        servicio.listar(),
        servicio.listarAdicionales(),
      ])

      if (configurablesResp.error) {
        throw new Error(configurablesResp.error.message)
      }

      if (adicionalesResp.error) {
        throw new Error(adicionalesResp.error.message)
      }

      configurables.value = configurablesResp.data || []
      adicionales.value = adicionalesResp.data || []

      logInfo('cargar', 'loaded', {
        configurables: configurables.value.length,
        adicionales: adicionales.value.length,
        traceId,
      })
    } catch (err) {
      error.value = MENSAJE_ERROR_CARGA
      logError('cargar', 'failed', { error: err, traceId })
    } finally {
      cargando.value = false
    }
  }

  async function crear(input: ProductoConfigurableInput): Promise<ProductoConfigurable | null> {
    const traceId = createTraceId()
    logTrace('crear', 'create-start', { producto_id: input.producto_id, traceId })

    const respuesta = await servicio.crear(input)
    if (respuesta.error) {
      logError('crear', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('crear', 'created', { id: respuesta.data?.id, traceId })

    // Recargar lista completa
    await cargar()
    return respuesta.data
  }

  async function actualizar(id: string, input: Partial<ProductoConfigurableInput>): Promise<ProductoConfigurable | null> {
    const traceId = createTraceId()
    logTrace('actualizar', 'update-start', { id, traceId })

    const respuesta = await servicio.actualizar(id, input)
    if (respuesta.error) {
      logError('actualizar', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('actualizar', 'updated', { id, traceId })
    await cargar()
    return respuesta.data
  }

  async function eliminar(id: string): Promise<void> {
    const traceId = createTraceId()
    logTrace('eliminar', 'delete-start', { id, traceId })

    const respuesta = await servicio.eliminar(id)
    if (respuesta.error) {
      logError('eliminar', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('eliminar', 'deleted', { id, traceId })
    await cargar()
  }

  async function recalcularCosto(id: string): Promise<number | null> {
    const traceId = createTraceId()
    logTrace('recalcularCosto', 'recalc-start', { id, traceId })

    const respuesta = await servicio.recalcularCosto(id)
    if (respuesta.error) {
      logError('recalcularCosto', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('recalcularCosto', 'recalculated', { id, costo: respuesta.data, traceId })
    await cargar()
    return respuesta.data
  }

  // Grupos de opciones
  async function crearGrupo(input: GrupoOpcionesInput): Promise<void> {
    const traceId = createTraceId()
    logTrace('crearGrupo', 'create-start', { producto_configurable_id: input.producto_configurable_id, traceId })

    const respuesta = await servicio.crearGrupo(input)
    if (respuesta.error) {
      logError('crearGrupo', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('crearGrupo', 'created', { id: respuesta.data?.id, traceId })
    await cargar()
  }

  async function actualizarGrupo(id: string, input: Partial<GrupoOpcionesInput>): Promise<void> {
    const traceId = createTraceId()
    logTrace('actualizarGrupo', 'update-start', { id, traceId })

    const respuesta = await servicio.actualizarGrupo(id, input)
    if (respuesta.error) {
      logError('actualizarGrupo', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('actualizarGrupo', 'updated', { id, traceId })
    await cargar()
  }

  async function eliminarGrupo(id: string): Promise<void> {
    const traceId = createTraceId()
    logTrace('eliminarGrupo', 'delete-start', { id, traceId })

    const respuesta = await servicio.eliminarGrupo(id)
    if (respuesta.error) {
      logError('eliminarGrupo', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('eliminarGrupo', 'deleted', { id, traceId })
    await cargar()
  }

  // Opciones de grupos
  async function agregarOpcion(input: OpcionGrupoInput): Promise<void> {
    const traceId = createTraceId()
    logTrace('agregarOpcion', 'add-start', { grupo_id: input.grupo_id, traceId })

    const respuesta = await servicio.agregarOpcion(input)
    if (respuesta.error) {
      logError('agregarOpcion', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('agregarOpcion', 'added', { id: respuesta.data?.id, traceId })
    await cargar()
  }

  async function eliminarOpcion(id: string): Promise<void> {
    const traceId = createTraceId()
    logTrace('eliminarOpcion', 'delete-start', { id, traceId })

    const respuesta = await servicio.eliminarOpcion(id)
    if (respuesta.error) {
      logError('eliminarOpcion', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('eliminarOpcion', 'deleted', { id, traceId })
    await cargar()
  }

  // Adicionales disponibles
  async function crearAdicional(input: AdicionalDisponibleInput): Promise<void> {
    const traceId = createTraceId()
    logTrace('crearAdicional', 'create-start', { materia_prima_id: input.materia_prima_id, traceId })

    const respuesta = await servicio.crearAdicional(input)
    if (respuesta.error) {
      logError('crearAdicional', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('crearAdicional', 'created', { id: respuesta.data?.id, traceId })
    await cargar()
  }

  async function actualizarAdicional(id: string, input: Partial<AdicionalDisponibleInput>): Promise<void> {
    const traceId = createTraceId()
    logTrace('actualizarAdicional', 'update-start', { id, traceId })

    const respuesta = await servicio.actualizarAdicional(id, input)
    if (respuesta.error) {
      logError('actualizarAdicional', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('actualizarAdicional', 'updated', { id, traceId })
    await cargar()
  }

  async function eliminarAdicional(id: string): Promise<void> {
    const traceId = createTraceId()
    logTrace('eliminarAdicional', 'delete-start', { id, traceId })

    const respuesta = await servicio.eliminarAdicional(id)
    if (respuesta.error) {
      logError('eliminarAdicional', 'failed', { error: respuesta.error, traceId })
      throw respuesta.error
    }

    logInfo('eliminarAdicional', 'deleted', { id, traceId })
    await cargar()
  }

  return {
    configurables,
    adicionales,
    cargando,
    error,
    configurablesMap,
    adicionalesMap,
    cargar,
    crear,
    actualizar,
    eliminar,
    recalcularCosto,
    crearGrupo,
    actualizarGrupo,
    eliminarGrupo,
    agregarOpcion,
    eliminarOpcion,
    crearAdicional,
    actualizarAdicional,
    eliminarAdicional,
  }
})
