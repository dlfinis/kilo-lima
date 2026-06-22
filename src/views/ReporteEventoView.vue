<script setup lang="ts">
// REQ-FIN-23, REQ-FIN-24, REQ-FIN-25, REQ-REPORTE-3..6 (PR-2c),
// REQ-CON-12, REQ-CON-13, REQ-CON-14 (PR-2):
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
//     (REQ-FIN-25, REQ-REPORTE-2). PR-2 adds:
//       * 🏆 crown on top-3 rows by utilidadBruta (REQ-CON-12).
//       * "Productos que pagaron la operación" banner listing the
//         top 3 by utilidadBruta (REQ-CON-13).
//       * "Ganancia pura" banner surfacing productos beyond
//         break-even — simplified: every producto when total
//         utilidadBruta > 0 (REQ-CON-14).
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
  rankingContribucion,
  productosPagaronOperacion,
  productosGananciaPura,
  cierre,
  cargando,
  error,
  cargar,
} = useReporteEvento(eventoId)

// REQ-CON-12 (PR-2): `rankingContribucion` is the full sorted list —
// the Por producto tab consumes `productosPagaronOperacion` (the
// top-3 slice) for the 🏆 column and the banner. The full ranking
// is exposed for future deep-link / export work; we acknowledge it
// explicitly here so eslint / typecheck don't flag it.
void rankingContribucion

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

// REQ-CON-12 (PR-2): set of productoIds that appear in the top-3 of
// the contribution ranking. Used by the Por producto tab to render
// the 🏆 crown on the right rows.
const topProductoIds = computed<Set<string>>(() => {
  return new Set(productosPagaronOperacion.value.map((d) => d.productoId))
})

// REQ-CON-13 (PR-2): display labels for the "pagaron la operación"
// banner — a comma-separated list of the top-3 product names.
const pagaronOperacionTexto = computed<string>(() => {
  return productosPagaronOperacion.value
    .map((d) => d.productoNombre)
    .join(', ')
})

// REQ-CON-14 (PR-2): a simplified "ganancia pura" flag — surfaces
// every producto when total utilidadBruta > 0.
const hayGananciaPura = computed<boolean>(
  () => productosGananciaPura.value.length > 0,
)
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

        <!-- Por producto tab: per-producto aggregation (REQ-REPORTE-2) +
             PR-2 ranking + banners. -->
        <v-window-item value="por-producto">
          <v-card class="pa-4" data-testid="reporte-por-producto-card">
            <h2 class="mb-3">Por producto</h2>

            <!-- REQ-CON-13 (PR-2): top-3 productos that paid the
                 operation. Always rendered when at least 1 producto
                 exists; the product names come from
                 `productosPagaronOperacion`. -->
            <v-alert
              v-if="productosPagaronOperacion.length > 0"
              type="success"
              variant="tonal"
              class="mb-3"
              data-testid="reporte-pagaron-operacion"
            >
              <p class="text-subtitle-1 mb-1">🏆 Productos que pagaron la operación</p>
              <p class="mb-0">{{ pagaronOperacionTexto }}</p>
            </v-alert>

            <!-- REQ-CON-14 (PR-2): simplified ganancia pura banner
                 — surfaces when total utilidadBruta > 0. -->
            <v-alert
              v-if="hayGananciaPura"
              type="info"
              variant="tonal"
              class="mb-3"
              data-testid="reporte-ganancia-pura"
            >
              Ganancia pura — la operación cerró con margen positivo.
            </v-alert>

            <v-data-table
              :items="reportePorProducto"
              :headers="[
                { title: '', key: 'ranking', sortable: false, width: 60 },
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
              <template #[`item.ranking`]="{ item }">
                <span
                  v-if="topProductoIds.has(item.productoId)"
                  :data-testid="`reporte-ranking-${item.productoId}`"
                >
                  🏆
                </span>
              </template>
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
