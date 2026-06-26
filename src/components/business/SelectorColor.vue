<script setup lang="ts">
// Selector de color para productos. Colores predefinidos de Vuetify
// que determinan el color de la card tanto en catalogo como en POS.
// Soporta colores nombrados y valor hex custom.
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [color: string]
}>()

// Colores Vuetify predefinidos + opciones neutras
const colores = [
  { value: 'primary', label: 'Azul' },
  { value: 'secondary', label: 'Gris' },
  { value: 'success', label: 'Verde' },
  { value: 'warning', label: 'Amarillo' },
  { value: 'error', label: 'Rojo' },
  { value: 'info', label: 'Celeste' },
  { value: 'purple', label: 'Morado' },
  { value: 'pink', label: 'Rosa' },
  { value: 'orange', label: 'Naranja' },
  { value: 'teal', label: 'Verde azulado' },
  { value: 'brown', label: 'Marron' },
  { value: 'indigo', label: 'Indigo' },
]

function seleccionar(color: string): void {
  emit('update:modelValue', color)
}
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-2">Color de la tarjeta</div>
    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-for="c in colores"
        :key="c.value"
        :color="c.value"
        size="small"
        :variant="modelValue === c.value ? 'flat' : 'outlined'"
        :min-width="40"
        :min-height="40"
        :data-testid="`selector-color-${c.value}`"
        @click="seleccionar(c.value)"
      >
        <v-icon v-if="modelValue === c.value" icon="mdi-check" size="small" />
      </v-btn>
    </div>
    <div class="mt-2 text-caption">
      Seleccionado: <v-chip :color="modelValue" size="x-small" variant="flat" /> {{ modelValue }}
    </div>
  </div>
</template>
