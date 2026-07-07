// Spanish identifier per REQ-CONV-5 (business surface in Spanish). The
// proof-of-pattern for the utils module — more formatters land in later
// slices (CRC for Costa Rica, MXN for Mexico, percentage, etc.).
export function formatearUSD(monto: number): string {
  return new Intl.NumberFormat('es-MX', { 
    style: 'currency', 
    currency: 'USD', 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 4 
  }).format(monto)
}

// REQ-CATALOG-21: renders "12.5 g" / "3 unidad(es)". The "(es)" suffix on
// the discrete "unidad" unit avoids the awkward "3 unidad" singular form.
export function formatearUnidad(cantidad: number, unidad: string): string {
  const sufijo = unidad === 'unidad' ? 'u' : unidad === 'und' ? 'unds' : unidad
  return `${cantidad} ${sufijo}`
}

// REQ-UX-14: Spanish date formatter for the home banner. "2026-07-15"
// renders as "15 jul 2026" (short, scannable). The abbreviated month
// list mirrors the catalog/views pattern; we don't pull in dayjs for
// one formatter. Returns the original string when the input doesn't
// match ISO date format (defensive: malformed evento.fecha from the
// DB still renders something instead of throwing).
export function formatearFechaCorta(iso: string): string {
  if (!iso || typeof iso !== 'string') return iso
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  const [, yyyy, mm, dd] = match
  const meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  const indice = Number(mm) - 1
  const mes = meses[indice] ?? mm
  return `${Number(dd)} ${mes} ${yyyy}`
}
