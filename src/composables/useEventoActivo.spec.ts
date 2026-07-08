// REQ-NAV-1 / mobile-ux-redesign Phase 2: useEventoActivo composable.
// Returns the active event when exactly ONE non-cerrado event exists.
// Returns null when there are zero or >1 non-finished events.
// Uses useEventsStore() from @/stores/events.store.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import { useEventoActivo } from './useEventoActivo'
import { useEventsStore } from '@/stores/events.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento } from '@/types'

let aplicacion: App

const mkEvento = (
  id: string,
  estado: Evento['estado'] = 'en_curso',
  overrides: Partial<Evento> = {},
): Evento => ({
  id,
  nombre: `Evento ${id}`,
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado,
  notas: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide(
    'supabase',
    createClient('http://x', 'anon') as SupabaseClient<Database>,
  )
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

describe('useEventoActivo', () => {
  it('returns the event when exactly 1 non-finished event exists', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      events.eventos.push(mkEvento('e-2', 'cerrado'))
      const { activeEvent } = useEventoActivo()
      expect(activeEvent.value).not.toBeNull()
      expect(activeEvent.value!.id).toBe('e-1')
      expect(activeEvent.value!.nombre).toBe('Evento e-1')
      expect(activeEvent.value!.estado).toBe('en_curso')
    })
  })

  it('returns null when 0 non-finished events exist (all cerrados)', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'cerrado'))
      events.eventos.push(mkEvento('e-2', 'cerrado'))
      const { activeEvent } = useEventoActivo()
      expect(activeEvent.value).toBeNull()
    })
  })

  it('returns null when >1 non-finished events exist', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      events.eventos.push(mkEvento('e-2', 'planificacion'))
      const { activeEvent } = useEventoActivo()
      expect(activeEvent.value).toBeNull()
    })
  })

  it('returns null when the store has no events at all', () => {
    conContexto(() => {
      const { activeEvent } = useEventoActivo()
      expect(activeEvent.value).toBeNull()
    })
  })

  it('is reactive: updates when events change', () => {
    conContexto(() => {
      const events = useEventsStore()
      const { activeEvent } = useEventoActivo()

      // Start with no events
      expect(activeEvent.value).toBeNull()

      // Add exactly one non-finished event
      events.eventos.push(mkEvento('e-3', 'planificacion'))
      expect(activeEvent.value).not.toBeNull()
      expect(activeEvent.value!.id).toBe('e-3')

      // Add a second non-finished event — should go back to null
      events.eventos.push(mkEvento('e-4', 'en_curso'))
      expect(activeEvent.value).toBeNull()

      // Close the second — should go back to having one
      events.eventos = events.eventos.map((e) =>
        e.id === 'e-4' ? { ...e, estado: 'cerrado' as const } : e,
      )
      expect(activeEvent.value).not.toBeNull()
      expect(activeEvent.value!.id).toBe('e-3')
    })
  })

  it('returns null when the only event is cerrado', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'cerrado'))
      const { activeEvent } = useEventoActivo()
      expect(activeEvent.value).toBeNull()
    })
  })

  it('includes planificacion events as non-finished', () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'planificacion'))
      const { activeEvent } = useEventoActivo()
      expect(activeEvent.value).not.toBeNull()
      expect(activeEvent.value!.estado).toBe('planificacion')
    })
  })
})
