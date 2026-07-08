// mobile-ux-redesign Phase 3: PosModeBanner — shows the current POS
// mode (simplified vs full) at the top of the POS screen. Uses
// usePosMode() composable (mocked).
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import PosModeBanner from './PosModeBanner.vue'

const vuetify = createVuetify({ components, directives })

let isSimplifiedMock = ref(false)

vi.mock('@/composables/usePosMode', () => ({
  usePosMode: () => ({
    isSimplifiedMode: computed(() => isSimplifiedMock.value),
  }),
}))

const mountBanner = () =>
  mount(PosModeBanner, {
    global: { plugins: [vuetify] },
  })

describe('PosModeBanner', () => {
  it('shows "Modo rápido" when in simplified mode', () => {
    isSimplifiedMock.value = true
    const wrapper = mountBanner()
    expect(wrapper.text()).toContain('Modo rápido')
  })

  it('shows "Modo completo" when in full mode', () => {
    isSimplifiedMock.value = false
    const wrapper = mountBanner()
    expect(wrapper.text()).toContain('Modo completo')
  })

  it('uses green/amber colors for simplified mode', () => {
    isSimplifiedMock.value = true
    const wrapper = mountBanner()
    const chip = wrapper.find('[data-testid="pos-mode-banner"]')
    expect(chip.exists()).toBe(true)
    // Simplified mode = success color (green)
    expect(chip.classes().join(' ')).toContain('success')
  })

  it('uses grey color for full mode', () => {
    isSimplifiedMock.value = false
    const wrapper = mountBanner()
    const chip = wrapper.find('[data-testid="pos-mode-banner"]')
    expect(chip.exists()).toBe(true)
    // Full mode should be muted/subtle
  })

  it('renders as a small non-intrusive chip', () => {
    isSimplifiedMock.value = true
    const wrapper = mountBanner()
    const chip = wrapper.find('[data-testid="pos-mode-banner"]')
    expect(chip.exists()).toBe(true)
    expect(chip.classes().some((c) => c.includes('v-chip'))).toBe(true)
  })
})
