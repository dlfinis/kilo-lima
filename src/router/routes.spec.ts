import { describe, it, expect } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import routes from './routes'

// Routes are defined as a plain array — no router instance or component mount
// is needed. We assert shape (path, name, lazy component function) and that
// the existing home route + catch-all are preserved.

function encontrar(path: string): RouteRecordRaw {
  const found = routes.find(r => r.path === path)
  if (!found) throw new Error(`Route not found: ${path}`)
  return found
}

describe('routes', () => {
  describe('catalog routes', () => {
    it('registers /materias-primas with a lazy component', () => {
      const ruta = encontrar('/materias-primas')
      expect(ruta.name).toBe('materias-primas')
      expect(typeof ruta.component).toBe('function')
    })

    it('registers /recetas with a lazy component', () => {
      const ruta = encontrar('/recetas')
      expect(ruta.name).toBe('recetas')
      expect(typeof ruta.component).toBe('function')
    })

    it('registers /recetas/:id with a lazy component and :id param', () => {
      const ruta = encontrar('/recetas/:id')
      expect(ruta.name).toBe('receta-detalle')
      expect(typeof ruta.component).toBe('function')
      expect(ruta.path).toContain(':id')
    })
  })

  describe('preserved foundation routes', () => {
    it('keeps the home route at /', () => {
      const ruta = encontrar('/')
      expect(ruta.name).toBe('home')
    })

    it('keeps the catch-all redirect to /', () => {
      const ruta = encontrar('/:pathMatch(.*)*')
      expect(ruta.redirect).toBe('/')
    })
  })
})
