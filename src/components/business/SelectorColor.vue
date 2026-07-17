<script setup lang="ts">
// Product palette. Values remain plain CSS colors, as accepted by the
// persisted producto.color field, while labels describe the visual result.
defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [color: string]
}>()

const colores = [
  { value: 'warning', label: 'Amarillo cálido', swatch: '#C79A35' },
  { value: 'pink', label: 'Rosa baya', swatch: '#B9627B' },
  { value: 'brown', label: 'Marrón cacao', swatch: '#805A43' },
  { value: 'orange', label: 'Naranja cítrico', swatch: '#C8752C' },
  { value: 'primary', label: 'Azul fresco', swatch: '#4E7896' },
  { value: 'secondary', label: 'Neutral', swatch: '#73706A' },
]

function seleccionar(color: string): void {
  emit('update:modelValue', color)
}
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-2">Estilo del producto</div>
    <div class="product-color-palette">
      <v-btn
        v-for="c in colores"
        :key="c.value"
        :color="c.swatch"
        :variant="modelValue === c.value ? 'flat' : 'tonal'"
        class="product-color-palette__option text-none"
        :data-testid="`selector-color-${c.value}`"
        :aria-pressed="modelValue === c.value"
        @click="seleccionar(c.value)"
      >
        <span class="product-color-palette__swatch" :style="{ backgroundColor: c.swatch }">
          <v-icon v-if="modelValue === c.value" icon="mdi-check" size="small" />
        </span>
        {{ c.label }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.product-color-palette {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.product-color-palette__option {
  justify-content: flex-start;
  min-height: 40px;
  padding-inline: 8px;
  font-size: 0.75rem;
  letter-spacing: normal;
}
.product-color-palette__swatch {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 50%;
  color: white;
}
</style>
