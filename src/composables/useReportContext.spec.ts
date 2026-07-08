// mobile-ux-redesign Phase 5: useReportContext composable.
// Determines report context: 'during' when an active event exists,
// 'post' when no active event or the event is cerrado.
// Uses useEventoActivo() internally.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'

import { useReportContext } from './useReportContext'
import { useEventsStore } from '@/stores/events.store'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Evento } from '@/types'

let aplicacion: App

const mkEvento = (
  id: string,
  estado: Evento['estado'] = 'en_curso',
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

describe('useReportContext', () => {
  it("returns 'during' when exactly one non-cerrado event exists", () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      events.eventos.push(mkEvento('e-2', 'cerrado'))

      const { reportContext } = useReportContext()
      expect(reportContext.value).toBe('during')
    })
  })

  it("returns 'during' for planificacion events (non-cerrado)", () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'planificacion'))

      const { reportContext } = useReportContext()
      expect(reportContext.value).toBe('during')
    })
  })

  it("returns 'post' when no active event exists (all cerrados)", () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'cerrado'))
      events.eventos.push(mkEvento('e-2', 'cerrado'))

      const { reportContext } = useReportContext()
      expect(reportContext.value).toBe('post')
    })
  })

  it("returns 'post' when >1 non-cerrado events exist (ambiguous)", () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', 'en_curso'))
      events.eventos.push(mkEvento('e-2', 'planificacion'))

      const { reportContext } = useReportContext()
      expect(reportContext.value).toBe('post')
    })
  })

  it("returns 'post' when the store has no events at all", () => {
    conContexto(() => {
      const { reportContext } = useReportContext()
      expect(reportContext.value).toBe('post')
    })
  })

  it('is reactive: switches when event status changes', () => {
    conContexto(() => {
      const events = useEventsStore()
      const { reportContext } = useReportContext()

      // Start with no events -> 'post'
      expect(reportContext.value).toBe('post')

      // Add exactly one non-cerrado event -> 'during'
      events.eventos.push(mkEvento('e-3', 'en_curso'))
      expect(reportContext.value).toBe('during')

      // Close it -> 'post'
      events.eventos = events.eventos.map((e) =>
        e.id === 'e-3' ? { ...e, estado: 'cerrado' as const } : e,
      )
      expect(reportContext.value).toBe('post')

      // Add a new non-cerrado -> 'during' again
      events.eventos.push(mkEvento('e-4', 'planificacion'))
      expect(reportContext.value).toBe('during')
    })
  })
})
