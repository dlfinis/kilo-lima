// REQ-POS-1, REQ-POS-2, REQ-POS-3, REQ-POS-4, REQ-POS-5, REQ-POS-44,
// REQ-POS-55: PR2 full implementation. The PR1 skeleton shipped the
// reactive state shape (productos/cargando/error) so PR2 could plug
// in the actions without churn on the view side. The cross-slice
// "Vender esta receta" button in `RecetaDetalleView` (REQ-POS-47)
// uses `crear` from this store and reflects the new producto via
// `cargarPorReceta` (added here for convenience so the button can
// show "Editar precio de venta" right after creation).
import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  Producto,
  ProductoInput,
  ServiceError,
} from '@/types'
import { crearProductosService, type ProductosService } from '@/services/productos.service'

const MENSAJE_ERROR_CARGA = 'Error al cargar los productos'
const MENSAJE_ERROR_GUARDAR = 'No se pudo guardar el producto'
const MENSAJE_ERROR_ELIMINAR = 'No se pudo eliminar el producto'

export const useProductosStore = defineStore('productos', () => {
  const supabaseInyectado = inject<SupabaseClient<Database>>('supabase')
  if (!supabaseInyectado) {
    throw new Error('Supabase client no inyectado — ¿servicesPlugin instalado?')
  }
  const supabase: SupabaseClient<Database> = supabaseInyectado
  const servicio: ProductosService = crearProductosService(supabase)

  const productos = ref<Producto[]>([])
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
    productos.value = res.data ?? []
  }

  async function cargarPorId(id: string) {
    error.value = null
    const cached = productos.value.find((p) => p.id === id)
    if (cached) {
      return { data: cached, error: null as ServiceError | null }
    }
    const res = await servicio.obtener(id)
    if (res.error || !res.data) {
      error.value = MENSAJE_ERROR_CARGA
      return { data: null, error: res.error }
    }
    if (!productos.value.some((p) => p.id === res.data!.id)) {
      productos.value = [res.data!, ...productos.value]
    }
    return { data: res.data, error: null as ServiceError | null }
  }

  // Cross-slice helper (REQ-POS-47): the "Vender esta receta" button
  // in RecetaDetalleView needs to know whether the current receta
  // already has a producto so it can switch between "Vender esta
  // receta" and "Editar precio de venta". Returns the first match
  // (UNIQUE(receta_id) guarantees at most one).
  async function cargarPorReceta(recetaId: string) {
    error.value = null
    const res = await servicio.listarPorReceta(recetaId)
    if (res.error) {
      error.value = MENSAJE_ERROR_CARGA
      return { data: null, error: res.error }
    }
    return { data: res.data ?? [], error: null as ServiceError | null }
  }

  async function crear(input: ProductoInput) {
    error.value = null
    const res = await servicio.crear(input)
    if (res.error) {
      error.value =
        res.error.code === 'DUPLICATE_RECETA' ? res.error.message : MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) productos.value = [res.data, ...productos.value]
    return res
  }

  async function actualizar(id: string, cambios: Partial<ProductoInput>) {
    error.value = null
    const res = await servicio.actualizar(id, cambios)
    if (res.error) {
      error.value = MENSAJE_ERROR_GUARDAR
      return res
    }
    if (res.data) {
      productos.value = productos.value.map((p) => (p.id === id ? res.data! : p))
    }
    return res
  }

  // REQ-POS-3: shortcut for the most common toggle in the POS UI.
  // Reads the cached value first to avoid an extra fetch, then
  // delegates to `actualizar` so the optimistic/rollback path stays
  // centralized.
  async function toggleDisponible(id: string) {
    const actual = productos.value.find((p) => p.id === id)
    if (!actual) {
      const err: ServiceError = { code: 'NO_ENCONTRADO', message: 'Producto no encontrado' }
      error.value = MENSAJE_ERROR_GUARDAR
      return { data: null, error: err }
    }
    return actualizar(id, { disponible: !actual.disponible })
  }

  async function eliminar(id: string) {
    error.value = null
    const res = await servicio.eliminar(id)
    if (res.error) {
      error.value =
        res.error.code === 'VENTA_HISTORIAL' ? res.error.message : MENSAJE_ERROR_ELIMINAR
      return res
    }
    productos.value = productos.value.filter((p) => p.id !== id)
    return res
  }

  return {
    productos,
    cargando,
    error,
    cargarTodas,
    cargarPorId,
    cargarPorReceta,
    crear,
    actualizar,
    toggleDisponible,
    eliminar,
  }
})