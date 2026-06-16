// Spanish identifier per REQ-CONV-5 (business surface in Spanish). The
// proof-of-pattern for the utils module — more formatters land in later
// slices (CRC for Costa Rica, MXN for Mexico, percentage, etc.).
export function formatearUSD(monto: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(monto)
}
