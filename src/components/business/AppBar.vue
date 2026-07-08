// REQ-UX-1..4 + REQ-UX-25: global v-app-bar with hamburger menu (web),
// back button, HomeIcon, BreadcrumbNav and appStore.appName title.
// Mounted once in App.vue so every route shows the same navigation surface.
<script setup lang="ts">
import { useRouter } from 'vue-router'

import { useAppStore } from '@/stores/app.store'
import { useNavegacion } from '@/composables/useNavegacion'
import { useBreakpoint } from '@/composables/useBreakpoint'
import BreadcrumbNav from '@/components/business/BreadcrumbNav.vue'

const appStore = useAppStore()
const router = useRouter()
const bp = useBreakpoint()
const { breadcrumbs, puedeVolver, irAtras } = useNavegacion()

const emit = defineEmits<{
  'menu-click': []
}>()

function irAInicio(): void {
  void router.push('/')
}
</script>

<template>
  <v-app-bar app color="surface" data-testid="app-bar" density="comfortable" elevation="1">
    <v-btn
      v-if="bp === 'web'"
      icon="mdi-menu"
      variant="text"
      data-testid="app-bar-menu"
      aria-label="Menú"
      @click="emit('menu-click')"
    />

    <v-btn
      v-else-if="puedeVolver"
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

    <v-app-bar-title data-testid="app-bar-title" class="d-flex align-center gap-2">
      <v-icon
        icon="mdi-scale-balanced"
        color="primary"
        size="28"
        class="me-2"
      />
      <span class="text-h6 font-weight-bold text-primary">
        {{ appStore.appName }}
      </span>
    </v-app-bar-title>

    <BreadcrumbNav :items="breadcrumbs" class="ms-4 d-none d-md-flex" />
  </v-app-bar>
</template>