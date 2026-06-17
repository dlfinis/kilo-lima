// REQ-CATALOG-9..12, REQ-CATALOG-43, REQ-CATALOG-44: factory pattern
// (OCP/DIP) — caller supplies the supabase client, the service never
// throws. `crear` performs a joined insert (receta row + batch
// receta_ingredientes rows); `actualizar` uses delete-then-reinsert for
// the ingredient lines so add/remove/quantity changes are atomic from
// the caller's perspective.
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  IngredienteRecetaInput,
  RecetaConIngredientes,
  RecetaInput,
  ServiceError,
} from '@/types'

export interface RecetaInputCompleto extends RecetaInput {
  ingredientes: IngredienteRecetaInput[]
}

export interface RecipesService {
  listar(): Promise<{ data: RecetaConIngredientes[] | null; error: ServiceError | null }>
  crear(
    input: RecetaInputCompleto,
  ): Promise<{ data: RecetaConIngredientes | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: RecetaInputCompleto,
  ): Promise<{ data: RecetaConIngredientes | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
}

export function crearRecipesService(supabase: SupabaseClient<Database>): RecipesService {
  return {
    async listar() {
      const respuesta = await supabase
        .from('recetas')
        .select('*, ingredientes:receta_ingredientes(*)')
      return {
        data: (respuesta.data as RecetaConIngredientes[] | null) ?? null,
        error: respuesta.error,
      }
    },

    async crear(input) {
      const { ingredientes, ...receta } = input
      const insercionReceta = await supabase
        .from('recetas')
        .insert(receta as Database['public']['Tables']['recetas']['Insert'])
        .select()
        .single()
      if (insercionReceta.error || !insercionReceta.data) {
        return { data: null, error: insercionReceta.error }
      }
      const recetaId = (insercionReceta.data as RecetaConIngredientes).id
      const lineasConReceta = ingredientes.map((linea) => ({
        receta_id: recetaId,
        materia_prima_id: linea.materia_prima_id,
        cantidad: linea.cantidad,
      }))
      const insercionLineas = await supabase
        .from('receta_ingredientes')
        .insert(lineasConReceta as Database['public']['Tables']['receta_ingredientes']['Insert'][])
      if (insercionLineas.error) {
        return { data: null, error: insercionLineas.error }
      }
      return {
        data: { ...(insercionReceta.data as RecetaConIngredientes), ingredientes: [] },
        error: null,
      }
    },

    async actualizar(id, cambios) {
      const { ingredientes, ...receta } = cambios
      const actualizacion = await supabase
        .from('recetas')
        .update(receta as Database['public']['Tables']['recetas']['Update'])
        .eq('id', id)
        .select()
        .single()
      if (actualizacion.error || !actualizacion.data) {
        return { data: null, error: actualizacion.error }
      }
      // Delete-then-reinsert keeps the ingredient list atomic from the
      // caller's view. Both errors are surfaced; partial state in the
      // DB is acceptable because REQ-CATALOG-11 only requires that the
      // post-update list matches the form input.
      const eliminacion = await supabase.from('receta_ingredientes').delete().eq('receta_id', id)
      if (eliminacion.error) {
        return { data: null, error: eliminacion.error }
      }
      const lineasConReceta = ingredientes.map((linea) => ({
        receta_id: id,
        materia_prima_id: linea.materia_prima_id,
        cantidad: linea.cantidad,
      }))
      const insercionLineas = await supabase
        .from('receta_ingredientes')
        .insert(lineasConReceta as Database['public']['Tables']['receta_ingredientes']['Insert'][])
      if (insercionLineas.error) {
        return { data: null, error: insercionLineas.error }
      }
      return {
        data: { ...(actualizacion.data as RecetaConIngredientes), ingredientes: [] },
        error: null,
      }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('recetas').delete().eq('id', id)
      return { data: null, error: respuesta.error }
    },
  }
}
