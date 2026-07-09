// REQ-NAV-X: Sidebar rail toggle composable with localStorage persistence.
// Module-level ref acts as a singleton shared across the entire app.
//
// TDD CYCLE (Strict TDD Mode):
//   RED   → This file was written before useSidebarRail.ts existed.
//   GREEN → useSidebarRail.ts must make ALL tests pass.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'kilo-lima:sidebar-rail'

describe('useSidebarRail', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('starts with rail = false when localStorage is empty', async () => {
    // Dynamic import to force a fresh module after localStorage.clear()
    const { useSidebarRail } = await import('./useSidebarRail')
    const { rail } = useSidebarRail()
    expect(rail.value).toBe(false)
  })

  it('toggle() flips rail from false to true', async () => {
    localStorage.clear()
    const { useSidebarRail } = await import('./useSidebarRail')
    const { rail, toggle } = useSidebarRail()
    expect(rail.value).toBe(false)
    toggle()
    expect(rail.value).toBe(true)
  })

  it('toggle() flips rail from true to false', async () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    const { useSidebarRail } = await import('./useSidebarRail')
    const { rail, toggle } = useSidebarRail()
    expect(rail.value).toBe(true)
    toggle()
    expect(rail.value).toBe(false)
  })

  it('persists rail = true to localStorage after toggle()', async () => {
    localStorage.clear()
    const { useSidebarRail } = await import('./useSidebarRail')
    const { toggle } = useSidebarRail()
    toggle()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('persists rail = false to localStorage after toggle() back', async () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    const { useSidebarRail } = await import('./useSidebarRail')
    const { toggle } = useSidebarRail()
    toggle()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('reads initial state from localStorage when set to true', async () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    const { useSidebarRail } = await import('./useSidebarRail')
    const { rail } = useSidebarRail()
    expect(rail.value).toBe(true)
  })

  it('returns the same ref instance across multiple calls (singleton)', async () => {
    localStorage.clear()
    const { useSidebarRail } = await import('./useSidebarRail')
    const a = useSidebarRail()
    const b = useSidebarRail()
    expect(a.rail).toBe(b.rail)
    a.toggle()
    expect(b.rail.value).toBe(true)
  })
})
