<script setup lang="ts">
// REQ-CATALOG-14, REQ-CATALOG-16, REQ-CATALOG-45: pure presentation
// component. Receives a pre-computed `CalculoReceta` via prop and
// renders the per-line breakdown + totals. The MATERIA_PRIMA_FALTANTE
// warning surfaces as a yellow v-alert so the user knows the line is
// excluded from the total. Display-only — no emits, no store import.
//
// REQ-RECIPE-SCALE: optional `factorEscala` prop (default 1) scales
// quantities and subtotals for projection (e.g. recipe yields 10 units,
// user wants to see what's needed for 20 → factor = 2). The base
// CalculoReceta is NOT modified; only the display is scaled.
import { computed } from 'vue'

import { formatearUSD, formatearUnidad } from '@/utils/format'
import type { CalculoReceta } from '@/types'

const props = withDefaults(
  defineProps<{
    calculo: CalculoReceta
    factorEscala?: number
  }>(),
  { factorEscala: 1 },
)

const factor = computed(() => Math.max(props.factorEscala, 0))
const lineas = computed(() => props.calculo.ingredientes)
const total = computed(() => formatearUSD(props.calculo.costoTotal * factor.value))
const porUnidad = computed(() => {
  // costoPorUnidad stays constant when scaling (same recipe, more units)
  return formatearUSD(props.calculo.costoPorUnidad)
})
const hayFaltantes = computed(() =>
  lineas.value.some((l) => l.advertencia === 'MATERIA_PRIMA_FALTANTE'),
)

/** Scale a quantity for display. Returns the scaled value. */
function cantidadEscalada(cantidad: number): number {
  return cantidad * factor.value
}

/** Scale a subtotal for display. */
function subtotalEscalada(subtotal: number): number {
  return subtotal * factor.value
}
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
            {{ formatearUnidad(cantidadEscalada(linea.ingrediente.cantidad), linea.materiaPrima?.unidad ?? '') }}
          </td>
          <td class="text-right">
            {{ linea.materiaPrima ? formatearUSD(linea.materiaPrima.costo_por_unidad) : '—' }}
          </td>
          <td class="text-right">{{ formatearUSD(subtotalEscalada(linea.subtotal)) }}</td>
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
