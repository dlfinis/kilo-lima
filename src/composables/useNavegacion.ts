// REQ-UX-8 + REQ-UX-25: navigation composable. Reads the active route
// via Vue Router, exposes:
//
//   breadcrumbs — `BreadcrumbItem[]` derived from `route.meta.breadcrumb`
//                 (delegated to the pure `resolverBreadcrumbDeMeta`).
//   puedeVolver — true when the user navigated into this route from
//                 another in-app route (history stack present) AND the
//                 breadcrumb trail has more than one crumb (otherwise
//                 there's nowhere meaningful to go back to). Direct
//                 deep-links return false so the back button stays
//                 hidden on first paint.
//   irAtras()   — calls `router.back()` when puedeVolver is true,
//                 otherwise falls back to `router.push('/')` so the
//                 global button is never a no-op.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  resolverBreadcrumbDeMeta,
  type BreadcrumbItem,
} from '@/utils/breadcrumb'

export function useNavegacion() {
  const route = useRoute()
  const router = useRouter()

  const breadcrumbs = computed<BreadcrumbItem[]>(() =>
    resolverBreadcrumbDeMeta(route.meta as { breadcrumb?: readonly string[] } | undefined),
  )

  const puedeVolver = computed<boolean>(() => {
    // Reference `route` so this computed re-evaluates on every
    // navigation — `router.options.history.state` is not a reactive
    // dependency on its own. The stack length is the actual signal.
    void route
    const stack = router.options.history.state?.back ?? null
    if (!stack) return false
    return (breadcrumbs.value.length ?? 0) > 1
  })

  function irAtras(): void {
    if (puedeVolver.value) {
      router.back()
    } else {
      void router.push('/')
    }
  }

  return { breadcrumbs, puedeVolver, irAtras }
}