// REQ-UX-17..19 + REQ-UX-25: pure helper that turns the `contadores`
// snapshot into the recommended next-step CTA. Six-branch hierarchy,
// no Vue / Pinia / async — trivially unit-testable with plain objects.
export interface Contadores {
  materiasPrimas: number
  recetas: number
  eventosTotal: number
  eventosEnCurso: number
  productos: number
  ventasHoy: number
}

export type ColorBoton = 'primary' | 'warning' | 'success'

export interface PasoRecomendado {
  texto: string
  ruta: string
  textoBoton: string
  colorBoton: ColorBoton
  testid: string
}

export function obtenerSiguientePaso(
  contadores: Partial<Contadores>,
): PasoRecomendado | null {
  const mp = contadores.materiasPrimas ?? 0
  const rc = contadores.recetas ?? 0
  const ev = contadores.eventosTotal ?? 0
  const evCurso = contadores.eventosEnCurso ?? 0
  const vt = contadores.ventasHoy ?? 0

  if (mp === 0) {
    return {
      texto: 'Empezá cargando tus materias primas',
      ruta: '/materias-primas',
      textoBoton: 'CREAR MATERIA PRIMA',
      colorBoton: 'primary',
      testid: 'siguiente-paso-crear-materia-prima',
    }
  }
  if (rc === 0) {
    return {
      texto: 'Ahora creá tu primera receta',
      ruta: '/recetas',
      textoBoton: 'CREAR RECETA',
      colorBoton: 'primary',
      testid: 'siguiente-paso-crear-receta',
    }
  }
  if (ev === 0) {
    return {
      texto: 'Planificá tu próximo evento',
      ruta: '/eventos',
      textoBoton: 'PLANIFICAR EVENTO',
      colorBoton: 'primary',
      testid: 'siguiente-paso-planificar-evento',
    }
  }
  if (evCurso === 0) {
    return {
      texto: 'Tenés eventos planificados pero ninguno en curso',
      ruta: '/eventos',
      textoBoton: 'IR A EVENTOS',
      colorBoton: 'warning',
      testid: 'siguiente-paso-ir-eventos',
    }
  }
  if (vt === 0) {
    return {
      texto: 'Tenés un evento activo, arrancá a vender',
      ruta: '/pos',
      textoBoton: 'IR A CAJA',
      colorBoton: 'success',
      testid: 'siguiente-paso-ir-caja',
    }
  }
  return null
}
