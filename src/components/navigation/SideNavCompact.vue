<!-- REQ-NAV-1: Tablet sidebar (769–1024px). v-navigation-drawer in rail
     (compact) mode with 5 items — icons + short labels. Active item
     tracks the current route. Hidden on mobile/web via useBreakpoint. -->
<script setup lang="ts">
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

function isActive(itemRoute: string): boolean {
  if (itemRoute === '/') return route.path === '/'
  return route.path.startsWith(itemRoute)
}

function navigate(to: string): void {
  void router.push(to)
}
</script>

<template>
  <v-navigation-drawer
    v-if="bp === 'tablet'"
    data-testid="side-nav-compact"
    rail
    width="72"
  >
    <v-list density="compact" nav>
      <v-list-item
        v-for="item in items"
        :key="item.route"
        :active="isActive(item.route)"
        :prepend-icon="item.icon"
        :title="item.label"
        @click="navigate(item.route)"
      />
    </v-list>
  </v-navigation-drawer>
</template>
