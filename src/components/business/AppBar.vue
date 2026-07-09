// REQ-UX-1..4 + REQ-UX-25: global v-app-bar with hamburger menu
// (mobile/tablet only, hidden when puedeVolver), back button,
// HomeIcon, and BreadcrumbNav. System title moved to sidebar.
// Mounted once in App.vue so every route shows the same navigation surface.
// REQ-NAV-X: rail toggle button on web breakpoint collapses/expands sidebar.
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useBreakpoint } from '@/composables/useBreakpoint'
import { useNavegacion } from '@/composables/useNavegacion'
import { useSidebarRail } from '@/composables/useSidebarRail'
import BreadcrumbNav from '@/components/business/BreadcrumbNav.vue'

const bp = useBreakpoint()
const router = useRouter()
const { breadcrumbs, puedeVolver, irAtras } = useNavegacion()
const { rail, toggle: toggleRail } = useSidebarRail()

const railAriaLabel = computed(() =>
  rail.value ? 'Expandir menú' : 'Colapsar menú',
)

const railIcon = computed(() =>
  rail.value ? 'mdi-chevron-right-box' : 'mdi-chevron-left-box',
)

const emit = defineEmits<{
  (e: 'menu-click'): void
}>()

function irAInicio(): void {
  void router.push('/')
}
</script>

<template>
  <v-app-bar app color="surface" data-testid="app-bar" density="comfortable" elevation="1">
    <v-btn
      v-if="bp !== 'web' && !puedeVolver"
      icon="mdi-menu"
      variant="text"
      data-testid="app-bar-menu"
      aria-label="Menú"
      @click="emit('menu-click')"
    />

    <v-btn
      v-if="puedeVolver"
      icon="mdi-arrow-left"
      variant="text"
      data-testid="app-bar-back"
      aria-label="Volver"
      @click="irAtras"
    />

    <v-btn
      icon
      variant="text"
      data-testid="app-bar-home"
      aria-label="Inicio"
      @click="irAInicio"
    >
      <v-icon icon="mdi-home" />
    </v-btn>

    <BreadcrumbNav :items="breadcrumbs" class="ms-4 d-none d-md-flex" />

    <v-btn
      v-if="bp === 'web'"
      :icon="railIcon"
      variant="text"
      data-testid="app-bar-rail-toggle"
      :aria-label="railAriaLabel"
      class="ms-auto"
      @click="toggleRail"
    />
  </v-app-bar>
</template>
