// REQ-CATALOG-21: formatearUnidad renders quantity + unit with the
// "(es)" plural suffix on the discrete "unidad" unit.
//
// REQ-UX-14: formatearFechaCorta renders "2026-07-15" as "15 jul 2026"
// for the active-evento banner. Abbreviated month list mirrors the
// business vocabulary (no dayjs for one formatter).
import { describe, it, expect } from 'vitest'
import { formatearUSD, formatearUSDInput, parsearUSDInput, formatearUnidad, formatearFechaCorta } from './format'

describe('formatearUSD', () => {
  it('renders whole dollars with 2 decimal places ($5.00)', () => {
    expect(formatearUSD(5)).toBe('$5.00')
  })

  it('renders cents with 2 decimal places ($0.50)', () => {
    expect(formatearUSD(0.5)).toBe('$0.50')
  })

  it('renders up to 3 decimal places when needed ($0.123)', () => {
    expect(formatearUSD(0.123)).toBe('$0.123')
  })

  it('does NOT include thousands separator ($1234.56)', () => {
    expect(formatearUSD(1234.56)).toBe('$1234.56')
  })

  it('handles large values without grouping ($1234567.89)', () => {
    expect(formatearUSD(1234567.89)).toBe('$1234567.89')
  })

  it('handles zero ($0.00)', () => {
    expect(formatearUSD(0)).toBe('$0.00')
  })

  it('handles negative values (-$5.00)', () => {
    expect(formatearUSD(-5)).toBe('-$5.00')
  })
})

describe('formatearUSDInput', () => {
  it('formats without currency symbol for input fields ("5.00")', () => {
    expect(formatearUSDInput(5)).toBe('5.00')
  })

  it('preserves trailing zeros ("1.200")', () => {
    expect(formatearUSDInput(1.2)).toBe('1.20')
  })

  it('preserves 3 decimal places ("0.123")', () => {
    expect(formatearUSDInput(0.123)).toBe('0.123')
  })

  it('does not add thousands separator ("1234.56")', () => {
    expect(formatearUSDInput(1234.56)).toBe('1234.56')
  })
})

describe('parsearUSDInput', () => {
  it('parses a plain decimal string', () => {
    expect(parsearUSDInput('1.200')).toBe(1.2)
  })

  it('strips dollar sign prefix', () => {
    expect(parsearUSDInput('$5.00')).toBe(5)
  })

  it('rejects comma even when a dot is present: "USD 1,234.56"', () => {
    // Any comma is invalid under the dot-decimal-no-grouping policy.
    expect(parsearUSDInput('USD 1,234.56')).toBeNaN()
  })

  it('rejects comma-decimal input: "1,23" must not silently become 123', () => {
    expect(parsearUSDInput('1,23')).toBeNaN()
  })

  it('rejects comma-decimal input: "5,5" must not silently become 55', () => {
    expect(parsearUSDInput('5,5')).toBeNaN()
  })

  it('rejects comma-only input with no dot ("1,234" is ambiguous)', () => {
    expect(parsearUSDInput('1,234')).toBeNaN()
  })

  it('rejects mixed-locale paste: "1.234,56" (European notation)', () => {
    // dot = thousands, comma = decimal → must not silently become 1.23456
    expect(parsearUSDInput('1.234,56')).toBeNaN()
  })

  it('rejects mixed-locale paste: "1,234.56" (thousands separator)', () => {
    // Comma thousands grouping is invalid under the no-grouping policy.
    expect(parsearUSDInput('1,234.56')).toBeNaN()
  })

  it('returns NaN for empty string', () => {
    expect(parsearUSDInput('')).toBeNaN()
  })

  it('returns NaN for non-numeric garbage', () => {
    expect(parsearUSDInput('abc')).toBeNaN()
  })

  it('returns NaN for standalone dot "."', () => {
    expect(parsearUSDInput('.')).toBeNaN()
  })

  it('returns NaN for standalone minus "-"', () => {
    expect(parsearUSDInput('-')).toBeNaN()
  })

  it('parses leading-dot decimal ".5" → 0.5', () => {
    expect(parsearUSDInput('.5')).toBe(0.5)
  })

  it('parses trailing-dot "1." → 1 (partial input, valid number)', () => {
    expect(parsearUSDInput('1.')).toBe(1)
  })

  it('parses negative values ("-5")', () => {
    expect(parsearUSDInput('-5')).toBe(-5)
  })

  it('parses negative decimal values ("-1.50")', () => {
    expect(parsearUSDInput('-1.50')).toBe(-1.5)
  })

  // ── Hardening: malformed digit-bearing strings ──

  it('rejects scientific notation "1e3" (must not become 13 or 1000)', () => {
    expect(parsearUSDInput('1e3')).toBeNaN()
  })

  it('rejects scientific notation "0e5"', () => {
    expect(parsearUSDInput('0e5')).toBeNaN()
  })

  it('rejects mixed alphanumeric "12abc34"', () => {
    expect(parsearUSDInput('12abc34')).toBeNaN()
  })

  it('rejects repeated dot "1..2"', () => {
    expect(parsearUSDInput('1..2')).toBeNaN()
  })

  it('rejects multiple dots "1.2.3"', () => {
    expect(parsearUSDInput('1.2.3')).toBeNaN()
  })

  it('rejects leading letter-digit mix "x5"', () => {
    expect(parsearUSDInput('x5')).toBeNaN()
  })

  // ── Hardening: >3 decimal places ──

  it('rejects 4 decimal places "0.1234"', () => {
    expect(parsearUSDInput('0.1234')).toBeNaN()
  })

  it('rejects 5 decimal places "5.12345"', () => {
    expect(parsearUSDInput('5.12345')).toBeNaN()
  })

  it('rejects exactly-at-boundary-break "1.0000" (4dp — one past limit)', () => {
    expect(parsearUSDInput('1.0000')).toBeNaN()
  })

  it('rejects many zero-padded decimals "0.10000" (5dp)', () => {
    expect(parsearUSDInput('0.10000')).toBeNaN()
  })
})

describe('formatearUnidad', () => {
  it('renders metric unit as "12.5 g"', () => {
    expect(formatearUnidad(12.5, 'g')).toBe('12.5 g')
  })

  it('renders "unidad" as "u" and "und" as "unds"', () => {
    expect(formatearUnidad(3, 'unidad')).toBe('3 u')
    expect(formatearUnidad(3, 'und')).toBe('3 unds')
  })

  it('renders kilograms as integer with "kg" suffix', () => {
    expect(formatearUnidad(2, 'kg')).toBe('2 kg')
  })

  it('renders liters as integer with "l" suffix', () => {
    expect(formatearUnidad(0.5, 'l')).toBe('0.5 l')
  })

  it('renders milliliters as integer with "ml" suffix', () => {
    expect(formatearUnidad(250, 'ml')).toBe('250 ml')
  })
})

describe('formatearFechaCorta', () => {
  it('renders an ISO date as "15 jul 2026" (REQ-UX-14)', () => {
    expect(formatearFechaCorta('2026-07-15')).toBe('15 jul 2026')
  })

  it('strips any trailing time portion (timestamp input)', () => {
    expect(formatearFechaCorta('2026-12-01T00:00:00Z')).toBe('1 dic 2026')
  })

  it('passes through non-ISO strings unchanged', () => {
    expect(formatearFechaCorta('not-a-date')).toBe('not-a-date')
  })
})
