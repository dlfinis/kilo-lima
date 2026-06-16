import type { Ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

export interface UsePwaUpdateReturn {
  needRefresh: Ref<boolean>
  offlineReady: Ref<boolean>
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
}

// Sole consumer of virtual:pwa-register/vue in the codebase. The virtual
// module ships a Vue adapter around vite-plugin-pwa's registerSW, so any
// other module that imports it directly bypasses this composable's
// contract. Future UX (install-prompt banner, update toast) calls this
// composable instead of reaching for the virtual module.
export function usePwaUpdate(): UsePwaUpdateReturn {
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(swScriptUrl) {
      // Useful when debugging install / update flow in dev.
      console.info('[pwa] service worker registered:', swScriptUrl)
    },
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed:', error)
    },
  })
  return { needRefresh, offlineReady, updateServiceWorker }
}
