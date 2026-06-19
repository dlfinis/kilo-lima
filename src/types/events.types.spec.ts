// REQ-EVENTS-31, REQ-EVENTS-32: events domain types compile correctly
// and resolve all imports from @/types. Verifies the Spanish domain
// surface (EstadoEvento, CategoriaGasto, Evento, EventoInput, GastoFijo,
// GastoFijoInput, PlanProduccion, PlanProduccionInput, ProyeccionResultado,
// DesgloseFijo, DesgloseVariable) is importable and *Input variants
// exclude the DB-only fields (id, created_at, updated_at).
import { describe, expect, it } from 'vitest'
import type {
  CategoriaGasto,
  DesgloseFijo,
  DesgloseVariable,
  Evento,
  EventoInput,
  GastoFijo,
  GastoFijoInput,
  MateriaPrima,
  PlanProduccion,
  PlanProduccionInput,
  ProyeccionResultado,
  Receta,
} from '@/types'

const mkEvento = (overrides: Partial<Evento> = {}): Evento => ({
  id: 'e-1',
  nombre: 'Feria del Sol',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza Central',
  estado: 'planificacion',
  notas: null,
  created_at: '2026-06-18T00:00:00Z',
  updated_at: '2026-06-18T00:00:00Z',
  ...overrides,
})

describe('events.types surface', () => {
  it('EstadoEvento and CategoriaGasto literal unions are exhaustive (REQ-EVENTS-5, REQ-EVENTS-12)', () => {
    const estados: Evento['estado'][] = ['planificacion', 'en_curso', 'cerrado']
    expect(estados).toHaveLength(3)
    const categorias: CategoriaGasto[] = [
      'renta',
      'transporte',
      'permisos',
      'publicidad',
      'servicios',
      'otro',
    ]
    expect(categorias).toHaveLength(6)
  })

  it('Evento carries every SQL column (REQ-EVENTS-31)', () => {
    const evento = mkEvento()
    expect(evento.id).toBe('e-1')
    expect(evento.nombre).toBe('Feria del Sol')
    expect(evento.fecha).toBe('2026-07-15')
    expect(evento.fecha_fin).toBeNull()
    expect(evento.margen_ganancia).toBeNull()
    expect(evento.ubicacion).toBe('Plaza Central')
    expect(evento.estado).toBe('planificacion')
    expect(evento.notas).toBeNull()
    expect(evento.created_at).toMatch(/^2026-/)
    expect(evento.updated_at).toMatch(/^2026-/)
  })

  it('Evento accepts multi-day range when fecha_fin is set (REQ-FIN-1, REQ-FIN-2)', () => {
    const evento = mkEvento({ fecha: '2026-07-15', fecha_fin: '2026-07-22' })
    expect(evento.fecha).toBe('2026-07-15')
    expect(evento.fecha_fin).toBe('2026-07-22')
  })

  it('Evento carries margen_ganancia as decimal (0..1) (REQ-FIN, PD-1)', () => {
    const evento = mkEvento({ margen_ganancia: 0.4 })
    expect(evento.margen_ganancia).toBeCloseTo(0.4, 4)
  })

  it('EventoInput excludes id, created_at, updated_at (REQ-EVENTS-31)', () => {
    const input: EventoInput = {
      nombre: 'Feria del Sol',
      fecha: '2026-07-15',
      fecha_fin: null,
      margen_ganancia: 0.4,
      ubicacion: 'Plaza Central',
      estado: 'planificacion',
      notas: null,
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
    expect(input).not.toHaveProperty('updated_at')
    // New Fase 1 fields are writable through EventoInput.
    expect(input.fecha_fin).toBeNull()
    expect(input.margen_ganancia).toBe(0.4)
  })

  it('GastoFijo + GastoFijoInput exclude id and created_at only (REQ-EVENTS-31)', () => {
    const gasto: GastoFijo = {
      id: 'g-1',
      evento_id: 'e-1',
      categoria: 'renta',
      monto: 500,
      descripcion: 'Alquiler',
      created_at: '2026-06-18T00:00:00Z',
    }
    expect(gasto.categoria).toBe('renta')
    const input: GastoFijoInput = {
      evento_id: 'e-1',
      categoria: 'renta',
      monto: 500,
      descripcion: 'Alquiler',
    }
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
  })

  it('PlanProduccion + PlanProduccionInput exclude id and created_at (REQ-EVENTS-31)', () => {
    const fila: PlanProduccion = {
      id: 'pp-1',
      evento_id: 'e-1',
      receta_id: 'r-1',
      unidades_a_producir: 24,
      created_at: '2026-06-18T00:00:00Z',
    }
    const input: PlanProduccionInput = {
      evento_id: 'e-1',
      receta_id: 'r-1',
      unidades_a_producir: 24,
    }
    expect(fila.id).toBe('pp-1')
    expect(fila.receta_id).toBe('r-1')
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('created_at')
  })

  it('ProyeccionResultado carries fijos + variables + lineas + breakdowns (REQ-EVENTS-20, REQ-EVENTS-22)', () => {
    const proyeccion: ProyeccionResultado = {
      costosFijos: 800,
      costosVariables: 150,
      costoTotal: 950,
      lineas: [
        {
          recetaId: 'r-1',
          recetaNombre: 'Pan de muerto',
          unidades: 10,
          costoPorUnidad: 1.5,
          costoLinea: 15,
        },
      ],
      desgloseFijos: [{ gastoId: 'g-1', categoria: 'renta', monto: 800, descripcion: 'Alquiler' }],
      desgloseVariables: [{ recetaId: 'r-1', recetaNombre: 'Pan de muerto', costoLinea: 15 }],
    }
    expect(proyeccion.costoTotal).toBe(950)
    expect(proyeccion.desgloseFijos[0]?.categoria).toBe('renta')
    expect(proyeccion.desgloseVariables[0]?.costoLinea).toBe(15)
  })

  it('DesgloseFijo and DesgloseVariable mirror their SQL counterparts (REQ-EVENTS-20)', () => {
    const fijo: DesgloseFijo = {
      gastoId: 'g-1',
      categoria: 'servicios',
      monto: 50,
      descripcion: 'Luz',
    }
    const variable: DesgloseVariable = {
      recetaId: 'r-1',
      recetaNombre: 'Galleta',
      costoLinea: 30,
    }
    expect(fijo.categoria).toBe('servicios')
    expect(variable.costoLinea).toBe(30)
  })

  it('Reuses MateriaPrima and Receta from catalog (REQ-EVENTS-32)', () => {
    const mp: MateriaPrima = {
      id: 'mp-1',
      nombre: 'Harina',
      unidad: 'kg',
      costo_por_unidad: 2.5,
      notas: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const receta: Receta = {
      id: 'r-1',
      nombre: 'Pan',
      descripcion: null,
      rendimiento_unidades: 4,
      notas: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(mp.unidad).toBe('kg')
    expect(receta.rendimiento_unidades).toBe(4)
  })
})
