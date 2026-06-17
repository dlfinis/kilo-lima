// REQ-CATALOG-21: formatearUnidad renders quantity + unit with the
// "(es)" plural suffix on the discrete "unidad" unit.
import { describe, it, expect } from 'vitest'
import { formatearUnidad } from './format'

describe('formatearUnidad', () => {
  it('renders metric unit as "12.5 g"', () => {
    expect(formatearUnidad(12.5, 'g')).toBe('12.5 g')
  })

  it('renders "unidad" with the "(es)" plural suffix', () => {
    expect(formatearUnidad(3, 'unidad')).toBe('3 unidad(es)')
  })

  it('renders kilograms as integer with "kg" suffix', () => {
    expect(formatearUnidad(2, 'kg')).toBe('2 kg')
  })

  it('renders liters with "l" suffix', () => {
    expect(formatearUnidad(0.5, 'l')).toBe('0.5 l')
  })

  it('renders milliliters with "ml" suffix', () => {
    expect(formatearUnidad(250, 'ml')).toBe('250 ml')
  })
})
