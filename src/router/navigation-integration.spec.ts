// Phase 6: Route Consolidation — Navigation Integration Tests
// Tests the full navigation flow across all consolidated routes.
import { describe, expect, it, beforeEach } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import routes from './routes'

describe('Navigation Integration (Phase 6)', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    router = createRouter({
      history: createMemoryHistory(),
      routes,
    })
    await router.push('/')
    await router.isReady()
  })

  describe('Main navigation flow (5 bottom nav items)', () => {
    it('navigates Home → Pos → Productos → Inventario → Reportes', async () => {
      // Home
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/')

      // Pos
      await router.push('/pos')
      expect(router.currentRoute.value.path).toBe('/pos')

      // Productos
      await router.push('/productos')
      expect(router.currentRoute.value.path).toBe('/productos')

      // Inventario
      await router.push('/inventario')
      expect(router.currentRoute.value.path).toBe('/inventario')

      // Reportes
      await router.push('/reportes')
      expect(router.currentRoute.value.path).toBe('/reportes')
    })

    it('bottom nav items resolve to correct named routes', async () => {
      await router.push('/')
      expect(router.currentRoute.value.name).toBe('home')

      await router.push('/pos')
      expect(router.currentRoute.value.name).toBe('pos')

      await router.push('/productos')
      expect(router.currentRoute.value.name).toBe('productos')

      await router.push('/inventario')
      expect(router.currentRoute.value.name).toBe('inventario')

      await router.push('/reportes')
      // The default child of /reportes is the resumen view
      expect(router.currentRoute.value.name).toBe('reportes-resumen')
    })
  })

  describe('Nested navigation under /productos', () => {
    // catalog-domain-refactor / Slice 3: canonical path is /productos/preparaciones
    it('navigates Productos → Preparaciones → Preparación detalle', async () => {
      // Productos (default child)
      await router.push('/productos')
      expect(router.currentRoute.value.path).toBe('/productos')
      expect(router.currentRoute.value.name).toBe('productos')

      // Preparaciones (canonical route; named 'recetas' for backward compat)
      await router.push('/productos/preparaciones')
      expect(router.currentRoute.value.path).toBe('/productos/preparaciones')
      expect(router.currentRoute.value.name).toBe('recetas')

      // Preparación detalle (canonical; named 'receta-detalle' for backward compat)
      await router.push('/productos/preparaciones/r-1')
      expect(router.currentRoute.value.path).toBe('/productos/preparaciones/r-1')
      expect(router.currentRoute.value.name).toBe('receta-detalle')
    })

    it('/productos layout renders child route via ProductosLayout', async () => {
      await router.push('/productos')
      // The route should have matched a parent layout + child
      expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
    })

    // catalog-domain-refactor / Slice 3: use canonical path
    it('/productos/preparaciones layout renders child route via ProductosLayout', async () => {
      await router.push('/productos/preparaciones')
      expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
    })

    it('/productos/preparaciones/:id layout renders child route via ProductosLayout', async () => {
      await router.push('/productos/preparaciones/r-1')
      expect(router.currentRoute.value.matched.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Legacy route redirects', () => {
    it('/materias-primas redirects to /inventario', async () => {
      await router.push('/materias-primas')
      expect(router.currentRoute.value.path).toBe('/inventario')
    })

    // catalog-domain-refactor / Slice 3: /recetas redirects to canonical path
    it('/recetas redirects to /productos/preparaciones', async () => {
      await router.push('/recetas')
      expect(router.currentRoute.value.path).toBe('/productos/preparaciones')
    })

    // catalog-domain-refactor / Slice 3: /recetas/:id redirects to canonical path
    it('/recetas/:id redirects to /productos/preparaciones/:id', async () => {
      await router.push('/recetas/old-recipe-99')
      expect(router.currentRoute.value.path).toBe('/productos/preparaciones/old-recipe-99')
    })

    it('/contabilidad redirects to /reportes/contabilidad', async () => {
      await router.push('/contabilidad')
      expect(router.currentRoute.value.path).toBe('/reportes/contabilidad')
    })

    it('/rentabilidad redirects to /reportes/rentabilidad', async () => {
      await router.push('/rentabilidad')
      expect(router.currentRoute.value.path).toBe('/reportes/rentabilidad')
    })
  })

  describe('Breadcrumb metadata', () => {
    it('/productos breadcrumb is [Inicio, Productos]', async () => {
      await router.push('/productos')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Productos'])
    })

    // catalog-domain-refactor / Slice 3: breadcrumb uses "Preparaciones"
    it('/productos/preparaciones breadcrumb is [Inicio, Productos, Preparaciones]', async () => {
      await router.push('/productos/preparaciones')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Productos', 'Preparaciones'])
    })

    // catalog-domain-refactor / Slice 3: detail breadcrumb
    it('/productos/preparaciones/:id breadcrumb is [Inicio, Productos, Preparaciones, Detalle]', async () => {
      await router.push('/productos/preparaciones/r-1')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Productos', 'Preparaciones', 'Detalle'])
    })

    it('/inventario breadcrumb is [Inicio, Inventario]', async () => {
      await router.push('/inventario')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Inventario'])
    })

    it('/reportes breadcrumb is [Inicio, Reportes, Resumen]', async () => {
      await router.push('/reportes')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Reportes', 'Resumen'])
    })

    it('/reportes/contabilidad breadcrumb is [Inicio, Reportes, Contabilidad]', async () => {
      await router.push('/reportes/contabilidad')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Reportes', 'Contabilidad'])
    })

    it('/reportes/rentabilidad breadcrumb is [Inicio, Reportes, Rentabilidad]', async () => {
      await router.push('/reportes/rentabilidad')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Reportes', 'Rentabilidad'])
    })

    it('/ breadcrumb is [Inicio]', async () => {
      await router.push('/')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio'])
    })
  })

  describe('Route name backward compatibility', () => {
    it('named route "productos" resolves from router', async () => {
      const route = router.resolve({ name: 'productos' })
      expect(route.name).toBe('productos')
      expect(route.path).toBe('/productos')
    })

    // catalog-domain-refactor / Slice 3: named route 'recetas' resolves
    // to canonical path /productos/preparaciones
    it('named route "recetas" resolves from router', async () => {
      const route = router.resolve({ name: 'recetas' })
      expect(route.name).toBe('recetas')
      expect(route.path).toBe('/productos/preparaciones')
    })

    // catalog-domain-refactor / Slice 3: named route 'receta-detalle'
    // resolves to canonical path /productos/preparaciones/:id
    it('named route "receta-detalle" resolves from router', async () => {
      const route = router.resolve({ name: 'receta-detalle', params: { id: 'r-1' } })
      expect(route.name).toBe('receta-detalle')
      expect(route.path).toBe('/productos/preparaciones/r-1')
    })

    it('named route "inventario" resolves from router', async () => {
      const route = router.resolve({ name: 'inventario' })
      expect(route.name).toBe('inventario')
      expect(route.path).toBe('/inventario')
    })
  })

  describe('WebSidebar routes (Wave 1)', () => {
    it('navigates to /ventas via WebSidebar click-through', async () => {
      await router.push('/ventas')
      expect(router.currentRoute.value.path).toBe('/ventas')
      expect(router.currentRoute.value.name).toBe('ventas')
      expect(router.currentRoute.value.meta.breadcrumb).toEqual(['Inicio', 'Operación', 'Ventas'])
    })

    it('navigates to /gastos via WebSidebar click-through', async () => {
      await router.push('/gastos')
      expect(router.currentRoute.value.path).toBe('/gastos')
      expect(router.currentRoute.value.name).toBe('gastos')
    })

    it('/costos redirects to / (deprecated route removed)', async () => {
      await router.push('/costos')
      expect(router.currentRoute.value.path).toBe('/')
    })

    it('navigates to /ajustes via WebSidebar click-through', async () => {
      await router.push('/ajustes')
      expect(router.currentRoute.value.path).toBe('/ajustes')
      expect(router.currentRoute.value.name).toBe('ajustes')
    })

    it('navigates to /equipo via WebSidebar click-through', async () => {
      await router.push('/equipo')
      expect(router.currentRoute.value.path).toBe('/equipo')
      expect(router.currentRoute.value.name).toBe('equipo')
    })
  })
})
