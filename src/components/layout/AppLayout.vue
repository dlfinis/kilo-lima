<!-- REQ-NAV-1: Responsive shell. Wraps router-view and conditionally
     renders BottomNav (mobile ≤768), SideNavCompact (tablet 769–1024),
     or the existing AppBar-only layout (web >1024). AppBar is present
     at the top for all breakpoints. -->
<script setup lang="ts">
import AppBar from '@/components/business/AppBar.vue'
import BottomNav from '@/components/navigation/BottomNav.vue'
import SideNavCompact from '@/components/navigation/SideNavCompact.vue'
</script>

<template>
  <v-app>
    <AppBar />

    <v-main>
      <router-view />
    </v-main>

    <BottomNav />
    <SideNavCompact />
  </v-app>
</template>
