// REQ-POS-32, REQ-POS-33, REQ-POS-35, REQ-POS-36, REQ-POS-44,
// REQ-POS-52, REQ-POS-53, REQ-POS-56: cierres_caja service — factory
// pattern (OCP/DIP), never-throw (LSP). Cierres are immutable
// snapshots (REQ-POS-32): no `actualizar`, no `eliminar` method
// exposed. The store layer owns the insert + estado transition flow
// so the service stays narrow and event-agnostic.
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, CierreCaja, CierreCajaInput, ServiceError } from '@/types'

export interface CierresCajaService {
  listarPorEvento(
    eventoId: string,
  ): Promise<{ data: CierreCaja[] | null; error: ServiceError | null }>
  buscarPorEvento(
    eventoId: string,
  ): Promise<{ data: CierreCaja | null; error: ServiceError | null }>
  registrar(
    input: CierreCajaInput,
  ): Promise<{ data: CierreCaja | null; error: ServiceError | null }>
}

function mapearErrorRegistrar(error: ServiceError | null): ServiceError | null {
  if (!error) return null
  // UNIQUE(evento_id) — already exists a cierre for this evento.
  if (error.code === '23505') {
    return { code: 'DUPLICATE_CIERRE', message: 'Ya existe un cierre para este evento' }
  }
  return error
}

export function crearCierresCajaService(supabase: SupabaseClient<Database>): CierresCajaService {
  return {
    async listarPorEvento(eventoId) {
      const respuesta = await supabase
        .from('cierres_caja')
        .select('*')
        .eq('evento_id', eventoId)
        .order('fecha_cierre', { ascending: false })
      return {
        data: (respuesta.data as CierreCaja[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async buscarPorEvento(eventoId) {
      const respuesta = await supabase
        .from('cierres_caja')
        .select('*')
        .eq('evento_id', eventoId)
        .maybeSingle()
      return {
        data: (respuesta.data as CierreCaja | null) ?? null,
        error: respuesta.error,
      }
    },

    async registrar(input) {
      const insercion = await supabase
        .from('cierres_caja')
        .insert(input as Database['public']['Tables']['cierres_caja']['Insert'])
        .select()
        .single()
      return {
        data: (insercion.data as CierreCaja | null) ?? null,
        error: mapearErrorRegistrar(insercion.error),
      }
    },
  }
}