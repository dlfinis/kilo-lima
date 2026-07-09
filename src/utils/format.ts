// REQ-CONV-5: single USD formatting policy for the entire app.  No
// thousands separator, dot decimal, consistent edit/display.  The
// en-US locale with style:'currency' reliably produces the "$" prefix;
// useGrouping:false strips the comma thousands separator.
//
// Money policy — single source of truth for decimal-digit contract.
// All formatters and the parser reference these; changing them here
// updates every money surface in the app.
const MONEY_MIN_DECIMALS = 2
const MONEY_MAX_DECIMALS = 3

// Examples (formatearUSD):
//   1234.56 → "$1234.56"
//   0.12    → "$0.12"
//   1.2     → "$1.20"
//   0.123   → "$0.123"
export function formatearUSD(monto: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: MONEY_MIN_DECIMALS,
    maximumFractionDigits: MONEY_MAX_DECIMALS,
    useGrouping: false,
  }).format(monto)
}

// REQ-UX-MONEY-1: input-field helper that returns the numeric portion
// (no currency symbol) so the form controls the "$" prefix visually.
// Preserves trailing zeros so editing never strips them.
//
// Examples:
//   1.2   → "1.20"
//   0.12  → "0.12"
//   5     → "5.00"
//   0.123 → "0.123"  (exact — no rounding beyond the 3dp policy)
export function formatearUSDInput(monto: number): string {
  return monto.toLocaleString('en-US', {
    minimumFractionDigits: MONEY_MIN_DECIMALS,
    maximumFractionDigits: MONEY_MAX_DECIMALS,
    useGrouping: false,
  })
}

// REQ-UX-MONEY-1: whole-token USD parser.  Validates the ENTIRE input
// against the dot-decimal-no-grouping policy — no character stripping,
// no silent coercion.
//
// REJECTED (deliberately — these are NOT "fixable" typos):
//   Scientific notation    "1e3" / "0e5"
//   Mixed alphanumeric     "12abc34"
//   Repeated / misplaced dot "1..2" / "1.2.3"
//   >3 fractional digits   "0.1234" / "1.0000"
//   Comma in any position  "1,234.56" / "1,23"
//
// ALLOWED (partial-input ergonomics):
//   Leading dot            ".5" → 0.5
//   Trailing dot           "1." → 1
//   Leading "$"            "$5.00" → 5  (paste robustness)
//   Negative values        "-1.50" → -1.5
//
// Returns NaN for invalid/partial input so callers can distinguish
// "not yet valid" from "genuinely zero".
export function parsearUSDInput(valor: string): number {
  const trimmed = valor.trim()

  // Quick-reject: empty, standalone minus, standalone dot.
  if (trimmed === '' || trimmed === '-' || trimmed === '.') return NaN

  // REQ-UX-MONEY-1: the policy is dot decimal, no grouping. ANY comma
  // is invalid — reject immediately instead of trying to infer locale.
  if (trimmed.includes(',')) return NaN

  // Strip optional "$" prefix (paste from formatted display).
  const sinDolar = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed

  // Whole-token regex anchored at both ends.  Must match one of:
  //   -?d+.d{0,MONEY_MAX_DECIMALS}   e.g. "1", "1.20", "1."
  //   -?.d{1,MONEY_MAX_DECIMALS}     e.g. ".5", ".123"
  const MONEY_RE = new RegExp(
    `^-?(?:\\d+\\.?\\d{0,${MONEY_MAX_DECIMALS}}|\\.\\d{1,${MONEY_MAX_DECIMALS}})$`,
  )
  if (!MONEY_RE.test(sinDolar)) return NaN

  const parsed = Number(sinDolar)
  return Number.isNaN(parsed) ? NaN : parsed
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
