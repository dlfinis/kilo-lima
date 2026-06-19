<script setup lang="ts">
// REQ-UX-13..16 + REQ-UX-25: warning banner when there is an evento
// `en_curso`. Reads `ventasStore.eventoEnCurso` (cross-store computed
// per REQ-POS-51) — zero new queries. Hidden when the computed
// returns null (banner disappears automatically when the evento
// transitions to `cerrado` because the cross-store filter no longer
// matches).
import { computed } from 'vue'
import { useVentas } from '@/composables/useVentas'
import { formatearFechaCorta } from '@/utils/format'

const ventas = useVentas()
const evento = computed(() => ventas.eventoEnCurso.value)
const visible = computed(() => evento.value !== null)
</script>

<template>
  <v-alert
    v-if="visible"
    type="warning"
    variant="tonal"
    data-testid="banner-evento-activo"
    class="mb-4"
  >
    <template #prepend>
      <v-icon icon="mdi-broadcast" />
    </template>
    <div class="d-flex align-center justify-space-between flex-wrap ga-2">
      <div>
        <strong>{{ evento!.nombre }}</strong>
        · {{ formatearFechaCorta(evento!.fecha) }}
      </div>
      <v-btn
        :to="'/pos'"
        color="warning"
        variant="flat"
        append-icon="mdi-arrow-right"
        data-testid="banner-evento-activo-cta"
      >
        IR A CAJA
      </v-btn>
    </div>
  </v-alert>
</template>
