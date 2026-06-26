// REQ-POS-CAMBIO-2: pure utility for cash-back calculation. Used by
// the store (EFECTIVO branch) and the dialog (live preview).
//
// Decimal-stable: rounds to 2 decimals via `Math.round((x + EPSILON)
// * 100) / 100` so floating-point arithmetic (0.1 + 0.2 = 0.300000…)
// does not surface in user-visible cambio values. The store applies
// the same rounding in `redondear2` — both sites must agree on the
// rounding policy.
//
// Never throws. Returns `null` when `montoRecibido` is null/undefined
// so the caller can distinguish "no cash-back" (transferencia,
// tarjeta) from "zero cambio" (efectivo EXACTO).
export function calcularCambio(total: number, montoRecibido: number | null): number | null {
  if (montoRecibido === null || montoRecibido === undefined) return null
  return Math.round((montoRecibido - total + Number.EPSILON) * 100) / 100
}
