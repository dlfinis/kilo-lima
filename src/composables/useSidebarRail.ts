// REQ-NAV-X: Sidebar rail toggle composable with localStorage persistence.
// Module-level ref acts as a singleton shared across the entire app.
// When rail is true the sidebar collapses to icon-only mode (72px).
// When rail is false the sidebar is fully expanded (240px with labels).
import { ref, watch } from 'vue'

const STORAGE_KEY = 'kilo-lima:sidebar-rail'

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const rail = ref(readInitial())

if (typeof window !== 'undefined') {
  watch(rail, (value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      // ignore quota or private-browsing errors
    }
  }, { flush: 'sync' })
}

export function useSidebarRail() {
  function toggle(): void {
    rail.value = !rail.value
  }
  return { rail, toggle }
}
