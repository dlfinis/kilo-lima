// Spanish domain types per REQ-POS-44. Field names mirror SQL columns
// 1:1 to eliminate name-mapping bugs, matching the catalog.types.ts
// and events.types.ts convention. *Input variants exclude DB-only
// fields so forms receive the minimum contract per ISP (REQ-POS-54).
//
// Pure-function shapes (LineaCarrito, ResumenCarrito, CierreInput,
// CierreResultado) live at the bottom — they are NOT SQL rows and
// never hit Supabase. Used by `useVentas` and `useCierreCaja` and the
// pure helpers in `src/utils/cierre.ts`.

export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto'

export type CategoriaImprevisto =
  | 'insumos_extra'
  | 'transporte'
  | 'reparacion'
  | 'propina'
  | 'otro'

export interface Producto {
  id: string
  receta_id: string
  precio_venta: number
  disponible: boolean
  orden: number
  // productos-mejoras / producto-descripcion: nullable free-text
  // description (≤ 500 chars, enforced DB-side). Optional on create.
  descripcion: string | null
  // productos-icono: MDI icon name for POS display. Nullable for
  // legacy productos; defaults to 'mdi-food' on create.
  icono: string | null
  created_at: string
  updated_at: string
}

export type ProductoInput = Omit<Producto, 'id' | 'created_at' | 'updated_at'>

export interface Venta {
  id: string
  evento_id: string
  fecha: string
  total: number
  metodo_pago: MetodoPago
  // pos-redesign (REQ-POS-CAMBIO-5, REQ-POS-COMPROBANTE-5): cash-back
  // columns + sequential receipt number per evento. Nullable for
  // legacy rows and non-efectivo sales.
  monto_recibido: number | null
  cambio: number | null
  comprobante_numero: string | null
  created_at: string
}

export type VentaInput = Omit<Venta, 'id' | 'fecha' | 'created_at'>

export interface VentaItem {
  id: string
  venta_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  // REQ-FIN-12: COGS snapshot columns. Nullable for legacy ventas
  // (PD-4: no historical backfill). `costo_unitario ?? 0` in COGS math.
  costo_unitario: number | null
  margen_aplicado: number | null
  created_at: string
}

// VentaItemInput carries the columns the caller wants to insert. The
// COGS snapshot columns (costo_unitario, margen_aplicado) are optional
// in the Input shape — the DB row (VentaItem) keeps them as nullable
// for legacy rows, but the Insert from cart/sale code may legitimately
// omit them (Fase 1: the cart snapshot still produces null until Fase 2
// wires evento_producto lookups). Service layer forwards `?? null`.
//
// evento_producto_id links back to the pricing config active at sale
// time (REQ-FIN-9 follow-up). Optional — legacy paths omit it.
export interface VentaItemInput {
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  costo_unitario?: number | null
  margen_aplicado?: number | null
  evento_producto_id?: string | null
}

export interface VentaConItems extends Venta {
  items: VentaItem[]
}

export interface GastoImprevisto {
  id: string
  evento_id: string
  monto: number
  motivo: string
  categoria: CategoriaImprevisto | null
  created_at: string
}

export type GastoImprevistoInput = Omit<GastoImprevisto, 'id' | 'created_at'>

export interface CierreCaja {
  id: string
  evento_id: string
  fecha_cierre: string
  total_ventas: number
  total_gastos_fijos: number
  total_gastos_imprevistos: number
  utilidad_bruta: number
  efectivo_esperado: number | null
  efectivo_real: number | null
  diferencia: number | null
  notas: string | null
  created_at: string
}

export type CierreCajaInput = Omit<CierreCaja, 'id' | 'fecha_cierre' | 'created_at'>

// One row in the in-memory cart. Lives in `ventas.store.carrito`
// (Pinia) and NEVER hits Supabase — v1 is online-only per
// REQ-POS-6 / REQ-POS-14. `nombre` is denormalized so the cart can
// render without re-reading `productos`.
//
// REQ-FIN-31 (PR-2b sale-time COGS snapshot): `costo_unitario` and
// `margen_aplicado` are FROZEN at add-to-cart time. They travel with
// the line through `registrarVenta` so the closure-time COGS
// aggregation never depends on receta costs changing after the sale.
//
// REQ-FIN-9 (follow-up gap fix): `evento_producto_id` links the cart
// line back to the evento_productos row that was active at sale time.
// Without this, the cierre backfill can't match a venta_item to its
// pricing config. Nullable — Fase 1 ventas have no link.
export interface LineaCarrito {
  producto_id: string
  nombre: string
  precio_unitario: number
  cantidad: number
  subtotal: number
  // Snapshot of receta.costoPorUnidad at add-to-cart time. Null when
  // the producto has no computable receta cost (legacy-safe).
  costo_unitario: number | null
  // Snapshot of the effective margen (evento_producto.margen ?? evento.margen_ganancia).
  margen_aplicado: number | null
  // Link to the evento_productos pricing row active at sale time.
  // Null for legacy ventas and productos without evento_productos config.
  evento_producto_id: string | null
}

export interface ResumenCarrito {
  lineas: LineaCarrito[]
  total: number
  cantidadItems: number
}

// Input shape for the pure `calcularCierre` helper. Consumes ventas
// (with `metodo_pago`) + their items (for COGS aggregation per REQ-FIN-6)
// + gastos fijos + imprevistos + optional cash count. Returns a
// CierreResultado (matches the cierre view's needs).
//
// REQ-FIN-21 / REQ-REPORTE-1: when fechaInicio and fechaFin are
// provided, `calcularCierre` populates `desgloseDias` with the per-day
// aggregation. When omitted, returns [] (Fase 1 compatibility).
export interface CierreInput {
  ventas: Venta[]
  // REQ-FIN-6: required for COGS computation. The caller (useCierreCaja)
  // flattens items from each venta; pasarVenta items is enough.
  ventaItems: VentaItem[]
  gastosFijos: GastoFijo[]
  gastosImprevistos: GastoImprevisto[]
  efectivoEsperado: number | null
  efectivoReal: number | null
  // Optional date range for per-day aggregation (REQ-REPORTE-1).
  // Fase 1 callers omit these → desgloseDias stays [].
  fechaInicio?: string
  fechaFin?: string
}

// Per-producto aggregation row (Fase 2 surface — Fase 1 returns []).
// Living here so the CierreResultado shape is stable across phases.
export interface DesgloseProducto {
  productoId: string
  productoNombre: string
  unidades: number
  ingresoTotal: number
  cogsTotal: number
  margenReal: number
  utilidadBruta: number
}

// Per-day aggregation row (Fase 2 surface — Fase 1 returns []).
export interface DesgloseDia {
  fecha: string
  ventas: number
  cantidad: number
  cogs: number
  utilidadBruta: number
  utilidadNeta: number
}

export interface CierreResultado {
  totalVentas: number
  // REQ-FIN-5: Σ(cantidad × costo_unitario ?? 0) across all items.
  totalCogs: number
  totalGastosFijos: number
  totalGastosImprevistos: number
  // REQ-FIN-6: utilidadBruta = totalVentas − COGS (corrected formula).
  utilidadBruta: number
  // REQ-FIN-7: utilidadNeta = utilidadBruta − gastosFijos − imprevistos.
  utilidadNeta: number
  efectivoEsperado: number | null
  efectivoReal: number | null
  diferencia: number | null
  ventasPorMetodoPago: Record<MetodoPago, number>
  cantidadVentas: number
  // Fase 1: empty arrays. Fase 2 fills these from venta_items aggregations.
  desgloseProductos: DesgloseProducto[]
  desgloseDias: DesgloseDia[]
}

// Re-export the events' GastoFijo so consumers can import CierreInput
// from a single path. Kept inline to avoid pulling events.types into
// the closure when only the shape is needed.
import type { GastoFijo } from './events.types'
export type { GastoFijo }
