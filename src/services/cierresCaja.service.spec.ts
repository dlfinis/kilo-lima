// REQ-POS-32, REQ-POS-33, REQ-POS-35, REQ-POS-36, REQ-POS-44,
// REQ-POS-52, REQ-POS-53, REQ-POS-56: cierresCaja service contract —
// factory pattern (OCP/DIP), never-throw. Cierres are immutable
// snapshots (REQ-POS-32): only listarPorEvento, buscarPorEvento, and
// registrar. UNIQUE(evento_id) → DUPLICATE_CIERRE (REQ-POS-35).
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { CierreCaja, CierreCajaInput } from '@/types'
import { crearCierresCajaService } from './cierresCaja.service'

const mkCierre = (overrides: Partial<CierreCaja> = {}): CierreCaja => ({
  id: 'cc-1',
  evento_id: 'e-1',
  fecha_cierre: '2026-06-19T20:00:00Z',
  total_ventas: 100,
  total_gastos_fijos: 30,
  total_gastos_imprevistos: 20,
  utilidad_bruta: 50,
  efectivo_esperado: null,
  efectivo_real: null,
  diferencia: null,
  notas: null,
  created_at: '2026-06-19T20:00:00Z',
  ...overrides,
})

const mkInput = (overrides: Partial<CierreCajaInput> = {}): CierreCajaInput => ({
  evento_id: 'e-1',
  total_ventas: 100,
  total_gastos_fijos: 30,
  total_gastos_imprevistos: 20,
  utilidad_bruta: 50,
  efectivo_esperado: null,
  efectivo_real: null,
  diferencia: null,
  notas: null,
  ...overrides,
})

const makeService = () => crearCierresCajaService(createClient('http://x', 'anon'))

describe('crearCierresCajaService', () => {
  beforeEach(() => {
    __resetSupabaseMock()
  })

  describe('listarPorEvento', () => {
    it('scopes the query to evento_id (REQ-POS-36)', async () => {
      __pushSupabaseResponse<CierreCaja[]>({
        data: [mkCierre()],
        error: null,
      })

      const { data, error } = await makeService().listarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      const llamadas = __getSupabaseMockCalls()
      expect(llamadas.some((l) => l.metodo === 'from' && l.args[0] === 'cierres_caja')).toBe(true)
      const eq = llamadas.find((l) => l.metodo === 'eq')
      expect(eq?.args).toEqual(['evento_id', 'e-1'])
    })
  })

  describe('buscarPorEvento', () => {
    it('returns the cierre row for the evento (REQ-POS-30)', async () => {
      __pushSupabaseResponse<CierreCaja>({ data: mkCierre(), error: null })

      const { data, error } = await makeService().buscarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data?.evento_id).toBe('e-1')
    })

    it('returns null data when no cierre exists (REQ-POS-33 retroactive)', async () => {
      __pushSupabaseResponse<CierreCaja>({ data: null, error: null })

      const { data, error } = await makeService().buscarPorEvento('e-1')

      expect(error).toBeNull()
      expect(data).toBeNull()
    })
  })

  describe('registrar', () => {
    it('inserts the cierre snapshot (REQ-POS-32)', async () => {
      const creado = mkCierre({ id: 'cc-new' })
      __pushSupabaseResponse<CierreCaja>({ data: creado, error: null })

      const { data, error } = await makeService().registrar(mkInput())

      expect(error).toBeNull()
      expect(data).toEqual(creado)
      const insercion = __getSupabaseMockCalls().find((l) => l.metodo === 'insert')
      expect(insercion?.args[0]).toEqual(
        expect.objectContaining({
          evento_id: 'e-1',
          total_ventas: 100,
          utilidad_bruta: 50,
        }),
      )
    })

    it('maps UNIQUE(evento_id) violation to DUPLICATE_CIERRE (REQ-POS-35)', async () => {
      __pushSupabaseResponse<CierreCaja>({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })

      const { data, error } = await makeService().registrar(mkInput())

      expect(data).toBeNull()
      expect(error?.code).toBe('DUPLICATE_CIERRE')
      expect(error?.message).toMatch(/Ya existe un cierre/)
    })

    it('passes other errors through unchanged (REQ-POS-53)', async () => {
      __pushSupabaseResponse<CierreCaja>({
        data: null,
        error: { code: '42501', message: 'RLS violation' },
      })

      const { data, error } = await makeService().registrar(mkInput())

      expect(data).toBeNull()
      expect(error?.code).toBe('42501')
    })
  })
})