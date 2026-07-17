import { describe, expect, it } from 'vitest'

import {
  ajustarPrecioEventoProducto,
  calcularMarkupsEventoProducto,
  distribuirPrecioManual,
} from './eventoPricing'

describe('calcularMarkupsEventoProducto', () => {
  it('uses persisted markups verbatim after reconciliation', () => {
    expect(calcularMarkupsEventoProducto(50, 10, 0.75, 3.25, 0.4)).toEqual({
      ganancia: 0.75,
      contribucion: 3.25,
    })
  })

  it('reconciles a legacy saved price once without changing that price', () => {
    // (50 / 10) - 1 = 4: gain is capped at 200% and the remainder is contribution.
    const reconciliado = calcularMarkupsEventoProducto(50, 10, null, null, 0.4)
    expect(reconciliado).toEqual({
      ganancia: 2,
      contribucion: 2,
    })
    expect(calcularMarkupsEventoProducto(50, 10, reconciliado.ganancia, reconciliado.contribucion, 0.4))
      .toEqual(reconciliado)
  })

  it('converts a valid true margin to markup when no manual price exists', () => {
    // 40% margin = 0.4 / (1 - 0.4) = 66.67% markup.
    const markups = calcularMarkupsEventoProducto(null, 10, null, null, 0.4)
    expect(markups.ganancia).toBeCloseTo(2 / 3)
    expect(markups.contribucion).toBe(0)
  })

  it('does not derive a fallback markup from an invalid margin', () => {
    expect(calcularMarkupsEventoProducto(null, 10, null, null, 1)).toEqual({
      ganancia: 0,
      contribucion: 0,
    })
  })
})

describe('ajustarPrecioEventoProducto', () => {
  it('rebases the untouched markup on the first slider change after a cost change', () => {
    // The saved price $40 came from cost $10 and 100% + 200% markups.
    // With current cost $20, changing gain must not jump the saved price.
    expect(ajustarPrecioEventoProducto(40, 20, 1, 2, 'ganancia', 0.5)).toEqual({
      precioVenta: 40,
      ganancia: 0.5,
      contribucion: 0.5,
    })
  })

  it('clamps the residual markup when the adjusted slider exceeds current total markup', () => {
    expect(ajustarPrecioEventoProducto(40, 20, 1, 2, 'ganancia', 1.5)).toEqual({
      precioVenta: 50,
      ganancia: 1.5,
      contribucion: 0,
    })
  })

  it('caps ganancia in the rebase branch too', () => {
    expect(ajustarPrecioEventoProducto(40, 20, 1, 2, 'ganancia', 5)).toEqual({
      precioVenta: 60,
      ganancia: 2,
      contribucion: 0,
    })
  })

  it('derives a new price after settings already match the current cost', () => {
    expect(ajustarPrecioEventoProducto(40, 20, 0.5, 0.5, 'contribucion', 1)).toEqual({
      precioVenta: 50,
      ganancia: 0.5,
      contribucion: 1,
    })
  })

  it('preserves positive saved-price intent when current cost is not usable', () => {
    expect(ajustarPrecioEventoProducto(40, 0, 1, 2, 'ganancia', 0.5)).toBeNull()
  })

  it('derives capped gain and contribution remainder for an explicit minimum price', () => {
    expect(calcularMarkupsEventoProducto(50, 10, null, null, null)).toEqual({
      ganancia: 2,
      contribucion: 2,
    })
  })
})

describe('distribuirPrecioManual', () => {
  it('preserves the current contribution preference when the operator types a manual price', () => {
    expect(distribuirPrecioManual(25, 10, 0.5)).toEqual({
      precioVenta: 25,
      ganancia: 1,
      contribucion: 0.5,
    })
  })

  it('clamps below-cost manual prices to a safe 0/0 split while preserving the explicit price', () => {
    expect(distribuirPrecioManual(8, 10)).toEqual({
      precioVenta: 8,
      ganancia: 0,
      contribucion: 0,
    })
  })

  it('caps ganancia at 200% and moves the remainder into contribucion for high manual prices', () => {
    expect(distribuirPrecioManual(50, 10, 0.5)).toEqual({
      precioVenta: 50,
      ganancia: 2,
      contribucion: 2,
    })
  })
})

describe('calcularMarkupsEventoProducto below cost', () => {
  it('does not persist negative derived markups for below-cost legacy prices', () => {
    expect(calcularMarkupsEventoProducto(8, 10, null, null, null)).toEqual({
      ganancia: 0,
      contribucion: 0,
    })
  })
})
