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
//
// Reactivity note: `router.options.history.state` is a plain object
// property — not tracked by Vue's reactivity — so the computed uses a
// watch on `route` to mirror the latest `state.back` into a ref.
import { computed, ref, watch } from 'vue'
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

  const stackBack = ref<string | null>(
    (router.options.history.state?.back as string | undefined) ?? null,
  )

  watch(
    () => route.fullPath,
    () => {
      stackBack.value = (router.options.history.state?.back as string | undefined) ?? null
    },
    { immediate: true },
  )

  const puedeVolver = computed<boolean>(() => {
    if (!stackBack.value) return false
    return breadcrumbs.value.length > 1
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