// REQ-POS-37, REQ-POS-38, REQ-POS-39, REQ-POS-44, REQ-POS-52,
// REQ-POS-53, REQ-POS-56: gastos_imprevistos service — factory
// pattern (OCP/DIP), never-throw (LSP). Per-evento CRUD scoped via
// `listarPorEvento`; the freeze-on-cerrado gate lives in the store
// layer where the parent evento's estado is known. Mirrors
// `gastosFijos.service` shape — separate table (REQ-POS-38), no
// update on the production surface but `actualizar` ships for
// future use cases.
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  GastoImprevisto,
  GastoImprevistoInput,
  ServiceError,
} from '@/types'

export interface GastosImprevistosService {
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: GastoImprevisto[] | null; error: ServiceError | null }>
  crear(
    input: GastoImprevistoInput,
  ): Promise<{ data: GastoImprevisto | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: Partial<GastoImprevistoInput>,
  ): Promise<{ data: GastoImprevisto | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
}

export function crearGastosImprevistosService(
  supabase: SupabaseClient<Database>,
): GastosImprevistosService {
  return {
    async listarPorEvento(eventoId) {
      const respuesta = await supabase
        .from('gastos_imprevistos')
        .select('*')
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: false })
      return {
        data: (respuesta.data as GastoImprevisto[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async crear(input) {
      const insercion = await supabase
        .from('gastos_imprevistos')
        .insert(input as Database['public']['Tables']['gastos_imprevistos']['Insert'])
        .select()
        .single()
      return {
        data: (insercion.data as GastoImprevisto | null) ?? null,
        error: insercion.error,
      }
    },

    async actualizar(id, cambios) {
      const respuesta = await supabase
        .from('gastos_imprevistos')
        .update(cambios as Database['public']['Tables']['gastos_imprevistos']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as GastoImprevisto | null) ?? null,
        error: respuesta.error,
      }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('gastos_imprevistos').delete().eq('id', id)
      return { data: null, error: respuesta.error }
    },
  }
}