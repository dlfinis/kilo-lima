<script setup lang="ts">
// REQ-EVENTS-15, REQ-EVENTS-16, REQ-EVENTS-18: one row in the plan
// grid. Pairs a SelectorReceta with a `unidades_a_producir` number
// input and renders the live cost formula "× {unidades} =
// ${costoLinea}" so the user sees the impact of their quantity
// decision before saving (REQ-EVENTS-18). The delete button is
// hidden when `editable` is false so the row is read-only on cerrado
// eventos (REQ-EVENTS-16).
import { computed } from 'vue'

import SelectorReceta from './SelectorReceta.vue'
import { formatearUSD } from '@/utils/format'
import type { PlanProduccionInput, RecetaConIngredientes } from '@/types'

const props = withDefaults(
  defineProps<{
    fila: PlanProduccionInput
    recetas: RecetaConIngredientes[]
    costoLinea: number
    editable?: boolean
  }>(),
  { editable: true },
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

const formula = computed(() => {
  const unidades = Number(props.fila.unidades_a_producir) || 0
  return `× ${unidades} = ${formatearUSD(props.costoLinea)}`
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
  <div class="plan-fila d-flex ga-2 align-center mb-2" data-testid="plan-fila">
    <SelectorReceta
      class="flex-grow-1"
      :model-value="fila.receta_id || null"
      :recetas="recetas"
      :exclude-ids="excludeIds"
      :editable="editable"
      @update:model-value="onRecetaSeleccionada"
    />
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
    <span class="text-body-2" data-testid="plan-fila-costo">{{ formula }}</span>
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