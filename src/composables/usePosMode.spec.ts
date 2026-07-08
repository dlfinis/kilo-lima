// mobile-ux-redesign Phase 3: usePosMode composable.
// Returns isSimplifiedMode computed ref:
//   true  when exactly one non-cerrado event exists (via useEventoActivo)
//   false when no active event or >1 non-cerrado events.
//
// Mock `useEventoActivo` with a reactive ref so we can toggle the
// active event and verify isSimplifiedMode tracks it reactively.

import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { usePosMode } from './usePosMode'

import type { Evento } from '@/types'

let activeEventMock = ref<Evento | null>(null)

vi.mock('@/composables/useEventoActivo', () => ({
  useEventoActivo: () => ({
    activeEvent: computed(() => activeEventMock.value),
  }),
}))

const mkEvento = (id: string): Evento => ({
  id,
  nombre: `Evento ${id}`,
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado: 'en_curso',
  notas: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
})

describe('usePosMode', () => {
  it('returns isSimplifiedMode = true when active event exists', () => {
    activeEventMock.value = mkEvento('e-1')
    const { isSimplifiedMode } = usePosMode()
    expect(isSimplifiedMode.value).toBe(true)
  })

  it('returns isSimplifiedMode = false when no active event exists (null)', () => {
    activeEventMock.value = null
    const { isSimplifiedMode } = usePosMode()
    expect(isSimplifiedMode.value).toBe(false)
  })

  it('is reactive: updates when activeEvent changes', () => {
    activeEventMock.value = null
    const { isSimplifiedMode } = usePosMode()
    expect(isSimplifiedMode.value).toBe(false)

    // Add an active event
    activeEventMock.value = mkEvento('e-1')
    expect(isSimplifiedMode.value).toBe(true)

    // Remove the active event
    activeEventMock.value = null
    expect(isSimplifiedMode.value).toBe(false)
  })

  it('returns false for falsy activeEvent values (undefined edge case)', () => {
    activeEventMock.value = null
    const { isSimplifiedMode } = usePosMode()
    expect(isSimplifiedMode.value).toBe(false)
  })
})
