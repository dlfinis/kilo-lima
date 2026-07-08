// REQ-UX-1..4 + REQ-UX-25: global v-app-bar with back button,
// HomeIcon, BreadcrumbNav and appStore.appName title. Mounted once
// in App.vue so every route shows the same navigation surface (no
// per-view header duplication). Back button visibility follows
// useNavegacion().puedeVolver so it is hidden on the root route and
// visible on nested routes. Home icon always renders and links to /.
<script setup lang="ts">
import { useRouter } from 'vue-router'

import { useAppStore } from '@/stores/app.store'
import { useNavegacion } from '@/composables/useNavegacion'
import BreadcrumbNav from '@/components/business/BreadcrumbNav.vue'

const appStore = useAppStore()
const router = useRouter()
const { breadcrumbs, puedeVolver, irAtras } = useNavegacion()

function irAInicio(): void {
  void router.push('/')
}
</script>

<template>
  <v-app-bar app color="surface" data-testid="app-bar" density="comfortable" elevation="1">
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