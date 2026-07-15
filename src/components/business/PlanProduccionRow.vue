<script setup lang="ts">
// plan-fila-layout: one row in the plan grid. Three-zone CSS grid
// (identity, units, cost) so operators can scan identity, quantity,
// and production cost consistently across rows. Production cost
// remains the dominant economic signal; unit cost and optional
// pricing context are subordinate.
//
// The delete button is hidden when `editable` is false so the row is
// read-only on cerrado eventos (REQ-EVENTS-16). The `update` and
// `eliminar` emits are unchanged — the save contract with the grid
// is preserved (REQ-EVENTS-15, REQ-EVENTS-19).
import { computed } from 'vue'

import SelectorReceta from './SelectorReceta.vue'
import { formatearUSD } from '@/utils/format'
import type {
  EventoProductoConDetalle,
  PlanProduccionInput,
  RecetaConIngredientes,
} from '@/types'

// Local row type — the enrichment fields are optional so the row
// works with both the grid's enriched `RecetaPlanOption[]` and the
// unenriched `RecetaConIngredientes[]` used in the existing tests.
type RecetaPlanRow = RecetaConIngredientes & {
  recetaNombre?: string
  productoId?: string | null
  productoNombre?: string | null
}

const props = withDefaults(
  defineProps<{
    fila: PlanProduccionInput
    recetas: RecetaPlanRow[]
    costoLinea: number
    costoUnitario?: number
    editable?: boolean
    pricingData?: EventoProductoConDetalle[]
  }>(),
  { editable: true, costoUnitario: 0, pricingData: undefined },
)

const emit = defineEmits<{
  update: [fila: PlanProduccionInput]
  eliminar: [recetaId: string]
}>()

// Stage A bugfix: do not self-exclude the row's own receta from the
// selector's items. The grid already prevents duplicate recetas via
// validarDuplicados() (REQ-EVENTS-17), so row-level exclusion is
// unnecessary and caused the selected name to render blank.
const excludeIds = computed<string[]>(() => [])

const recetaSeleccionada = computed<RecetaPlanRow | undefined>(() =>
  props.recetas.find((r) => r.id === props.fila.receta_id),
)

// Secondary identity: the preparation name shown below the primary
// label only when a commercial product exists — this tells the
// operator which preparation backs the product.
const secondaryLabel = computed<string | null>(() => {
  const sel = recetaSeleccionada.value
  if (!sel?.productoNombre) return null
  return sel.recetaNombre ?? sel.nombre
})

// Missing-product badge: visible only in read-only mode so the row
// signals "no commercial product configured" without cluttering the
// editable view.
const mostrarBadgeSinProducto = computed<boolean>(() => {
  if (props.editable) return false
  const sel = recetaSeleccionada.value
  return !!sel && !sel.productoId
})

const unidades = computed<number>(() => Number(props.fila.unidades_a_producir) || 0)

// Optional pricing context: match by receta_id. Only render when the
// entry is valid (precio_final > 0, finite) — no placeholders.
const pricingEntry = computed<EventoProductoConDetalle | undefined>(() => {
  if (!props.pricingData?.length || !props.fila.receta_id) return undefined
  return props.pricingData.find((ep) => ep.receta_id === props.fila.receta_id)
})

const precioEventoValido = computed<boolean>(() => {
  const ep = pricingEntry.value
  return !!ep && Number.isFinite(ep.precio_final) && ep.precio_final > 0
})

const contribucionValida = computed<boolean>(() => {
  const ep = pricingEntry.value
  if (!ep) return false
  const contrib = ep.precio_final - ep.costo_unitario
  return Number.isFinite(contrib)
})

const contribucionMonto = computed<number>(() => {
  const ep = pricingEntry.value
  if (!ep) return 0
  return ep.precio_final - ep.costo_unitario
})

function onRecetaSeleccionada(recetaId: string | null) {
  emit('update', { ...props.fila, receta_id: recetaId ?? '' })
}

function onUnidadesChange(valor: string | number) {
  const unidades = typeof valor === 'number' ? valor : Number(valor)
  emit('update', { ...props.fila, unidades_a_producir: Number.isFinite(unidades) ? unidades : 0 })
}

function onEliminar() {
  emit('eliminar', props.fila.receta_id)
}
</script>

<template>
  <div class="plan-fila-grid mb-2" data-testid="plan-fila">
    <!-- Identity zone -->
    <div class="plan-fila-identity" data-testid="plan-fila-identity">
      <SelectorReceta
        :model-value="fila.receta_id || null"
        :recetas="recetas"
        :exclude-ids="excludeIds"
        :editable="editable"
        @update:model-value="onRecetaSeleccionada"
      />
      <p
        v-if="secondaryLabel"
        class="plan-fila-secondary text-caption text-medium-emphasis text-truncate"
        :title="secondaryLabel"
      >
        {{ secondaryLabel }}
      </p>
      <v-chip
        v-if="mostrarBadgeSinProducto"
        size="small"
        color="warning"
        variant="tonal"
        data-testid="plan-fila-sin-producto"
      >
        Sin producto comercial
      </v-chip>
    </div>

    <!-- Units zone -->
    <div class="plan-fila-unidades">
      <v-text-field
        :model-value="fila.unidades_a_producir"
        label="Unidades"
        type="number"
        min="1"
        step="1"
        density="compact"
        :disabled="!editable"
        style="max-width: 140px"
        data-testid="plan-fila-unidades"
        @update:model-value="onUnidadesChange"
      />
    </div>

    <!-- Cost zone -->
    <div class="plan-fila-costo" data-testid="plan-fila-costo">
      <span class="plan-fila-unit-cost text-caption text-medium-emphasis">
        {{ formatearUSD(costoUnitario) }} × {{ unidades }}
      </span>
      <span class="plan-fila-total text-body-1 font-weight-bold">
        {{ formatearUSD(costoLinea) }}
      </span>
      <div
        v-if="precioEventoValido"
        class="plan-fila-pricing d-flex ga-1 flex-wrap"
      >
        <v-chip
          size="small"
          variant="tonal"
          color="info"
          data-testid="plan-fila-precio-evento"
        >
          Precio: {{ formatearUSD(pricingEntry!.precio_final) }}
        </v-chip>
        <v-chip
          v-if="contribucionValida"
          size="small"
          variant="tonal"
          color="success"
          data-testid="plan-fila-contribucion"
        >
          Margen: {{ formatearUSD(contribucionMonto) }}
        </v-chip>
      </div>
    </div>

    <!-- Delete action -->
    <v-btn
      v-if="editable"
      icon="mdi-close"
      size="small"
      variant="text"
      color="error"
      data-testid="plan-fila-eliminar"
      @click="onEliminar"
    />
  </div>
</template>

<style scoped>
.plan-fila-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
}

.plan-fila-identity {
  min-width: 0;
}

.plan-fila-secondary {
  margin: 0;
  line-height: 1.2;
}

.plan-fila-costo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  white-space: nowrap;
}

.plan-fila-unit-cost {
  line-height: 1.2;
}

.plan-fila-total {
  line-height: 1.3;
}

.plan-fila-pricing {
  margin-top: 4px;
  justify-content: flex-end;
}
</style>
