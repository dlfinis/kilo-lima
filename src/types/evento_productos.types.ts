// REQ-PRICING-1, REQ-FIN-12, REQ-FIN-13: types for the
// `evento_productos` table and its joined-detail shape.
//
// `EventoProducto` mirrors the SQL columns 1:1 so the service layer
// can `data as EventoProducto[]` without name-mapping bugs. `*Input`
// variants drop DB-only fields per the catalog/events/pos convention
// (ISP, REQ-EVENTS-43). `EventoProductoConDetalle` adds the joined
// columns used by `usePreciosEvento` and `EventoProductosView` so the
// view can render rows without re-reading recetas/productos for every
// cell.
export interface EventoProducto {
  id: string
  evento_id: string
  producto_id: string
  // REQ-PRICING-3: nullable on the SQL side — null when the operator
  // hasn't set a manual override and `precio_sugerido` (computed from
  // margen + costo) is the de-facto price. The view treats
  // `precio_venta ?? precio_sugerido` as the final price.
  precio_venta: number | null
  // REQ-PRICING-1: decimal 0..1 (DB default 0.40 per PD-1). Nullable
  // when inherited from `evento.margen_ganancia` and the operator
  // didn't override.
  margen: number | null
  incluido: boolean
  created_at: string
  updated_at: string
}

// Service / form input — drops the DB-only fields so callers don't
// have to fabricate id / timestamps just to insert.
export type CrearEventoProductoInput = Omit<
  EventoProducto,
  'id' | 'created_at' | 'updated_at'
>

// Slim payload for the margen-update action: caller already knows the
// row id and only needs to send the new decimal margen. The service
// recomputes `precio_venta` from `calcularPrecioPorMargen(costo, margen)`
// before writing the DB row.
export interface ActualizarMargenInput {
  evento_producto_id: string
  margen: number
}

// Joined shape consumed by `usePreciosEvento` and
// `EventoProductosView`. The view doesn't refetch recetas/productos
// per row — the composable reads them once and joins in-memory. The
// `incluido = true` rows are exposed via `productosDelEvento` (the
// POS grid source) and the full list (incluido false too) feeds the
// configurator table.
//
// `costo_unitario` comes from the producto's receta
// (`receta.costoPorUnidad`). `precio_sugerido` is the margin-derived
// price when the operator hasn't overridden `precio_venta`.
// `margen_efectivo` falls back to the evento's `margen_ganancia`
// (PD-1) when the producto row has `margen = null`. `precio_final`
// = `precio_venta ?? precio_sugerido` — manual override wins.
export interface EventoProductoConDetalle extends EventoProducto {
  producto_nombre: string
  receta_id: string
  receta_nombre: string
  costo_unitario: number
  precio_sugerido: number
  margen_efectivo: number
  precio_final: number
}