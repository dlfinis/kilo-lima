<script setup lang="ts">
// REQ-EVENT-INGREDIENT-PURCHASING: read‑only panel that lives below the
// Gestión productos table inside `evento-gestion-tabla-card`. Receives a
// pre‑computed `IngredientesEventoResultado` via prop (pure presentation
// component — no store / composable calls) and renders:
//   - An accordion with a consolidated "to‑buy" summary table
//   - Per‑product ingredient breakdown tables
//   - A yellow v‑alert when any advertencia exists
//   - A friendly empty state when no derivation data exists
//
// Design §3: collapsible v‑expansion‑panels keep the panel next to the
// production‑unit edits without navigation or route state.
import { computed } from 'vue'

import type {
  IngredientesEventoResultado,
  IngredienteCompra,
  Advertencia,
} from '@/composables/useIngredientesEvento'

const props = defineProps<{
  resultado: IngredientesEventoResultado | null
}>()

const consolidado = computed<IngredienteCompra[]>(() => props.resultado?.consolidado ?? [])
const porProducto = computed(() => props.resultado?.porProducto ?? [])
const advertencias = computed<Advertencia[]>(() => props.resultado?.advertencias ?? [])

const hayDatos = computed(
  () => props.resultado !== null && (consolidado.value.length > 0 || porProducto.value.length > 0),
)

const compraHeaders = [
  { title: 'Ingrediente', key: 'nombre' },
  { title: 'Tipo', key: 'unidadTipo', align: 'start' as const, width: 55 },
  { title: 'Cantidad', key: 'cantidadDisplay', align: 'end' as const, width: 90 },
  { title: 'Costo compra', key: 'costoCompra', align: 'end' as const, width: 110 },
  { title: 'A comprar', key: 'faltanteDisplay', align: 'end' as const, width: 120 },
]

const costoCopraTotal = computed<number>(() =>
  consolidado.value.reduce((sum, ing) => sum + ing.faltante * ing.costoUnitario, 0),
)

const productoHeaders = [
  { title: 'Ingrediente', key: 'nombre' },
  { title: 'Tipo', key: 'unidadTipo', align: 'start' as const, width: 55 },
  { title: 'Cantidad', key: 'cantidadDisplay', align: 'end' as const, width: 90 },
  { title: 'Requerido', key: 'requeridoDisplay', align: 'end' as const, width: 120 },
]

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function faltanteFmt(v: number): string {
  return v > 0 ? v.toFixed(2) : '—'
}

/** Abbreviated unit label matching `formatearUnidad` conventions. */
function unidadTipoLabel(u: string): string {
  if (u === 'unidad') return 'u'
  if (u === 'und') return 'unds'
  return u
}

const ETIQUETAS_ADVERTENCIA: Record<Advertencia['codigo'], string> = {
  PRODUCTO_FALTANTE: 'Producto faltante en catálogo',
  RECETA_FALTANTE: 'Receta faltante',
  RENDIMIENTO_INVALIDO: 'Receta con rendimiento inválido',
  MATERIA_PRIMA_FALTANTE: 'Materia prima faltante en catálogo',
}
</script>

<template>
  <!-- Empty state: no derivation data at all -->
  <v-card
    v-if="!hayDatos"
    class="mt-4 pa-4 text-center text-medium-emphasis"
    data-testid="ingredientes-empty"
  >
    <template v-if="resultado === null">
      Sin datos de ingredientes — seleccioná un evento para ver el plan de compras.
    </template>
    <template v-else>
      Sin ingredientes para planificar — agregá productos al evento con recetas y unidades planificadas.
    </template>
  </v-card>

  <template v-else>
    <!-- Warning banner: aggregated advertencias -->
    <v-alert
      v-if="advertencias.length > 0"
      type="warning"
      variant="tonal"
      class="mt-4"
      data-testid="ingredientes-alerta"
    >
      {{ advertencias.length }} advertencia(s) — algunos ingredientes no pudieron derivarse.
      <ul class="mt-1 mb-0">
        <li v-for="(a, i) in advertencias" :key="i">
          {{ ETIQUETAS_ADVERTENCIA[a.codigo] ?? a.codigo }} (ref: {{ a.referenciaId }})
        </li>
      </ul>
    </v-alert>

    <v-expansion-panels
      variant="accordion"
      class="mt-4"
      data-testid="ingredientes-panels"
    >
      <!-- Consolidated "to-buy" summary -->
      <v-expansion-panel
        v-if="consolidado.length > 0"
        data-testid="ingredientes-consolidado-panel"
      >
        <v-expansion-panel-title>
          <template #default="{ expanded }">
            <v-icon :class="{ 'expand-icon-rotated': expanded }" class="mr-2">
              mdi-chevron-right
            </v-icon>
            Resumen de compras ({{ consolidado.length }} ítems)
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-data-table
            :items="consolidado"
            :headers="compraHeaders"
            density="compact"
            hide-default-footer
            data-testid="ingredientes-consolidado-tabla"
          >
            <!-- unidadTipo -->
            <template #[`item.unidadTipo`]="{ item }">
              {{ unidadTipoLabel(item.unidad) }}
            </template>
            <!-- cantidadDisplay -->
            <template #[`item.cantidadDisplay`]="{ item }">
              {{ item.requerido.toFixed(2) }}
            </template>
            <!-- costoCompra: unit cost × faltante -->
            <template #[`item.costoCompra`]="{ item }">
              <span :class="{ 'text-medium-emphasis': item.faltante === 0 }">
                ${{ (item.faltante * item.costoUnitario).toFixed(2) }}
              </span>
            </template>
            <!-- faltanteDisplay: colour-coded: red when gap > 0, green when 0 -->
            <template #[`item.faltanteDisplay`]="{ item }">
              <span
                v-if="item.faltante > 0"
                class="font-weight-bold text-error"
              >{{ faltanteFmt(item.faltante) }}</span>
              <span v-else class="text-success">—</span>
            </template>
          </v-data-table>

          <div
            v-if="consolidado.length > 0"
            class="d-flex justify-end pa-2 text-body-2 font-weight-medium"
            data-testid="ingredientes-consolidado-total"
          >
            Total compra: ${{ costoCopraTotal.toFixed(2) }}
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Per-product breakdown panels -->
      <v-expansion-panel
        v-for="prod in porProducto"
        :key="prod.eventoProductoId"
        :data-testid="`ingredientes-producto-panel-${prod.eventoProductoId}`"
      >
        <v-expansion-panel-title>
          <template #default="{ expanded }">
            <v-icon :class="{ 'expand-icon-rotated': expanded }" class="mr-2">
              mdi-chevron-right
            </v-icon>
            {{ prod.productoNombre }}
            <v-chip
              size="x-small"
              variant="tonal"
              class="ml-2"
            >
              {{ prod.ingredientes.length }}
            </v-chip>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-data-table
            :items="prod.ingredientes"
            :headers="productoHeaders"
            density="compact"
            hide-default-footer
            :data-testid="`ingredientes-producto-tabla-${prod.eventoProductoId}`"
          >
            <template #[`item.unidadTipo`]="{ item }">
              {{ unidadTipoLabel(item.unidad) }}
            </template>
            <template #[`item.cantidadDisplay`]="{ item }">
              {{ item.requerido.toFixed(2) }}
            </template>
            <template #[`item.requeridoDisplay`]="{ item }">
              {{ item.requerido.toFixed(2) }}
            </template>
          </v-data-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </template>
</template>

<style scoped>
.expand-icon-rotated {
  transform: rotate(90deg);
}
</style>
