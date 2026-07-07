// Hand-rolled for catalog (3 tables) + events (3 tables) + pos
// (5 tables). pnpm typecheck catches drift. To regenerate from Supabase
// once the CLI is installed (deferred to CI slice):
//   npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts
// Per REQ-CATALOG-27 + REQ-EVENTS-30 + REQ-POS-42.
export interface Database {
  public: {
    Tables: {
      materias_primas: {
        Row: {
          id: string
          nombre: string
          unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'
          costo_por_unidad: number
          categoria: 'ingrediente' | 'empaque'
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          unidad: 'kg' | 'g' | 'l' | 'ml' | 'unidad'
          costo_por_unidad: number
          categoria?: 'ingrediente' | 'empaque'
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
          fecha_fin: string | null
          margen_ganancia: number | null
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
          fecha_fin?: string | null
          margen_ganancia?: number | null
          ubicacion?: string | null
          estado?: 'planificacion' | 'en_curso' | 'cerrado'
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['eventos']['Insert']>
        Relationships: []
      }
      socios: {
        Row: {
          id: string
          nombre: string
          email: string | null
          telefono: string | null
          notas: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          email?: string | null
          telefono?: string | null
          notas?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['socios']['Insert']>
        Relationships: []
      }
      evento_socios: {
        Row: {
          id: string
          evento_id: string
          socio_id: string
          porcentaje_ganancia: number
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          socio_id: string
          porcentaje_ganancia: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['evento_socios']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'evento_socios_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'evento_socios_socio_id_fkey'
            columns: ['socio_id']
            referencedRelation: 'socios'
            referencedColumns: ['id']
          },
        ]
      }
      aportes: {
        Row: {
          id: string
          evento_id: string
          socio_id: string
          monto: number
          fecha: string
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          socio_id: string
          monto: number
          fecha?: string
          descripcion?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['aportes']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'aportes_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'aportes_socio_id_fkey'
            columns: ['socio_id']
            referencedRelation: 'socios'
            referencedColumns: ['id']
          },
        ]
      }
      compras_insumos: {
        Row: {
          id: string
          evento_id: string | null
          socio_id: string
          materia_prima_id: string
          cantidad: number
          costo_total: number
          fecha: string
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id?: string | null
          socio_id: string
          materia_prima_id: string
          cantidad: number
          costo_total: number
          fecha?: string
          descripcion?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['compras_insumos']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'compras_insumos_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'compras_insumos_socio_id_fkey'
            columns: ['socio_id']
            referencedRelation: 'socios'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'compras_insumos_materia_prima_id_fkey'
            columns: ['materia_prima_id']
            referencedRelation: 'materias_primas'
            referencedColumns: ['id']
          },
        ]
      }
      gastos_fijos: {
        Row: {
          id: string
          evento_id: string
          categoria: 'renta' | 'transporte' | 'permisos' | 'publicidad' | 'servicios' | 'otro'
          monto: number
          descripcion: string | null
          socio_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          categoria: 'renta' | 'transporte' | 'permisos' | 'publicidad' | 'servicios' | 'otro'
          monto: number
          descripcion?: string | null
          socio_id?: string | null
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
      productos: {
        Row: {
          id: string
          receta_id: string
          precio_venta: number
          disponible: boolean
          orden: number
          // productos-mejoras / producto-descripcion: nullable description.
          descripcion: string | null
          // productos-icono: MDI icon name for POS display.
          icono: string | null
          // productos-color: card color in POS/catalog.
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          receta_id: string
          precio_venta: number
          disponible?: boolean
          orden?: number
          descripcion?: string | null
          icono?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['productos']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'productos_receta_id_fkey'
            columns: ['receta_id']
            referencedRelation: 'recetas'
            referencedColumns: ['id']
          },
        ]
      }
      ventas: {
        Row: {
          id: string
          evento_id: string
          fecha: string
          total: number
          metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
          // pos-redesign / pos-cambio-comprobante: cash-back + receipt
          // numbering. Nullable for legacy rows and non-efectivo sales.
          monto_recibido: number | null
          cambio: number | null
          comprobante_numero: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          fecha?: string
          total: number
          metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
          monto_recibido?: number | null
          cambio?: number | null
          comprobante_numero?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['ventas']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'ventas_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
        ]
      }
      venta_items: {
        Row: {
          id: string
          venta_id: string
          producto_id: string
          cantidad: number
          precio_unitario: number
          subtotal: number
          costo_unitario: number | null
          margen_aplicado: number | null
          evento_producto_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          venta_id: string
          producto_id: string
          cantidad: number
          precio_unitario: number
          subtotal: number
          costo_unitario?: number | null
          margen_aplicado?: number | null
          evento_producto_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['venta_items']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'venta_items_venta_id_fkey'
            columns: ['venta_id']
            referencedRelation: 'ventas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_items_producto_id_fkey'
            columns: ['producto_id']
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_items_evento_producto_id_fkey'
            columns: ['evento_producto_id']
            referencedRelation: 'evento_productos'
            referencedColumns: ['id']
          },
        ]
      }
      evento_productos: {
        Row: {
          id: string
          evento_id: string
          producto_id: string
          precio_venta: number | null
          margen: number | null
          incluido: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          producto_id: string
          precio_venta?: number | null
          margen?: number | null
          incluido?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['evento_productos']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'evento_productos_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'evento_productos_producto_id_fkey'
            columns: ['producto_id']
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
        ]
      }
      gastos_imprevistos: {
        Row: {
          id: string
          evento_id: string
          monto: number
          motivo: string
          categoria: 'insumos_extra' | 'transporte' | 'reparacion' | 'propina' | 'otro' | null
          socio_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          monto: number
          motivo: string
          categoria?: 'insumos_extra' | 'transporte' | 'reparacion' | 'propina' | 'otro' | null
          socio_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['gastos_imprevistos']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'gastos_imprevistos_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
        ]
      }
      cierres_caja: {
        Row: {
          id: string
          evento_id: string
          fecha_cierre: string
          total_ventas: number
          total_gastos_fijos: number
          total_gastos_imprevistos: number
          utilidad_bruta: number
          total_cogs: number
          total_utilidad_bruta: number
          total_utilidad_neta: number
          efectivo_esperado: number | null
          efectivo_real: number | null
          diferencia: number | null
          notas: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          fecha_cierre?: string
          total_ventas: number
          total_gastos_fijos: number
          total_gastos_imprevistos: number
          utilidad_bruta: number
          total_cogs?: number
          total_utilidad_bruta?: number
          total_utilidad_neta?: number
          efectivo_esperado?: number | null
          efectivo_real?: number | null
          diferencia?: number | null
          notas?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['cierres_caja']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'cierres_caja_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
        ]
      }
      // REQ-POS-CORRECCION-1: append-only audit table for sale
      // corrections. The header rows capture financial deltas;
      // `items_anteriores` / `items_nuevos` carry full item
      // snapshots so the audit row is self-contained. `motivo` is
      // required — operators must record a reason for every edit.
      venta_correcciones: {
        Row: {
          id: string
          venta_id: string
          evento_id: string
          total_anterior: number
          total_nuevo: number
          metodo_pago_anterior: 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
          metodo_pago_nuevo: 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
          monto_recibido_anterior: number | null
          monto_recibido_nuevo: number | null
          motivo: string
          items_anteriores: unknown
          items_nuevos: unknown
          created_at: string
        }
        Insert: {
          id?: string
          venta_id: string
          evento_id: string
          total_anterior: number
          total_nuevo: number
          metodo_pago_anterior: 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
          metodo_pago_nuevo: 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'
          monto_recibido_anterior?: number | null
          monto_recibido_nuevo?: number | null
          motivo: string
          items_anteriores: unknown
          items_nuevos: unknown
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['venta_correcciones']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'venta_correcciones_venta_id_fkey'
            columns: ['venta_id']
            referencedRelation: 'ventas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_correcciones_evento_id_fkey'
            columns: ['evento_id']
            referencedRelation: 'eventos'
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
