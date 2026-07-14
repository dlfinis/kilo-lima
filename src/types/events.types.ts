// Spanish domain types per REQ-EVENTS-31 / REQ-EVENTS-32. Field names
// mirror SQL columns 1:1 to eliminate name-mapping bugs, matching the
// catalog.types.ts convention. *Input variants exclude DB-only fields
// so forms receive the minimum contract per ISP (REQ-EVENTS-43).
import type { CategoriaProducto } from './pos.types'

export type EstadoEvento = 'planificacion' | 'en_curso' | 'cerrado'

export type CategoriaGasto =
  | 'renta'
  | 'transporte'
  | 'permisos'
  | 'publicidad'
  | 'servicios'
  | 'otro'

export interface Evento {
  id: string
  nombre: string
  fecha: string
  // REQ-FIN-1: nullable — NULL means single day, treated as fecha at the UI layer.
  fecha_fin: string | null
  // REQ-FIN, PD-1: per-evento margin decimal 0..1. SQL default 0.40.
  margen_ganancia: number | null
  ubicacion: string | null
  estado: EstadoEvento
  notas: string | null
  created_at: string
  updated_at: string
}

export type EventoInput = Omit<Evento, 'id' | 'created_at' | 'updated_at'>

export interface GastoFijo {
  id: string
  evento_id: string
  categoria: CategoriaGasto
  monto: number
  descripcion: string | null
  socio_id?: string | null
  created_at: string
}

export type GastoFijoInput = Omit<GastoFijo, 'id' | 'created_at'>

export interface PlanProduccion {
  id: string
  evento_id: string
  receta_id: string
  unidades_a_producir: number
  created_at: string
}

export type PlanProduccionInput = Omit<PlanProduccion, 'id' | 'created_at'>

// event-product-management-refactor: additive production plan keyed by
// evento_producto_id. One row per event product — replaces plan_produccion
// for new writes. plan_produccion stays readable for backward compat.
export interface ProductoProduccion {
  id: string
  evento_producto_id: string
  unidades_a_producir: number
  created_at: string
}

export type ProductoProduccionInput = Omit<ProductoProduccion, 'id' | 'created_at'>

// event-product-management-refactor: joined shape for the unified
// Gestión productos view. Combines producto_produccion (planned units)
// with evento_producto (pricing, inclusion) + product/preparation
// details. Follows the same pattern as EventoProductoConDetalle — the
// composable reads stores once and joins in-memory so the view doesn't
// refetch per row.
export interface ProductoProduccionConDetalle {
  // producto_produccion fields
  id: string
  evento_producto_id: string
  unidades_a_producir: number
  created_at: string
  // evento_producto fields (pricing/inclusion context)
  evento_id: string
  producto_id: string
  incluido: boolean
  precio_venta: number | null
  margen: number | null
  // producto fields (commercial identity + recipe link)
  producto_nombre: string
  producto_categoria: CategoriaProducto | null
  producto_icono: string | null
  producto_color: string | null
  receta_id: string
  // preparation fields
  receta_nombre: string
  // derived cost from receta ingredients × materias primas
  costo_unitario: number
}

// One row in the per-receta breakdown (REQ-EVENTS-22). Carries the
// receta name so the UI can render the list without a second lookup.
export interface LineaProyeccion {
  recetaId: string
  recetaNombre: string
  unidades: number
  costoPorUnidad: number
  costoLinea: number
  advertencia?: 'RECETA_FALTANTE' | 'MATERIA_PRIMA_FALTANTE'
}

// One row in the per-gasto breakdown (REQ-EVENTS-22).
export interface DesgloseFijo {
  gastoId: string
  categoria: CategoriaGasto
  monto: number
  descripcion: string | null
}

// One row in the per-receta fixed-cost side (REQ-EVENTS-22). Lives
// next to DesgloseFijo so the projection card can render two
// independent lists without re-deriving the breakdown.
export interface DesgloseVariable {
  recetaId: string
  recetaNombre: string
  costoLinea: number
}

// Top-level projection return type consumed by ProyeccionCostosCard
// (REQ-EVENTS-20). costoPorUnidad at the top level is intentionally
// absent — it is OUT OF SCOPE v1 per REQ-EVENTS-23/24 and lives in
// per-receta LineaProyeccion entries only.
//
// REQ-CON-4 / AC-6 / AC-9: break-even + contribution fields added by
// `calcularProyeccion` when the caller passes `productos`. Optional
// (`number | null`) so existing callers (no productos param) keep
// working without changes — backward-compatible.
export interface ProyeccionResultado {
  costosFijos: number
  costosVariables: number
  costoTotal: number
  lineas: LineaProyeccion[]
  desgloseFijos: DesgloseFijo[]
  desgloseVariables: DesgloseVariable[]
  // REQ-CON-4: break-even + contribution. null when no productos were
  // provided (the operator hasn't priced any products yet).
  breakEvenUnidades: number | null
  breakEvenIngreso: number | null
  contribucionPromedioPonderada: number | null
  // Per-product minimum break-even price (REQ-CON-3 / AC-4). Keyed by
  // `producto_id` so `ProyeccionCostosCard` can show "precio mínimo
  // sugerido por producto". null entry when the product has no cost
  // set yet. Empty record when productos wasn't provided.
  precioMinimoSugeridoPorProducto: Record<string, number>
}
