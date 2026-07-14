// Servicio para productos configurables: CRUD + cálculo automático de costos
import type { SupabaseClient } from '@supabase/supabase'

import type {
  AdicionalDisponible,
  AdicionalDisponibleConMateriaPrima,
  AdicionalDisponibleInput,
  Database,
  GrupoOpciones,
  GrupoOpcionesConOpciones,
  GrupoOpcionesInput,
  OpcionGrupo,
  OpcionGrupoInput,
  ProductoConfigurable,
  ProductoConfigurableConGrupos,
  ProductoConfigurableInput,
  ServiceError,
} from '@/types'

export interface ProductosConfigurablesService {
  listar(): Promise<{ data: ProductoConfigurableConGrupos[] | null; error: ServiceError | null }>
  crear(
    input: ProductoConfigurableInput,
  ): Promise<{ data: ProductoConfigurable | null; error: ServiceError | null }>
  actualizar(
    id: string,
    input: Partial<ProductoConfigurableInput>,
  ): Promise<{ data: ProductoConfigurable | null; error: ServiceError | null }>
  eliminar(id: string): Promise<{ data: null; error: ServiceError | null }>
  recalcularCosto(id: string): Promise<{ data: number | null; error: ServiceError | null }>
  
  // Grupos de opciones
  listarGrupos(
    productoConfigurableId: string,
  ): Promise<{ data: GrupoOpcionesConOpciones[] | null; error: ServiceError | null }>
  crearGrupo(
    input: GrupoOpcionesInput,
  ): Promise<{ data: GrupoOpciones | null; error: ServiceError | null }>
  actualizarGrupo(
    id: string,
    input: Partial<GrupoOpcionesInput>,
  ): Promise<{ data: GrupoOpciones | null; error: ServiceError | null }>
  eliminarGrupo(id: string): Promise<{ data: null; error: ServiceError | null }>
  
  // Opciones de grupos
  agregarOpcion(
    input: OpcionGrupoInput,
  ): Promise<{ data: OpcionGrupo | null; error: ServiceError | null }>
  eliminarOpcion(id: string): Promise<{ data: null; error: ServiceError | null }>
  
  // Adicionales disponibles
  listarAdicionales(): Promise<{
    data: AdicionalDisponibleConMateriaPrima[] | null
    error: ServiceError | null
  }>
  crearAdicional(
    input: AdicionalDisponibleInput,
  ): Promise<{ data: AdicionalDisponible | null; error: ServiceError | null }>
  actualizarAdicional(
    id: string,
    input: Partial<AdicionalDisponibleInput>,
  ): Promise<{ data: AdicionalDisponible | null; error: ServiceError | null }>
  eliminarAdicional(id: string): Promise<{ data: null; error: ServiceError | null }>
}

export function crearProductosConfigurablesService(
  supabase: SupabaseClient<Database>,
): ProductosConfigurablesService {
  return {
    async listar() {
      const respuesta = await supabase
        .from('productos_configurables')
        .select(`
          *,
          grupos:grupos_opciones(
            *,
            opciones:opciones_grupo(
              *,
              materia_prima:materias_primas(*)
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (respuesta.error) {
        return { data: null, error: { code: 'LISTAR_CONFIGURABLES_ERROR', message: respuesta.error.message } }
      }

      const configurables: ProductoConfigurableConGrupos[] = (respuesta.data || []).map((pc: any) => ({
        id: pc.id,
        producto_id: pc.producto_id,
        costo_base_calculado: pc.costo_base_calculado,
        created_at: pc.created_at,
        updated_at: pc.updated_at,
        grupos: (pc.grupos || []).map((g: any) => ({
          id: g.id,
          producto_configurable_id: g.producto_configurable_id,
          nombre: g.nombre,
          tipo_calculo: g.tipo_calculo,
          incluidas_gratis: g.incluidas_gratis,
          precio_venta_extra: g.precio_venta_extra,
          created_at: g.created_at,
          updated_at: g.updated_at,
          opciones: (g.opciones || []).map((o: any) => ({
            id: o.id,
            grupo_id: o.grupo_id,
            materia_prima_id: o.materia_prima_id,
            created_at: o.created_at,
            materia_prima: o.materia_prima,
          })),
        })),
      }))

      return { data: configurables, error: null }
    },

    async crear(input) {
      const respuesta = await supabase
        .from('productos_configurables')
        .insert([input as any])
        .select()
        .single()

      if (respuesta.error) {
        return { data: null, error: { code: 'CREAR_CONFIGURABLE_ERROR', message: respuesta.error.message } }
      }

      // Recalcular costo base automáticamente
      await supabase.rpc('calcular_costo_base_configurable', { p_producto_configurable_id: respuesta.data.id })

      return { data: respuesta.data as unknown as ProductoConfigurable, error: null }
    },

    async actualizar(id, input) {
      const respuesta = await supabase
        .from('productos_configurables')
        .update(input as any)
        .eq('id', id)
        .select()
        .single()

      if (respuesta.error) {
        return { data: null, error: { code: 'ACTUALIZAR_CONFIGURABLE_ERROR', message: respuesta.error.message } }
      }

      return { data: respuesta.data as unknown as ProductoConfigurable, error: null }
    },

    async eliminar(id) {
      const respuesta = await supabase.from('productos_configurables').delete().eq('id', id)

      if (respuesta.error) {
        return { data: null, error: { code: 'ELIMINAR_CONFIGURABLE_ERROR', message: respuesta.error.message } }
      }

      return { data: null, error: null }
    },

    async recalcularCosto(id) {
      const respuesta = await supabase.rpc('calcular_costo_base_configurable', {
        p_producto_configurable_id: id,
      })

      if (respuesta.error) {
        return { data: null, error: { code: 'RECALCULAR_COSTO_ERROR', message: respuesta.error.message } }
      }

      return { data: respuesta.data as number, error: null }
    },

    async listarGrupos(productoConfigurableId) {
      const respuesta = await supabase
        .from('grupos_opciones')
        .select(`
          *,
          opciones:opciones_grupo(
            *,
            materia_prima:materias_primas(*)
          )
        `)
        .eq('producto_configurable_id', productoConfigurableId)
        .order('created_at', { ascending: true })

      if (respuesta.error) {
        return { data: null, error: { code: 'LISTAR_GRUPOS_ERROR', message: respuesta.error.message } }
      }

      const grupos: GrupoOpcionesConOpciones[] = (respuesta.data || []).map((g: any) => ({
        id: g.id,
        producto_configurable_id: g.producto_configurable_id,
        nombre: g.nombre,
        tipo_calculo: g.tipo_calculo,
        incluidas_gratis: g.incluidas_gratis,
        precio_venta_extra: g.precio_venta_extra,
        created_at: g.created_at,
        updated_at: g.updated_at,
        opciones: (g.opciones || []).map((o: any) => ({
          id: o.id,
          grupo_id: o.grupo_id,
          materia_prima_id: o.materia_prima_id,
          created_at: o.created_at,
          materia_prima: o.materia_prima,
        })),
      }))

      return { data: grupos, error: null }
    },

    async crearGrupo(input) {
      const respuesta = await supabase
        .from('grupos_opciones')
        .insert([input as any])
        .select()
        .single()

      if (respuesta.error) {
        return { data: null, error: { code: 'CREAR_GRUPO_ERROR', message: respuesta.error.message } }
      }

      // Recalcular costo base del producto configurable
      await supabase.rpc('calcular_costo_base_configurable', {
        p_producto_configurable_id: input.producto_configurable_id,
      })

      return { data: respuesta.data as unknown as GrupoOpciones, error: null }
    },

    async actualizarGrupo(id, input) {
      const respuesta = await supabase
        .from('grupos_opciones')
        .update(input as any)
        .eq('id', id)
        .select()
        .single()

      if (respuesta.error) {
        return { data: null, error: { code: 'ACTUALIZAR_GRUPO_ERROR', message: respuesta.error.message } }
      }

      // Recalcular costo base
      const grupo = respuesta.data as unknown as GrupoOpciones
      await supabase.rpc('calcular_costo_base_configurable', {
        p_producto_configurable_id: grupo.producto_configurable_id,
      })

      return { data: respuesta.data as unknown as GrupoOpciones, error: null }
    },

    async eliminarGrupo(id) {
      // Primero obtener el producto_configurable_id
      const grupoResp = await supabase
        .from('grupos_opciones')
        .select('producto_configurable_id')
        .eq('id', id)
        .single()

      if (grupoResp.error) {
        return { data: null, error: { code: 'ELIMINAR_GRUPO_ERROR', message: grupoResp.error.message } }
      }

      const respuesta = await supabase.from('grupos_opciones').delete().eq('id', id)

      if (respuesta.error) {
        return { data: null, error: { code: 'ELIMINAR_GRUPO_ERROR', message: respuesta.error.message } }
      }

      // Recalcular costo base
      await supabase.rpc('calcular_costo_base_configurable', {
        p_producto_configurable_id: (grupoResp.data as any).producto_configurable_id,
      })

      return { data: null, error: null }
    },

    async agregarOpcion(input) {
      const respuesta = await supabase
        .from('opciones_grupo')
        .insert([input as any])
        .select()
        .single()

      if (respuesta.error) {
        return { data: null, error: { code: 'AGREGAR_OPCION_ERROR', message: respuesta.error.message } }
      }

      // Recalcular costo base del grupo
      const grupoResp = await supabase
        .from('grupos_opciones')
        .select('producto_configurable_id')
        .eq('id', input.grupo_id)
        .single()

      if (!grupoResp.error) {
        await supabase.rpc('calcular_costo_base_configurable', {
          p_producto_configurable_id: (grupoResp.data as any).producto_configurable_id,
        })
      }

      return { data: respuesta.data as unknown as OpcionGrupo, error: null }
    },

    async eliminarOpcion(id) {
      // Obtener grupo_id antes de eliminar
      const opcionResp = await supabase
        .from('opciones_grupo')
        .select('grupo_id')
        .eq('id', id)
        .single()

      if (opcionResp.error) {
        return { data: null, error: { code: 'ELIMINAR_OPCION_ERROR', message: opcionResp.error.message } }
      }

      const respuesta = await supabase.from('opciones_grupo').delete().eq('id', id)

      if (respuesta.error) {
        return { data: null, error: { code: 'ELIMINAR_OPCION_ERROR', message: respuesta.error.message } }
      }

      // Recalcular costo base
      const grupoResp = await supabase
        .from('grupos_opciones')
        .select('producto_configurable_id')
        .eq('id', (opcionResp.data as any).grupo_id)
        .single()

      if (!grupoResp.error) {
        await supabase.rpc('calcular_costo_base_configurable', {
          p_producto_configurable_id: (grupoResp.data as any).producto_configurable_id,
        })
      }

      return { data: null, error: null }
    },

    async listarAdicionales() {
      const respuesta = await supabase
        .from('adicionales_disponibles')
        .select(`
          *,
          materia_prima:materias_primas(*)
        `)
        .eq('activo', true)
        .order('created_at', { ascending: true })

      if (respuesta.error) {
        return { data: null, error: { code: 'LISTAR_ADICIONALES_ERROR', message: respuesta.error.message } }
      }

      const adicionales: AdicionalDisponibleConMateriaPrima[] = (respuesta.data || []).map((a: any) => ({
        id: a.id,
        materia_prima_id: a.materia_prima_id,
        precio_venta: a.precio_venta,
        activo: a.activo,
        created_at: a.created_at,
        updated_at: a.updated_at,
        materia_prima: a.materia_prima,
      }))

      return { data: adicionales, error: null }
    },

    async crearAdicional(input) {
      const respuesta = await supabase
        .from('adicionales_disponibles')
        .insert([input as any])
        .select()
        .single()

      if (respuesta.error) {
        return { data: null, error: { code: 'CREAR_ADICIONAL_ERROR', message: respuesta.error.message } }
      }

      return { data: respuesta.data as unknown as AdicionalDisponible, error: null }
    },

    async actualizarAdicional(id, input) {
      const respuesta = await supabase
        .from('adicionales_disponibles')
        .update(input as any)
        .eq('id', id)
        .select()
        .single()

      if (respuesta.error) {
        return { data: null, error: { code: 'ACTUALIZAR_ADICIONAL_ERROR', message: respuesta.error.message } }
      }

      return { data: respuesta.data as unknown as AdicionalDisponible, error: null }
    },

    async eliminarAdicional(id) {
      const respuesta = await supabase.from('adicionales_disponibles').delete().eq('id', id)

      if (respuesta.error) {
        return { data: null, error: { code: 'ELIMINAR_ADICIONAL_ERROR', message: respuesta.error.message } }
      }

      return { data: null, error: null }
    },
  }
}
