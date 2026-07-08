<!-- REQ-NAV-1: Web sidebar (>1024px). Full navigation-drawer with icons + labels.
     Active item tracks the current route. Hidden on mobile/tablet via useBreakpoint. -->
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
    v-if="bp === 'web'"
    permanent
    width="240"
  >
    <v-list density="comfortable" nav>
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
