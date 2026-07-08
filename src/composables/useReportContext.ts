// mobile-ux-redesign Phase 5: useReportContext composable.
// Determines report context from the active event:
//   'during' — there is exactly one non-cerrado event (active event ongoing)
//   'post'   — no active event, all cerrados, or ambiguous (>1 non-finished)
//
// Uses useEventoActivo() internally, which already enforces the
// "exactly one non-cerrado" invariant. When activeEvent is non-null
// we are 'during'; otherwise we are 'post'.
import { computed, type ComputedRef } from 'vue'

import { useEventoActivo } from './useEventoActivo'

export type ReportContext = 'during' | 'post'

export function useReportContext(): { reportContext: ComputedRef<ReportContext> } {
  const { activeEvent } = useEventoActivo()

  const reportContext = computed<ReportContext>(() => {
    return activeEvent.value !== null ? 'during' : 'post'
  })

  return { reportContext }
}
