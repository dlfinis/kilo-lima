// REQ-EVENTS-5, REQ-EVENTS-6, REQ-EVENTS-25, REQ-EVENTS-46: state machine
// pure helpers. The 9-combo truth table covers all (desde, hacia) pairs
// from {planificacion, en_curso, cerrado}². The 3-value table covers
// `estadoEsEditable` — the single source of truth for freeze-on-cerrado
// across store guards, UI disables, and form locks.
import { describe, expect, it } from 'vitest'
import type { EstadoEvento } from '@/types'
import { estadoEsEditable, transicionEstadoValida } from './estado'

const ESTADOS: EstadoEvento[] = ['planificacion', 'en_curso', 'cerrado']

describe('transicionEstadoValida', () => {
  it('planificacion → en_curso is valid (REQ-EVENTS-6)', () => {
    expect(transicionEstadoValida('planificacion', 'en_curso')).toBe(true)
  })

  it('en_curso → cerrado is valid (REQ-EVENTS-6)', () => {
    expect(transicionEstadoValida('en_curso', 'cerrado')).toBe(true)
  })

  it('planificacion → cerrado (cancel) is valid (REQ-EVENTS-6)', () => {
    expect(transicionEstadoValida('planificacion', 'cerrado')).toBe(true)
  })

  it('en_curso → planificacion is invalid (no backward)', () => {
    expect(transicionEstadoValida('en_curso', 'planificacion')).toBe(false)
  })

  it('cerrado → en_curso is invalid (no backward)', () => {
    expect(transicionEstadoValida('cerrado', 'en_curso')).toBe(false)
  })

  it('cerrado → planificacion is invalid (no backward)', () => {
    expect(transicionEstadoValida('cerrado', 'planificacion')).toBe(false)
  })

  it('planificacion → planificacion is invalid (idempotent same→same)', () => {
    expect(transicionEstadoValida('planificacion', 'planificacion')).toBe(false)
  })

  it('en_curso → en_curso is invalid (idempotent same→same)', () => {
    expect(transicionEstadoValida('en_curso', 'en_curso')).toBe(false)
  })

  it('cerrado → cerrado is invalid (idempotent same→same)', () => {
    expect(transicionEstadoValida('cerrado', 'cerrado')).toBe(false)
  })

  it('9-combo truth table contains exactly 3 valid transitions', () => {
    let validas = 0
    for (const desde of ESTADOS) {
      for (const hacia of ESTADOS) {
        if (transicionEstadoValida(desde, hacia)) validas++
      }
    }
    expect(validas).toBe(3)
  })
})

describe('estadoEsEditable', () => {
  it('planificacion is editable (REQ-EVENTS-25)', () => {
    expect(estadoEsEditable('planificacion')).toBe(true)
  })

  it('en_curso is editable (REQ-EVENTS-25)', () => {
    expect(estadoEsEditable('en_curso')).toBe(true)
  })

  it('cerrado is NOT editable (REQ-EVENTS-25, REQ-EVENTS-46)', () => {
    expect(estadoEsEditable('cerrado')).toBe(false)
  })
})
