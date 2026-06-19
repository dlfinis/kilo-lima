<script setup lang="ts">
// REQ-UX-9..12 + REQ-UX-25: clickable counter cards that link to each
// domain route. Presentational only — `contadores` is computed by
// useResumen() in the parent (HomeView). While `cargado === false`
// (first-paint or fetch-in-flight) the cards render a Vuetify skeleton
// loader so the user never sees a flash-of-empty counters.
//
// Each card is a `<v-card to="...">` so vue-router handles navigation
// (consistent with the existing `home-btn-*` buttons). testids map
// 1:1 to the spec scenarios in spec.md §3.
import { computed } from 'vue'
import type { Contadores } from '@/composables/useResumen'

const props = defineProps<{ contadores: Contadores }>()

const cargando = computed<boolean>(() => !props.contadores.cargado)

// Mirror the 6-counter design: 5 navigable + 1 read-only (ventas hoy,
// drives /pos). Each entry is the visual chip + its target route +
// its icon. Keeping the array shape lets us loop in the template.
const TARJETAS = [
  { testid: 'contador-materias-primas', etiqueta: 'Materias primas', ruta: '/materias-primas', icono: 'mdi-package-variant', color: 'primary', clave: 'materiasPrimas' as const },
  { testid: 'contador-recetas', etiqueta: 'Recetas', ruta: '/recetas', icono: 'mdi-book-open-variant', color: 'success', clave: 'recetas' as const },
  { testid: 'contador-eventos', etiqueta: 'Eventos', ruta: '/eventos', icono: 'mdi-calendar-check', color: 'warning', clave: 'eventosTotal' as const },
  { testid: 'contador-productos', etiqueta: 'Productos', ruta: '/productos', icono: 'mdi-store-outline', color: 'info', clave: 'productos' as const },
  { testid: 'contador-ventas-hoy', etiqueta: 'Ventas hoy', ruta: '/pos', icono: 'mdi-cart-outline', color: 'secondary', clave: 'ventasHoy' as const },
]
</script>

<template>
  <v-row dense data-testid="contadores-home">
    <template v-if="cargando">
      <v-col v-for="t in TARJETAS" :key="t.testid" cols="6" sm="4" md="2">
        <v-skeleton-loader
          type="card"
          data-testid="contador-skeleton"
        />
      </v-col>
    </template>
    <template v-else>
      <v-col
        v-for="t in TARJETAS"
        :key="t.testid"
        cols="6"
        sm="4"
        md="2"
      >
        <v-card
          :data-testid="t.testid"
          :to="t.ruta"
          variant="tonal"
          :color="t.color"
        >
          <v-card-text class="d-flex flex-column align-center text-center pa-3">
            <v-icon :icon="t.icono" size="large" class="mb-2" />
            <div class="text-h4 font-weight-bold">{{ contadores[t.clave] }}</div>
            <div class="text-caption text-medium-emphasis mt-1">{{ t.etiqueta }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </template>
  </v-row>
</template>
