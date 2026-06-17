// REQ-CATALOG-43, REQ-CATALOG-44: factory pattern (OCP/DIP) — caller
// supplies the supabase client, the service never throws. The duplicate
// check (REQ-CATALOG-5) does a case-insensitive scan before insert; the
// FK-restriction error from `eliminar` is propagated verbatim so the
// view layer can surface it in Spanish.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, MateriaPrima, MateriaPrimaInput, ServiceError } from '@/types'

export interface IngredientsService {
  listar(): Promise<{ data: MateriaPrima[] | null; error: ServiceError | null }>
  crear(input: MateriaPrimaInput): Promise<{ data: MateriaPrima | null; error: ServiceError | null }>
  actualizar(
    id: string,
    cambios: Partial<MateriaPrimaInput>,
  ): Promise<{ data: MateriaPrima | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
}

export function crearIngredientsService(supabase: SupabaseClient<Database>): IngredientsService {
  // Trim + case-fold mirrors what the SQL CHECK + the typeahead index do.
  // We compare in TS so a "azúcar" attempt fails before hitting Supabase,
  // giving the user the friendly message in REQ-CATALOG-5.
  const nombreCoincide = (a: string, b: string): boolean =>
    a.trim().toLowerCase() === b.trim().toLowerCase()

  return {
    async listar() {
      const respuesta = await supabase.from('materias_primas').select('*')
      return { data: (respuesta.data as MateriaPrima[] | null) ?? null, error: respuesta.error }
    },

    async crear(input) {
      // REQ-CATALOG-5: case-insensitive duplicate detection against the
      // existing list. Cheap pre-check; full UNIQUE constraint lives in DB.
      const existentes = await supabase.from('materias_primas').select('nombre')
      if (existentes.error) {
        return { data: null, error: existentes.error }
      }
      const choque = (existentes.data as Pick<MateriaPrima, 'nombre'>[] | null)?.find((m) =>
        nombreCoincide(m.nombre, input.nombre),
      )
      if (choque) {
        return {
          data: null,
          error: {
            code: 'DUPLICADO',
            message: `Ya existe una materia prima con el nombre '${choque.nombre}'`,
          },
        }
      }

      const insercion = await supabase
        .from('materias_primas')
        .insert(input as Database['public']['Tables']['materias_primas']['Insert'])
        .select()
        .single()
      return {
        data: (insercion.data as MateriaPrima | null) ?? null,
        error: insercion.error,
      }
    },

    async actualizar(id, cambios) {
      const respuesta = await supabase
        .from('materias_primas')
        .update(cambios as Database['public']['Tables']['materias_primas']['Update'])
        .eq('id', id)
        .select()
        .single()
      return {
        data: (respuesta.data as MateriaPrima | null) ?? null,
        error: respuesta.error,
      }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('materias_primas').delete().eq('id', id)
      // Supabase delete returns a count-like payload; we normalize to null
      // because the LSP contract is `{ data: null, error: ... }` for deletes.
      return { data: null, error: respuesta.error }
    },
  }
}
