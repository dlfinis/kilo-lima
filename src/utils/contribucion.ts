// REQ-CON-1, REQ-CON-2, REQ-CON-3: pure contribution / break-even math.
//
// Naming follows the design.md "Naming reconciliation" — the spec names
// (`calcularContribucionUnitaria`, `calcularContribucionPorcentual`,
// `calcularBreakEvenUnidades`) are the canonical contract; the
// orchestrator brief names are documented as equivalent aliases.
//
// Single-rounding policy (REQ-PRICING-7 / REQ-CATALOG-20): one
// `redondearCentavos` at function exit. No intermediate rounding, no
// `toFixed()` strings — float-drift safe across `calcularProyeccion`
// callers that sum hundreds of items.
import { redondearCentavos } from '@/utils/moneda'

/**
 * Unit contribution (precio − costo), rounded once at the end.
 *
 * Negative when the operator prices below cost (selling at loss).
 */
export function calcularContribucionUnitaria(precio: number, costo: number): number {
  return redondearCentavos(precio - costo)
}

/**
 * Contribution as a 0..1 fraction of price (decimal, NOT percentage).
 *
 * Returns 1 when costo = 0 (100% margin — no COGS) and 0 when
 * precio = 0 (no sale). Negative when precio < costo.
 */
export function calcularContribucionPorcentual(precio: number, costo: number): number {
  if (precio === 0) return 0
  if (costo === 0) return 1
  return redondearCentavos((precio - costo) / precio)
}

/**
 * Pair of contribution-per-unit and units-sold — the inputs the
 * operator expects when computing a weighted-average break-even.
 */
export interface ContribucionConVolumen {
  contribucionUnidad: number
  unidades: number
}

/**
 * Break-even unit count (`Math.ceil(gastosFijos / promedioPonderado)`).
 *
 * Returns `Infinity` when the weighted-average contribution is <= 0
 * or when `contribuciones` is empty — surfaces as "Definí márgenes
 * primero" in the UI per REQ-CON-2 / AC-3.
 */
export function calcularBreakEvenUnidades(
  gastosFijos: number,
  contribuciones: ContribucionConVolumen[],
): number {
  const totalUnidades = contribuciones.reduce((acc, c) => acc + c.unidades, 0)
  if (totalUnidades <= 0) return Number.POSITIVE_INFINITY
  const totalContribucion = contribuciones.reduce(
    (acc, c) => acc + c.contribucionUnidad * c.unidades,
    0,
  )
  const promedioPonderado = totalContribucion / totalUnidades
  if (promedioPonderado <= 0) return Number.POSITIVE_INFINITY
  return Math.ceil(gastosFijos / promedioPonderado)
}

/**
 * Minimum price so that `(precio − costo) × unidades >= gastosFijos`
 * (the operator's "minimum break-even price" — REQ-CON-3 / AC-4).
 *
 * Uses `Math.max(1, unidadesEstimadas)` defensively so the UI never
 * shows `Infinity` when the operator hasn't entered a sales target yet.
 */
export function calcularPrecioMinimoBreakEven(
  costo: number,
  gastosFijos: number,
  unidadesEstimadas: number,
): number {
  return redondearCentavos(costo + gastosFijos / Math.max(1, unidadesEstimadas))
}

/**
 * 3-tier contribution classifier (PR-1 brief):
 *   entrada: <= 0.30   low margin, high-volume product
 *   margen:  0.30..0.60
 *   premium: > 0.60    high margin, low-volume product
 */

/**
 * Reverse calculator (Type A): given a desired contribution per unit,
 * returns the price the operator should set.
 *   precio = costoProduccion + contribucionDeseada
 *
 * If contribucionDeseada < 0 the result is clamped to costoProduccion
 * (selling at cost is the floor — selling at loss requires a manual
 * price override).
 */
export function calcularPrecioDesdeContribucion(
  costoProduccion: number,
  contribucionDeseada: number,
): number {
  const precio = costoProduccion + contribucionDeseada
  // Floor at cost — the operator can override below via the editable
  // precio field (the alert will warn them).
  return redondearCentavos(Math.max(precio, costoProduccion))
}

/**
 * 3-tier contribution classifier (PR-1 brief):
 *   entrada: <= 0.30   low margin, high-volume product
 *   margen:  0.30..0.60
 *   premium: > 0.60    high margin, low-volume product
 */
export type CategoriaContribucion = 'entrada' | 'margen' | 'premium'

const UMBRAL_MARGEN = 0.3
const UMBRAL_PREMIUM = 0.6

export function clasificarContribucion(
  contribucionPorcentaje: number,
): CategoriaContribucion {
  if (contribucionPorcentaje > UMBRAL_PREMIUM) return 'premium'
  if (contribucionPorcentaje > UMBRAL_MARGEN) return 'margen'
  return 'entrada'
}
