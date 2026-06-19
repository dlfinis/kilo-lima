// REQ-POS-30, REQ-POS-31, REQ-POS-32, REQ-POS-36, REQ-FIN-5..8,
// REQ-FIN-11: cierre math. Two exports, both pure (zero Vue/Pinia/
// Supabase deps so unit tests run fast):
//   - calcularCierre(input): aggregates ventas + venta items (COGS) +
//     gastos fijos + imprevistos into the snapshot the cierre view
//     consumes. The utilidadBruta formula is snapshot-at-write
//     (REQ-POS-32) so the cierre row stays accurate to its day even if
//     ventas drift later (they shouldn't — evento is cerrado).
//   - formatearDiferencia(monto): human label for the yellow v-alert
//     on `CierreResumenCard` (REQ-POS-34). Returns "Cuadre exacto" /
//     "Sobrante $X.XX" / "Faltante $X.XX".
//
// Rounding policy: every sum and diferencia run through
// `redondearCentavos` (catalog's utils/moneda.ts) so cierre totals and
// venta_items subtotals share the same single-rounding rule — no
// cumulative ±$0.01 drift across the cierre math (REQ-POS-31).
//
// Fase 1 — REQ-FIN-6/7 (corrected formula):
//   utilidadBruta = totalVentas − COGS (NOT ventas − gastos; the old
//     formula was buggy — see git blame for "buggy cierre math").
//   utilidadNeta  = utilidadBruta − gastosFijos − imprevistos.
//   COGS = Σ(cantidad × (costo_unitario ?? 0)) across ventaItems
//     (legacy rows have NULL costo_unitario and contribute 0 —
//     REQ-FIN-8 / PD-4).
// Fase 1 desglose: desgloseProductos and desgloseDias return [] — the
// aggregation lives in Fase 2 (useReporteEvento).
import type {
  CierreInput,
  CierreResultado,
  DesgloseDia,
  DesgloseProducto,
  MetodoPago,
  Venta,
  VentaItem,
} from '@/types'
import { redondearCentavos } from '@/utils/moneda'

const METODOS_PAGO: readonly MetodoPago[] = ['efectivo', 'transferencia', 'tarjeta', 'mixto']

export function calcularCierre(input: CierreInput): CierreResultado {
  const totalVentas = redondearCentavos(input.ventas.reduce((acc, v) => acc + v.total, 0))
  // REQ-FIN-6: COGS = Σ(cantidad × (costo_unitario ?? 0)). Null-safe
  // per REQ-FIN-8 so legacy ventas contribute 0.
  const totalCogs = redondearCentavos(
    input.ventaItems.reduce(
      (acc, it: VentaItem) => acc + (it.costo_unitario ?? 0) * it.cantidad,
      0,
    ),
  )
  const totalGastosFijos = redondearCentavos(input.gastosFijos.reduce((acc, g) => acc + g.monto, 0))
  const totalGastosImprevistos = redondearCentavos(
    input.gastosImprevistos.reduce((acc, g) => acc + g.monto, 0),
  )
  // Corrected formula: utilidadBruta = totalVentas − COGS.
  const utilidadBruta = redondearCentavos(totalVentas - totalCogs)
  // REQ-FIN-7: utilidadNeta = utilidadBruta − gastosOp (fijos + imprevistos).
  const utilidadNeta = redondearCentavos(
    utilidadBruta - totalGastosFijos - totalGastosImprevistos,
  )

  const diferencia =
    input.efectivoEsperado !== null && input.efectivoReal !== null
      ? redondearCentavos(input.efectivoReal - input.efectivoEsperado)
      : null

  const ventasPorMetodoPago: Record<MetodoPago, number> = {
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    mixto: 0,
  }
  for (const v of input.ventas as Venta[]) {
    ventasPorMetodoPago[v.metodo_pago] = redondearCentavos(
      ventasPorMetodoPago[v.metodo_pago] + v.total,
    )
  }

  return {
    totalVentas,
    totalCogs,
    totalGastosFijos,
    totalGastosImprevistos,
    utilidadBruta,
    utilidadNeta,
    efectivoEsperado: input.efectivoEsperado,
    efectivoReal: input.efectivoReal,
    diferencia,
    ventasPorMetodoPago,
    cantidadVentas: input.ventas.length,
    // REQ-REPORTE-1/2: populate desglose arrays when date range
    // provided (Fase 2). Fase 1 callers omit fechaInicio/fechaFin
    // and receive [] — backward-compatible.
    desgloseProductos: calcularDesglosePorProducto(input.ventaItems),
    desgloseDias:
      input.fechaInicio && input.fechaFin
        ? calcularDesglosePorDia(
            input.ventas as Venta[],
            input.ventaItems,
            input.fechaInicio,
            input.fechaFin,
          )
        : [],
  }
}

// "Sobrante $X.XX" / "Faltante $X.XX" / "Cuadre exacto". Called only
// with a non-null number — null is the "user skipped cash count" case
// and renders no alert at all.
export function formatearDiferencia(monto: number): string {
  if (monto === 0) return 'Cuadre exacto'
  const abs = Math.abs(redondearCentavos(monto))
  const formatted = abs.toFixed(2)
  return monto > 0 ? `Sobrante $${formatted}` : `Faltante $${formatted}`
}

// REQ-REPORTE-1, REQ-REPORTE-2, REQ-FIN-21, REQ-FIN-22 (PR-2c):
// per-day and per-producto aggregation functions. Pure — zero Vue/
// Pinia/Supabase deps so they stay fast and trivially testable. The
// report composable (`useReporteEvento`) calls these from computed
// refs; the view only receives the populated arrays.
//
// `calcularDesglosePorDia`: returns one row per day in the inclusive
// range [fechaInicio, fechaFin] — even days with zero ventas per the
// user prompt "For each day in range, even days with 0 ventas".
// Aggregates `ventas` (for count + total) and `itemsDelEvento`
// (for COGS) by DATE(created_at) via simple string-prefix matching.
export function calcularDesglosePorDia(
  ventas: Venta[],
  items: VentaItem[],
  fechaInicio: string,
  fechaFin: string,
): DesgloseDia[] {
  // Build a map for quick lookup: day → { ventas, cantidad, cogs }
  const diaMap = new Map<string, { ventas: number; cantidad: number; cogs: number }>()

  // Pre-populate every day in range (even zero-venta days) so the
  // report chart shows the full event duration.
  const inicio = new Date(fechaInicio + 'T00:00:00')
  const fin = new Date(fechaFin + 'T00:00:00')
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    diaMap.set(key, { ventas: 0, cantidad: 0, cogs: 0 })
  }

  for (const v of ventas) {
    const dia = v.created_at.slice(0, 10)
    const entry = diaMap.get(dia)
    if (entry) {
      entry.ventas = redondearCentavos(entry.ventas + v.total)
      entry.cantidad += 1
    }
  }

  // Build a venta_id → day map so item-level COGS can be assigned
  // to the correct date without requiring the caller to pre-group.
  const ventaIdToDay = new Map<string, string>()
  for (const v of ventas) {
    ventaIdToDay.set(v.id, v.created_at.slice(0, 10))
  }

  for (const it of items) {
    // Map the item to its parent venta's day via venta_id. Without
    // this join, COGS can't be assigned to a specific date.
    const dia = ventaIdToDay.get(it.venta_id)
    if (!dia) continue
    const cogs = redondearCentavos((it.costo_unitario ?? 0) * it.cantidad)
    const entry = diaMap.get(dia)
    if (entry) {
      entry.cogs = redondearCentavos(entry.cogs + cogs)
    }
  }

  const result: DesgloseDia[] = []
  for (const [fecha, d] of diaMap) {
    const utilidadBruta = redondearCentavos(d.ventas - d.cogs)
    result.push({
      fecha,
      ventas: d.ventas,
      cantidad: d.cantidad,
      cogs: d.cogs,
      utilidadBruta,
      utilidadNeta: utilidadBruta, // caller subtracts gastosOp externally — pure function stays narrow
    })
  }
  // Sort ascending so the chart reads left-to-right.
  result.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return result
}

// REQ-REPORTE-2: per-producto aggregation. Groups VentaItem[] by
// producto_id and computes ingresos, COGS, utilidadBruta, and
// margenReal per product. Pure — no side effects.
export function calcularDesglosePorProducto(
  items: VentaItem[],
): DesgloseProducto[] {
  const prodMap = new Map<
    string,
    { unidades: number; ingresoTotal: number; cogsTotal: number }
  >()

  for (const it of items) {
    const entry = prodMap.get(it.producto_id) ?? { unidades: 0, ingresoTotal: 0, cogsTotal: 0 }
    entry.unidades += it.cantidad
    entry.ingresoTotal = redondearCentavos(entry.ingresoTotal + it.subtotal)
    entry.cogsTotal = redondearCentavos(entry.cogsTotal + (it.costo_unitario ?? 0) * it.cantidad)
    prodMap.set(it.producto_id, entry)
  }

  const result: DesgloseProducto[] = []
  for (const [productoId, p] of prodMap) {
    const utilidadBruta = redondearCentavos(p.ingresoTotal - p.cogsTotal)
    const margenReal = p.ingresoTotal > 0
      ? redondearCentavos((p.ingresoTotal - p.cogsTotal) / p.ingresoTotal)
      : 0
    result.push({
      productoId,
      // Fallback to productoId when the catalog name isn't joined yet
      // (caller — useReporteEvento — fills the real name when available).
      productoNombre: productoId,
      unidades: p.unidades,
      ingresoTotal: p.ingresoTotal,
      cogsTotal: p.cogsTotal,
      margenReal,
      utilidadBruta,
    })
  }
  result.sort((a, b) => b.ingresoTotal - a.ingresoTotal) // highest revenue first
  return result
}

// Silence unused-export lint; METODOS_PAGO is reserved for PR4's
// per-metodo breakdown component (REQ-POS-34) — the spec does not
// exercise it directly here but the typed list is part of the
// contract.
void METODOS_PAGO
