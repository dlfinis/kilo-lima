<script setup lang="ts">
// REQ-UX-20, REQ-UX-25: generic FAB wrapper around Vuetify's
// <v-fab>. Replaces the inline "+ Nuevo X" button in each list view
// (design decision 6: per-view FAB keeps the dialog-owner pattern —
// the FAB emits `click` and the view's `abrirCrear` function owns
// the dialog state).
//
// Props: icon, color, ariaLabel, testid. Emits: click.
defineProps<{
  icon?: string
  color?: string
  ariaLabel: string
  testid: string
}>()

const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <v-fab
    :data-testid="testid"
    :aria-label="ariaLabel"
    :icon="icon ?? 'mdi-plus'"
    :color="color ?? 'primary'"
    app
    location="bottom end"
    @click="emit('click')"
  />
</template>
