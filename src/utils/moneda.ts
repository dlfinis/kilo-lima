// REQ-CATALOG-20: Single-rounding policy used by the cost calculator.
// + Number.EPSILON guards against the 1.005 / 0.1+0.2 floating-point cases
// without resorting to toFixed (which returns a string).
export function redondearCentavos(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100
}
