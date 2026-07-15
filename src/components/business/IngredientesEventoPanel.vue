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
  {
    title: 'Requerido',
    key: 'requeridoDisplay',
    value: (item: IngredienteCompra) =>
      aUnidadDisplay(item.requerido, item.unidad, mejorUnidad(item.unidad, item.requerido)),
    align: 'end' as const,
    width: 100,
  },
  {
    title: 'Disponible',
    key: 'disponibleDisplay',
    value: (item: IngredienteCompra) =>
      aUnidadDisplay(item.disponible, item.unidad, mejorUnidad(item.unidad, item.requerido)),
    align: 'end' as const,
    width: 100,
  },
  {
    title: 'A comprar',
    key: 'faltanteDisplay',
    value: (item: IngredienteCompra) =>
      aUnidadDisplay(item.faltante, item.unidad, mejorUnidad(item.unidad, item.requerido)),
    align: 'end' as const,
    width: 100,
  },
  {
    title: 'Tipo',
    key: 'unidadTipo',
    value: (item: IngredienteCompra) => mejorUnidad(item.unidad, item.requerido),
    align: 'center' as const,
    width: 40,
  },
  {
    title: 'C.U',
    key: 'costoUnitario',
    value: (item: IngredienteCompra) => item.costoUnitario,
    align: 'end' as const,
    width: 130,
  },
  {
    title: 'Subtotal',
    key: 'costoCompra',
    value: (item: IngredienteCompra) => item.faltante * item.costoUnitario,
    align: 'end' as const,
    width: 110,
  },
]

const costoCompraTotal = computed<number>(() =>
  consolidado.value.reduce((sum, ing) => sum + ing.faltante * ing.costoUnitario, 0),
)

const productoHeaders = [
  { title: 'Ingrediente', key: 'nombre' },
  { title: 'Cantidad', key: 'cantidadDisplay', align: 'end' as const, width: 100 },
  { title: 'Tipo', key: 'unidadTipo', align: 'center' as const, width: 40 },
  { title: 'Requerido', key: 'requeridoDisplay', align: 'end' as const, width: 120 },
]

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Abbreviated unit label matching `formatearUnidad` conventions. */
function unidadTipoLabel(u: string): string {
  if (u === 'unidad') return 'u'
  if (u === 'und') return 'unds'
  return u
}

/**
 * Unit-conversion helpers for display only. The underlying math
 * (faltante, costo) still operates in the original unit.
 *
 * Strategy: decide the display unit ONCE per row (based on `requerido`),
 * then convert all values in that row to the same unit so columns stay
 * comparable. 1500 g required → show everything in kg for that row.
 *
 *   1500 g  → 1.5 kg      0.5 kg  → 500 g
 *   2000 ml → 2 l          0.5 l   → 500 ml
 */

/** Pick the most legible unit for a row, based on the required amount. */
function mejorUnidad(unidad: string, requerido: number): string {
  if (unidad === 'g' && requerido >= 1000) return 'kg'
  if (unidad === 'kg' && requerido > 0 && requerido < 1) return 'g'
  if (unidad === 'ml' && requerido >= 1000) return 'l'
  if (unidad === 'l' && requerido > 0 && requerido < 1) return 'ml'
  return unidad
}

/** Convert a value from the original unit to the display unit. */
function aUnidadDisplay(valor: number, unidadOriginal: string, unidadDestino: string): number {
  if (unidadOriginal === unidadDestino) return valor
  if (unidadOriginal === 'g' && unidadDestino === 'kg') return valor / 1000
  if (unidadOriginal === 'kg' && unidadDestino === 'g') return valor * 1000
  if (unidadOriginal === 'ml' && unidadDestino === 'l') return valor / 1000
  if (unidadOriginal === 'l' && unidadDestino === 'ml') return valor * 1000
  return valor
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
            :items-per-page="25"
            :items-per-page-options="[10, 25, 50, 100, -1]"
            data-testid="ingredientes-consolidado-tabla"
          >
            <!-- requeridoDisplay (converted to display unit) -->
            <template #[`item.requeridoDisplay`]="{ item }">
              {{ aUnidadDisplay(item.requerido, item.unidad, mejorUnidad(item.unidad, item.requerido)).toFixed(2) }}
            </template>
            <!-- disponibleDisplay: on-hand stock (converted to display unit) -->
            <template #[`item.disponibleDisplay`]="{ item }">
              <span :class="{ 'text-success': item.disponible >= item.requerido }">
                {{ aUnidadDisplay(item.disponible, item.unidad, mejorUnidad(item.unidad, item.requerido)).toFixed(2) }}
              </span>
            </template>
            <!-- faltanteDisplay: colour-coded (converted to display unit) -->
            <template #[`item.faltanteDisplay`]="{ item }">
              <span
                v-if="item.faltante > 0"
                class="font-weight-bold text-error"
              >{{ aUnidadDisplay(item.faltante, item.unidad, mejorUnidad(item.unidad, item.requerido)).toFixed(2) }}</span>
              <span v-else class="text-success">✓</span>
            </template>
            <!-- unidadTipo: display unit for the row (may differ from original) -->
            <template #[`item.unidadTipo`]="{ item }">
              {{ unidadTipoLabel(mejorUnidad(item.unidad, item.requerido)) }}
            </template>
            <!-- costoUnitario -->
            <template #[`item.costoUnitario`]="{ item }">
              <span :class="{ 'text-medium-emphasis': item.faltante === 0 }">
                {{ (item.costoUnitario).toFixed(4) }}
              </span>
            </template>
            <!-- costoCompra: unit cost × faltante -->
            <template #[`item.costoCompra`]="{ item }">
              <span :class="{ 'text-medium-emphasis': item.faltante === 0 }">
                {{ (item.faltante * item.costoUnitario).toFixed(2) }}
              </span>
            </template>
          </v-data-table>

          <div
            v-if="consolidado.length > 0"
            class="d-flex justify-end pa-2 text-body-2 font-weight-medium"
            data-testid="ingredientes-consolidado-total"
          >
            Total compra: $ {{ costoCompraTotal.toFixed(2) }}
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
            <template #[`item.cantidadDisplay`]="{ item }">
              {{ item.requerido.toFixed(2) }}
            </template>
            <template #[`item.unidadTipo`]="{ item }">
              {{ unidadTipoLabel(item.unidad) }}
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
