<template>
  <v-card data-testid="post-event-panel" class="post-event-panel mb-4">
    <v-card-title class="text-h6">Resumen del evento</v-card-title>
    <v-card-text>
      <!-- Totals -->
      <v-row dense class="mb-4">
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">Ventas totales</div>
          <div class="text-h5 font-weight-bold">
            S/ {{ totalVentas.toFixed(2) }}
          </div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">COGS</div>
          <div class="text-h5 font-weight-bold">
            S/ {{ totalCogs.toFixed(2) }}
          </div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">Utilidad bruta</div>
          <div
            class="text-h5 font-weight-bold"
            :class="totalUtilidadBruta >= 0 ? 'text-success' : 'text-error'"
          >
            S/ {{ totalUtilidadBruta.toFixed(2) }}
          </div>
        </v-col>
        <v-col cols="6" sm="3">
          <div class="text-caption text-medium-emphasis">Utilidad neta</div>
          <div
            class="text-h5 font-weight-bold"
            :class="totalUtilidadNeta >= 0 ? 'text-success' : 'text-error'"
          >
            S/ {{ totalUtilidadNeta.toFixed(2) }}
          </div>
        </v-col>
      </v-row>

      <!-- Top products -->
      <v-divider class="mb-3" />
      <div class="text-subtitle-1 font-weight-bold mb-2">Productos principales</div>
      <v-list density="compact">
        <v-list-item
          v-for="(p, idx) in topProducts"
          :key="idx"
          :title="p.productoNombre"
          :subtitle="`${p.unidades} unid. · Ingreso S/ ${p.ingresoTotal.toFixed(2)}`"
        >
          <template #append>
            <span
              :class="p.utilidadBruta >= 0 ? 'text-success' : 'text-error'"
              class="font-weight-bold"
            >
              S/ {{ p.utilidadBruta.toFixed(2) }}
            </span>
          </template>
        </v-list-item>
      </v-list>

      <!-- Recommendations placeholder -->
      <v-divider class="mb-3" />
      <div class="text-subtitle-1 font-weight-bold mb-2">Recomendaciones</div>
      <v-alert
        type="info"
        variant="tonal"
        density="compact"
        text="Revisa los productos con mayor margen para priorizar en el próximo evento."
      />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReporteEvento } from '@/composables/useReporteEvento'
import type { DesgloseProducto } from '@/types'
import { redondearCentavos } from '@/utils/moneda'

const props = defineProps<{
  eventoId?: string | null
}>()

const reporte = useReporteEvento(computed(() => props.eventoId ?? null))

const totalVentas = computed(() => {
  return redondearCentavos(
    reporte.reportePorProducto.value.reduce((sum, p) => sum + p.ingresoTotal, 0),
  )
})

const totalCogs = computed(() => {
  return redondearCentavos(
    reporte.reportePorProducto.value.reduce((sum, p) => sum + p.cogsTotal, 0),
  )
})

const totalUtilidadBruta = computed(() => {
  return redondearCentavos(totalVentas.value - totalCogs.value)
})

const totalUtilidadNeta = computed(() => {
  return redondearCentavos(totalUtilidadBruta.value)
})

const topProducts = computed<DesgloseProducto[]>(() => {
  return [...reporte.reportePorProducto.value]
    .sort((a, b) => b.utilidadBruta - a.utilidadBruta)
    .slice(0, 5)
})
</script>
