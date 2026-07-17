<script setup lang="ts">
// Curated food and drink icons keep POS cards recognisable at a glance.
defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [icono: string]
}>()

const iconos = [
  { value: 'mdi-food', label: 'Plato' },
  { value: 'mdi-cake-variant', label: 'Torta' },
  { value: 'mdi-cookie', label: 'Galleta' },
  { value: 'mdi-ice-cream', label: 'Helado' },
  { value: 'mdi-cupcake', label: 'Cupcake' },
  { value: 'mdi-chocolate', label: 'Chocolate' },
  { value: 'mdi-donut', label: 'Dona' },
  { value: 'mdi-bread-slice', label: 'Pan' },
  { value: 'mdi-pizza', label: 'Pizza' },
  { value: 'mdi-hamburger', label: 'Hamburguesa' },
  { value: 'mdi-taco', label: 'Taco' },
  { value: 'mdi-coffee', label: 'Café' },
  { value: 'mdi-tea', label: 'Té' },
  { value: 'mdi-juice', label: 'Jugo' },
  { value: 'mdi-milk', label: 'Leche' },
  { value: 'mdi-fruit-cherries', label: 'Cerezas' },
  { value: 'mdi-fruit-citrus', label: 'Cítrico' },
]

function seleccionar(icono: string): void {
  emit('update:modelValue', icono)
}
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-2">Ícono del producto</div>
    <div class="product-icon-grid">
      <v-btn
        v-for="icono in iconos"
        :key="icono.value"
        :color="modelValue === icono.value ? 'primary' : undefined"
        :variant="modelValue === icono.value ? 'flat' : 'tonal'"
        size="small"
        class="product-icon-grid__option text-none"
        :data-testid="`selector-icono-${icono.value}`"
        :aria-pressed="modelValue === icono.value"
        @click="seleccionar(icono.value)"
      >
        <v-icon :icon="icono.value" size="18" class="mr-1" />
        {{ icono.label }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.product-icon-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.product-icon-grid__option {
  justify-content: flex-start;
  min-height: 36px;
  padding-inline: 8px;
  font-size: 0.72rem;
  letter-spacing: normal;
}
@media (max-width: 600px) {
  .product-icon-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
