<script setup lang="ts">
// Foundation PR2 root component: Vuetify layout shell. <v-app> applies
// the theme background and <v-main> provides the responsive padding
// grid that every page composes against.
</script>

<template>
  <v-app>
    <v-main>
      <div id="app-root">
        <h1>Kilo-Lima</h1>
      </div>
      <router-view />
    </v-main>
  </v-app>
</template>
