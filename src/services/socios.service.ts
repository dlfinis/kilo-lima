import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Aporte,
  AporteInput,
  Database,
  EventoSocio,
  EventoSocioInput,
  ServiceError,
  Socio,
  SocioInput,
} from '@/types'

export interface SociosService {
  listarTodos(): Promise<{ data: Socio[] | null; error: ServiceError | null }>
  crear(input: SocioInput): Promise<{ data: Socio | null; error: ServiceError | null }>
  actualizar(id: string, cambios: Partial<SocioInput>): Promise<{ data: Socio | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>

  listarPorEvento(eventoId: string): Promise<{ data: EventoSocio[] | null; error: ServiceError | null }>
  vincular(input: EventoSocioInput): Promise<{ data: EventoSocio | null; error: ServiceError | null }>
  actualizarVinculacion(id: string, cambios: Partial<EventoSocioInput>): Promise<{ data: EventoSocio | null; error: ServiceError | null }>
  desvincular(id: string): Promise<{ data: null; error: ServiceError | null }>

  listarAportes(eventoId: string): Promise<{ data: Aporte[] | null; error: ServiceError | null }>
  crearAporte(input: AporteInput): Promise<{ data: Aporte | null; error: ServiceError | null }>
  eliminarAporte(id: string): Promise<{ data: null; error: ServiceError | null }>
}

export function crearSociosService(supabase: SupabaseClient<Database>): SociosService {
  return {
    async listarTodos() {
      const res = await supabase.from('socios').select('*').order('nombre')
      return { data: (res.data as Socio[] | null) ?? null, error: res.error }
    },

    async crear(input) {
      const res = await supabase.from('socios').insert(input as Database['public']['Tables']['socios']['Insert']).select().single()
      return { data: (res.data as Socio | null) ?? null, error: res.error }
    },

    async actualizar(id, cambios) {
      const res = await supabase.from('socios').update(cambios as Database['public']['Tables']['socios']['Update']).eq('id', id).select().single()
      return { data: (res.data as Socio | null) ?? null, error: res.error }
    },

    async eliminar(id) {
      const res = await supabase.from('socios').delete().eq('id', id)
      return { data: null, error: res.error }
    },

    async listarPorEvento(eventoId) {
      const res = await supabase.from('evento_socios').select('*').eq('evento_id', eventoId)
      return { data: (res.data as EventoSocio[] | null) ?? null, error: res.error }
    },

    async vincular(input) {
      const res = await supabase.from('evento_socios').insert(input as Database['public']['Tables']['evento_socios']['Insert']).select().single()
      return { data: (res.data as EventoSocio | null) ?? null, error: res.error }
    },

    async actualizarVinculacion(id, cambios) {
      const res = await supabase.from('evento_socios').update(cambios as Database['public']['Tables']['evento_socios']['Update']).eq('id', id).select().single()
      return { data: (res.data as EventoSocio | null) ?? null, error: res.error }
    },

    async desvincular(id) {
      const res = await supabase.from('evento_socios').delete().eq('id', id)
      return { data: null, error: res.error }
    },

    async listarAportes(eventoId) {
      const res = await supabase.from('aportes').select('*').eq('evento_id', eventoId).order('fecha', { ascending: false })
      return { data: (res.data as Aporte[] | null) ?? null, error: res.error }
    },

    async crearAporte(input) {
      const res = await supabase.from('aportes').insert(input as Database['public']['Tables']['aportes']['Insert']).select().single()
      return { data: (res.data as Aporte | null) ?? null, error: res.error }
    },

    async eliminarAporte(id) {
      const res = await supabase.from('aportes').delete().eq('id', id)
      return { data: null, error: res.error }
    },
  }
}
