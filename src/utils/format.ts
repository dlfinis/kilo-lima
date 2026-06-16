// Spanish identifier per REQ-CONV-5 (business surface in Spanish). The
// proof-of-pattern for the utils module — more formatters land in later
// slices (CRC for Costa Rica, MXN for Mexico, percentage, etc.).
export function formatearUSD(monto: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(monto)
}

// REQ-CATALOG-21: renders "12.5 g" / "3 unidad(es)". The "(es)" suffix on
// the discrete "unidad" unit avoids the awkward "3 unidad" singular form.
export function formatearUnidad(cantidad: number, unidad: string): string {
  const sufijo = unidad === 'unidad' ? 'unidad(es)' : unidad
  return `${cantidad} ${sufijo}`
}

