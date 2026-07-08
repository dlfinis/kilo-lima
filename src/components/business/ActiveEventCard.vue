<script setup lang="ts">
// mobile-ux-redesign Phase 2: ActiveEventCard component.
// Displays the active event's name, date, status, and a prominent
// "Ir a caja →" CTA button. Hidden when no active event exists.
import { computed } from 'vue'

import { useEventoActivo } from '@/composables/useEventoActivo'
import { formatearFechaCorta } from '@/utils/format'
import EventoStatusChip from '@/components/business/EventoStatusChip.vue'

const { activeEvent } = useEventoActivo()

const evento = computed(() => activeEvent.value)
const visible = computed(() => evento.value !== null)
</script>

<template>
  <v-card
    v-if="visible"
    data-testid="active-event-card"
    color="warning"
    variant="tonal"
    class="mb-4"
  >
    <v-card-text class="pa-4">
      <div class="d-flex align-center justify-space-between flex-wrap ga-3">
        <div>
          <div
            data-testid="active-event-name"
            class="text-h5 font-weight-bold mb-1"
          >
            {{ evento!.nombre }}
          </div>
          <div class="d-flex align-center ga-3 text-body-2 text-medium-emphasis">
            <span>{{ formatearFechaCorta(evento!.fecha) }}</span>
            <EventoStatusChip :estado="evento!.estado" />
          </div>
        </div>
        <v-btn
          data-testid="active-event-cta"
          to="/pos"
          color="amber"
          variant="flat"
          size="x-large"
          append-icon="mdi-arrow-right"
        >
          Ir a caja
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>
