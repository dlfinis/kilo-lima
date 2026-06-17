// Hand-rolled for catalog (3 tables). pnpm typecheck catches drift.
// To regenerate from Supabase once the CLI is installed (deferred to CI slice):
//   npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts
// Per REQ-CATALOG-27.
export interface Database {
  public: {
    Tables: {
      materias_primas: {
        Row: {
          id: string
          nombre: string
          unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'
          costo_por_unidad: number
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'
          costo_por_unidad: number
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['materias_primas']['Insert']>
        Relationships: []
      }
      recetas: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          rendimiento_unidades: number
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          descripcion?: string | null
          rendimiento_unidades: number
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['recetas']['Insert']>
        Relationships: []
      }
      receta_ingredientes: {
        Row: {
          id: string
          receta_id: string
          materia_prima_id: string
          cantidad: number
          created_at: string
        }
        Insert: {
          id?: string
          receta_id: string
          materia_prima_id: string
          cantidad: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['receta_ingredientes']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'receta_ingredientes_receta_id_fkey'
            columns: ['receta_id']
            referencedRelation: 'recetas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'receta_ingredientes_materia_prima_id_fkey'
            columns: ['materia_prima_id']
            referencedRelation: 'materias_primas'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
