<script setup lang="ts">
// REQ-FIN-23, REQ-FIN-24, REQ-FIN-25, REQ-REPORTE-3..6 (PR-2c):
// post-evento analytics view at `/eventos/:id/reporte`. Three
// Vuetify tabs (Resumen / Por día / Por producto) backed by
// `useReporteEvento`. The view composes:
//
//   - Resumen tab: CierreResumenCard populated from the cierre
//     snapshot (REQ-FIN-23, REQ-REPORTE-3) showing utilidadBruta +
//     utilidadNeta + KPIs.
//   - Por día tab: DataTable driven by reportePorDia — every day in
//     [fecha_inicio, fecha_fin] inclusive, even zero-venta days
//     (REQ-FIN-24, REQ-REPORTE-1).
//   - Por producto tab: DataTable driven by reportePorProducto
//     (REQ-FIN-25, REQ-REPORTE-2). Sortable by productoNombre /
//     unidades / ingresoTotal / margenReal / utilidadBruta.
//
// Empty state (REQ-REPORTE-5): when `evento.estado !== 'cerrado'`
// the view renders "El evento debe estar cerrado para ver el reporte"
// with no data query. The closure guard is the single source of
// truth — tabs / data tables stay hidden.
//
// Snapshot-based reading (REQ-REPORTE-4): the report reads from the
// cierres_caja snapshot and the historical venta_items in Pinia
// memory. It does NOT re-read products or recetas, so a receta cost
// change after cierre does not mutate the report.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import CierreResumenCard from '@/components/business/CierreResumenCard.vue'
import { useReporteEvento } from '@/composables/useReporteEvento'
import { useEventsStore } from '@/stores/events.store'
import { formatearUSD } from '@/utils/format'
import type { CierreResultado } from '@/types'

const route = useRoute()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const {
  reportePorDia,
  reportePorProducto,
  cierre,
  cargando,
  error,
  cargar,
} = useReporteEvento(eventoId)

// The view reads the evento through the eventsStore so the
// "cerrado" gate is consistent with the rest of the app. We do NOT
// duplicate the snapshot — the gate is the live eventsStore.evento
// filtered by id.
const eventsStore = useEventsStore()
const eventoActual = computed(() => {
  const eid = eventoId.value
  if (!eid) return null
  return eventsStore.eventos.find((e) => e.id === eid) ?? eventsStore.eventoActual
})
const esCerrado = computed(() => eventoActual.value?.estado === 'cerrado')

// Build a CierreResultado-shaped object for the CierreResumenCard
// from the cierre snapshot row. Mirrors the CierreInput → CierreResultado
// pipeline so the card renders the same UI for both live and
// snapshot data (REQ-FIN-23).
const resumenParaCard = computed<CierreResultado | null>(() => {
  const c = cierre.value
  if (!c) return null
  // Derive a resumen that the CierreResumenCard understands. We
  // forward the snapshot's utilidadBruta + utilidadNeta + totalVentas
  // + gastosFijos/Imprevistos so the card renders the same KPIs it
  // does for the live flow. The desglose arrays stay empty — the
  // Resumen tab is the snapshot view, the Por día/Por producto tabs
  // are the aggregated views.
  return {
    totalVentas: c.total_ventas,
    totalCogs: 0,
    totalGastosFijos: c.total_gastos_fijos,
    totalGastosImprevistos: c.total_gastos_imprevistos,
    utilidadBruta: c.utilidad_bruta,
    utilidadNeta: c.utilidad_bruta - c.total_gastos_fijos - c.total_gastos_imprevistos,
    efectivoEsperado: c.efectivo_esperado,
    efectivoReal: c.efectivo_real,
    diferencia: c.diferencia,
    ventasPorMetodoPago: { efectivo: 0, transferencia: 0, tarjeta: 0, mixto: 0 },
    cantidadVentas: 0,
    desgloseProductos: [],
    desgloseDias: [],
  }
})

onMounted(() => {
  void cargar()
})

// v-tabs: which panel is active. Default Resumen (REQ-FIN-23).
type TabReporte = 'resumen' | 'por-dia' | 'por-producto'
const tabActiva = ref<TabReporte>('resumen')
function cambiarTab(t: TabReporte) {
  tabActiva.value = t
}

// Date / money formatters reused across the 3 tabs.
function formatearPorcentaje(decimal: number): string {
  return `${Math.round(decimal * 100)}%`
}
</script>

<template>
  <v-container>
    <v-progress-linear
      v-if="cargando"
      indeterminate
      color="primary"
      class="mb-2"
      data-testid="reporte-loading"
    />

    <v-alert
      v-if="error && !cargando"
      type="error"
      class="mb-4"
      data-testid="reporte-error"
    >
      {{ error }}
    </v-alert>

    <!-- REQ-REPORTE-5: empty state for non-cerrado eventos. The
         reporte is only meaningful after the cierre is registered. -->
    <v-alert
      v-if="!cargando && !esCerrado"
      type="info"
      class="mb-4"
      data-testid="reporte-empty"
    >
      <p class="text-h6 mb-2">El evento debe estar cerrado para ver el reporte</p>
      <p class="text-body-2">Cerrá el evento en la pantalla de detalle para habilitar el reporte.</p>
    </v-alert>

    <template v-else-if="esCerrado">
      <div class="d-flex align-center ga-3 mb-2">
        <h1 data-testid="reporte-titulo">
          Reporte — {{ eventoActual?.nombre ?? eventoId }}
        </h1>
        <v-chip color="success" size="small" data-testid="reporte-estado">
          Cerrado
        </v-chip>
      </div>
      <p class="text-medium-emphasis mb-4" data-testid="reporte-rango">
        {{ eventoActual?.fecha }}
        <template v-if="eventoActual?.fecha_fin && eventoActual.fecha_fin !== eventoActual.fecha">
          – {{ eventoActual.fecha_fin }}
        </template>
      </p>

      <v-tabs v-model="tabActiva" color="primary" class="mb-4">
        <v-tab
          value="resumen"
          data-testid="reporte-tab-resumen"
          @click="cambiarTab('resumen')"
        >
          Resumen
        </v-tab>
        <v-tab
          value="por-dia"
          data-testid="reporte-tab-por-dia"
          @click="cambiarTab('por-dia')"
        >
          Por día
        </v-tab>
        <v-tab
          value="por-producto"
          data-testid="reporte-tab-por-producto"
          @click="cambiarTab('por-producto')"
        >
          Por producto
        </v-tab>
      </v-tabs>

      <v-window v-model="tabActiva">
        <!-- Resumen tab: snapshot from cierres_caja -->
        <v-window-item value="resumen">
          <CierreResumenCard :resumen="resumenParaCard" />
        </v-window-item>

        <!-- Por día tab: per-day aggregation (REQ-REPORTE-1) -->
        <v-window-item value="por-dia">
          <v-card class="pa-4" data-testid="reporte-por-dia-card">
            <h2 class="mb-3">Por día</h2>
            <v-data-table
              :items="reportePorDia"
              :headers="[
                { title: 'Fecha', key: 'fecha' },
                { title: '# Ventas', key: 'ventas' },
                { title: 'Unidades', key: 'cantidad' },
                { title: 'COGS', key: 'cogs' },
                { title: 'Utilidad bruta', key: 'utilidadBruta' },
              ]"
              density="comfortable"
              data-testid="reporte-por-dia-tabla"
            >
              <template #[`item.fecha`]="{ item }">
                <span :data-testid="`reporte-por-dia-fila-${item.fecha}`">{{ item.fecha }}</span>
              </template>
              <template #[`item.cogs`]="{ item }">
                {{ formatearUSD(item.cogs) }}
              </template>
              <template #[`item.utilidadBruta`]="{ item }">
                {{ formatearUSD(item.utilidadBruta) }}
              </template>
            </v-data-table>
          </v-card>
        </v-window-item>

        <!-- Por producto tab: per-producto aggregation (REQ-REPORTE-2) -->
        <v-window-item value="por-producto">
          <v-card class="pa-4" data-testid="reporte-por-producto-card">
            <h2 class="mb-3">Por producto</h2>
            <v-data-table
              :items="reportePorProducto"
              :headers="[
                { title: 'Producto', key: 'productoNombre' },
                { title: 'Uds vendidas', key: 'unidades' },
                { title: 'Ingreso', key: 'ingresoTotal' },
                { title: 'COGS', key: 'cogsTotal' },
                { title: 'Utilidad bruta', key: 'utilidadBruta' },
                { title: 'Margen real', key: 'margenReal' },
              ]"
              density="comfortable"
              data-testid="reporte-por-producto-tabla"
            >
              <template #[`item.productoNombre`]="{ item }">
                <span :data-testid="`reporte-por-producto-fila-${item.productoId}`">{{ item.productoNombre }}</span>
              </template>
              <template #[`item.ingresoTotal`]="{ item }">
                {{ formatearUSD(item.ingresoTotal) }}
              </template>
              <template #[`item.cogsTotal`]="{ item }">
                {{ formatearUSD(item.cogsTotal) }}
              </template>
              <template #[`item.utilidadBruta`]="{ item }">
                {{ formatearUSD(item.utilidadBruta) }}
              </template>
              <template #[`item.margenReal`]="{ item }">
                {{ formatearPorcentaje(item.margenReal) }}
              </template>
            </v-data-table>
          </v-card>
        </v-window-item>
      </v-window>
    </template>
  </v-container>
</template>
