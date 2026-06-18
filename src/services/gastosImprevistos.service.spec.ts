// REQ-POS-37, REQ-POS-38, REQ-POS-39, REQ-POS-44, REQ-POS-52,
// REQ-POS-53, REQ-POS-56: gastosImprevistos service contract —
// factory pattern (OCP/DIP), never-throw. Per-evento CRUD plus
// `actualizar` (the production POS UI only uses crear/eliminar but
// the service stays symmetric with gastosFijos for future slices).
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { GastoImprevisto, GastoImprevistoInput } from '@/types'
import { crearGastosImprevistosService } from './gastosImprevistos.service'

const mkGasto = (id: string, overrides: Partial<GastoImprevisto> = {}): GastoImprevisto => ({
  id,
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  created_at: '2026-06-19T11:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<GastoImprevistoInput> = {}): GastoImprevistoInput => ({
  evento_id: 'e-1',
  monto: 50,
  motivo: 'Compramos más vasos',
  categoria: 'insumos_extra',
  ...overrides,
})

const makeService = () => crearGastosImprevistosService(createClient('http://x', 'anon'))

describe('crearGastosImprevistosService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listarPorEvento', () => {
    it('scopes the query to evento_id (REQ-POS-37)', async () => {
      __pushSupabaseResponse<GastoImprevisto[]>({
        data: [mkGasto('gi-1'), mkGasto('gi-2', { monto: 20 })],
        error: null,
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toHaveLength(2)
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.some((l) => l.metodo === 'from' && l.args[0] === 'gastos_imprevistos')).toBe(
        true,
      )
      const eq = llamadas.find((l) => l.metodo === 'eq')
      expect(eq?.args).toEqual(['evento_id', 'e-1'])
    })

    it('returns { data: null, error } on supabase failure (REQ-POS-42)', async () => {
      __pushSupabaseResponse<GastoImprevisto[]>({
        data: null,
        error: { code: 'PGRST301', message: 'connection refused' },
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST301')
    })
  })

  describe('crear', () => {
    it('inserts the new gasto (REQ-POS-37)', async () => {
      const creado = mkGasto('gi-new', { monto: 75, motivo: 'Taxi al venue' })
      __pushSupabaseResponse<GastoImprevisto>({ data: creado, error: null })

      const { data, error } = await makeService().crear(
        mkInput({ monto: 75, motivo: 'Taxi al venue', categoria: 'transporte' }),
      )

      expect(error).toBeNull()
      expect(data).toEqual(creado)
      const insercion = __getSupabaseMockCalls().find((l) => l.metodo === 'insert')
      expect(insercion?.args[0]).toEqual(
        expect.objectContaining({ evento_id: 'e-1', monto: 75, motivo: 'Taxi al venue' }),
      )
    })

    it('passes through supabase errors unchanged (REQ-POS-53)', async () => {
      __pushSupabaseResponse<GastoImprevisto>({
        data: null,
        error: { code: '42501', message: 'RLS violation' },
      })

      const { data, error } = await makeService().crear(mkInput())

      expect(data).toBeNull()
      expect(error?.code).toBe('42501')
    })
  })

  describe('actualizar', () => {
    it('updates the gasto row (REQ-POS-37)', async () => {
      const actualizado = mkGasto('gi-1', { monto: 80, motivo: 'Reparación urgente' })
      __pushSupabaseResponse<GastoImprevisto>({ data: actualizado, error: null })

      const { data, error } = await makeService().actualizar('gi-1', {
        ...mkInput(),
        monto: 80,
        motivo: 'Reparación urgente',
      })

      expect(error).toBeNull()
      expect(data?.monto).toBe(80)
      const update = __getSupabaseMockCalls().find((l) => l.metodo === 'update')
      expect(update?.args[0]).toEqual(
        expect.objectContaining({ monto: 80, motivo: 'Reparación urgente' }),
      )
    })
  })

  describe('eliminar', () => {
    it('deletes the gasto (REQ-POS-37)', async () => {
      __pushSupabaseResponse<null>({ data: null, error: null })

      const { data, error } = await makeService().eliminar('gi-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.map((l) => l.metodo)).toEqual(['from', 'delete', 'eq'])
    })
  })
})