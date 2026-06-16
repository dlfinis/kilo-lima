<script setup lang="ts">
import { useAppStore } from '@/stores/app.store'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const app = useAppStore()
const { online } = useOnlineStatus()
</script>

<template>
  <v-container>
    <h1>Kilo-Lima</h1>
    <p>Pre-evento · Durante evento · Post-evento</p>
    <v-card
      :color="online ? 'success' : 'warning'"
      class="mt-4 pa-4"
      data-testid="estado-conexion"
    >
      <v-card-title>{{ app.appName }}</v-card-title>
      <v-card-text>
        {{ online ? 'En línea' : 'Sin conexión' }}
      </v-card-text>
    </v-card>
  </v-container>
</template>
