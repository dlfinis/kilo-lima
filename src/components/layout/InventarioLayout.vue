<template>
  <div data-testid="inventario-layout" class="inventario-layout">
    <!-- Sub-navigation tabs -->
    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        :value="tab.to"
      >
        {{ tab.label }}
      </v-tab>
    </v-tabs>

    <!-- Child route view -->
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { label: 'Inventario', to: '/inventario/materias' },
  { label: 'Movimientos', to: '/inventario/movimientos' },
  { label: 'Compras', to: '/inventario/compras' },
]

const activeTab = computed(() => route.path)
</script>
