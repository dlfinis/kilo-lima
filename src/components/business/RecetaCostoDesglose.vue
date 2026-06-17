<script setup lang="ts">
// REQ-CATALOG-14, REQ-CATALOG-16, REQ-CATALOG-45: pure presentation
// component. Receives a pre-computed `CalculoReceta` via prop and
// renders the per-line breakdown + totals. The MATERIA_PRIMA_FALTANTE
// warning surfaces as a yellow v-alert so the user knows the line is
// excluded from the total. Display-only — no emits, no store import.
import { computed } from 'vue'

import { formatearUSD, formatearUnidad } from '@/utils/format'
import type { CalculoReceta } from '@/types'

const props = defineProps<{ calculo: CalculoReceta }>()

const lineas = computed(() => props.calculo.ingredientes)
const total = computed(() => formatearUSD(props.calculo.costoTotal))
const porUnidad = computed(() => formatearUSD(props.calculo.costoPorUnidad))
const hayFaltantes = computed(() =>
  lineas.value.some((l) => l.advertencia === 'MATERIA_PRIMA_FALTANTE'),
)
</script>

<template>
  <v-card class="pa-4" data-testid="receta-desglose">
    <v-alert
      v-if="hayFaltantes"
      type="warning"
      variant="tonal"
      class="mb-4"
      data-testid="receta-desglose-alerta"
    >
      Materia prima no disponible en una o más líneas (excluidas del total).
    </v-alert>

    <v-table density="compact">
      <thead>
        <tr>
          <th>Ingrediente</th>
          <th class="text-right">Cantidad</th>
          <th class="text-right">Costo / unidad</th>
          <th class="text-right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="linea in lineas" :key="linea.ingrediente.id" data-testid="receta-desglose-linea">
          <td>
            {{ linea.materiaPrima?.nombre ?? '—' }}
            <v-icon
              v-if="linea.advertencia === 'MATERIA_PRIMA_FALTANTE'"
              color="warning"
              size="small"
              class="ml-1"
            >mdi-alert</v-icon>
          </td>
          <td class="text-right">
            {{ formatearUnidad(linea.ingrediente.cantidad, linea.materiaPrima?.unidad ?? '') }}
          </td>
          <td class="text-right">
            {{ linea.materiaPrima ? formatearUSD(linea.materiaPrima.costo_por_unidad) : '—' }}
          </td>
          <td class="text-right">{{ formatearUSD(linea.subtotal) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th colspan="3" class="text-right">Costo total</th>
          <th class="text-right" data-testid="receta-desglose-total">{{ total }}</th>
        </tr>
        <tr>
          <th colspan="3" class="text-right">Costo por unidad producida</th>
          <th class="text-right" data-testid="receta-desglose-por-unidad">{{ porUnidad }}</th>
        </tr>
      </tfoot>
    </v-table>
  </v-card>
</template>
