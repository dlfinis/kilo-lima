// REQ-NAV-1: useBreakpoint wraps Vuetify useDisplay() into a stable
// three-value contract: mobile | tablet | web. This composable is the
// single source of truth for responsive layout decisions across nav
// components, KPI grids, and POS mode selection.
//
// TDD CYCLE (Strict TDD Mode):
//   RED   → This file was written before useBreakpoint.ts existed.
//   GREEN → useBreakpoint.ts must make ALL tests pass.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBreakpoint } from './useBreakpoint'

// --------------- mock helpers ---------------
interface DisplayMock {
  mobile: { value: boolean }
  mdAndDown: { value: boolean }
}

let mockDisplay: DisplayMock

vi.mock('vuetify', () => ({
  useDisplay: () => mockDisplay,
}))

beforeEach(() => {
  // Default to web (desktop) — each test overrides.
  mockDisplay = {
    mobile: { value: false },
    mdAndDown: { value: false },
  }
})

// --------------- tests ---------------
describe('useBreakpoint', () => {
  it('returns "mobile" when useDisplay().mobile.value is true (xs, sm)', () => {
    mockDisplay.mobile.value = true
    mockDisplay.mdAndDown.value = true // mobile also matches mdAndDown
    const bp = useBreakpoint()
    expect(bp.value).toBe('mobile')
  })

  it('returns "tablet" when mdAndDown is true but mobile is false (md)', () => {
    mockDisplay.mobile.value = false
    mockDisplay.mdAndDown.value = true
    const bp = useBreakpoint()
    expect(bp.value).toBe('tablet')
  })

  it('returns "web" when neither mobile nor mdAndDown is true (lg, xl)', () => {
    mockDisplay.mobile.value = false
    mockDisplay.mdAndDown.value = false
    const bp = useBreakpoint()
    expect(bp.value).toBe('web')
  })

  it('returns a computed ref (Vue reactivity is delegated to useDisplay)', () => {
    const bp = useBreakpoint()
    // The composable returns a ComputedRef — it must have a .value property.
    expect(bp).toHaveProperty('value')
    expect(typeof bp.value).toBe('string')
  })

  it('treats xs/sm as mobile when mobile alone is true but mdAndDown is false', () => {
    // Vuetify's mobile flag covers xs+sm. mdAndDown only covers ≤md.
    // If mobile is true (sm device), the composable should return 'mobile'
    // even when mdAndDown thought it was false (boundary edge case).
    mockDisplay.mobile.value = true
    mockDisplay.mdAndDown.value = false
    const bp = useBreakpoint()
    expect(bp.value).toBe('mobile')
  })

  it('returns "web" for lg/xl even when both flags are false', () => {
    mockDisplay.mobile.value = false
    mockDisplay.mdAndDown.value = false
    const bp = useBreakpoint()
    expect(bp.value).toBe('web')
  })
})
