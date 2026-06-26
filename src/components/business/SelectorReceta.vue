<script setup lang="ts">
// REQ-EVENTS-15, REQ-EVENTS-17, REQ-EVENTS-43: autocomplete that picks
// one receta. Separate from SelectorMateriaPrima (ISP — different
// domain, no shared prop coupling). The component reads recetas from
// the catalog store by default but accepts a `recetas` prop so a
// caller can pass a pre-filtered list (e.g., the planning view's
// already-loaded recetas).
//
// `excludeIds` filters recetas whose id is already in the plan so the
// user cannot pick a duplicate — client-side check matches the DB
// UNIQUE(evento_id, receta_id) constraint (REQ-EVENTS-17).
//
// Emits both `update:modelValue` (id, for v-model binding) and
// `select` (full Receta, so the caller can read `costoPorUnidad`
// directly without a second lookup).
import { computed } from 'vue'

import type { RecetaConIngredientes } from '@/types'
import { useRecipesStore } from '@/stores/recipes.store'

const props = withDefaults(
  defineProps<{
    modelValue: string | null
    recetas?: RecetaConIngredientes[]
    excludeIds?: string[]
    etiqueta?: string
  }>(),
  { recetas: undefined, excludeIds: () => [], etiqueta: 'Receta' },
)

const emit = defineEmits<{
  'update:modelValue': [id: string | null]
  select: [receta: RecetaConIngredientes]
}>()

// Lazy store access: only initialize the recipes store when no prop
// was supplied. Lets the test suite pass `recetas` as a prop and
// skip the Pinia/supabase context entirely.
const lista = computed<RecetaConIngredientes[]>(() => {
  if (props.recetas) return props.recetas
  return useRecipesStore().recetas
})

const items = computed(() =>
  lista.value
    .filter((r) => !props.excludeIds.includes(r.id))
    .map((r) => ({ title: r.nombre, value: r.id })),
)

function onUpdate(value: string | null) {
  emit('update:modelValue', value)
  if (value !== null) {
    const receta = lista.value.find((r) => r.id === value)
    if (receta) emit('select', receta)
  }
}
</script>

<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="items"
    item-title="title"
    item-value="value"
    :label="etiqueta"
    clearable
    data-testid="selector-receta"
    @update:model-value="onUpdate"
  />
</template>