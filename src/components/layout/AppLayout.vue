<script setup lang="ts">
import { ref } from 'vue'
import AppBar from '@/components/business/AppBar.vue'
import BottomNav from '@/components/navigation/BottomNav.vue'
import SideNavCompact from '@/components/navigation/SideNavCompact.vue'
import SideNavFull from '@/components/navigation/SideNavFull.vue'

const drawer = ref(false)

function toggleDrawer() {
  drawer.value = !drawer.value
}
</script>

<template>
  <v-app>
    <AppBar @menu-click="toggleDrawer" />

    <SideNavFull v-model="drawer" />

    <v-main>
      <router-view />
    </v-main>

    <BottomNav />
    <SideNavCompact />
  </v-app>
</template>
