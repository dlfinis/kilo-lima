// REQ-EVENTS-1..6, REQ-EVENTS-41, REQ-EVENTS-42: factory pattern
// (OCP/DIP). `cambiarEstado` is the only mutator that gates via
// `transicionEstadoValida` because the SQL CHECK constraint only
// validates the value, not the move. Returning `{ code:
// 'TRANSICION_INVALIDA' }` keeps the LSP surface (never-throw) intact
// so the store can render the same error toast for invalid moves and
// DB errors.
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  Evento,
  EventoInput,
  ServiceError,
} from '@/types'
import { transicionEstadoValida } from '@/utils/estado'

export interface EventsService {
  listar(): Promise<{ data: Evento[] | null; error: ServiceError | null }>
  crear(input: EventoInput): Promise<{ data: Evento | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: EventoInput,
  ): Promise<{ data: Evento | null; error: ServiceError | null }>
  cambiarEstado(
    id: string,
    desde: Evento['estado'],
    hacia: Evento['estado'],
  ): Promise<{ data: Evento | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
}

export function crearEventsService(supabase: SupabaseClient<Database>): EventsService {
  return {
    async listar() {
      const respuesta = await supabase.from('eventos').select('*').order('fecha', { ascending: false })
      return { data: (respuesta.data as Evento[] | null) ?? null, error: respuesta.error }
    },

    async crear(input) {
      const insercion = await supabase
        .from('eventos')
        .insert(input as Database['public']['Tables']['eventos']['Insert'])
        .select()
        .single()
      return {
        data: (insercion.data as Evento | null) ?? null,
        error: insercion.error,
      }
    },

    async actualizar(id, cambios) {
      const respuesta = await supabase
        .from('eventos')
        .update(cambios as Database['public']['Tables']['eventos']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as Evento | null) ?? null,
        error: respuesta.error,
      }
    },

    async cambiarEstado(id, desde, hacia) {
      // REQ-EVENTS-6: forward-only transitions (and same→same is invalid).
      // The store knows the current `estado` from `eventos`/`eventoActual`
      // and passes it as `desde`. Gate first so an invalid move is
      // rejected without touching the DB.
      if (!transicionEstadoValida(desde, hacia)) {
        return {
          data: null,
          error: {
            code: 'TRANSICION_INVALIDA',
            message: `Transición de estado inválida: ${desde} → ${hacia}`,
          },
        }
      }
      const respuesta = await supabase
        .from('eventos')
        .update({ estado: hacia } as Database['public']['Tables']['eventos']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as Evento | null) ?? null,
        error: respuesta.error,
      }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('eventos').delete().eq('id', id)
      return { data: null, error: respuesta.error }
    },
  }
}
