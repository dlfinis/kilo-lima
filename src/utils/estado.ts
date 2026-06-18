// REQ-EVENTS-5, REQ-EVENTS-6, REQ-EVENTS-25, REQ-EVENTS-46: pure state
// machine helpers. Single source of truth — store guards, UI disables,
// and form locks all call these. No hardcoded `estado === 'cerrado'`
// anywhere else (REQ-EVENTS-46).
import type { EstadoEvento } from '@/types'

// REQ-EVENTS-6: forward-only transitions. Valid moves: start → in
// progress, in progress → closed, start → closed (cancel). Idempotent
// same → same is invalid so the service surfaces a TRANSICION_INVALIDA
// instead of silently no-op'ing. No backward transitions because the
// post-evento phase is read-only by design (REQ-EVENTS-27).
const TRANSICIONES_VALIDAS: ReadonlySet<string> = new Set([
  'planificacion|en_curso',
  'en_curso|cerrado',
  'planificacion|cerrado',
])

export function transicionEstadoValida(
  desde: EstadoEvento,
  hacia: EstadoEvento,
): boolean {
  return TRANSICIONES_VALIDAS.has(`${desde}|${hacia}`)
}

// REQ-EVENTS-25, REQ-EVENTS-46: single source of truth for the
// freeze-on-cerrado rule. Anything but 'cerrado' is editable. v1 keeps
// 'en_curso' fully editable (cost updates during the event); if a
// future slice freezes plan rows while en_curso, only this function
// changes — every guard calls it.
export function estadoEsEditable(estado: EstadoEvento): boolean {
  return estado !== 'cerrado'
}
