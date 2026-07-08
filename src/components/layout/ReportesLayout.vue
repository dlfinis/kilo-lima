<template>
  <div data-testid="reportes-layout" class="reportes-layout">
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
  { label: 'Resumen', to: '/reportes' },
  { label: 'Contabilidad', to: '/reportes/contabilidad' },
  { label: 'Rentabilidad', to: '/reportes/rentabilidad' },
]

const activeTab = computed(() => route.path)
</script>
