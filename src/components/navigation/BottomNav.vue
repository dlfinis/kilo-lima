<!-- REQ-NAV-1: Mobile bottom navigation (≤768px). 5-item v-bottom-navigation
     with icons + labels. Active item tracks the current route. Hidden on
     tablet/web via the useBreakpoint composable. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBreakpoint } from '@/composables/useBreakpoint'

const router = useRouter()
const route = useRoute()
const bp = useBreakpoint()

const items = [
  { icon: 'mdi-home', label: 'Inicio', route: '/' },
  { icon: 'mdi-cash-register', label: 'Caja', route: '/pos' },
  { icon: 'mdi-package-variant', label: 'Productos', route: '/productos' },
  { icon: 'mdi-warehouse', label: 'Inventario', route: '/inventario' },
  { icon: 'mdi-chart-bar', label: 'Reportes', route: '/reportes' },
] as const

const activeIndex = computed(() =>
  items.findIndex((item) => {
    // Exact match for root; prefix match for nested routes.
    if (item.route === '/') return route.path === '/'
    return route.path.startsWith(item.route)
  }),
)

function navigate(to: string): void {
  void router.push(to)
}
</script>

<template>
  <v-bottom-navigation
    v-if="bp === 'mobile'"
    :model-value="activeIndex"
    bg-color="surface"
    grow
  >
    <template v-for="(item, i) in items" :key="item.route">
      <v-btn :value="i" @click="navigate(item.route)">
        <v-icon :icon="item.icon" />
        <span>{{ item.label }}</span>
      </v-btn>
    </template>
  </v-bottom-navigation>
</template>
