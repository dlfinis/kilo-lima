// REQ-EVENTS-10, REQ-EVENTS-11, REQ-EVENTS-12, REQ-EVENTS-13,
// REQ-EVENTS-41, REQ-EVENTS-42: factory pattern (OCP/DIP). All four
// methods are scoped to `evento_id`; the freeze-on-cerrado gate lives
// in the store layer (REQ-EVENTS-26) where the parent evento's estado
// is known. The service is event-agnostic so future slices (e.g.,
// shared gastos) can reuse it without circular deps.
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  GastoFijo,
  GastoFijoInput,
  ServiceError,
} from '@/types'

export interface GastosFijosService {
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: GastoFijo[] | null; error: ServiceError | null }>
  crear(input: GastoFijoInput): Promise<{ data: GastoFijo | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: Partial<GastoFijoInput>,
  ): Promise<{ data: GastoFijo | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
}

export function crearGastosFijosService(
  supabase: SupabaseClient<Database>,
): GastosFijosService {
  return {
    async listarPorEvento(eventoId) {
      const respuesta = await supabase
        .from('gastos_fijos')
        .select('*')
        .eq('evento_id', eventoId)
      return {
        data: (respuesta.data as GastoFijo[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async crear(input) {
      const insercion = await supabase
        .from('gastos_fijos')
        .insert(input as Database['public']['Tables']['gastos_fijos']['Insert'])
        .select()
        .single()
      return {
        data: (insercion.data as GastoFijo | null) ?? null,
        error: insercion.error,
      }
    },

    async actualizar(id, cambios) {
      const respuesta = await supabase
        .from('gastos_fijos')
        .update(cambios as Database['public']['Tables']['gastos_fijos']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as GastoFijo | null) ?? null,
        error: respuesta.error,
      }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('gastos_fijos').delete().eq('id', id)
      return { data: null, error: respuesta.error }
    },
  }
}
