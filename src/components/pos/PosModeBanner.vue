<script setup lang="ts">
// mobile-ux-redesign Phase 3: PosModeBanner — shows current POS mode
// at the top of the screen as a small, non-intrusive chip.
import { usePosMode } from '@/composables/usePosMode'

const { isSimplifiedMode } = usePosMode()
</script>

<template>
  <div class="pos-mode-banner text-center mb-2">
    <v-chip
      v-if="isSimplifiedMode"
      size="small"
      color="success"
      variant="tonal"
      data-testid="pos-mode-banner"
    >
      <v-icon start size="small">mdi-flash</v-icon>
      Modo rápido &mdash; Evento activo
    </v-chip>
    <v-chip
      v-else
      size="small"
      color="grey"
      variant="outlined"
      data-testid="pos-mode-banner"
    >
      <v-icon start size="small">mdi-view-dashboard</v-icon>
      Modo completo
    </v-chip>
  </div>
</template>
