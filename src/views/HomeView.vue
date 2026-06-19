<script setup lang="ts">
// REQ-UX-9..19 + REQ-UX-25: HomeView rewrite. PR2 of ux-improvements
// adds three new presentational components that turn the home from a
// passive landing page into an action-oriented context surface:
//
//   - ContadoresHome: live snapshot of the 6 domain counters (links
//     to each route).
//   - BannerEventoActivo: warning banner when an evento is en_curso
//     (drives the user to /pos).
//   - SiguientePasoCta: the recommended next step computed by
//     `obtenerSiguientePaso(contadores)`. Hidden when no step is
//     recommended (user is in motion).
//
// The 3 phase cards from foundation PR2 are kept as a SECONDARY
// navigation surface (smaller, below the new components) so the
// brief §3.1 Progressive Disclosure model still works.
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app.store'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useResumen } from '@/composables/useResumen'
import ContadoresHome from '@/components/business/ContadoresHome.vue'
import BannerEventoActivo from '@/components/business/BannerEventoActivo.vue'
import SiguientePasoCta from '@/components/business/SiguientePasoCta.vue'

const app = useAppStore()
const { online } = useOnlineStatus()
const { contadores, cargar } = useResumen()

onMounted(() => {
  // Fire-and-forget — the home shows the skeleton state until
  // `cargado` flips true. The Promise.allSettled design ensures
  // partial failures don't blank the home.
  void cargar()
})
</script>

<template>
  <v-container class="py-6">
    <h1 class="text-h4 mb-1">Kilo-Lima</h1>
    <p class="text-body-2 text-medium-emphasis mb-6">
      Costos y ventas de postres en ferias
    </p>

    <!-- Top: live counters (REQs UX-9..12) -->
    <ContadoresHome :contadores="contadores" />

    <!-- Active business state (REQs UX-13..16) -->
    <BannerEventoActivo />

    <!-- Recommended next step (REQs UX-17..19). Hidden on null. -->
    <SiguientePasoCta :contadores="contadores" />

    <v-divider class="my-6" />

    <!-- Secondary: 3 phase cards from foundation PR2 — kept smaller -->
    <h2 class="text-h6 mb-3">Fases del negocio</h2>
    <v-row dense>
      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-pre-evento"
          :to="'/eventos'"
          variant="tonal"
          color="info"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-clipboard-list-outline" />
            </template>
            <v-card-title>Pre-evento</v-card-title>
            <v-card-subtitle>Planificación</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <p class="text-body-2 mb-2">
              Crea el evento, define gastos fijos, planifica cuántas unidades
              de cada receta vas a producir y revisá la proyección de costos.
            </p>
            <p class="text-caption text-medium-emphasis">
              Ir a Eventos →
            </p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-durante-evento"
          :to="'/pos'"
          variant="tonal"
          color="warning"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-cart-outline" />
            </template>
            <v-card-title>Durante evento</v-card-title>
            <v-card-subtitle>Ventas en vivo</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <p class="text-body-2 mb-2">
              Con el evento activo, registrá ventas en el POS. Agregá productos
              al carrito, elegí método de pago y registrá gastos imprevistos
              que surjan durante la feria.
            </p>
            <p class="text-caption text-medium-emphasis">
              Ir a Caja →
            </p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-post-evento"
          disabled
          variant="tonal"
          color="success"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-chart-line" />
            </template>
            <v-card-title>Post-evento</v-card-title>
            <v-card-subtitle>Análisis (próximamente)</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <p class="text-body-2 mb-2">
              Dashboard de resultados: ventas totales, gastos, ganancia neta
              y comparativa entre eventos. Llega en el próximo slice.
            </p>
            <p class="text-caption text-medium-emphasis">
              Slice futuro
            </p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-divider class="my-6" />

    <h2 class="text-h6 mb-3">Accesos rápidos</h2>
    <v-row dense>
      <v-col cols="6" sm="3">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-package-variant"
          to="/materias-primas"
          block
          data-testid="home-btn-materias-primas"
        >
          Materias Primas
        </v-btn>
      </v-col>
      <v-col cols="6" sm="3">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-book-open-variant"
          to="/recetas"
          block
          data-testid="home-btn-recetas"
        >
          Recetas
        </v-btn>
      </v-col>
      <v-col cols="6" sm="3">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-store-outline"
          to="/productos"
          block
          data-testid="home-btn-productos"
        >
          Productos
        </v-btn>
      </v-col>
      <v-col cols="6" sm="3">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-calendar-check"
          to="/eventos"
          block
          data-testid="home-btn-eventos"
        >
          Eventos
        </v-btn>
      </v-col>
    </v-row>

    <v-card
      :color="online ? 'success' : 'warning'"
      class="mt-6"
      variant="tonal"
      data-testid="estado-conexion"
    >
      <v-card-text class="d-flex align-center ga-2">
        <v-icon :icon="online ? 'mdi-wifi' : 'mdi-wifi-off'" />
        <span class="text-body-2">
          <strong>{{ app.appName }}</strong> ·
          {{ online ? 'En línea' : 'Sin conexión (los datos en cache se ven, los nuevos no se guardan)' }}
        </span>
      </v-card-text>
    </v-card>
  </v-container>
</template>
