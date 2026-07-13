<script setup lang="ts">
// REQ-EVENTS-1, REQ-EVENTS-37: one row in the eventos list. Shows
// nombre, formatted fecha, EventoStatusChip. Emits `click` (open
// detail) and `eliminar` so the parent view owns the navigation +
// delete confirmation dialog (REQ-EVENTS-39).
import EventoStatusChip from './EventoStatusChip.vue'
import type { Evento } from '@/types'

defineProps<{
  evento: Evento
  costoTotal: number
  unidadesPlanificadas: number
  breakEvenUnidades: number | null
}>()

const emit = defineEmits<{
  click: [id: string]
  eliminar: [id: string]
}>()

function formatearFecha(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY for the Spanish locale display.
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
</script>

<template>
  <v-list-item :data-testid="`evento-row-${evento.id}`" @click="emit('click', evento.id)">
    <v-list-item-title>{{ evento.nombre }}</v-list-item-title>
    <v-list-item-subtitle>
      {{ formatearFecha(evento.fecha) }}
      <span v-if="unidadesPlanificadas > 0" class="ml-2">
        · <strong>{{ unidadesPlanificadas }}</strong> unidades
      </span>
      <span v-if="breakEvenUnidades !== null" class="ml-2 text-medium-emphasis">
        · BE: {{ breakEvenUnidades }} uds
      </span>
    </v-list-item-subtitle>
    <template #prepend>
      <EventoStatusChip :estado="evento.estado" />
    </template>
    <template #append>
      <v-btn
        icon="mdi-delete"
        variant="text"
        size="small"
        color="error"
        :data-testid="`evento-eliminar-${evento.id}`"
        @click.stop="emit('eliminar', evento.id)"
      />
    </template>
  </v-list-item>
</template>
