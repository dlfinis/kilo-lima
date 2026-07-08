// mobile-ux-redesign Phase 2: returns the active event when exactly ONE
// non-cerrado event exists. Returns null when there are zero or >1
// non-finished events. Uses `useEventsStore()` so it stays reactive
// when the store updates from other views.
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { Evento } from '@/types'

import { useEventsStore } from '@/stores/events.store'

export function useEventoActivo(): { activeEvent: ComputedRef<Evento | null> } {
  const eventsStore = useEventsStore()

  const activeEvent = computed<Evento | null>(() => {
    const noCerrados = eventsStore.eventos.filter((e) => e.estado !== 'cerrado')
    return noCerrados.length === 1 ? noCerrados[0]! : null
  })

  return { activeEvent }
}
