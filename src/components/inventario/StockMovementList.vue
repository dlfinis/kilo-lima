<script setup lang="ts">
// inventory-tabs-redesign / Work Unit 2: presentational typed movement rows.
// Receives movements + a material-name lookup map. Never fetches — pure
// presentational seam (DIP). Used by MovimientosTab and any other view
// that needs to render movement history.
import type { StockMovement } from '@/types'

defineProps<{
  movements: StockMovement[]
  /** Map of materia_prima_id → display name for the material column. */
  materiaNames: Map<string, string>
}>()
</script>

<template>
  <v-list v-if="movements.length > 0" data-testid="movement-list">
    <v-list-item
      v-for="mov in movements"
      :key="mov.id"
      :data-testid="`movement-row-${mov.id}`"
    >
      <template #prepend>
        <v-icon
          :icon="mov.tipo === 'compra' ? 'mdi-cart-arrow-down' : mov.tipo === 'consumo' ? 'mdi-cart-arrow-up' : mov.tipo === 'correccion' ? 'mdi-pencil' : 'mdi-swap-horizontal'"
          :color="mov.tipo === 'compra' ? 'success' : mov.tipo === 'consumo' ? 'warning' : mov.tipo === 'correccion' ? 'error' : 'info'"
          size="small"
        />
      </template>

      <v-list-item-title class="text-body-2">
        <span class="font-weight-medium">{{ materiaNames.get(mov.materia_prima_id) ?? mov.materia_prima_id.slice(0, 8) }}</span>
        <v-chip
          size="x-small"
          class="ml-2"
          :color="mov.tipo === 'compra' ? 'success' : mov.tipo === 'consumo' ? 'warning' : mov.tipo === 'correccion' ? 'error' : 'info'"
          variant="tonal"
        >
          {{ mov.tipo === 'compra' ? 'Compra' : mov.tipo === 'consumo' ? 'Consumo' : mov.tipo === 'correccion' ? 'Corrección' : 'Ajuste' }}
        </v-chip>
      </v-list-item-title>

      <v-list-item-subtitle class="text-caption">
        {{ new Date(mov.fecha).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) }}
        <template v-if="mov.motivo">
          · {{ mov.motivo }}
        </template>
        <template v-if="mov.evento_id">
          · Evento
        </template>
      </v-list-item-subtitle>

      <template #append>
        <span
          :class="mov.cantidad > 0 ? 'text-success' : 'text-error'"
          class="font-weight-bold text-body-2"
          :data-testid="`movement-qty-${mov.id}`"
        >
          {{ mov.cantidad > 0 ? '+' : '' }}{{ mov.cantidad }}
        </span>
      </template>
    </v-list-item>
  </v-list>

  <v-card v-else class="pa-6 text-center" data-testid="movement-list-empty">
    <v-icon size="40" color="medium-emphasis" class="mb-2">mdi-swap-horizontal</v-icon>
    <p class="text-body-1 text-medium-emphasis">No hay movimientos registrados</p>
  </v-card>
</template>
