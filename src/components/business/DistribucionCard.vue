<script setup lang="ts">
import type { DistribucionResultado } from '@/types'
import { formatearUSD } from '@/utils/format'

defineProps<{
  distribucion: DistribucionResultado
}>()
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center ga-2">
      <v-icon>mdi-chart-pie</v-icon>
      Distribución por socio
    </v-card-title>

    <v-card-text>
      <v-alert
        v-if="distribucion.utilidadNeta < 0"
        type="warning"
        density="compact"
        class="mb-3"
        icon="mdi-alert-circle"
      >
        Este evento no generó ganancia. La pérdida se distribuye según porcentajes acordados.
      </v-alert>

      <v-table density="compact">
        <thead>
          <tr>
            <th class="text-left">Socio</th>
            <th class="text-right">% inversión</th>
            <th class="text-right">% ganancia</th>
            <th class="text-right">Total inversión</th>
            <th class="text-right">Parte ganancia</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in distribucion.socios" :key="s.socioId">
            <td>{{ s.socioNombre }}</td>
            <td class="text-right">{{ (s.porcentajeInversion * 100).toFixed(2) }}%</td>
            <td class="text-right">
              {{
                (
                  (distribucion.distribucion.find((d) => d.socioId === s.socioId)
                    ?.porcentajeGanancia ?? 0) * 100
                ).toFixed(2)
              }}%
            </td>
            <td class="text-right">{{ formatearUSD(s.inversionTotal) }}</td>
            <td class="text-right font-weight-medium">
              {{ formatearUSD(distribucion.distribucion.find((d) => d.socioId === s.socioId)?.parteGanancia ?? 0) }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="font-weight-bold">
            <td>Total</td>
            <td class="text-right">100%</td>
            <td class="text-right">100%</td>
            <td class="text-right">{{ formatearUSD(distribucion.totalInversion) }}</td>
            <td class="text-right">{{ formatearUSD(distribucion.utilidadNeta) }}</td>
          </tr>
        </tfoot>
      </v-table>
    </v-card-text>
  </v-card>
</template>
