// REQ-UX-8: useNavegacion exposes breadcrumbs (from route.meta), the
// puedeVolver guard (history stack AND multi-crumb trail), and
// irAtras() (router.back when guard passes, router.push('/') fallback).
// Each test drives a real router with createMemoryHistory so the
// `router.options.history.state.back` semantics are exercised.
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { useNavegacion } from './useNavegacion'

interface Consumir {
  breadcrumbs: () => { title: string; to?: string; disabled?: boolean }[]
  puedeVolver: () => boolean
  irAtras: () => void
}

const renderConsumidor = (router: Router): { expuesta: Consumir } => {
  let expuesta: Consumir
  const Componente = defineComponent({
    setup() {
      const nav = useNavegacion()
      expuesta = {
        breadcrumbs: () => nav.breadcrumbs.value,
        puedeVolver: () => nav.puedeVolver.value,
        irAtras: () => nav.irAtras(),
      }
      return () => h('div')
    },
  })
  mount(Componente, { global: { plugins: [router] } })
  return { expuesta: expuesta! }
}

const mkRouter = async (
  inicial: string,
  breadcrumb?: readonly string[],
): Promise<Router> => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: { template: '<div />' },
        meta: breadcrumb ? { breadcrumb } : {},
      },
      {
        path: '/materias-primas',
        name: 'materias-primas',
        component: { template: '<div />' },
        meta: { breadcrumb: ['Inicio', 'materias-primas'] },
      },
      {
        path: '/eventos/:id',
        name: 'evento-detalle',
        component: { template: '<div />' },
        meta: { breadcrumb: ['Inicio', 'eventos', 'Detalle'] },
      },
    ],
  })
  await router.push(inicial)
  await router.isReady()
  return router
}

// Simulate the browser history stack that createWebHistory populates
// but createMemoryHistory does not. The composable reads
// `router.options.history.state.back` to decide whether the back button
// should appear (REQ-UX-2). In jsdom unit tests we mock that field.
const simularHistorialPrevio = (router: Router, rutaAnterior: string) => {
  const state = router.options.history.state as { back?: string } | null
  if (state) state.back = rutaAnterior
}

describe('useNavegacion', () => {
  beforeEach(() => {
    // No shared state — each test owns its router.
  })

  it('hides the back button on the root route (REQ-UX-2)', async () => {
    const router = await mkRouter('/')
    const { expuesta } = renderConsumidor(router)
    await nextTick()
    expect(expuesta.puedeVolver()).toBe(false)
    expect(expuesta.breadcrumbs()).toEqual([{ title: 'Inicio', to: '/' }])
  })

  it('shows the back button on a nested route (REQ-UX-2)', async () => {
    // Navigate to root, then to the nested route BEFORE mounting the
    // consumer — otherwise `route` is captured at the initial value
    // and `puedeVolver` never sees the history stack.
    const router = await mkRouter('/')
    await router.push('/materias-primas')
    await router.isReady()
    simularHistorialPrevio(router, '/')
    const { expuesta } = renderConsumidor(router)
    await nextTick()
    expect(expuesta.puedeVolver()).toBe(true)
  })

  it('irAtras calls router.back when puedeVolver is true (REQ-UX-2)', async () => {
    const router = await mkRouter('/')
    await router.push('/materias-primas')
    await router.isReady()
    simularHistorialPrevio(router, '/')
    const { expuesta } = renderConsumidor(router)
    await nextTick()
    const spy = vi.spyOn(router, 'back')
    expuesta.irAtras()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('builds breadcrumbs from route.meta.breadcrumb (REQ-UX-5, REQ-UX-6)', async () => {
    const router = await mkRouter('/eventos/abc')
    const { expuesta } = renderConsumidor(router)
    await nextTick()
    expect(expuesta.breadcrumbs()).toEqual([
      { title: 'Inicio', to: '/' },
      { title: 'Eventos', to: '/eventos' },
      { title: 'Detalle', disabled: true },
    ])
  })

  it('falls back to the Inicio breadcrumb when meta is missing (REQ-UX-8)', async () => {
    const router = await mkRouter('/', undefined)
    // Manually strip the meta on the current route to simulate
    // a route registered without breadcrumb meta.
    router.currentRoute.value.meta = {}
    const { expuesta } = renderConsumidor(router)
    await nextTick()
    expect(expuesta.breadcrumbs()).toEqual([{ title: 'Inicio', to: '/' }])
    expect(expuesta.puedeVolver()).toBe(false)
  })
})