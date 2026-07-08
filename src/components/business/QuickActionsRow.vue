<script setup lang="ts">
// mobile-ux-redesign Phase 2: QuickActionsRow component.
// Displays 4 primary action buttons in a responsive row:
//   Ir a caja → /pos
//   Registrar gasto → /eventos
//   Ver stock → /inventario
//   Nuevo producto → /productos/nuevo
</script>

<template>
  <v-row data-testid="quick-actions-row" dense class="mb-4">
    <v-col cols="6" sm="3">
      <v-btn
        data-testid="quick-action-pos"
        to="/pos"
        color="amber"
        variant="flat"
        prepend-icon="mdi-cash-register"
        block
      >
        Ir a caja
      </v-btn>
    </v-col>
    <v-col cols="6" sm="3">
      <v-btn
        data-testid="quick-action-gasto"
        to="/eventos"
        color="warning"
        variant="tonal"
        prepend-icon="mdi-file-document-edit"
        block
      >
        Registrar gasto
      </v-btn>
    </v-col>
    <v-col cols="6" sm="3">
      <v-btn
        data-testid="quick-action-stock"
        to="/inventario"
        color="info"
        variant="tonal"
        prepend-icon="mdi-warehouse"
        block
      >
        Ver stock
      </v-btn>
    </v-col>
    <v-col cols="6" sm="3">
      <v-btn
        data-testid="quick-action-producto"
        to="/productos/nuevo"
        color="success"
        variant="tonal"
        prepend-icon="mdi-plus-circle"
        block
      >
        Nuevo producto
      </v-btn>
    </v-col>
  </v-row>
</template>
