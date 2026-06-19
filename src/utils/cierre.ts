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
    desgloseProductos: [],
    desgloseDias: [],
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

// Silence unused-export lint; METODOS_PAGO is reserved for PR4's
// per-metodo breakdown component (REQ-POS-34) — the spec does not
// exercise it directly here but the typed list is part of the
// contract.
void METODOS_PAGO
