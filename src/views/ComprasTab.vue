<script setup lang="ts">
// inventory-tabs-redesign / Work Unit 3: global purchase history tab.
// Loads movements on mount, filters to tipo='compra', and provides a
// registration dialog via CompraStockForm. Reuses StockMovementList
// and the stockMovements store. After a successful purchase, refreshes
// movements + stock actual so the ledger is consistent.
import { computed, onMounted, ref } from 'vue'

import CompraStockForm from '@/components/inventario/CompraStockForm.vue'
import StockMovementList from '@/components/inventario/StockMovementList.vue'
import { useIngredients } from '@/composables/useIngredients'
import { useStockMovementsStore } from '@/stores/stockMovements.store'
import type { RegistrarCompraInput, StockMovement } from '@/types'

const { materiasPrimas, cargarTodas: cargarMaterias } = useIngredients()
const store = useStockMovementsStore()

// ----- dialog state -----
const dialogoCompra = ref(false)

// ----- data -----
const materiaNames = computed<Map<string, string>>(() => {
  const map = new Map<string, string>()
  for (const mp of materiasPrimas.value) {
    map.set(mp.id, mp.nombre)
  }
  return map
})

const comprasFiltradas = computed<StockMovement[]>(() =>
  store.movements.filter((m) => m.tipo === 'compra'),
)

// ----- lifecycle -----
onMounted(async () => {
  if (materiasPrimas.value.length === 0) {
    await cargarMaterias()
  }
  await store.cargarMovimientos()
})

// ----- handlers -----
function abrirDialogoCompra() {
  dialogoCompra.value = true
}

function cerrarDialogoCompra() {
  dialogoCompra.value = false
}

async function manejarCompraSubmit(input: RegistrarCompraInput) {
  const res = await store.registrarCompra(input)
  if (!res.error) {
    await store.cargarStockActual()
    cerrarDialogoCompra()
  }
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1>Compras</h1>
      <v-btn
        color="primary"
        prepend-icon="mdi-cart-arrow-down"
        data-testid="compra-nueva"
        @click="abrirDialogoCompra"
      >
        Registrar compra
      </v-btn>
    </div>

    <!-- Loading -->
    <v-progress-linear
      v-if="store.cargando"
      indeterminate
      color="primary"
      data-testid="compra-loading"
    />

    <!-- Error -->
    <v-alert
      v-if="store.error"
      type="error"
      class="mb-4"
      data-testid="compra-error"
    >
      {{ store.error }}
      <template #append>
        <v-btn variant="text" @click="store.cargarMovimientos()">
          Reintentar
        </v-btn>
      </template>
    </v-alert>

    <!-- Empty global -->
    <v-card
      v-if="!store.cargando && store.movements.length === 0 && !store.error"
      class="pa-6 text-center"
      data-testid="compra-empty-global"
    >
      <v-icon size="48" color="medium-emphasis" class="mb-2">mdi-cart-arrow-down</v-icon>
      <p class="text-h6 mb-2">Sin compras</p>
      <p class="text-body-1 text-medium-emphasis mb-4">
        Las compras globales de inventario aparecerán aquí cuando se registren.
      </p>
      <v-btn color="primary" @click="abrirDialogoCompra">
        Registrar primera compra
      </v-btn>
    </v-card>

    <!-- Empty filter (no purchases) -->
    <v-card
      v-if="!store.cargando && store.movements.length > 0 && comprasFiltradas.length === 0 && !store.error"
      class="pa-6 text-center"
      data-testid="compra-empty-filter"
    >
      <v-icon size="48" color="medium-emphasis" class="mb-2">mdi-cart-arrow-down</v-icon>
      <p class="text-h6 mb-2">No hay compras registradas</p>
      <p class="text-body-1 text-medium-emphasis mb-4">
        Hay movimientos de inventario, pero ninguno es de tipo compra.
      </p>
      <v-btn color="primary" @click="abrirDialogoCompra">
        Registrar compra
      </v-btn>
    </v-card>

    <!-- Purchase list -->
    <StockMovementList
      v-if="comprasFiltradas.length > 0"
      :movements="comprasFiltradas"
      :materia-names="materiaNames"
    />

    <!-- Registration dialog -->
    <CompraStockForm
      v-model="dialogoCompra"
      :materias-primas="materiasPrimas"
      @submit="manejarCompraSubmit"
      @cancel="cerrarDialogoCompra"
    />
  </v-container>
</template>
