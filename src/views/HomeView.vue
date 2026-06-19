<script setup lang="ts">
import { useAppStore } from '@/stores/app.store'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

// HomeView is the business hub: orients the user, shows the 3 phases of
// the feriante's workflow (brief §3.1 Progressive Disclosure), and gives
// direct CTAs to the next action. Per design §15, the home must be a
// navigation surface — not a passive landing page.
const app = useAppStore()
const { online } = useOnlineStatus()
</script>

<template>
  <v-container class="py-6">
    <h1 class="text-h4 mb-1">Kilo-Lima</h1>
    <p class="text-body-2 text-medium-emphasis mb-6">
      Costos y ventas de postres en ferias
    </p>

    <v-row dense>
      <!-- Fase 1: Pre-evento (planificación) -->
      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-pre-evento"
          :to="'/eventos'"
          variant="tonal"
          color="info"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-clipboard-list-outline" size="large" />
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

      <!-- Fase 2: Durante evento (ventas) -->
      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-durante-evento"
          :to="'/pos'"
          variant="tonal"
          color="warning"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-cart-outline" size="large" />
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

      <!-- Fase 3: Post-evento (análisis) -->
      <v-col cols="12" md="4">
        <v-card
          data-testid="home-card-post-evento"
          disabled
          variant="tonal"
          color="success"
        >
          <v-card-item>
            <template #prepend>
              <v-icon icon="mdi-chart-line" size="large" />
            </template>
            <v-card-title>Post-evento</v-card-title>
            <v-card-subtitle>Análisis (próximamente)</v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <p class="text-body-2 mb-2">
              Dashboard de resultados: ventas totales, gastos, ganancia neta
              y comparativa entre eventos. Llega en el próximo slice (Phase 5
              del brief).
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
