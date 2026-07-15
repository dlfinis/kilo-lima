export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adicionales_disponibles: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          materia_prima_id: string
          precio_venta: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          materia_prima_id: string
          precio_venta: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          materia_prima_id?: string
          precio_venta?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adicionales_disponibles_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: true
            referencedRelation: "materias_primas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adicionales_disponibles_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: true
            referencedRelation: "v_stock_actual"
            referencedColumns: ["materia_prima_id"]
          },
        ]
      }
      aportes: {
        Row: {
          created_at: string
          descripcion: string | null
          evento_id: string
          fecha: string
          id: string
          monto: number
          socio_id: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          evento_id: string
          fecha?: string
          id?: string
          monto: number
          socio_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          evento_id?: string
          fecha?: string
          id?: string
          monto?: number
          socio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aportes_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aportes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      cierres_caja: {
        Row: {
          created_at: string
          diferencia: number | null
          efectivo_esperado: number | null
          efectivo_real: number | null
          evento_id: string
          fecha_cierre: string
          id: string
          notas: string | null
          total_cogs: number
          total_gastos_fijos: number
          total_gastos_imprevistos: number
          total_utilidad_bruta: number
          total_utilidad_neta: number
          total_ventas: number
          utilidad_bruta: number
        }
        Insert: {
          created_at?: string
          diferencia?: number | null
          efectivo_esperado?: number | null
          efectivo_real?: number | null
          evento_id: string
          fecha_cierre?: string
          id?: string
          notas?: string | null
          total_cogs?: number
          total_gastos_fijos: number
          total_gastos_imprevistos: number
          total_utilidad_bruta?: number
          total_utilidad_neta?: number
          total_ventas: number
          utilidad_bruta: number
        }
        Update: {
          created_at?: string
          diferencia?: number | null
          efectivo_esperado?: number | null
          efectivo_real?: number | null
          evento_id?: string
          fecha_cierre?: string
          id?: string
          notas?: string | null
          total_cogs?: number
          total_gastos_fijos?: number
          total_gastos_imprevistos?: number
          total_utilidad_bruta?: number
          total_utilidad_neta?: number
          total_ventas?: number
          utilidad_bruta?: number
        }
        Relationships: [
          {
            foreignKeyName: "cierres_caja_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: true
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_insumos: {
        Row: {
          cantidad: number
          costo_total: number
          created_at: string
          descripcion: string | null
          evento_id: string | null
          fecha: string
          id: string
          materia_prima_id: string
          socio_id: string
        }
        Insert: {
          cantidad: number
          costo_total: number
          created_at?: string
          descripcion?: string | null
          evento_id?: string | null
          fecha?: string
          id?: string
          materia_prima_id: string
          socio_id: string
        }
        Update: {
          cantidad?: number
          costo_total?: number
          created_at?: string
          descripcion?: string | null
          evento_id?: string | null
          fecha?: string
          id?: string
          materia_prima_id?: string
          socio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_insumos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_insumos_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "materias_primas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_insumos_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["materia_prima_id"]
          },
          {
            foreignKeyName: "compras_insumos_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_productos: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          incluido: boolean
          margen: number | null
          precio_venta: number | null
          producto_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          incluido?: boolean
          margen?: number | null
          precio_venta?: number | null
          producto_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          incluido?: boolean
          margen?: number | null
          precio_venta?: number | null
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_productos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_socios: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          porcentaje_ganancia: number
          socio_id: string
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          porcentaje_ganancia?: number
          socio_id: string
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          porcentaje_ganancia?: number
          socio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_socios_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_socios_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          fecha_fin: string | null
          id: string
          margen_ganancia: number | null
          nombre: string
          notas: string | null
          ubicacion: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha: string
          fecha_fin?: string | null
          id?: string
          margen_ganancia?: number | null
          nombre: string
          notas?: string | null
          ubicacion?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          fecha_fin?: string | null
          id?: string
          margen_ganancia?: number | null
          nombre?: string
          notas?: string | null
          ubicacion?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gastos_fijos: {
        Row: {
          categoria: string
          created_at: string
          descripcion: string | null
          evento_id: string
          id: string
          monto: number
          socio_id: string | null
        }
        Insert: {
          categoria: string
          created_at?: string
          descripcion?: string | null
          evento_id: string
          id?: string
          monto: number
          socio_id?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          descripcion?: string | null
          evento_id?: string
          id?: string
          monto?: number
          socio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_fijos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_fijos_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_imprevistos: {
        Row: {
          categoria: string | null
          created_at: string
          evento_id: string
          id: string
          monto: number
          motivo: string
          socio_id: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          evento_id: string
          id?: string
          monto: number
          motivo: string
          socio_id?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          evento_id?: string
          id?: string
          monto?: number
          motivo?: string
          socio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_imprevistos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_imprevistos_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_opciones: {
        Row: {
          created_at: string
          id: string
          incluidas_gratis: number
          nombre: string
          precio_venta_extra: number
          producto_configurable_id: string
          tipo_calculo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          incluidas_gratis?: number
          nombre: string
          precio_venta_extra?: number
          producto_configurable_id: string
          tipo_calculo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          incluidas_gratis?: number
          nombre?: string
          precio_venta_extra?: number
          producto_configurable_id?: string
          tipo_calculo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_opciones_producto_configurable_id_fkey"
            columns: ["producto_configurable_id"]
            isOneToOne: false
            referencedRelation: "productos_configurables"
            referencedColumns: ["id"]
          },
        ]
      }
      materias_primas: {
        Row: {
          cantidad_disponible: number
          categoria: string
          costo_por_unidad: number
          created_at: string
          id: string
          nombre: string
          notas: string | null
          unidad: string
          updated_at: string
        }
        Insert: {
          cantidad_disponible?: number
          categoria?: string
          costo_por_unidad: number
          created_at?: string
          id?: string
          nombre: string
          notas?: string | null
          unidad: string
          updated_at?: string
        }
        Update: {
          cantidad_disponible?: number
          categoria?: string
          costo_por_unidad?: number
          created_at?: string
          id?: string
          nombre?: string
          notas?: string | null
          unidad?: string
          updated_at?: string
        }
        Relationships: []
      }
      opciones_grupo: {
        Row: {
          created_at: string
          grupo_id: string
          id: string
          materia_prima_id: string
        }
        Insert: {
          created_at?: string
          grupo_id: string
          id?: string
          materia_prima_id: string
        }
        Update: {
          created_at?: string
          grupo_id?: string
          id?: string
          materia_prima_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opciones_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_opciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opciones_grupo_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "materias_primas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opciones_grupo_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["materia_prima_id"]
          },
        ]
      }
      plan_produccion: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          receta_id: string
          unidades_a_producir: number
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          receta_id: string
          unidades_a_producir: number
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          receta_id?: string
          unidades_a_producir?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_produccion_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_produccion_receta_id_fkey"
            columns: ["receta_id"]
            isOneToOne: false
            referencedRelation: "recetas"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_produccion: {
        Row: {
          created_at: string
          evento_producto_id: string
          id: string
          unidades_a_producir: number
        }
        Insert: {
          created_at?: string
          evento_producto_id: string
          id?: string
          unidades_a_producir: number
        }
        Update: {
          created_at?: string
          evento_producto_id?: string
          id?: string
          unidades_a_producir?: number
        }
        Relationships: [
          {
            foreignKeyName: "producto_produccion_evento_producto_id_fkey"
            columns: ["evento_producto_id"]
            isOneToOne: true
            referencedRelation: "evento_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          categoria: string | null
          color: string | null
          created_at: string
          descripcion: string | null
          disponible: boolean
          icono: string | null
          id: string
          nombre: string
          orden: number
          precio_venta: number | null
          receta_id: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          color?: string | null
          created_at?: string
          descripcion?: string | null
          disponible?: boolean
          icono?: string | null
          id?: string
          nombre: string
          orden?: number
          precio_venta?: number | null
          receta_id: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          color?: string | null
          created_at?: string
          descripcion?: string | null
          disponible?: boolean
          icono?: string | null
          id?: string
          nombre?: string
          orden?: number
          precio_venta?: number | null
          receta_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_receta_id_fkey"
            columns: ["receta_id"]
            isOneToOne: true
            referencedRelation: "recetas"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_configurables: {
        Row: {
          costo_base_calculado: number
          created_at: string
          id: string
          producto_id: string
          updated_at: string
        }
        Insert: {
          costo_base_calculado?: number
          created_at?: string
          id?: string
          producto_id: string
          updated_at?: string
        }
        Update: {
          costo_base_calculado?: number
          created_at?: string
          id?: string
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_configurables_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      receta_ingredientes: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          materia_prima_id: string
          receta_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          materia_prima_id: string
          receta_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          materia_prima_id?: string
          receta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receta_ingredientes_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "materias_primas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receta_ingredientes_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["materia_prima_id"]
          },
          {
            foreignKeyName: "receta_ingredientes_receta_id_fkey"
            columns: ["receta_id"]
            isOneToOne: false
            referencedRelation: "recetas"
            referencedColumns: ["id"]
          },
        ]
      }
      recetas: {
        Row: {
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          notas: string | null
          rendimiento_unidades: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          notas?: string | null
          rendimiento_unidades: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          rendimiento_unidades?: number
          updated_at?: string
        }
        Relationships: []
      }
      socios: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          cantidad: number
          compra_insumo_id: string | null
          costo_unitario_snapshot: number | null
          created_at: string
          created_by: string | null
          evento_id: string | null
          fecha: string
          id: string
          materia_prima_id: string
          motivo: string | null
          movimiento_corregido_id: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          venta_id: string | null
        }
        Insert: {
          cantidad: number
          compra_insumo_id?: string | null
          costo_unitario_snapshot?: number | null
          created_at?: string
          created_by?: string | null
          evento_id?: string | null
          fecha?: string
          id?: string
          materia_prima_id: string
          motivo?: string | null
          movimiento_corregido_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          venta_id?: string | null
        }
        Update: {
          cantidad?: number
          compra_insumo_id?: string | null
          costo_unitario_snapshot?: number | null
          created_at?: string
          created_by?: string | null
          evento_id?: string | null
          fecha?: string
          id?: string
          materia_prima_id?: string
          motivo?: string | null
          movimiento_corregido_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_compra_insumo_id_fkey"
            columns: ["compra_insumo_id"]
            isOneToOne: false
            referencedRelation: "compras_insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "materias_primas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["materia_prima_id"]
          },
          {
            foreignKeyName: "stock_movements_movimiento_corregido_id_fkey"
            columns: ["movimiento_corregido_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_correcciones: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          items_anteriores: Json
          items_nuevos: Json
          metodo_pago_anterior: string
          metodo_pago_nuevo: string
          monto_recibido_anterior: number | null
          monto_recibido_nuevo: number | null
          motivo: string
          total_anterior: number
          total_nuevo: number
          venta_id: string
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          items_anteriores: Json
          items_nuevos: Json
          metodo_pago_anterior: string
          metodo_pago_nuevo: string
          monto_recibido_anterior?: number | null
          monto_recibido_nuevo?: number | null
          motivo: string
          total_anterior: number
          total_nuevo: number
          venta_id: string
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          items_anteriores?: Json
          items_nuevos?: Json
          metodo_pago_anterior?: string
          metodo_pago_nuevo?: string
          monto_recibido_anterior?: number | null
          monto_recibido_nuevo?: number | null
          motivo?: string
          total_anterior?: number
          total_nuevo?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_correcciones_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_correcciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_item_personalizaciones: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string
          es_incluido: boolean
          grupo_id: string | null
          id: string
          materia_prima_id: string
          precio_venta_extra: number
          venta_item_id: string
        }
        Insert: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          es_incluido?: boolean
          grupo_id?: string | null
          id?: string
          materia_prima_id: string
          precio_venta_extra?: number
          venta_item_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          es_incluido?: boolean
          grupo_id?: string | null
          id?: string
          materia_prima_id?: string
          precio_venta_extra?: number
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_item_personalizaciones_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_opciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_item_personalizaciones_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "materias_primas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_item_personalizaciones_materia_prima_id_fkey"
            columns: ["materia_prima_id"]
            isOneToOne: false
            referencedRelation: "v_stock_actual"
            referencedColumns: ["materia_prima_id"]
          },
          {
            foreignKeyName: "venta_item_personalizaciones_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_items: {
        Row: {
          cantidad: number
          costo_unitario: number | null
          created_at: string
          evento_producto_id: string | null
          id: string
          margen_aplicado: number | null
          precio_unitario: number
          producto_id: string
          subtotal: number
          venta_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario?: number | null
          created_at?: string
          evento_producto_id?: string | null
          id?: string
          margen_aplicado?: number | null
          precio_unitario: number
          producto_id: string
          subtotal: number
          venta_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string
          evento_producto_id?: string | null
          id?: string
          margen_aplicado?: number | null
          precio_unitario?: number
          producto_id?: string
          subtotal?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_evento_producto_id_fkey"
            columns: ["evento_producto_id"]
            isOneToOne: false
            referencedRelation: "evento_productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          cambio: number | null
          comprobante_numero: string | null
          created_at: string
          evento_id: string
          fecha: string
          id: string
          metodo_pago: string
          monto_recibido: number | null
          total: number
        }
        Insert: {
          cambio?: number | null
          comprobante_numero?: string | null
          created_at?: string
          evento_id: string
          fecha?: string
          id?: string
          metodo_pago: string
          monto_recibido?: number | null
          total: number
        }
        Update: {
          cambio?: number | null
          comprobante_numero?: string | null
          created_at?: string
          evento_id?: string
          fecha?: string
          id?: string
          metodo_pago?: string
          monto_recibido?: number | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_stock_actual: {
        Row: {
          materia_prima_id: string | null
          nombre: string | null
          stock_actual: number | null
          unidad: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calcular_costo_base_configurable: {
        Args: { p_producto_configurable_id: string }
        Returns: number
      }
      corregir_venta: { Args: { payload: Json }; Returns: Json }
      exec_sql: {
        Args: { params?: Json; sql_text: string }
        Returns: undefined
      }
      finalizar_evento_snapshot: {
        Args: { p_evento_id: string }
        Returns: Json
      }
      recalcular_costos_configurables: { Args: never; Returns: undefined }
      registrar_ajuste: {
        Args: {
          p_cantidad: number
          p_created_by?: string
          p_fecha?: string
          p_materia_prima_id: string
          p_motivo: string
        }
        Returns: Json
      }
      registrar_compra: {
        Args: {
          p_cantidad: number
          p_compra_insumo_id?: string
          p_costo_unitario: number
          p_evento_id?: string
          p_fecha?: string
          p_materia_prima_id: string
        }
        Returns: Json
      }
      registrar_compra_insumo: {
        Args: {
          p_cantidad: number
          p_costo_total: number
          p_costo_unitario: number
          p_descripcion?: string
          p_evento_id?: string
          p_fecha?: string
          p_materia_prima_id: string
          p_socio_id: string
        }
        Returns: Json
      }
      registrar_consumo: {
        Args: {
          p_cantidad: number
          p_costo_unitario: number
          p_evento_id: string
          p_fecha?: string
          p_materia_prima_id: string
          p_venta_id?: string
        }
        Returns: Json
      }
      registrar_correccion: {
        Args: {
          p_cantidad_corregida: number
          p_fecha?: string
          p_motivo: string
          p_movimiento_id: string
        }
        Returns: Json
      }
      sync_stock_cache: { Args: never; Returns: undefined }
    }
    Enums: {
      tipo_movimiento: "compra" | "consumo" | "correccion" | "ajuste"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      tipo_movimiento: ["compra", "consumo", "correccion", "ajuste"],
    },
  },
} as const
