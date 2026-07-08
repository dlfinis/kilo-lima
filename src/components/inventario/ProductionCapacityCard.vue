<script setup lang="ts">
// mobile-ux-redesign Phase 4: ProductionCapacityCard — shows the maximum
// producible units for a product based on current inventory, and
// identifies the limiting ingredient.
import { computed } from 'vue'

import { useInventario, unidadesPosibles } from '@/composables/useInventario'
import type { IngredienteLinea } from '@/composables/useInventario'

const props = defineProps<{
  producto: {
    id: string
    nombre: string
    receta: readonly IngredienteLinea[]
  }
}>()

const { items } = useInventario()

/** Stock map: materia_prima_id → cantidad_disponible */
const stockMap = computed<Map<string, number>>(() => {
  const map = new Map<string, number>()
  for (const mp of items.value) {
    map.set(mp.id, mp.cantidad_disponible ?? 0)
  }
  return map
})

/** Maximum producible units for this product's recipe. */
const capacidad = computed<number>(() => {
  if (props.producto.receta.length === 0) return 0
  return unidadesPosibles(stockMap.value, props.producto.receta)
})

/** Identify which ingredient limits production the most. */
const limitante = computed<{ nombre: string; sobraPara: number } | null>(() => {
  if (props.producto.receta.length === 0) return null

  let minUnidades = Infinity
  let minIngrediente: { nombre: string; sobraPara: number } | null = null

  for (const ing of props.producto.receta) {
    const disponible = stockMap.value.get(ing.materia_prima_id) ?? 0
    const cantidadNecesaria = ing.cantidad
    if (cantidadNecesaria <= 0) continue

    const posibles = Math.floor(disponible / cantidadNecesaria)
    if (posibles < minUnidades) {
      minUnidades = posibles
      const mp = items.value.find((m) => m.id === ing.materia_prima_id)
      minIngrediente = {
        nombre: mp?.nombre ?? ing.materia_prima_id,
        sobraPara: posibles,
      }
    }
  }

  return minIngrediente
})
</script>

<template>
  <v-card data-testid="production-capacity-card" class="mb-4">
    <v-card-title class="d-flex align-center">
      <v-icon start color="primary" class="mr-2">mdi-factory</v-icon>
      Capacidad de Producción
    </v-card-title>

    <v-card-text>
      <p class="text-h6 mb-2">
        Puedes producir <strong>{{ capacidad }}</strong> unidades de <strong>{{ producto.nombre }}</strong>
      </p>
      <p
        v-if="limitante"
        class="text-body-2 text-medium-emphasis"
      >
        Ingrediente limitante: <strong>{{ limitante.nombre }}</strong>
        (queda para {{ limitante.sobraPara }})
      </p>
      <p v-else class="text-body-2 text-medium-emphasis">
        Sin receta definida — verifica los ingredientes
      </p>
    </v-card-text>
  </v-card>
</template>
