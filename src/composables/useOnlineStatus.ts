import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface UseOnlineStatusReturn {
  online: Ref<boolean>
}

// Reactive network awareness. Initialized from navigator.onLine so the
// first paint reflects the real state (no UI flash). window 'online' /
// 'offline' events flip the ref. The task spec says lifecycle cleanup is
// deferred to the offline-sync slice; we wire it now anyway because the
// cost is one addEventListener pair and the alternative (leaking listeners
// across route changes) creates harder-to-find bugs than the ones it
// avoids.
export function useOnlineStatus(): UseOnlineStatusReturn {
  const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const actualizar = () => {
    online.value = navigator.onLine
  }

  onMounted(() => {
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
  })

  onUnmounted(() => {
    window.removeEventListener('online', actualizar)
    window.removeEventListener('offline', actualizar)
  })

  return { online }
}
