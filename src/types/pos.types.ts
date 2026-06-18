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
  created_at: string
}

export type VentaItemInput = Omit<VentaItem, 'id' | 'venta_id' | 'created_at'>

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
export interface LineaCarrito {
  producto_id: string
  nombre: string
  precio_unitario: number
  cantidad: number
  subtotal: number
}

export interface ResumenCarrito {
  lineas: LineaCarrito[]
  total: number
  cantidadItems: number
}

// Input shape for the pure `calcularCierre` helper. Consumes ventas
// (with `metodo_pago`) + gastos fijos + imprevistos + optional cash
// count. Returns a CierreResultado (matches the cierre view's needs).
export interface CierreInput {
  ventas: Venta[]
  gastosFijos: GastoFijo[]
  gastosImprevistos: GastoImprevisto[]
  efectivoEsperado: number | null
  efectivoReal: number | null
}

export interface CierreResultado {
  totalVentas: number
  totalGastosFijos: number
  totalGastosImprevistos: number
  utilidadBruta: number
  efectivoEsperado: number | null
  efectivoReal: number | null
  diferencia: number | null
  ventasPorMetodoPago: Record<MetodoPago, number>
  cantidadVentas: number
}

// Re-export the events' GastoFijo so consumers can import CierreInput
// from a single path. Kept inline to avoid pulling events.types into
// the closure when only the shape is needed.
import type { GastoFijo } from './events.types'
export type { GastoFijo }
