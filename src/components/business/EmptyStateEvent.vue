<script setup lang="ts">
// mobile-ux-redesign Phase 2: EmptyStateEvent component.
// Shows a friendly message when no active event exists, with two
// variants:
//   0 non-cerrado events total → "No hay eventos activos" + Crear evento
//   >1 non-cerrado events     → "Hay múltiples eventos sin cerrar" + Ver eventos
// Hidden when exactly one active event exists (ActiveEventCard shows instead).
import { computed } from 'vue'

import { useEventoActivo } from '@/composables/useEventoActivo'
import { useEventsStore } from '@/stores/events.store'

const { activeEvent } = useEventoActivo()
const eventsStore = useEventsStore()

const visible = computed(() => activeEvent.value === null)

const noCerradosCount = computed(
  () => eventsStore.eventos.filter((e) => e.estado !== 'cerrado').length,
)

const titulo = computed(() =>
  noCerradosCount.value === 0
    ? 'No hay eventos activos'
    : 'Hay múltiples eventos sin cerrar',
)

const subtitulo = computed(() =>
  noCerradosCount.value === 0
    ? 'Creá un evento para empezar a vender en ferias'
    : 'Cerrá los eventos que ya terminaron para activar uno solo',
)

const botonTexto = computed(() =>
  noCerradosCount.value === 0 ? 'Crear evento' : 'Ver eventos',
)
</script>

<template>
  <v-card
    v-if="visible"
    data-testid="empty-state-event"
    variant="tonal"
    color="grey-lighten-3"
    class="mb-4"
  >
    <v-card-text class="pa-6 text-center">
      <v-icon icon="mdi-calendar-blank" size="x-large" class="mb-3 text-medium-emphasis" />
      <h3 class="text-h6 mb-1">{{ titulo }}</h3>
      <p class="text-body-2 text-medium-emphasis mb-4">{{ subtitulo }}</p>
      <v-btn
        data-testid="empty-state-cta"
        :to="'/eventos'"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
      >
        {{ botonTexto }}
      </v-btn>
    </v-card-text>
  </v-card>
</template>
