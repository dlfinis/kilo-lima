// mobile-ux-redesign Phase 6: Route consolidation tests.
// Tests nested /productos routes, redirects, and breadcrumbs.
import { describe, expect, it } from 'vitest'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import routes from './routes'

let router: Router

async function setupRouter() {
  router = createRouter({
    history: createWebHistory(),
    routes,
  })
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

describe('Route consolidation (Phase 6)', () => {
  it('/productos resolves to ProductosView', async () => {
    await setupRouter()
    await router.push('/productos')
    expect(router.currentRoute.value.path).toBe('/productos')
    // The route should have a component loaded (or matched)
    expect(router.currentRoute.value.name).toBeDefined()
  })

  it('/productos/recetas resolves to RecetasView', async () => {
    await setupRouter()
    await router.push('/productos/recetas')
    expect(router.currentRoute.value.path).toBe('/productos/recetas')
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
  })

  it('/productos/recetas/:id resolves to RecetaDetalleView', async () => {
    await setupRouter()
    await router.push('/productos/recetas/r-test-1')
    expect(router.currentRoute.value.path).toBe('/productos/recetas/r-test-1')
    // Matched: ProductosLayout (parent) + RecetaDetalleView (leaf child) = 2
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
  })

  it('/materias-primas redirects to /inventario', async () => {
    await setupRouter()
    await router.push('/materias-primas')
    expect(router.currentRoute.value.path).toBe('/inventario')
  })

  it('/recetas redirects to /productos/recetas', async () => {
    await setupRouter()
    await router.push('/recetas')
    expect(router.currentRoute.value.path).toBe('/productos/recetas')
  })

  it('/recetas/:id redirects to /productos/recetas/:id preserving param', async () => {
    await setupRouter()
    await router.push('/recetas/my-recipe-42')
    expect(router.currentRoute.value.path).toBe('/productos/recetas/my-recipe-42')
  })

  it('/productos breadcrumb is [Inicio, Productos]', async () => {
    await setupRouter()
    await router.push('/productos')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Productos'])
  })

  it('/productos/recetas breadcrumb is [Inicio, Productos, Recetas]', async () => {
    await setupRouter()
    await router.push('/productos/recetas')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Productos', 'Recetas'])
  })

  it('/inventario breadcrumb is [Inicio, Inventario]', async () => {
    await setupRouter()
    await router.push('/inventario')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Inventario'])
  })

  it('/reportes breadcrumb is correct', async () => {
    await setupRouter()
    await router.push('/reportes')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Reportes', 'Resumen'])
  })

  it('/reportes/contabilidad breadcrumb is correct', async () => {
    await setupRouter()
    await router.push('/reportes/contabilidad')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Reportes', 'Contabilidad'])
  })

  it('/reportes/rentabilidad breadcrumb is correct', async () => {
    await setupRouter()
    await router.push('/reportes/rentabilidad')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Reportes', 'Rentabilidad'])
  })
})
