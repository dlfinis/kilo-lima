<script setup lang="ts">
// REQ-EVENTS-10, REQ-EVENTS-11: one row in the gastos fijos list.
// Shows categoria label, monto USD, descripcion. Emits `eliminar`
// so the parent view owns the confirmation dialog (REQ-EVENTS-39).
import { formatearUSD } from '@/utils/format'
import type { CategoriaGasto, GastoFijo } from '@/types'

defineProps<{ gasto: GastoFijo }>()

const emit = defineEmits<{
  eliminar: [id: string]
}>()

const ETIQUETAS: Record<CategoriaGasto, string> = {
  renta: 'Renta',
  transporte: 'Transporte',
  permisos: 'Permisos',
  publicidad: 'Publicidad',
  servicios: 'Servicios',
  otro: 'Otro',
}
</script>

<template>
  <v-list-item :data-testid="`gasto-row-${gasto.id}`">
    <v-list-item-title>{{ ETIQUETAS[gasto.categoria] }}</v-list-item-title>
    <v-list-item-subtitle>
      {{ gasto.descripcion ?? 'Sin descripción' }}
    </v-list-item-subtitle>
    <template #append>
      <span class="text-body-2 mr-3">{{ formatearUSD(gasto.monto) }}</span>
      <v-btn
        icon="mdi-delete"
        variant="text"
        size="small"
        color="error"
        :data-testid="`gasto-eliminar-${gasto.id}`"
        @click="emit('eliminar', gasto.id)"
      />
    </template>
  </v-list-item>
</template>
