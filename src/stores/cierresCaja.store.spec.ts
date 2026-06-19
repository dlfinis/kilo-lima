// REQ-POS-32, REQ-POS-33, REQ-POS-35, REQ-POS-36, REQ-POS-44,
// REQ-POS-52, REQ-POS-53, REQ-POS-55, REQ-POS-56: cierresCaja store
// full implementation. PR1 shipped the reactive state shape;
// PR4 wires cargarPorEvento, listarPorEvento, buscarPorEvento, and
// registrarCierre (insert + eventsService.cambiarEstado).
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  __getSupabaseMockCalls,
  __pushSupabaseResponse,
  __resetSupabaseMock,
} from '../../tests/setup'
import type { CierreCaja, CierreCajaInput, Database, Evento } from '@/types'
import { useCierresCajaStore } from './cierresCaja.store'
import { useEventsStore } from './events.store'

let aplicacion: App

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function conContexto<T>(callback: () => T): T {
  return aplicacion.runWithContext(callback)
}

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

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria',
  fecha: '2026-07-15',
  fecha_fin: null,
  margen_ganancia: null,
  ubicacion: 'Plaza',
  estado: 'en_curso',
  notas: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
  ...overrides,
})

describe('useCierresCajaStore', () => {
  it('starts with null cierre, cargando=false, error=null (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useCierresCajaStore()
      expect(store.cierre).toBeNull()
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento fetches the cierre for the evento (REQ-POS-30)', async () => {
    __pushSupabaseResponse<CierreCaja>({ data: mkCierre(), error: null })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      await store.cargarPorEvento('e-1')

      expect(store.cierre?.id).toBe('cc-1')
      expect(store.cargando).toBe(false)
      expect(store.error).toBeNull()
    })
  })

  it('cargarPorEvento sets cierre=null when nothing exists (REQ-POS-33 retroactive)', async () => {
    __pushSupabaseResponse<CierreCaja>({ data: null, error: null })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      await store.cargarPorEvento('e-1')

      expect(store.cierre).toBeNull()
      expect(store.error).toBeNull()
    })
  })

  it('buscarPorEvento surfaces supabase errors in Spanish (REQ-POS-53)', async () => {
    __pushSupabaseResponse<CierreCaja>({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      await store.buscarPorEvento('e-1')

      expect(store.error).toMatch(/Error al cargar/)
    })
  })

  it('listarPorEvento picks up the most recent cierre (REQ-POS-36)', async () => {
    __pushSupabaseResponse<CierreCaja[]>({
      data: [mkCierre({ id: 'cc-recent' }), mkCierre({ id: 'cc-old' })],
      error: null,
    })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      await store.listarPorEvento('e-1')

      expect(store.cierre?.id).toBe('cc-recent')
    })
  })

  it('registrarCierre inserts the snapshot and returns it (REQ-POS-32)', async () => {
    const creado = mkCierre({ id: 'cc-new' })
    __pushSupabaseResponse<CierreCaja>({ data: creado, error: null })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      const resultado = await store.registrarCierre(mkInput())

      expect(resultado.error).toBeNull()
      expect(store.cierre?.id).toBe('cc-new')
      const insercion = __getSupabaseMockCalls().find((l) => l.metodo === 'insert')
      expect(insercion?.args[0]).toEqual(expect.objectContaining({ evento_id: 'e-1' }))
    })
  })

  it('registrarCierre surfaces DUPLICATE_CIERRE (REQ-POS-35)', async () => {
    __pushSupabaseResponse<CierreCaja>({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      const resultado = await store.registrarCierre(mkInput())

      expect(resultado.error?.code).toBe('DUPLICATE_CIERRE')
      expect(store.error).toMatch(/Ya existe un cierre/)
    })
  })

  it('registrarCierre drives en_curso → cerrado when evento is en_curso (REQ-POS-33)', async () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { estado: 'en_curso' }))
    })
    const creado = mkCierre({ id: 'cc-new' })
    const transicionado = mkEvento('e-1', { estado: 'cerrado' })
    __pushSupabaseResponse<CierreCaja>({ data: creado, error: null })
    __pushSupabaseResponse<Evento>({ data: transicionado, error: null })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      const resultado = await store.registrarCierre(mkInput())

      expect(resultado.error).toBeNull()
      const events = useEventsStore()
      const evento = events.eventos.find((e) => e.id === 'e-1')
      expect(evento?.estado).toBe('cerrado')
    })
  })

  it('registrarCierre skips estado transition when evento is already cerrado (REQ-POS-33 retroactive)', async () => {
    conContexto(() => {
      const events = useEventsStore()
      events.eventos.push(mkEvento('e-1', { estado: 'cerrado' }))
    })
    const creado = mkCierre({ id: 'cc-new' })
    __pushSupabaseResponse<CierreCaja>({ data: creado, error: null })

    await conContexto(async () => {
      const store = useCierresCajaStore()
      const resultado = await store.registrarCierre(mkInput())

      expect(resultado.error).toBeNull()
      // No events update call should have fired.
      const update = __getSupabaseMockCalls().find(
        (l) => l.metodo === 'update' && JSON.stringify(l.args[0] ?? {}).includes('cerrado'),
      )
      expect(update).toBeUndefined()
    })
  })

  it('limpiar resets cierre and error (REQ-POS-44)', () => {
    conContexto(() => {
      const store = useCierresCajaStore()
      store.cierre = mkCierre()
      store.error = 'something'
      store.limpiar()
      expect(store.cierre).toBeNull()
      expect(store.error).toBeNull()
    })
  })
})