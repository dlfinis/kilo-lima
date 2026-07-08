<script setup lang="ts">
// mobile-ux-redesign Phase 2: HomeView operational dashboard.
// Composes ActiveEventCard / EmptyStateEvent, KpiGrid, QuickActionsRow,
// and keeps the 3 business-phase cards as a secondary surface (de-emphasized).
// Data loading still uses useResumen() for store hydration.
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app.store'
import { useEventsStore } from '@/stores/events.store'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useResumen } from '@/composables/useResumen'
import { useEventoActivo } from '@/composables/useEventoActivo'
import { useKpis } from '@/composables/useKpis'
import { formatearUSD } from '@/utils/format'
import ActiveEventCard from '@/components/business/ActiveEventCard.vue'
import EmptyStateEvent from '@/components/business/EmptyStateEvent.vue'
import KpiGrid from '@/components/business/KpiGrid.vue'
import QuickActionsRow from '@/components/business/QuickActionsRow.vue'

const app = useAppStore()
const eventsStore = useEventsStore()
const { online } = useOnlineStatus()
const { cargar } = useResumen()
const { activeEvent } = useEventoActivo()
const kpisData = useKpis()

// KPI data for the grid — derived from store-backed composable
const kpis = computed(() => [
  {
    title: 'Ventas Hoy',
    value: formatearUSD(kpisData.ventasHoy.value),
    icon: 'mdi-cash-register',
    color: 'primary',
  },
  {
    title: 'Gastos Hoy',
    value: formatearUSD(kpisData.gastosHoy.value),
    icon: 'mdi-file-document-edit',
    color: 'warning',
  },
  {
    title: 'Utilidad Est.',
    value: formatearUSD(kpisData.utilidadEstimada.value),
    icon: 'mdi-chart-line',
    color: kpisData.utilidadEstimada.value >= 0 ? 'success' : 'error',
  },
  {
    title: 'Stock Crítico',
    value: kpisData.stockCritico.value,
    icon: 'mdi-alert-circle',
    color: kpisData.stockCritico.value > 0 ? 'error' : 'grey',
  },
])

// Most-recently-finished event for the post-evento card
const ultimoCerrado = computed(() => {
  const cerrados = eventsStore.eventos
    .filter((e) => e.estado === 'cerrado')
    .sort((a, b) => {
      const fa = a.fecha_fin ?? a.fecha
      const fb = b.fecha_fin ?? b.fecha
      return fb.localeCompare(fa)
    })
  return cerrados[0] ?? null
})

const hasActiveEvent = computed(() => activeEvent.value !== null)

onMounted(() => {
  void cargar()
})
</script>

<template>
  <v-container class="py-6">
    <h1 class="text-h4 mb-1">Kilo-Lima</h1>
    <p class="text-body-2 text-medium-emphasis mb-6">
      Costos y ventas de postres en ferias
    </p>

    <!-- Active event or empty state -->
    <ActiveEventCard v-if="hasActiveEvent" />
    <EmptyStateEvent v-else />

    <!-- KPI Dashboard -->
    <KpiGrid :kpis="kpis" />

    <!-- Quick Action Buttons -->
    <QuickActionsRow />

    <v-divider class="my-6" />

    <!-- Secondary: 3 business phase cards (de-emphasized) -->
    <h3 class="text-subtitle-2 text-medium-emphasis mb-3">Fases del negocio</h3>
    <v-row dense>
      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-pre-evento"
          :to="'/eventos'"
          variant="tonal"
          color="info"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-clipboard-list-outline" />
            </template>
            <v-card-title>Pre-evento</v-card-title>
            <v-card-subtitle>Planificación</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <p class="text-body-2 mb-2">
              Crea el evento, define gastos fijos, planifica cuántas unidades
              de cada receta vas a producir y revisá la proyección de costos.
            </p>
            <p class="text-caption text-medium-emphasis">
              Ir a Eventos →
            </p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-durante-evento"
          :to="'/pos'"
          variant="tonal"
          color="warning"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-cart-outline" />
            </template>
            <v-card-title>Durante evento</v-card-title>
            <v-card-subtitle>Ventas en vivo</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <p class="text-body-2 mb-2">
              Con el evento activo, registrá ventas en el POS. Agregá productos
              al carrito, elegí método de pago y registrá gastos imprevistos.
            </p>
            <p class="text-caption text-medium-emphasis">
              Ir a Caja →
            </p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-post-evento"
          :disabled="!ultimoCerrado"
          :to="ultimoCerrado ? { name: 'evento-reporte', params: { id: ultimoCerrado.id } } : undefined"
          variant="tonal"
          color="success"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-chart-line" />
            </template>
            <v-card-title>Post-evento</v-card-title>
            <v-card-subtitle>{{ ultimoCerrado ? 'Análisis' : 'Sin eventos cerrados' }}</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <p class="text-body-2 mb-2">
              <template v-if="ultimoCerrado">
                Revisá el reporte de <strong>{{ ultimoCerrado.nombre }}</strong>: ventas,
                COGS, utilidad bruta y neta, y desglose por día y por producto.
              </template>
              <template v-else>
                Cuando cierres un evento vas a poder ver el análisis de resultados acá.
              </template>
            </p>
            <p class="text-caption text-medium-emphasis">
              {{ ultimoCerrado ? 'Ver reporte →' : 'Esperando primer cierre' }}
            </p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card
      :color="online ? 'success' : 'warning'"
      class="mt-6"
      variant="tonal"
      data-testid="estado-conexion"
    >
      <v-card-text class="d-flex align-center ga-2">
        <v-icon :icon="online ? 'mdi-wifi' : 'mdi-wifi-off'" />
        <span class="text-body-2">
          <strong>{{ app.appName }}</strong> ·
          {{ online ? 'En línea' : 'Sin conexión (los datos en cache se ven, los nuevos no se guardan)' }}
        </span>
      </v-card-text>
    </v-card>
  </v-container>
</template>
