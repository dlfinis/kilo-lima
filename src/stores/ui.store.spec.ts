// REQ-NAV-1: ui.store provides `useMobileUx` — a computed boolean
// that reads the build-time feature flag VITE_FLAG_MOBILE_UX. When
// 'true' the App.vue shell switches from the legacy AppBar layout to
// the responsive AppLayout with BottomNav / SideNavCompact /
// SideNavFull navigation. When 'false' or absent, the legacy layout
// stays active (safe deploy-time rollback).
//
// TDD CYCLE (Strict TDD Mode):
//   RED   → This file was written before ui.store.ts existed.
//   GREEN → ui.store.ts must make ALL tests pass.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useUiStore } from './ui.store'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useUiStore', () => {
  describe('useMobileUx', () => {
    it('returns true when VITE_FLAG_MOBILE_UX is "true"', () => {
      vi.stubEnv('VITE_FLAG_MOBILE_UX', 'true')
      const store = useUiStore()
      expect(store.useMobileUx).toBe(true)
    })

    it('returns false when VITE_FLAG_MOBILE_UX is "false"', () => {
      vi.stubEnv('VITE_FLAG_MOBILE_UX', 'false')
      const store = useUiStore()
      expect(store.useMobileUx).toBe(false)
    })

    it('returns false when VITE_FLAG_MOBILE_UX is not set (undefined)', () => {
      vi.stubEnv('VITE_FLAG_MOBILE_UX', undefined)
      const store = useUiStore()
      expect(store.useMobileUx).toBe(false)
    })

    it('returns false when VITE_FLAG_MOBILE_UX is an unexpected string', () => {
      vi.stubEnv('VITE_FLAG_MOBILE_UX', 'yes')
      const store = useUiStore()
      expect(store.useMobileUx).toBe(false)
    })

    it('returns false when VITE_FLAG_MOBILE_UX is empty string', () => {
      vi.stubEnv('VITE_FLAG_MOBILE_UX', '')
      const store = useUiStore()
      expect(store.useMobileUx).toBe(false)
    })
  })
})
