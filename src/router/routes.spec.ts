// mobile-ux-redesign Phase 5: Route redirect tests.
import { describe, expect, it } from 'vitest'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import routes from './routes'

let router: Router

async function setupRouter() {
  router = createRouter({
    history: createWebHistory(),
    routes,
  })
  // Navigate once to initialize
  await router.push('/')
}

describe('Route redirects (Phase 5)', () => {
  it('redirects /contabilidad to /reportes/contabilidad', async () => {
    await setupRouter()
    await router.push('/contabilidad')
    expect(router.currentRoute.value.path).toBe('/reportes/contabilidad')
  })

  it('redirects /rentabilidad to /reportes/rentabilidad', async () => {
    await setupRouter()
    await router.push('/rentabilidad')
    expect(router.currentRoute.value.path).toBe('/reportes/rentabilidad')
  })

  it('/reportes route resolves to the reportes view', async () => {
    await setupRouter()
    await router.push('/reportes')
    expect(router.currentRoute.value.path).toBe('/reportes')
  })
})
