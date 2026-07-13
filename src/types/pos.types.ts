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

// Single source of truth for the operator-facing payment-method list
// (REQ-POS-CORRECCION-2 follow-up: previously the registrar dialog
// and the edit dialog hard-coded their own subsets, which drifted
// from the `MetodoPago` union and from the history dialog's
// `METODOS_ETIQUETA` map). Add new methods here and the union above
// in the same change.
export const METODOS_PAGO: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'mixto', label: 'Mixto' },
]

export type CategoriaImprevisto =
  | 'insumos_extra'
  | 'transporte'
  | 'reparacion'
  | 'propina'
  | 'otro'

// catalog-domain-refactor: closed set of product categories for POS
// filtering. Starts as a fixed list; category management may later
// move to a central configuration area shared with insumos.
export type CategoriaProducto = 'dulce' | 'salado' | 'helado' | 'bebida'

export interface Producto {
  id: string
  receta_id: string
  // catalog-domain-refactor / Slice 1: commercial identity independent
  // from preparation (receta.nombre). Required; unique. Backfilled on
  // migration. UNIQUE constraint enforced at DB level.
  nombre: string
  // catalog-domain-refactor: closed-set category for POS filters.
  // Nullable — not every product needs a tag. Must be one of the
  // CategoriaProducto values when set.
  categoria: CategoriaProducto | null
  // catalog-domain-refactor / Slice 1: made nullable. Event pricing
  // (evento_productos.precio_venta) is the sole sell-price authority.
  // Column stays for backward compat until cleanup.
  precio_venta: number | null
  disponible: boolean
  orden: number
  // productos-mejoras / producto-descripcion: nullable free-text
  // description (≤ 500 chars, enforced DB-side). Optional on create.
  descripcion: string | null
  // productos-icono: MDI icon name for POS display. Nullable for
  // legacy productos; defaults to 'mdi-food' on create.
  icono: string | null
  // productos-color: card color in POS/catalog. Vuetify color name
  // or hex value. Defaults to 'primary'.
  color: string | null
  created_at: string
  updated_at: string
}

// catalog-domain-refactor: ProductoInput requires `nombre` (commercial
// name, unique), accepts optional closed-set `categoria`. precio_venta
// is omitted — event pricing is the sole sell-price authority.
export type ProductoInput = Omit<Producto, 'id' | 'created_at' | 'updated_at' | 'precio_venta'>

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
  // REQ-FIN-9 / REQ-POS-CORRECCION type fix: the DB column
  // `evento_producto_id` is the FK back to the evento_productos row
  // that was active at sale time. The hand-rolled domain type
  // previously omitted it, which forced the edit dialog to read
  // `it.evento_producto_id` on a shape that didn't declare the
  // field. The column is nullable — Fase 1 ventas and any path
  // that doesn't snapshot the link leave it null.
  evento_producto_id: string | null
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

// REQ-POS-CORRECCION-1..3: traceability of sale corrections.
// `venta_correcciones` is an append-only audit table — one row per
// edit. The header columns capture the financial deltas (totals,
// metodo, monto_recibido) and `motivo` carries the operator's
// reason. `items_anteriores` + `items_nuevos` are jsonb snapshots
// of the venta_items arrays before/after the correction so the
// audit row is self-contained — the report can reconstruct the
// entire sale at the time of the edit even if the live venta_items
// rows were further edited (v2 — single edit allowed here).
export interface VentaCorreccion {
  id: string
  venta_id: string
  evento_id: string
  total_anterior: number
  total_nuevo: number
  metodo_pago_anterior: MetodoPago
  metodo_pago_nuevo: MetodoPago
  monto_recibido_anterior: number | null
  monto_recibido_nuevo: number | null
  motivo: string
  // Full item snapshots — not a delta, the full VentaItem[] at the
  // moment of the edit. Operators auditing the report expect to see
  // "this is exactly what was sold before / after", not just a diff.
  items_anteriores: VentaItem[]
  items_nuevos: VentaItem[]
  created_at: string
}

export interface VentaCorreccionInput {
  venta_id: string
  evento_id: string
  total_anterior: number
  total_nuevo: number
  metodo_pago_anterior: MetodoPago
  metodo_pago_nuevo: MetodoPago
  monto_recibido_anterior: number | null
  monto_recibido_nuevo: number | null
  motivo: string
  // Snapshot of the items BEFORE the edit — the audit row stores this
  // verbatim (jsonb) so the report can reconstruct the sale without
  // joining the live venta_items table. VentaItem[] (full DB row)
  // because the data is read, not written.
  items_anteriores: VentaItem[]
  // Items AFTER the edit. VentaItemInput[] (writeable subset) because
  // the caller (the dialog) doesn't have id/created_at at hand — the
  // DB generates them on insert.
  items_nuevos: VentaItemInput[]
}

// Snapshot of a venta at the moment the edit dialog opens. The
// store / dialog reads it once so the user can compare "before" vs
// the new edit form values without re-fetching from the server.
export interface VentaEdicionContexto {
  venta: VentaConItems
  evento: Evento
}

export interface GastoImprevisto {
  id: string
  evento_id: string
  monto: number
  motivo: string
  categoria: CategoriaImprevisto | null
  socio_id?: string | null
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
import type { Evento, GastoFijo } from './events.types'
export type { GastoFijo }
