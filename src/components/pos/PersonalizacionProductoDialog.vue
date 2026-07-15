<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useProductosConfigurablesStore } from '@/stores/productosConfigurables.store'
import { formatearUSD } from '@/utils/format'
import type {
  PersonalizacionCarrito,
  ProductoConfigurableConGrupos,
  GrupoOpcionesConOpciones,
} from '@/types'

const props = defineProps<{
  productoId: string
  nombreProducto: string
  precioBase: number
  costoBase: number
  margenBase: number | null
}>()

const emit = defineEmits<{
  confirmar: [personalizaciones: PersonalizacionCarrito[], precioTotal: number, costoTotal: number]
  cancelar: []
}>()

const productosConfigurablesStore = useProductosConfigurablesStore()

// Buscar el producto configurable
const configurable = computed<ProductoConfigurableConGrupos | null>(() => {
  return productosConfigurablesStore.configurables.find((c) => c.producto_id === props.productoId) || null
})

// Estado de personalizaciones seleccionadas por grupo
const seleccionesPorGrupo = ref<Map<string, PersonalizacionCarrito[]>>(new Map())

// Inicializar selecciones con las opciones gratis
watch(configurable, (conf) => {
  if (!conf) return

  seleccionesPorGrupo.value.clear()

  conf.grupos.forEach((grupo) => {
    const incluidas: PersonalizacionCarrito[] = []

    // Seleccionar automáticamente las primeras N opciones como gratis
    for (let i = 0; i < grupo.incluidas_gratis && i < grupo.opciones.length; i++) {
      const opcion = grupo.opciones[i]
      if (!opcion) continue

      incluidas.push({
        grupo_id: grupo.id,
        materia_prima_id: opcion.materia_prima_id,
        nombre: opcion.materia_prima.nombre,
        es_incluido: true,
        costo_unitario: opcion.materia_prima.costo_por_unidad,
        precio_venta_extra: 0,
        cantidad: 1,
      })
    }

    seleccionesPorGrupo.value.set(grupo.id, incluidas)
  })
}, { immediate: true })

// Calcular precio y costo total
const totalExtras = computed(() => {
  let total = 0
  seleccionesPorGrupo.value.forEach((selecciones) => {
    selecciones.forEach((sel) => {
      if (!sel.es_incluido) {
        total += sel.precio_venta_extra * sel.cantidad
      }
    })
  })
  return total
})

const costoExtras = computed(() => {
  let total = 0
  seleccionesPorGrupo.value.forEach((selecciones) => {
    selecciones.forEach((sel) => {
      total += sel.costo_unitario * sel.cantidad
    })
  })
  return total
})

const precioTotal = computed(() => props.precioBase + totalExtras.value)
const costoTotal = computed(() => props.costoBase + costoExtras.value)

// Obtener selecciones de un grupo
function obtenerSelecciones(grupoId: string): PersonalizacionCarrito[] {
  return seleccionesPorGrupo.value.get(grupoId) || []
}

// Contar cuántas opciones gratis quedan disponibles en un grupo
function opcionesGratisDisponibles(grupo: GrupoOpcionesConOpciones): number {
  const seleccionadas = obtenerSelecciones(grupo.id)
  const gratisSeleccionadas = seleccionadas.filter((s) => s.es_incluido).length
  return Math.max(0, grupo.incluidas_gratis - gratisSeleccionadas)
}

// Seleccionar una opción de un grupo
function seleccionarOpcion(grupo: GrupoOpcionesConOpciones, materiaPrimaId: string) {
  const opcion = grupo.opciones.find((o) => o.materia_prima_id === materiaPrimaId)
  if (!opcion) return

  const selecciones = obtenerSelecciones(grupo.id)
  const existente = selecciones.find((s) => s.materia_prima_id === materiaPrimaId)

  if (existente) {
    // Si ya está seleccionada, aumentar cantidad
    existente.cantidad++
  } else {
    // Determinar si es gratis o paga
    const gratisDisponibles = opcionesGratisDisponibles(grupo)
    const esIncluido = gratisDisponibles > 0

    selecciones.push({
      grupo_id: grupo.id,
      materia_prima_id: materiaPrimaId,
      nombre: opcion.materia_prima.nombre,
      es_incluido: esIncluido,
      costo_unitario: opcion.materia_prima.costo_por_unidad,
      precio_venta_extra: esIncluido ? 0 : grupo.precio_venta_extra,
      cantidad: 1,
    })
  }

  seleccionesPorGrupo.value.set(grupo.id, [...selecciones])
}

// Remover una opción seleccionada
function removerSeleccion(grupoId: string, materiaPrimaId: string) {
  const selecciones = obtenerSelecciones(grupoId)
  const index = selecciones.findIndex((s) => s.materia_prima_id === materiaPrimaId)

  if (index !== -1) {
    const seleccion = selecciones[index]
    if (!seleccion) return

    if (seleccion.cantidad > 1) {
      seleccion.cantidad--
    } else {
      selecciones.splice(index, 1)
    }
    seleccionesPorGrupo.value.set(grupoId, [...selecciones])
  }
}

// Agregar adicional no configurado (cualquier materia prima)
const dialogoAdicionalAbierto = ref(false)
const adicionalSeleccionadoId = ref<string | null>(null)
const adicionalCantidad = ref(1)

function abrirDialogoAdicional() {
  adicionalSeleccionadoId.value = null
  adicionalCantidad.value = 1
  dialogoAdicionalAbierto.value = true
}

function agregarAdicional() {
  if (!adicionalSeleccionadoId.value) return

  const adicional = productosConfigurablesStore.adicionales.find(
    (a) => a.materia_prima_id === adicionalSeleccionadoId.value
  )
  if (!adicional) return

  // Agregar al primer grupo (o crear un grupo "Adicionales" si no existe)
  // Por simplicidad, lo agregamos como una selección sin grupo
  const selecciones = obtenerSelecciones('adicionales')
  const existente = selecciones.find((s) => s.materia_prima_id === adicionalSeleccionadoId.value)

  if (existente) {
    existente.cantidad += adicionalCantidad.value
  } else {
    selecciones.push({
      grupo_id: null,
      materia_prima_id: adicional.materia_prima_id,
      nombre: adicional.materia_prima.nombre,
      es_incluido: false,
      costo_unitario: adicional.materia_prima.costo_por_unidad,
      precio_venta_extra: adicional.precio_venta,
      cantidad: adicionalCantidad.value,
    })
  }

  seleccionesPorGrupo.value.set('adicionales', [...selecciones])
  dialogoAdicionalAbierto.value = false
}

// Confirmar y cerrar
function confirmar() {
  const todasPersonalizaciones: PersonalizacionCarrito[] = []
  seleccionesPorGrupo.value.forEach((selecciones) => {
    todasPersonalizaciones.push(...selecciones)
  })

  emit('confirmar', todasPersonalizaciones, precioTotal.value, costoTotal.value)
}

function cancelar() {
  emit('cancelar')
}
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-cog-outline</v-icon>
      Personalizar {{ nombreProducto }}
      <v-spacer />
      <v-btn icon="mdi-close" variant="text" size="small" @click="cancelar" />
    </v-card-title>
    
      <v-divider />

    <v-card-text>
      <!-- Precio base -->
      <div class="mb-4">
        <div class="text-caption text-medium-emphasis">Precio base</div>
        <div class="text-h6 font-weight-bold">{{ formatearUSD(precioBase) }}</div>
      </div>

      <v-divider class="mb-4" />

      <!-- Grupos de opciones -->
      <div v-if="configurable" class="mb-4">
        <div v-for="grupo in configurable.grupos" :key="grupo.id" class="mb-4">
          <div class="d-flex align-center mb-2">
            <v-icon size="small" class="mr-2">mdi-tag-outline</v-icon>
            <span class="text-subtitle-2 font-weight-bold">{{ grupo.nombre }}</span>
            <v-spacer />
            <v-chip v-if="grupo.incluidas_gratis > 0" size="x-small" color="success" variant="tonal">
              {{ grupo.incluidas_gratis }} gratis
            </v-chip>
            <v-chip v-if="grupo.precio_venta_extra > 0" size="x-small" variant="tonal" class="ml-1">
              Extra: {{ formatearUSD(grupo.precio_venta_extra) }}
            </v-chip>
          </div>

          <!-- Opciones disponibles -->
          <div class="d-flex flex-wrap ga-2 mb-2">
            <v-btn
              v-for="opcion in grupo.opciones"
              :key="opcion.materia_prima_id"
              size="small"
              :variant="obtenerSelecciones(grupo.id).some(s => s.materia_prima_id === opcion.materia_prima_id) ? 'flat' : 'tonal'"
              :color="obtenerSelecciones(grupo.id).some(s => s.materia_prima_id === opcion.materia_prima_id) ? 'primary' : undefined"
              @click="seleccionarOpcion(grupo, opcion.materia_prima_id)"
            >
              {{ opcion.materia_prima.nombre }}
            </v-btn>
          </div>

          <!-- Opciones seleccionadas -->
          <div v-if="obtenerSelecciones(grupo.id).length > 0">
            <div class="text-caption text-medium-emphasis mb-1">Seleccionadas:</div>
            <v-chip
              v-for="sel in obtenerSelecciones(grupo.id)"
              :key="sel.materia_prima_id"
              size="small"
              :color="sel.es_incluido ? 'success' : 'warning'"
              variant="tonal"
              closable
              class="mr-1 mb-1"
              @click:close="removerSeleccion(grupo.id, sel.materia_prima_id)"
            >
              {{ sel.nombre }}
              <span v-if="sel.cantidad > 1"> x{{ sel.cantidad }}</span>
              <span v-if="!sel.es_incluido"> ({{ formatearUSD(sel.precio_venta_extra * sel.cantidad) }})</span>
              <span v-else> (gratis)</span>
            </v-chip>
          </div>
        </div>
      </div>

      <v-divider class="mb-4" />

      <!-- Adicionales no configurados -->
      <div class="mb-4">
        <div class="d-flex align-center mb-2">
          <v-icon size="small" class="mr-2">mdi-plus-circle-outline</v-icon>
          <span class="text-subtitle-2 font-weight-bold">Adicionales</span>
          <v-spacer />
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="abrirDialogoAdicional">
            Agregar
          </v-btn>
        </div>

        <!-- Adicionales seleccionados -->
        <div v-if="obtenerSelecciones('adicionales').length > 0">
          <v-chip
            v-for="sel in obtenerSelecciones('adicionales')"
            :key="sel.materia_prima_id"
            size="small"
            color="warning"
            variant="tonal"
            closable
            class="mr-1 mb-1"
            @click:close="removerSeleccion('adicionales', sel.materia_prima_id)"
          >
            {{ sel.nombre }}
            <span v-if="sel.cantidad > 1"> x{{ sel.cantidad }}</span>
            ({{ formatearUSD(sel.precio_venta_extra * sel.cantidad) }})
          </v-chip>
        </div>
      </div>

      <v-divider class="mb-4" />

      <!-- Totales -->
      <div class="d-flex justify-space-between align-center">
        <div>
          <div class="text-caption text-medium-emphasis">Total</div>
          <div class="text-h5 font-weight-bold">{{ formatearUSD(precioTotal) }}</div>
          <div class="text-caption text-medium-emphasis">
            Base: {{ formatearUSD(precioBase) }} + Extras: {{ formatearUSD(totalExtras) }}
          </div>
        </div>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-spacer />
      <v-btn variant="text" @click="cancelar">Cancelar</v-btn>
      <v-btn color="primary" @click="confirmar">Agregar al carrito</v-btn>
    </v-card-actions>
  </v-card>

  <!-- Dialog: Agregar adicional -->
  <v-dialog v-model="dialogoAdicionalAbierto" max-width="500">
    <v-card>
      <v-card-title>Agregar Adicional</v-card-title>
      <v-card-text>
        <v-select
          v-model="adicionalSeleccionadoId"
          :items="productosConfigurablesStore.adicionales"
          item-title="materia_prima.nombre"
          item-value="materia_prima_id"
          label="Seleccionar adicional"
          variant="outlined"
        />
        <v-text-field
          v-model.number="adicionalCantidad"
          label="Cantidad"
          type="number"
          min="1"
          variant="outlined"
        />
        <div v-if="adicionalSeleccionadoId" class="text-caption text-medium-emphasis">
          Precio: {{ formatearUSD(productosConfigurablesStore.adicionales.find(a => a.materia_prima_id === adicionalSeleccionadoId)?.precio_venta || 0) }}
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialogoAdicionalAbierto = false">Cancelar</v-btn>
        <v-btn color="primary" :disabled="!adicionalSeleccionadoId" @click="agregarAdicional">Agregar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
