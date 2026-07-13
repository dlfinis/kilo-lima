// REQ-POS-1, REQ-POS-2, REQ-POS-3, REQ-POS-4, REQ-POS-5, REQ-POS-52,
// REQ-POS-53: productos service — factory pattern (OCP/DIP), never-throw
// contract (LSP). Five mutating/reading methods + one cross-slice helper
// (`listarPorReceta`) that backs the "Vender esta receta" button in
// `RecetaDetalleView` (REQ-POS-47).
//
// Error mapping is intentionally minimal but spans the DB-level
// constraint violations the surface needs to distinguish from generic
// failures:
//   - UNIQUE(receta_id)            -> DUPLICATE_RECETA  (REQ-POS-2)
//   - UNIQUE(nombre)               -> DUPLICATE_NOMBRE  (catalog-domain-refactor)
//   - RESTRICT FK from venta_items -> VENTA_HISTORIAL   (REQ-POS-5)
// Other PG errors pass through unchanged so the store / view can render
// the raw message without lossy translation.
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Producto, ProductoInput, ServiceError } from '@/types'

export interface ProductosService {
  listar(): Promise<{ data: Producto[] | null; error: ServiceError | null }>
  listarPorReceta(
    recetaId: string,
  ): Promise<{ data: Producto[] | null; error: ServiceError | null }>
  obtener(id: string): Promise<{ data: Producto | null; error: ServiceError | null }>
  crear(
    input: ProductoInput,
  ): Promise<{ data: Producto | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: Partial<ProductoInput>,
  ): Promise<{ data: Producto | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
}

function mapearErrorCrear(error: ServiceError | null): ServiceError | null {
  if (!error) return null
  if (error.code === '23505') {
    // catalog-domain-refactor: distinguish between receta_id and nombre
    // unique violations. PostgreSQL includes the constraint name in the
    // error message (e.g. "...unique constraint \"productos_nombre_key\"").
    if (error.message?.includes('productos_nombre_key')) {
      return {
        code: 'DUPLICATE_NOMBRE',
        message: 'Ya existe un producto con este nombre comercial',
      }
    }
    return { code: 'DUPLICATE_RECETA', message: 'Ya existe un producto para esta receta' }
  }
  return error
}

function mapearErrorEliminar(error: ServiceError | null): ServiceError | null {
  if (!error) return null
  if (error.code === '23503') {
    return {
      code: 'VENTA_HISTORIAL',
      message: 'No se puede eliminar — el producto tiene ventas registradas',
    }
  }
  return error
}

export function crearProductosService(supabase: SupabaseClient<Database>): ProductosService {
  return {
    async listar() {
      const respuesta = await supabase
        .from('productos')
        .select('*')
        .order('orden', { ascending: true })
        .order('created_at', { ascending: true })
      return {
        data: (respuesta.data as Producto[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async listarPorReceta(recetaId) {
      const respuesta = await supabase.from('productos').select('*').eq('receta_id', recetaId)
      return {
        data: (respuesta.data as Producto[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async obtener(id) {
      const respuesta = await supabase.from('productos').select('*').eq('id', id).single()
      return {
        data: (respuesta.data as Producto | null) ?? null,
        error: respuesta.error,
      }
    },

    async crear(input) {
      const insercion = await supabase
        .from('productos')
        .insert(input as Database['public']['Tables']['productos']['Insert'])
        .select()
        .single()
      return {
        data: (insercion.data as Producto | null) ?? null,
        error: mapearErrorCrear(insercion.error),
      }
    },

    async actualizar(id, cambios) {
      const respuesta = await supabase
        .from('productos')
        .update(cambios as Database['public']['Tables']['productos']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as Producto | null) ?? null,
        error: respuesta.error,
      }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('productos').delete().eq('id', id)
      return { data: null, error: mapearErrorEliminar(respuesta.error) }
    },
  }
}