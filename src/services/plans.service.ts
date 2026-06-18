// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-17, REQ-EVENTS-19,
// REQ-EVENTS-41, REQ-EVENTS-42: factory pattern (OCP/DIP) — caller
// supplies the supabase client, the service never throws.
// `reemplazarTodos` is a delete-then-insert two-call flow (no
// transaction, v1 simplicity per REQ-EVENTS-19) — when the grid is
// saved, the existing rows are wiped and the new list is inserted.
// On insert failure the store surfaces the error and the user retries
// (matches `recipes.service.actualizar`'s delete-then-reinsert
// pattern for ingrediente lines).
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  PlanProduccion,
  PlanProduccionInput,
  ServiceError,
} from '@/types'

export interface PlansService {
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: PlanProduccion[] | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
  reemplazarTodos(
    eventoId: string,
    filas: PlanProduccionInput[],
  ): Promise<{ data: PlanProduccion[] | null; error: ServiceError | null }>
}

export function crearPlansService(supabase: SupabaseClient<Database>): PlansService {
  return {
    async listarPorEvento(eventoId) {
      const respuesta = await supabase
        .from('plan_produccion')
        .select('*')
        .eq('evento_id', eventoId)
      return {
        data: (respuesta.data as PlanProduccion[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('plan_produccion').delete().eq('id', id)
      return { data: null, error: respuesta.error }
    },

    async reemplazarTodos(eventoId, filas) {
      // Wipe existing rows for the evento first; delete is idempotent
      // so a zero-row plan works as well.
      const eliminacion = await supabase
        .from('plan_produccion')
        .delete()
        .eq('evento_id', eventoId)
      if (eliminacion.error) {
        return { data: null, error: eliminacion.error }
      }
      if (filas.length === 0) {
        return { data: [], error: null }
      }
      const insercion = await supabase
        .from('plan_produccion')
        .insert(filas as Database['public']['Tables']['plan_produccion']['Insert'][])
        .select()
      return {
        data: (insercion.data as PlanProduccion[] | null) ?? null,
        error: insercion.error,
      }
    },
  }
}