// REQ-CATALOG-21: formatearUnidad renders quantity + unit with the
// "(es)" plural suffix on the discrete "unidad" unit.
//
// REQ-UX-14: formatearFechaCorta renders "2026-07-15" as "15 jul 2026"
// for the active-evento banner. Abbreviated month list mirrors the
// business vocabulary (no dayjs for one formatter).
import { describe, it, expect } from 'vitest'
import { formatearUnidad, formatearFechaCorta } from './format'

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
