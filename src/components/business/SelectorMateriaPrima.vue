<script setup lang="ts">
// REQ-CATALOG-10, REQ-CATALOG-40, REQ-CATALOG-45: autocomplete that
// picks one materia_prima. The parent owns the options list (DIP) so
// the component stays a thin presentational seam. The label format
// "Harina (kg)" matches the design §5 lockup.
import { computed } from 'vue'

import type { MateriaPrima } from '@/types'

const props = defineProps<{
  modelValue: string | null
  materiasPrimas: MateriaPrima[]
  etiqueta?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string | null]
}>()

const items = computed(() =>
  props.materiasPrimas.map((m) => ({
    title: `${m.nombre} (${m.unidad})`,
    value: m.id,
  })),
)

function onUpdate(value: string | null) {
  emit('update:modelValue', value)
}
</script>

<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="items"
    :label="etiqueta ?? 'Materia prima'"
    clearable
    data-testid="selector-materia-prima"
    @update:model-value="onUpdate"
  />
</template>
