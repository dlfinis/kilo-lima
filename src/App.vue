<script setup lang="ts">
// REQ-NAV-1: When VITE_FLAG_MOBILE_UX='true', App.vue renders the
// responsive AppLayout with BottomNav/SideNavCompact/SideNavFull.
// Otherwise, the legacy AppBar-only layout stays active (safe rollback).
// The flag is build-time only — a rebuild is required to switch.
import { useUiStore } from '@/stores/ui.store'
import AppBar from '@/components/business/AppBar.vue'
import AppLayout from '@/components/layout/AppLayout.vue'

const ui = useUiStore()
</script>

<template>
  <AppLayout v-if="ui.useMobileUx" />
  <v-app v-else>
    <AppBar />
    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>
