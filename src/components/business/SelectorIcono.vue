<script setup lang="ts">
// Selector de iconos MDI para productos. Lista predefinida de iconos
// relevantes para comida/postres de feria. Muestra una grilla de
// botones icono; el seleccionado se resalta con color primary.
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [icono: string]
}>()

// Iconos MDI relevantes para productos de feria/postres
const iconos = [
  'mdi-food',
  'mdi-cake-variant',
  'mdi-cookie',
  'mdi-ice-cream',
  'mdi-cupcake',
  'mdi-coffee',
  'mdi-tea',
  'mdi-fruit-cherries',
  'mdi-fruit-citrus',
  'mdi-fruit-grapes',
  'mdi-fruit-watermelon',
  'mdi-chocolate',
  'mdi-candy',
  'mdi-donut',
  'mdi-bread-slice',
  'mdi-pizza',
  'mdi-hamburger',
  'mdi-french-fries',
  'mdi-taco',
  'mdi-egg',
  'mdi-milk',
  'mdi-glass-cocktail',
  'mdi-glass-wine',
  'mdi-bottle-wine',
  'mdi-beer',
  'mdi-water',
  'mdi-juice',
  'mdi-silverware-fork-knife',
  'mdi-noodles',
  'mdi-rice',
]

function seleccionar(icono: string): void {
  emit('update:modelValue', icono)
}
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-2">Icono del producto</div>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-for="icono in iconos"
        :key="icono"
        :icon="icono"
        :color="modelValue === icono ? 'primary' : undefined"
        :variant="modelValue === icono ? 'flat' : 'outlined'"
        size="small"
        data-testid="selector-icono-btn"
        @click="seleccionar(icono)"
      />
    </div>
    <div class="mt-2 text-caption">
      Seleccionado: <v-icon :icon="modelValue" size="small" /> {{ modelValue }}
    </div>
  </div>
</template>
