<script setup lang="ts">
// Foundation PR2 root component: Vuetify layout shell. The global
// AppBar (REQ-UX-1) mounts above the router-view so every route shows
// the back button + breadcrumb + brand title. The leftover
// <h1>Kilo-Lima</h1> from foundation PR2 was redundant once the
// AppBar started carrying the brand — removed.
import AppBar from '@/components/business/AppBar.vue'
</script>

<template>
  <v-app>
    <AppBar />
    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>
