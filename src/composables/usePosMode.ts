// mobile-ux-redesign Phase 3: POS mode flag. Simplified mode is active
// during an event (exactly one non-cerrado) — otherwise full mode.
import { computed } from 'vue'
import type { ComputedRef } from 'vue'

import { useEventoActivo } from './useEventoActivo'

export function usePosMode(): { isSimplifiedMode: ComputedRef<boolean> } {
  const { activeEvent } = useEventoActivo()

  const isSimplifiedMode = computed<boolean>(() => !!activeEvent.value)

  return { isSimplifiedMode }
}
