<script setup lang="ts">
defineProps<{
  title: string
  icon: string
  section: string
}>()
</script>

<template>
  <v-container class="fill-height d-flex align-center justify-center">
    <v-card max-width="420" class="pa-6 text-center">
      <v-icon :icon="icon" size="64" color="primary" class="mb-4" />
      <h4 class="text-h4 mb-2">{{ title }}</h4>
      <p class="text-subtitle-1 text-medium-emphasis mb-6">{{ section }}</p>
      <v-btn to="/" color="primary" variant="tonal" prepend-icon="mdi-home">
        Volver al inicio
      </v-btn>
    </v-card>
  </v-container>
</template>
