<script setup lang="ts">
// REQ-UX-17..19 + REQ-UX-25: SiguientePasoCta. Runs the home's
// `contadores` snapshot through the pure `obtenerSiguientePaso`
// helper and renders the recommended step as a colour-coded card.
// Renders nothing when the helper returns null (user is in motion
// — every counter is non-zero).
import { computed } from 'vue'
import { obtenerSiguientePaso } from '@/utils/siguientePaso'
import type { Contadores } from '@/composables/useResumen'

const props = defineProps<{ contadores: Contadores }>()

const paso = computed(() => obtenerSiguientePaso(props.contadores))
</script>

<template>
  <v-card
    v-if="paso"
    :data-testid="paso.testid"
    variant="tonal"
    :color="paso.colorBoton"
    class="mb-4"
  >
    <v-card-text class="d-flex align-center justify-space-between flex-wrap ga-3">
      <div>
        <strong>{{ paso.texto }}</strong>
      </div>
      <v-btn
        :to="paso.ruta"
        :color="paso.colorBoton"
        variant="flat"
        append-icon="mdi-arrow-right"
        :data-testid="`${paso.testid}-boton`"
      >
        {{ paso.textoBoton }}
      </v-btn>
    </v-card-text>
  </v-card>
</template>
