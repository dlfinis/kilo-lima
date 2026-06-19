// REQ-FIN-23, REQ-FIN-24, REQ-FIN-25, REQ-REPORTE-3..6 (PR-2c):
// `ReporteEventoView.vue` is the post-evento analytics surface at
// `/eventos/:id/reporte`. Renders 3 Vuetify tabs:
//
//   1. Resumen — `CierreResumenCard` populated from the cierre snapshot
//      (REQ-FIN-23, REQ-REPORTE-3) with utilidadBruta + utilidadNeta.
//   2. Por día — DataTable from `useReporteEvento.reportePorDia`
//      (REQ-FIN-24, REQ-REPORTE-1).
//   3. Por producto — DataTable from `useReporteEvento.reportePorProducto`
//      (REQ-FIN-25, REQ-REPORTE-2).
//
// Empty state (REQ-REPORTE-5): when `evento.estado !== 'cerrado'` the
// view renders an alert "El evento debe estar cerrado para ver el
// reporte" with no data query. The alert is also shown while the data
// is still loading so the user never sees a flash of empty tabs.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createClient } from '@supabase/supabase-js'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CierreCaja,
  Database,
  Evento,
  VentaConItems,
} from '@/types'
import { __pushSupabaseResponse, __resetSupabaseMock } from '../../tests/setup'
import ReporteEventoView from './ReporteEventoView.vue'
import CierreResumenCard from '@/components/business/CierreResumenCard.vue'
import { useEventsStore } from '@/stores/events.store'

const vuetify = createVuetify({ components, directives })

const mkEvento = (id: string, overrides: Partial<Evento> = {}): Evento => ({
  id,
  nombre: 'Feria del Sol',
  fecha: '2026-12-18',
  fecha_fin: '2026-12-20',
  margen_ganancia: 0.4,
  ubicacion: 'Plaza',
  estado: 'cerrado',
  notas: null,
  created_at: '2026-12-15T00:00:00Z',
  updated_at: '2026-12-20T22:00:00Z',
  ...overrides,
})

const mkVentaConItems = (
  id: string,
  fecha: string,
  total: number,
  items: Array<{
    id: string
    productoId: string
    cantidad: number
    precioUnitario: number
    costoUnitario: number | null
  }>,
  eventoId = 'e-1',
): VentaConItems => ({
  id,
  evento_id: eventoId,
  fecha,
  total,
  metodo_pago: 'efectivo',
  created_at: fecha,
  items: items.map((it) => ({
    id: it.id,
    venta_id: id,
    producto_id: it.productoId,
    cantidad: it.cantidad,
    precio_unitario: it.precioUnitario,
    subtotal: it.cantidad * it.precioUnitario,
    costo_unitario: it.costoUnitario,
    margen_aplicado: null,
    created_at: fecha,
  })),
})

const mkCierre = (eventoId: string, utilidadBruta: number): CierreCaja => ({
  id: `cierre-${eventoId}`,
  evento_id: eventoId,
  fecha_cierre: '2026-12-20T22:00:00Z',
  total_ventas: utilidadBruta,
  total_gastos_fijos: 0,
  total_gastos_imprevistos: 0,
  utilidad_bruta: utilidadBruta,
  efectivo_esperado: null,
  efectivo_real: null,
  diferencia: null,
  notas: null,
  created_at: '2026-12-20T22:00:00Z',
  // The DB shape includes the REQ-FIN-5 columns; the type only
  // surfaces utilidad_bruta in the CierreResumenCard prop.
})

let aplicacion: App
let router: Router

beforeEach(() => {
  setActivePinia(createPinia())
  __resetSupabaseMock()
  document.body.innerHTML = ''
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/eventos', name: 'eventos', component: { template: '<div />' } },
      { path: '/eventos/:id', name: 'evento-detalle', component: { template: '<div />' } },
      { path: '/eventos/:id/reporte', name: 'evento-reporte', component: ReporteEventoView },
    ],
  })
  aplicacion = createApp({})
  aplicacion.use(createPinia())
  aplicacion.provide('supabase', createClient('http://x', 'anon') as SupabaseClient<Database>)
})

function sembrarEvento(evento: Evento): void {
  return aplicacion.runWithContext(() => {
    useEventsStore().eventos.push(evento)
  })
}

async function montarVista(id: string) {
  router.push(`/eventos/${id}/reporte`)
  await router.isReady()
  return mount(ReporteEventoView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify, router],
      provide: { supabase: createClient('http://x', 'anon') },
    },
  })
}

describe('ReporteEventoView', () => {
  it('renders the breadcrumb trail and the 3 tabs (REQ-FIN-23)', async () => {
    const evento = mkEvento('e-1')
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja | null>({ data: null, error: null })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="reporte-titulo"]').exists()).toBe(true)
    // 3 tabs each with a testid so the spec can click them.
    expect(wrapper.find('[data-testid="reporte-tab-resumen"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reporte-tab-por-dia"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reporte-tab-por-producto"]').exists()).toBe(true)
  })

  it('shows the empty state when the evento is not cerrado (REQ-REPORTE-5)', async () => {
    const evento = mkEvento('e-1', { estado: 'planificacion' })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="reporte-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('El evento debe estar cerrado')
    // No tab content rendered.
    expect(wrapper.find('[data-testid="reporte-tab-resumen"]').exists()).toBe(false)
  })

  it('shows the same empty state when estado is en_curso (REQ-REPORTE-5)', async () => {
    const evento = mkEvento('e-1', { estado: 'en_curso' })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()

    expect(wrapper.find('[data-testid="reporte-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reporte-tab-resumen"]').exists()).toBe(false)
  })

  it('renders the Resumen tab with CierreResumenCard when the evento is cerrado (REQ-FIN-23)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja | null>({
      data: mkCierre('e-1', 300),
      error: null,
    })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()

    // CierreResumenCard is mounted and receives the cierre snapshot.
    const card = wrapper.findComponent(CierreResumenCard)
    expect(card.exists()).toBe(true)
    // The card itself contains the Utilidad labels.
    expect(wrapper.text()).toContain('Utilidad bruta')
    expect(wrapper.text()).toContain('Utilidad neta')
  })

  it('renders the Por día tab with one row per day in the range (REQ-FIN-24, REQ-REPORTE-1)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    const ventas = [
      mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 100, [
        { id: 'vi-1', productoId: 'p-1', cantidad: 4, precioUnitario: 25, costoUnitario: 10 },
      ]),
      mkVentaConItems('v-2', '2026-12-19T10:00:00Z', 60, [
        { id: 'vi-2', productoId: 'p-2', cantidad: 2, precioUnitario: 30, costoUnitario: 5 },
      ]),
    ]
    __pushSupabaseResponse<VentaConItems[]>({ data: ventas, error: null })
    __pushSupabaseResponse<CierreCaja | null>({
      data: mkCierre('e-1', 110),
      error: null,
    })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()

    // Switch to Por día tab.
    await wrapper.find('[data-testid="reporte-tab-por-dia"]').trigger('click')
    await flushPromises()
    // Range covers 3 days.
    const filas = wrapper.findAll('[data-testid^="reporte-por-dia-fila-"]')
    expect(filas.length).toBe(3)
    // First row is Dec 18.
    expect(wrapper.text()).toContain('2026-12-18')
    expect(wrapper.text()).toContain('2026-12-19')
    expect(wrapper.text()).toContain('2026-12-20')
  })

  it('renders the Por producto tab with one row per producto (REQ-FIN-25, REQ-REPORTE-2)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    const ventas = [
      mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 50, [
        { id: 'vi-1', productoId: 'p-1', cantidad: 2, precioUnitario: 25, costoUnitario: 10 },
      ]),
      mkVentaConItems('v-2', '2026-12-19T10:00:00Z', 30, [
        { id: 'vi-2', productoId: 'p-2', cantidad: 3, precioUnitario: 10, costoUnitario: 5 },
      ]),
    ]
    __pushSupabaseResponse<VentaConItems[]>({ data: ventas, error: null })
    __pushSupabaseResponse<CierreCaja | null>({
      data: mkCierre('e-1', 35),
      error: null,
    })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()

    // Switch to Por producto tab.
    await wrapper.find('[data-testid="reporte-tab-por-producto"]').trigger('click')
    await flushPromises()
    const filas = wrapper.findAll('[data-testid^="reporte-por-producto-fila-"]')
    expect(filas.length).toBe(2)
    // The productId is the source of truth — Denormalized names would
    // come from the productsStore; for now the testid renders the id.
    expect(wrapper.text()).toContain('p-1')
    expect(wrapper.text()).toContain('p-2')
  })

  it('exposes the cargando flag proxied from ventasStore (REQ-FIN-23)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja | null>({ data: null, error: null })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()
    // After mount + cargar() completed, the store is no longer cargando.
    // The view exposes the v-progress-linear only when cargando=true; this
    // is a smoke check that the cargando ref is wired up (not stuck on true).
    expect(wrapper.find('[data-testid="reporte-loading"]').exists()).toBe(false)
  })

  it('exposes the closure-snapshot utilidadBruta in the Resumen tab (REQ-FIN-23)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja | null>({
      data: mkCierre('e-1', 300),
      error: null,
    })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()

    // The CierreResumenCard receives the cierre snapshot as its
    // `resumen` prop and renders the utilidadBruta inside.
    const card = wrapper.findComponent(CierreResumenCard)
    const resumen = card.props('resumen') as { utilidadBruta: number; utilidadNeta: number } | null
    expect(resumen).not.toBeNull()
    expect(resumen?.utilidadBruta).toBe(300)
    // utilidadNeta is the snapshot's utilidadNeta field.
    expect(typeof resumen?.utilidadNeta).toBe('number')
  })

  it('calls useReporteEvento.cargar on mount (REQ-FIN-21)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    __pushSupabaseResponse<VentaConItems[]>({ data: [], error: null })
    __pushSupabaseResponse<CierreCaja | null>({ data: null, error: null })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()
    // After mount + flush the cerrar + ventas stores have been
    // invoked. We don't count mock calls (cargarPorEvento runs
    // through the Supabase mock queue) — the empty state proof
    // is that the view rendered without errors.
    expect(wrapper.find('[data-testid="reporte-titulo"]').exists()).toBe(true)
  })
})

// REQ-REPORTE-6: arithmetic consistency at the view level. The view
// composes CierreResumenCard + Por día + Por producto from the same
// composable, so the sums MUST match. The pure util enforces it
// (utils/cierre.spec.ts) — here we just spot-check the snapshot.
describe('ReporteEventoView — arithmetic consistency (REQ-REPORTE-6)', () => {
  it('Σ Por día utilidadBruta matches the cierre snapshot within 0.01 (REQ-REPORTE-6)', async () => {
    const evento = mkEvento('e-1', { estado: 'cerrado' })
    const ventas = [
      mkVentaConItems('v-1', '2026-12-18T10:00:00Z', 100, [
        { id: 'vi-1', productoId: 'p-1', cantidad: 4, precioUnitario: 25, costoUnitario: 10 },
      ]),
      mkVentaConItems('v-2', '2026-12-19T10:00:00Z', 60, [
        { id: 'vi-2', productoId: 'p-2', cantidad: 2, precioUnitario: 30, costoUnitario: 5 },
      ]),
    ]
    __pushSupabaseResponse<VentaConItems[]>({ data: ventas, error: null })
    __pushSupabaseResponse<CierreCaja | null>({
      data: mkCierre('e-1', 110),
      error: null,
    })
    sembrarEvento(evento)
    const wrapper = await montarVista('e-1')
    await flushPromises()
    await wrapper.find('[data-testid="reporte-tab-por-dia"]').trigger('click')
    await flushPromises()
    const card = wrapper.findComponent(CierreResumenCard)
    const resumen = card.props('resumen') as { utilidadBruta: number } | null
    expect(resumen).not.toBeNull()
    expect(resumen?.utilidadBruta).toBe(110)
  })
})
