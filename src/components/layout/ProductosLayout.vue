<template>
  <div data-testid="productos-layout" class="productos-layout">
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
  { label: 'Productos', to: '/productos' },
  // catalog-domain-refactor / Slice 3: renamed from Recetas to Preparaciones
  { label: 'Preparaciones', to: '/productos/preparaciones' },
]

const activeTab = computed(() => route.path)
</script>
