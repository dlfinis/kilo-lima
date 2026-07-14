<script setup lang="ts">
// REQ-CATALOG-1: one row in the materia prima list. Minimal typed props
// per ISP (REQ-CATALOG-45) — emits `edit` and `delete` so the parent view
// owns the action handlers and confirmation dialog (REQ-CATALOG-41).
import { formatearUSD } from '@/utils/format'
import type { MateriaPrima } from '@/types'

defineProps<{
  materia: MateriaPrima
  stockActual?: number | null
}>()

const emit = defineEmits<{
  edit: [id: string]
  delete: [id: string]
  'movement': [id: string]
}>()
</script>

<template>
  <v-list-item :data-testid="`mp-row-${materia.id}`">
    <v-list-item-title>
      {{ materia.nombre }}
      <v-chip size="x-small" class="ml-2" :color="materia.categoria === 'ingrediente' ? 'primary' : 'secondary'">
        {{ materia.categoria === 'ingrediente' ? 'Ingrediente' : 'Empaque' }}
      </v-chip>
    </v-list-item-title>
    <v-list-item-subtitle>
      {{ materia.unidad }} · {{ formatearUSD(materia.costo_por_unidad) }} / {{ materia.unidad }}
      <template v-if="stockActual !== undefined && stockActual !== null">
        · Stock: <span :class="stockActual <= 0 ? 'text-error' : 'text-success'">{{ stockActual }}</span> {{ materia.unidad }}
      </template>
    </v-list-item-subtitle>
    <template #append>
      <v-btn icon="mdi-swap-horizontal" variant="text" size="small" color="info" :data-testid="`mp-movement-${materia.id}`" @click="emit('movement', materia.id)" />
      <v-btn icon="mdi-pencil" variant="text" size="small" :data-testid="`mp-edit-${materia.id}`" @click="emit('edit', materia.id)" />
      <v-btn icon="mdi-delete" variant="text" size="small" color="error" :data-testid="`mp-delete-${materia.id}`" @click="emit('delete', materia.id)" />
    </template>
  </v-list-item>
</template>
