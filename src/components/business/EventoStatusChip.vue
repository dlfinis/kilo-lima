<script setup lang="ts">
// REQ-EVENTS-37: status chip with semantic Vuetify color per estado.
// `info` for planificacion (active planning), `warning` for en_curso
// (in-progress), grey for cerrado (completed). Spanish labels per
// REQ-EVENTS-36.
import type { EstadoEvento } from '@/types'

defineProps<{ estado: EstadoEvento }>()

const ETIQUETAS: Record<EstadoEvento, { texto: string; color: string }> = {
  planificacion: { texto: 'Planificación', color: 'info' },
  en_curso: { texto: 'En curso', color: 'warning' },
  cerrado: { texto: 'Cerrado', color: 'grey' },
}
</script>

<template>
  <v-chip
    :color="ETIQUETAS[estado].color"
    size="small"
    :data-testid="`evento-chip-${estado}`"
  >
    {{ ETIQUETAS[estado].texto }}
  </v-chip>
</template>
