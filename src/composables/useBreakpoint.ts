// REQ-NAV-1: Thin wrapper around Vuetify's useDisplay() that normalises
// the multi-value responsive API into a stable three-value enum:
//   mobile  → display.mobile.value === true  (xs, sm)
//   tablet  → display.mdAndDown.value && !mobile
//   web     → everything else (lg, xl)
//
// Vuetify's display breakpoints: xs < 600, sm >= 600, md >= 960,
// lg >= 1280, xl >= 1920. `mobile` is xs + sm; `mdAndDown` is
// everything ≤ md. By nesting `mobile` first we guarantee that xs/sm
// always evaluate as 'mobile' regardless of the mdAndDown value.
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

export type Breakpoint = 'mobile' | 'tablet' | 'web'

export function useBreakpoint() {
  const display = useDisplay()

  return computed<Breakpoint>(() => {
    if (display.mobile.value) return 'mobile'
    if (display.mdAndDown.value) return 'tablet'
    return 'web'
  })
}
