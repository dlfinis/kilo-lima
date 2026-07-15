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

  // catalog-domain-refactor / Slice 3: canonical route is /productos/preparaciones
  it('/productos/preparaciones resolves to RecetasView', async () => {
    await setupRouter()
    await router.push('/productos/preparaciones')
    expect(router.currentRoute.value.path).toBe('/productos/preparaciones')
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
  })

  it('/productos/preparaciones/:id resolves to RecetaDetalleView', async () => {
    await setupRouter()
    await router.push('/productos/preparaciones/r-test-1')
    expect(router.currentRoute.value.path).toBe('/productos/preparaciones/r-test-1')
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
  })

  // catalog-domain-refactor / Slice 3: /recetas redirects to canonical /productos/preparaciones
  it('/recetas redirects to /productos/preparaciones', async () => {
    await setupRouter()
    await router.push('/recetas')
    expect(router.currentRoute.value.path).toBe('/productos/preparaciones')
  })

  // catalog-domain-refactor / Slice 3: /recetas/:id redirects preserving param
  it('/recetas/:id redirects to /productos/preparaciones/:id preserving param', async () => {
    await setupRouter()
    await router.push('/recetas/my-recipe-42')
    expect(router.currentRoute.value.path).toBe('/productos/preparaciones/my-recipe-42')
  })

  // catalog-domain-refactor / Slice 3: legacy /productos/recetas redirects
  it('/productos/recetas redirects to /productos/preparaciones', async () => {
    await setupRouter()
    await router.push('/productos/recetas')
    expect(router.currentRoute.value.path).toBe('/productos/preparaciones')
  })

  // catalog-domain-refactor / Slice 3: legacy /productos/recetas/:id redirects
  it('/productos/recetas/:id redirects to /productos/preparaciones/:id', async () => {
    await setupRouter()
    await router.push('/productos/recetas/some-recipe')
    expect(router.currentRoute.value.path).toBe('/productos/preparaciones/some-recipe')
  })

  it('/productos breadcrumb is [Inicio, Productos]', async () => {
    await setupRouter()
    await router.push('/productos')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Productos'])
  })

  // catalog-domain-refactor / Slice 3: breadcrumb uses "Preparaciones"
  it('/productos/preparaciones breadcrumb is [Inicio, Productos, Preparaciones]', async () => {
    await setupRouter()
    await router.push('/productos/preparaciones')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Productos', 'Preparaciones'])
  })

  // catalog-domain-refactor / Slice 3: detail breadcrumb
  it('/productos/preparaciones/:id breadcrumb is [Inicio, Productos, Preparaciones, Detalle]', async () => {
    await setupRouter()
    await router.push('/productos/preparaciones/some-id')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Productos', 'Preparaciones', 'Detalle'])
  })

  it('/inventario breadcrumb is [Inicio, Inventario, Materias]', async () => {
    await setupRouter()
    await router.push('/inventario')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Inventario', 'Materias'])
  })

  // inventory-tabs-redesign WU 1: nested tab route tests
  it('/inventario redirects to /inventario/materias', async () => {
    await setupRouter()
    await router.push('/inventario')
    expect(router.currentRoute.value.path).toBe('/inventario/materias')
  })

  it('/inventario/materias resolves to InventarioTab', async () => {
    await setupRouter()
    await router.push('/inventario/materias')
    expect(router.currentRoute.value.path).toBe('/inventario/materias')
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
  })

  it('/inventario/movimientos resolves to MovimientosTab', async () => {
    await setupRouter()
    await router.push('/inventario/movimientos')
    expect(router.currentRoute.value.path).toBe('/inventario/movimientos')
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
  })

  it('/inventario/compras resolves to ComprasTab', async () => {
    await setupRouter()
    await router.push('/inventario/compras')
    expect(router.currentRoute.value.path).toBe('/inventario/compras')
    expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
  })

  it('/inventario/materias breadcrumb is [Inicio, Inventario, Materias]', async () => {
    await setupRouter()
    await router.push('/inventario/materias')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Inventario', 'Materias'])
  })

  it('/inventario/movimientos breadcrumb is [Inicio, Inventario, Movimientos]', async () => {
    await setupRouter()
    await router.push('/inventario/movimientos')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Inventario', 'Movimientos'])
  })

  it('/inventario/compras breadcrumb is [Inicio, Inventario, Compras]', async () => {
    await setupRouter()
    await router.push('/inventario/compras')
    const meta = router.currentRoute.value.meta
    expect(meta.breadcrumb).toEqual(['Inicio', 'Inventario', 'Compras'])
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

describe('New feature routes (Wave 1)', () => {
  it('/ventas resolves with correct name and breadcrumb', async () => {
    await setupRouter()
    await router.push('/ventas')
    expect(router.currentRoute.value.path).toBe('/ventas')
    expect(router.currentRoute.value.name).toBe('ventas')
    expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Operación', 'Ventas'])
  })

  it('/gastos resolves with correct name and breadcrumb', async () => {
    await setupRouter()
    await router.push('/gastos')
    expect(router.currentRoute.value.path).toBe('/gastos')
    expect(router.currentRoute.value.name).toBe('gastos')
    expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Operación', 'Gastos'])
  })

  it('/costos redirects to /', async () => {
    await setupRouter()
    await router.push('/costos')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('/ajustes resolves with correct name and breadcrumb', async () => {
    await setupRouter()
    await router.push('/ajustes')
    expect(router.currentRoute.value.path).toBe('/ajustes')
    expect(router.currentRoute.value.name).toBe('ajustes')
    expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Configuración', 'Ajustes'])
  })

  it('/equipo resolves with correct name and breadcrumb', async () => {
    await setupRouter()
    await router.push('/equipo')
    expect(router.currentRoute.value.path).toBe('/equipo')
    expect(router.currentRoute.value.name).toBe('equipo')
    expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Configuración', 'Equipo'])
  })

  it('catch-all still redirects to /', async () => {
    await setupRouter()
    await router.push('/nonexistent-page-xyz')
    expect(router.currentRoute.value.path).toBe('/')
  })
})

// event-product-management-refactor: unified Gestión productos route
// + legacy redirects. /eventos/:id/gestion is the canonical surface;
// /eventos/:id/productos and /eventos/:id/planificar redirect there
// so existing bookmarks and links keep working.
describe('Event product management routes', () => {
  it('/eventos/:id/gestion resolves with name + breadcrumb', async () => {
    await setupRouter()
    await router.push('/eventos/e-42/gestion')
    expect(router.currentRoute.value.path).toBe('/eventos/e-42/gestion')
    expect(router.currentRoute.value.name).toBe('evento-gestion')
    expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'eventos', 'Gestión productos'])
  })

  it('/eventos/:id/productos redirects to /eventos/:id/gestion preserving id', async () => {
    await setupRouter()
    await router.push('/eventos/e-42/productos')
    expect(router.currentRoute.value.path).toBe('/eventos/e-42/gestion')
  })

  it('/eventos/:id/planificar redirects to /eventos/:id/gestion preserving id', async () => {
    await setupRouter()
    await router.push('/eventos/e-42/planificar')
    expect(router.currentRoute.value.path).toBe('/eventos/e-42/gestion')
  })
})

// inventory-accounting-workflow-refactor / Phase 3: Abastecimiento route.
describe('Abastecimiento route', () => {
  it('/eventos/:id/abastecimiento resolves with name + breadcrumb', async () => {
    await setupRouter()
    await router.push('/eventos/e-99/abastecimiento')
    expect(router.currentRoute.value.path).toBe('/eventos/e-99/abastecimiento')
    expect(router.currentRoute.value.name).toBe('evento-abastecimiento')
    expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'eventos', 'Abastecimiento'])
  })
})
