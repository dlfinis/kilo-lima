// Tipos para productos configurables: productos base con grupos de opciones
// incluidas gratis y capacidad de agregar adicionales (configurados o no)

import type { MateriaPrima } from './catalog.types'

// Producto configurable: producto base con grupos de opciones
export interface ProductoConfigurable {
  id: string
  producto_id: string
  costo_base_calculado: number
  created_at: string
  updated_at: string
}

export type ProductoConfigurableInput = Omit<ProductoConfigurable, 'id' | 'created_at' | 'updated_at'>

// Grupo de opciones: categoría de personalizaciones (salsas, toppings, etc.)
export interface GrupoOpciones {
  id: string
  producto_configurable_id: string
  nombre: string
  tipo_calculo: 'promedio_categoria' | 'costo_individual'
  incluidas_gratis: number
  precio_venta_extra: number
  created_at: string
  updated_at: string
}

export type GrupoOpcionesInput = Omit<GrupoOpciones, 'id' | 'created_at' | 'updated_at'>

// Opción de grupo: materia prima que puede elegirse dentro de un grupo
export interface OpcionGrupo {
  id: string
  grupo_id: string
  materia_prima_id: string
  created_at: string
}

export type OpcionGrupoInput = Omit<OpcionGrupo, 'id' | 'created_at'>

// Materia prima disponible como adicional (vendible por separado)
export interface AdicionalDisponible {
  id: string
  materia_prima_id: string
  precio_venta: number
  activo: boolean
  created_at: string
  updated_at: string
}

export type AdicionalDisponibleInput = Omit<AdicionalDisponible, 'id' | 'created_at' | 'updated_at'>

// Personalización de venta item: qué opciones se eligieron
export interface VentaItemPersonalizacion {
  id: string
  venta_item_id: string
  grupo_id: string | null
  materia_prima_id: string
  es_incluido: boolean
  costo_unitario: number
  precio_venta_extra: number
  cantidad: number
  created_at: string
}

// Input for creating personalizations (venta_item_id is assigned by the service after insert)
export type VentaItemPersonalizacionInput = Omit<VentaItemPersonalizacion, 'id' | 'created_at' | 'venta_item_id'>

// Shapes joined para UI
export interface GrupoOpcionesConOpciones extends GrupoOpciones {
  opciones: (OpcionGrupo & { materia_prima: MateriaPrima })[]
}

export interface ProductoConfigurableConGrupos extends ProductoConfigurable {
  grupos: GrupoOpcionesConOpciones[]
}

export interface AdicionalDisponibleConMateriaPrima extends AdicionalDisponible {
  materia_prima: MateriaPrima
}

// Personalización en carrito (antes de vender)
export interface PersonalizacionCarrito {
  grupo_id: string | null
  materia_prima_id: string
  nombre: string
  es_incluido: boolean
  costo_unitario: number
  precio_venta_extra: number
  cantidad: number
}
