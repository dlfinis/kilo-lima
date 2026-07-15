// REQ-UX-17..19: pure function `obtenerSiguientePaso(contadores)` returns
// the recommended next step for the home CTA. Six-branch hierarchy:
//
//   1. materiasPrimas === 0                → CREAR MATERIA PRIMA  /inventario (primary)
//   2. recetas === 0                       → CREAR PREPARACIÓN   /productos/preparaciones (primary)
//   3. eventosTotal === 0                  → PLANIFICAR EVENTO    /eventos        (primary)
//   4. eventosEnCurso === 0 && eventosTotal > 0
//                                          → IR A EVENTOS         /eventos        (warning)
//   5. ventasHoy === 0                     → IR A CAJA            /pos            (success)
//   6. otherwise                           → null (hide CTA)
//
// Each test references a SPEC SCENARIO from spec.md §5. Pure function,
// no mocks — plain objects exercise every branch + null + edge cases.
import { describe, it, expect } from 'vitest'

import { obtenerSiguientePaso } from './siguientePaso'

describe('obtenerSiguientePaso', () => {
  it('returns CREAR MATERIA PRIMA when materiasPrimas is 0 (REQ-UX-17 branch 1)', () => {
    const paso = obtenerSiguientePaso({
      materiasPrimas: 0,
      recetas: 0,
      eventosTotal: 0,
      eventosEnCurso: 0,
      productos: 0,
      ventasHoy: 0,
    })
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('CREAR MATERIA PRIMA')
    expect(paso!.ruta).toBe('/inventario')
    expect(paso!.colorBoton).toBe('primary')
    expect(paso!.testid).toBe('siguiente-paso-crear-materia-prima')
  })

  it('returns CREAR PREPARACIÓN when materiasPrimas>0 but recetas===0 (REQ-UX-17 branch 2)', () => {
    const paso = obtenerSiguientePaso({
      materiasPrimas: 5,
      recetas: 0,
      eventosTotal: 0,
      eventosEnCurso: 0,
      productos: 0,
      ventasHoy: 0,
    })
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('CREAR PREPARACIÓN')
    expect(paso!.ruta).toBe('/productos/preparaciones')
    expect(paso!.colorBoton).toBe('primary')
  })

  it('returns PLANIFICAR EVENTO when recetas>0 but eventosTotal===0 (REQ-UX-17 branch 3)', () => {
    const paso = obtenerSiguientePaso({
      materiasPrimas: 5,
      recetas: 3,
      eventosTotal: 0,
      eventosEnCurso: 0,
      productos: 4,
      ventasHoy: 0,
    })
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('PLANIFICAR EVENTO')
    expect(paso!.ruta).toBe('/eventos')
    expect(paso!.colorBoton).toBe('primary')
  })

  it('returns IR A EVENTOS (warning) when eventosTotal>0 but eventosEnCurso===0 (REQ-UX-17 branch 4)', () => {
    const paso = obtenerSiguientePaso({
      materiasPrimas: 5,
      recetas: 3,
      eventosTotal: 2,
      eventosEnCurso: 0,
      productos: 4,
      ventasHoy: 0,
    })
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('IR A EVENTOS')
    expect(paso!.ruta).toBe('/eventos')
    expect(paso!.colorBoton).toBe('warning')
  })

  it('returns IR A CAJA (success) when eventosEnCurso>0 but ventasHoy===0 (REQ-UX-17 branch 5)', () => {
    const paso = obtenerSiguientePaso({
      materiasPrimas: 5,
      recetas: 3,
      eventosTotal: 2,
      eventosEnCurso: 1,
      productos: 4,
      ventasHoy: 0,
    })
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('IR A CAJA')
    expect(paso!.ruta).toBe('/pos')
    expect(paso!.colorBoton).toBe('success')
  })

  it('returns null when all counters are non-zero — user is in motion (REQ-UX-19)', () => {
    const paso = obtenerSiguientePaso({
      materiasPrimas: 5,
      recetas: 3,
      eventosTotal: 2,
      eventosEnCurso: 1,
      productos: 4,
      ventasHoy: 7,
    })
    expect(paso).toBeNull()
  })

  it('treats missing counter fields as zero (defensive default for in-flight load)', () => {
    const paso = obtenerSiguientePaso({})
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('CREAR MATERIA PRIMA')
  })

  it('respects strict priority: branch 1 wins even when other counters are positive', () => {
    // Even though recetas > 0 and eventosTotal > 0, the function must
    // still recommend materia prima first because the sequential model
    // means the user might have rolled-back data or imported recipes
    // without ingredients — UI must still surface the missing step.
    const paso = obtenerSiguientePaso({
      materiasPrimas: 0,
      recetas: 3,
      eventosTotal: 2,
      eventosEnCurso: 1,
      productos: 4,
      ventasHoy: 7,
    })
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('CREAR MATERIA PRIMA')
  })

  it('respects branch 4 priority over branch 5 (eventosEnCurso==0 wins over ventasHoy==0)', () => {
    // Branch 4 only fires when ventasHoy===0 too (otherwise we'd be at
    // branch 6 / null). But branch 4 must beat branch 5 in the
    // ordering when both apply.
    const paso = obtenerSiguientePaso({
      materiasPrimas: 5,
      recetas: 3,
      eventosTotal: 2,
      eventosEnCurso: 0,
      productos: 4,
      ventasHoy: 0,
    })
    expect(paso).not.toBeNull()
    expect(paso!.textoBoton).toBe('IR A EVENTOS')
    expect(paso!.colorBoton).toBe('warning')
  })
})
