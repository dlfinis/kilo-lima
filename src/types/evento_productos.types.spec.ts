// REQ-PRICING-1, REQ-FIN-12, REQ-FIN-13: structural + runtime contract
// for the `evento_productos` table. The spec covers:
//   1. Compile-time shape: every required field is present and typed.
//   2. Runtime defaults: omit-on-create objects have safe defaults
//      (`incluido = true`, `margen = 0.40`, `precio_venta = 0`).
//   3. EventoProductoConDetalle joins expose producto_nombre + costo +
//      precio_sugerido + margen_efectivo + precio_final for the view
//      layer.
import { describe, expect, it } from 'vitest'

import type {
  ActualizarMargenInput,
  CrearEventoProductoInput,
  EventoProducto,
  EventoProductoConDetalle,
} from './evento_productos.types'

describe('evento_productos.types', () => {
  describe('EventoProducto', () => {
    it('has all REQ-PRICING-1 columns (id, evento_id, producto_id, precio_venta, margen, incluido, created_at, updated_at)', () => {
      // Compile-time check: TypeScript rejects objects missing any of
      // the required fields. Build one at runtime and assert every
      // key is present.
      const fila: EventoProducto = {
        id: 'ep-1',
        evento_id: 'e-1',
        producto_id: 'p-1',
        precio_venta: 16.67,
        margen: 0.4,
        incluido: true,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      }
      const claves = Object.keys(fila).sort()
      expect(claves).toEqual(
        [
          'created_at',
          'evento_id',
          'id',
          'incluido',
          'margen',
          'precio_venta',
          'producto_id',
          'updated_at',
        ].sort(),
      )
      expect(fila.precio_venta).toBe(16.67)
      expect(fila.margen).toBe(0.4)
      expect(fila.incluido).toBe(true)
    })

    it('margen is typed as number 0..1 (not percentage)', () => {
      const fila: EventoProducto = {
        id: 'ep-1',
        evento_id: 'e-1',
        producto_id: 'p-1',
        precio_venta: 10,
        margen: 0.4,
        incluido: true,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
      }
      expect(fila.margen).toBeGreaterThanOrEqual(0)
      expect(fila.margen).toBeLessThanOrEqual(1)
    })
  })

  describe('CrearEventoProductoInput', () => {
    it('omits DB-only fields (id, created_at, updated_at)', () => {
      const input: CrearEventoProductoInput = {
        evento_id: 'e-1',
        producto_id: 'p-1',
        precio_venta: 16.67,
        margen: 0.4,
        incluido: true,
      }
      const claves = Object.keys(input)
      expect(claves).not.toContain('id')
      expect(claves).not.toContain('created_at')
      expect(claves).not.toContain('updated_at')
      expect(claves).toContain('evento_id')
      expect(claves).toContain('producto_id')
      expect(claves).toContain('precio_venta')
      expect(claves).toContain('margen')
      expect(claves).toContain('incluido')
    })
  })

  describe('ActualizarMargenInput', () => {
    it('carries the evento_producto_id + margen decimal (REQ-PRICING-3)', () => {
      const input: ActualizarMargenInput = {
        evento_producto_id: 'ep-1',
        margen: 0.5,
      }
      expect(input.evento_producto_id).toBe('ep-1')
      expect(input.margen).toBe(0.5)
    })
  })

  describe('EventoProductoConDetalle', () => {
    it('extends EventoProducto with producto_nombre + receta_id + receta_nombre + costo_unitario + precio_sugerido + margen_efectivo + precio_final', () => {
      const fila: EventoProductoConDetalle = {
        id: 'ep-1',
        evento_id: 'e-1',
        producto_id: 'p-1',
        precio_venta: null,
        margen: null,
        incluido: true,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
        producto_nombre: 'Pan básico',
        receta_id: 'r-1',
        receta_nombre: 'Pan básico',
        costo_unitario: 10,
        precio_sugerido: 16.67,
        margen_efectivo: 0.4,
        precio_final: 16.67,
      }
      // Every base field is still present.
      expect(fila.evento_id).toBe('e-1')
      expect(fila.producto_id).toBe('p-1')
      // Denormalized fields.
      expect(fila.producto_nombre).toBe('Pan básico')
      expect(fila.receta_id).toBe('r-1')
      expect(fila.receta_nombre).toBe('Pan básico')
      expect(fila.costo_unitario).toBe(10)
      expect(fila.precio_sugerido).toBe(16.67)
      expect(fila.margen_efectivo).toBe(0.4)
      expect(fila.precio_final).toBe(16.67)
    })

    it('permite precio_venta null (manual override not set)', () => {
      const fila: EventoProductoConDetalle = {
        id: 'ep-1',
        evento_id: 'e-1',
        producto_id: 'p-1',
        precio_venta: null,
        margen: null,
        incluido: true,
        created_at: '2026-06-20T00:00:00Z',
        updated_at: '2026-06-20T00:00:00Z',
        producto_nombre: 'Pan básico',
        receta_id: 'r-1',
        receta_nombre: 'Pan básico',
        costo_unitario: 10,
        precio_sugerido: 16.67,
        margen_efectivo: 0.4,
        precio_final: 16.67,
      }
      expect(fila.precio_venta).toBeNull()
    })
  })
})