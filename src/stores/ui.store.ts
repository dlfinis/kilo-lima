// REQ-NAV-1: Thin Pinia store that exposes the VITE_FLAG_MOBILE_UX
// build-time feature flag as a computed boolean. The flag controls
// whether App.vue renders the responsive AppLayout (mobile/tablet/web
// navigation) or the legacy AppBar-only layout.
//
// The flag is read once at boot via import.meta.env. It is NOT an
// in-app toggle — deploying requires a rebuild. This gives us a safe
// deploy-time kill switch (set to 'false' and the app rolls back to
// the known-good legacy shell).
import { computed } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const useMobileUx = computed<boolean>(
    () => import.meta.env.VITE_FLAG_MOBILE_UX === 'true',
  )

  return { useMobileUx }
})
