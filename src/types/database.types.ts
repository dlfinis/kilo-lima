// Hand-rolled for catalog (3 tables) + events (3 tables). pnpm typecheck
// catches drift. To regenerate from Supabase once the CLI is installed
// (deferred to CI slice):
//   npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts
// Per REQ-CATALOG-27 + REQ-EVENTS-30.
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
      eventos: {
        Row: {
          id: string
          nombre: string
          fecha: string
          ubicacion: string | null
          estado: 'planificacion' | 'en_curso' | 'cerrado'
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          fecha: string
          ubicacion?: string | null
          estado?: 'planificacion' | 'en_curso' | 'cerrado'
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['eventos']['Insert']>
        Relationships: []
      }
      gastos_fijos: {
        Row: {
          id: string
          evento_id: string
          categoria: 'renta' | 'transporte' | 'permisos' | 'publicidad' | 'servicios' | 'otro'
          monto: number
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          categoria: 'renta' | 'transporte' | 'permisos' | 'publicidad' | 'servicios' | 'otro'
          monto: number
          descripcion?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['gastos_fijos']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'gastos_fijos_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
        ]
      }
      plan_produccion: {
        Row: {
          id: string
          evento_id: string
          receta_id: string
          unidades_a_producir: number
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          receta_id: string
          unidades_a_producir: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['plan_produccion']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'plan_produccion_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'plan_produccion_receta_id_fkey'
            columns: ['receta_id']
            referencedRelation: 'recetas'
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
