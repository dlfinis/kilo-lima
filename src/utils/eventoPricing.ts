export interface MarkupsEventoProducto {
  ganancia: number
  contribucion: number
}

export interface AjustePrecioEventoProducto extends MarkupsEventoProducto {
  precioVenta: number
}

const GANANCIA_MARKUP_MAXIMA = 2

function clampMarkup(value: number): number {
  return Math.max(0, value)
}

function clampGanancia(value: number): number {
  return Math.min(clampMarkup(value), GANANCIA_MARKUP_MAXIMA)
}

export function distribuirMarkupTotal(markupTotal: number): MarkupsEventoProducto {
  const totalSeguro = clampMarkup(markupTotal)
  const ganancia = clampGanancia(totalSeguro)
  return {
    ganancia,
    contribucion: Math.max(totalSeguro - ganancia, 0),
  }
}

export function distribuirPrecioManual(
  precioVenta: number,
  costoUnitario: number,
  contribucionPreferida = 0,
): AjustePrecioEventoProducto | null {
  if (costoUnitario <= 0) return null
  const markupTotal = clampMarkup((precioVenta / costoUnitario) - 1)
  const contribucionBase = Math.min(clampMarkup(contribucionPreferida), markupTotal)
  const restante = markupTotal - contribucionBase
  const ganancia = clampGanancia(restante)
  const contribucion = contribucionBase + Math.max(restante - ganancia, 0)
  return {
    precioVenta,
    ganancia,
    contribucion,
  }
}

export function calcularMarkupsEventoProducto(
  precioVenta: number | null,
  costoUnitario: number,
  gananciaPersistida: number | null | undefined,
  contribucionPersistida: number | null | undefined,
  margen: number | null,
): MarkupsEventoProducto {
  if (gananciaPersistida !== null && gananciaPersistida !== undefined
    && contribucionPersistida !== null && contribucionPersistida !== undefined) {
    return { ganancia: gananciaPersistida, contribucion: contribucionPersistida }
  }

  let markupTotal: number | null = null
  if (precioVenta !== null && costoUnitario > 0) {
    markupTotal = (precioVenta / costoUnitario) - 1
  } else if (precioVenta === null && margen !== null && margen >= 0 && margen < 1) {
    markupTotal = margen / (1 - margen)
  }

  if (markupTotal === null) return { ganancia: 0, contribucion: 0 }
  return distribuirMarkupTotal(markupTotal)
}

// A saved price is authoritative. If recipe costs changed after the last
// pricing edit, the first slider interaction rebases the untouched slider
// against that saved price instead of causing an unexpected price jump.
export function ajustarPrecioEventoProducto(
  precioVenta: number | null,
  costoUnitario: number,
  ganancia: number,
  contribucion: number,
  ajuste: 'ganancia' | 'contribucion',
  nuevoValor: number,
): AjustePrecioEventoProducto | null {
  if (costoUnitario <= 0) {
    // A positive manual price with no usable cost cannot be safely converted
    // to markups. Keep the persisted price/settings and wait for a valid cost.
    return null
  }

  const totalGuardado = ganancia + contribucion
  const precioEsperado = costoUnitario * (1 + totalGuardado)
  const necesitaRebase = precioVenta !== null && Math.abs(precioVenta - precioEsperado) > 0.005

  if (necesitaRebase) {
    const markupActual = clampMarkup((precioVenta / costoUnitario) - 1)
    const siguienteGanancia = ajuste === 'ganancia'
      ? clampGanancia(nuevoValor)
      : clampGanancia(markupActual - clampMarkup(nuevoValor))
    const siguienteContribucion = ajuste === 'contribucion'
      ? clampMarkup(nuevoValor)
      : Math.max(0, markupActual - siguienteGanancia)
    return {
      precioVenta: costoUnitario * (1 + siguienteGanancia + siguienteContribucion),
      ganancia: siguienteGanancia,
      contribucion: siguienteContribucion,
    }
  }

  const siguienteGanancia = ajuste === 'ganancia' ? clampGanancia(nuevoValor) : clampGanancia(ganancia)
  const siguienteContribucion = ajuste === 'contribucion' ? clampMarkup(nuevoValor) : clampMarkup(contribucion)
  return {
    precioVenta: costoUnitario * (1 + siguienteGanancia + siguienteContribucion),
    ganancia: siguienteGanancia,
    contribucion: siguienteContribucion,
  }
}
