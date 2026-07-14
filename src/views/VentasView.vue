<script setup lang="ts">
// Histórico de ventas por evento. Permite consultar y analizar ventas
// pasadas con filtros básicos y vista detallada por venta.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useEventsStore } from '@/stores/events.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useProductosStore } from '@/stores/productos.store'
import { formatearUSD } from '@/utils/format'
import type { VentaConItems, MetodoPago } from '@/types'

const router = useRouter()
const eventsStore = useEventsStore()
const ventasStore = useVentasStore()
const productosStore = useProductosStore()

// Helper to get product name by id
function obtenerNombreProducto(productoId: string): string {
  const producto = productosStore.productos.find((p) => p.id === productoId)
  return producto?.nombre ?? 'Producto no encontrado'
}

// Auto-select active event or allow manual selection
const eventoSeleccionadoId = ref<string | null>(null)

const eventoSeleccionado = computed(() => {
  const id = eventoSeleccionadoId.value
  if (!id) return null
  return eventsStore.eventos.find((e) => e.id === id) ?? null
})

const ventasDelEvento = computed<VentaConItems[]>(() => {
  const id = eventoSeleccionadoId.value
  if (!id) return []
  return ventasStore.ventas.filter((v) => v.evento_id === id)
})

// KPIs
const totalVentas = computed(() => {
  return ventasDelEvento.value.reduce((sum, v) => sum + v.total, 0)
})

const cantidadVentas = computed(() => ventasDelEvento.value.length)

const promedioVenta = computed(() => {
  if (cantidadVentas.value === 0) return 0
  return totalVentas.value / cantidadVentas.value
})

// Filter by payment method
const filtroMetodoPago = ref<MetodoPago | null>(null)

// Filter by date range
const fechaInicio = ref<string | null>(null)
const fechaFin = ref<string | null>(null)

const ventasFiltradas = computed(() => {
  let result = ventasDelEvento.value
  
  // Filter by payment method
  if (filtroMetodoPago.value) {
    result = result.filter((v) => v.metodo_pago === filtroMetodoPago.value)
  }
  
  // Filter by date range
  if (fechaInicio.value) {
    const inicio = new Date(fechaInicio.value)
    inicio.setHours(0, 0, 0, 0)
    result = result.filter((v) => new Date(v.fecha) >= inicio)
  }
  
  if (fechaFin.value) {
    const fin = new Date(fechaFin.value)
    fin.setHours(23, 59, 59, 999)
    result = result.filter((v) => new Date(v.fecha) <= fin)
  }
  
  return result.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
})

// Dialog for sale detail
const ventaSeleccionada = ref<VentaConItems | null>(null)
const dialogoVentaAbierto = ref(false)

function abrirDetalleVenta(venta: VentaConItems) {
  ventaSeleccionada.value = venta
  dialogoVentaAbierto.value = true
}

function cerrarDetalleVenta() {
  ventaSeleccionada.value = null
  dialogoVentaAbierto.value = false
}

function limpiarFiltros() {
  filtroMetodoPago.value = null
  fechaInicio.value = null
  fechaFin.value = null
}

async function cargarDatos() {
  const id = eventoSeleccionadoId.value
  if (!id) return
  await ventasStore.cargarPorEvento(id)
}

onMounted(async () => {
  // Load events if not already loaded
  if (eventsStore.eventos.length === 0) {
    await eventsStore.cargarTodas()
  }
  
  // Load products for name lookup in sale details
  if (productosStore.productos.length === 0) {
    await productosStore.cargarTodos()
  }
  
  // Auto-select active event if available
  const eventoActivo = eventsStore.eventos.find((e) => e.estado === 'en_curso')
  if (eventoActivo) {
    eventoSeleccionadoId.value = eventoActivo.id
    await cargarDatos()
  }
})

// Watch for event selection changes
watch(eventoSeleccionadoId, async (newId) => {
  if (newId) {
    await cargarDatos()
  }
})

const METODOS_PAGO: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'mixto', label: 'Mixto' },
]

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="ventas-view pa-4">
    <!-- Header -->
    <div class="d-flex align-center mb-4">
      <v-icon size="32" color="primary" class="mr-3">mdi-cash-register</v-icon>
      <div>
        <h1 class="text-h5 font-weight-bold">Histórico de Ventas</h1>
        <p class="text-caption text-medium-emphasis mb-0">
          Consulta y analiza ventas por evento
        </p>
      </div>
    </div>

    <!-- Event selector -->
    <v-card class="mb-4" data-testid="ventas-evento-selector">
      <v-card-text>
        <div class="d-flex align-center ga-3 flex-wrap">
          <v-select
            v-model="eventoSeleccionadoId"
            :items="eventsStore.eventos"
            item-title="nombre"
            item-value="id"
            label="Seleccionar evento"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            data-testid="ventas-evento-select"
            style="max-width: 400px"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props">
                <template #subtitle>
                  {{ item.raw.fecha }} · {{ item.raw.estado }}
                </template>
              </v-list-item>
            </template>
          </v-select>
          
          <v-chip
            v-if="eventoSeleccionado"
            :color="eventoSeleccionado.estado === 'en_curso' ? 'success' : 'grey'"
            variant="tonal"
            size="small"
          >
            {{ eventoSeleccionado.estado === 'en_curso' ? 'En curso' : 'Cerrado' }}
          </v-chip>
        </div>
      </v-card-text>
    </v-card>

    <!-- No event selected state -->
    <v-alert
      v-if="!eventoSeleccionadoId"
      type="info"
      variant="tonal"
      density="compact"
      data-testid="ventas-sin-evento"
    >
      Selecciona un evento para ver su histórico de ventas
    </v-alert>

    <!-- Event selected: show KPIs and sales list -->
    <template v-if="eventoSeleccionadoId && eventoSeleccionado">
      <!-- KPIs -->
      <v-row dense class="mb-4">
        <v-col cols="12" sm="4">
          <v-card data-testid="ventas-kpi-total">
            <v-card-text>
              <div class="text-caption text-medium-emphasis">Total ventas</div>
              <div class="text-h5 font-weight-bold">
                {{ formatearUSD(totalVentas) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card data-testid="ventas-kpi-cantidad">
            <v-card-text>
              <div class="text-caption text-medium-emphasis">Cantidad</div>
              <div class="text-h5 font-weight-bold">
                {{ cantidadVentas }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card data-testid="ventas-kpi-promedio">
            <v-card-text>
              <div class="text-caption text-medium-emphasis">Promedio</div>
              <div class="text-h5 font-weight-bold">
                {{ formatearUSD(promedioVenta) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Filters -->
      <v-card class="mb-4" data-testid="ventas-filtros">
        <v-card-text>
          <div class="d-flex align-center ga-2 flex-wrap mb-3">
            <span class="text-body-2 font-weight-medium">Método de pago:</span>
            <v-chip
              :color="filtroMetodoPago === null ? 'primary' : undefined"
              :variant="filtroMetodoPago === null ? 'flat' : 'tonal'"
              size="small"
              data-testid="ventas-filtro-todos"
              @click="filtroMetodoPago = null"
            >
              Todos
            </v-chip>
            <v-chip
              v-for="metodo in METODOS_PAGO"
              :key="metodo.value"
              :color="filtroMetodoPago === metodo.value ? 'primary' : undefined"
              :variant="filtroMetodoPago === metodo.value ? 'flat' : 'tonal'"
              size="small"
              :data-testid="`ventas-filtro-${metodo.value}`"
              @click="filtroMetodoPago = filtroMetodoPago === metodo.value ? null : metodo.value"
            >
              {{ metodo.label }}
            </v-chip>
          </div>
          
          <div class="d-flex align-center ga-2 flex-wrap">
            <span class="text-body-2 font-weight-medium">Rango de fechas:</span>
            <v-text-field
              v-model="fechaInicio"
              type="date"
              label="Desde"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 180px"
              data-testid="ventas-fecha-inicio"
            />
            <span>—</span>
            <v-text-field
              v-model="fechaFin"
              type="date"
              label="Hasta"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 180px"
              data-testid="ventas-fecha-fin"
            />
            
            <v-spacer />
            
            <v-btn
              v-if="filtroMetodoPago || fechaInicio || fechaFin"
              size="small"
              variant="text"
              color="error"
              prepend-icon="mdi-filter-remove"
              data-testid="ventas-limpiar-filtros"
              @click="limpiarFiltros"
            >
              Limpiar
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- Sales list -->
      <v-card data-testid="ventas-lista">
        <v-card-title class="d-flex align-center">
          <span>Ventas ({{ ventasFiltradas.length }})</span>
          <v-spacer />
          <v-btn
            v-if="ventasFiltradas.length > 0"
            variant="text"
            size="small"
            prepend-icon="mdi-refresh"
            data-testid="ventas-recargar"
            @click="cargarDatos"
          >
            Recargar
          </v-btn>
        </v-card-title>
        <v-divider />
        
        <v-list v-if="ventasFiltradas.length > 0" density="compact">
          <v-list-item
            v-for="venta in ventasFiltradas"
            :key="venta.id"
            :data-testid="`ventas-item-${venta.id}`"
            @click="abrirDetalleVenta(venta)"
          >
            <template #prepend>
              <v-icon color="primary">mdi-receipt</v-icon>
            </template>
            <v-list-item-title class="font-weight-medium">
              {{ formatearUSD(venta.total) }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ formatearFecha(venta.fecha) }} · {{ venta.metodo_pago }} · {{ venta.items.length }} item(s)
            </v-list-item-subtitle>
            <template #append>
              <v-icon size="small">mdi-chevron-right</v-icon>
            </template>
          </v-list-item>
        </v-list>

        <div
          v-else
          class="text-center py-8 text-medium-emphasis"
          data-testid="ventas-vacio"
        >
          <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-receipt-text-outline</v-icon>
          <p class="mb-0">
            {{ filtroMetodoPago ? 'No hay ventas con este filtro' : 'Sin ventas registradas' }}
          </p>
        </div>
      </v-card>
    </template>

    <!-- Sale detail dialog -->
    <v-dialog
      v-model="dialogoVentaAbierto"
      max-width="600"
      data-testid="ventas-detalle-dialogo"
    >
      <v-card v-if="ventaSeleccionada">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-receipt</v-icon>
          Detalle de venta
          <v-spacer />
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="cerrarDetalleVenta"
          />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <div class="mb-4">
            <div class="text-caption text-medium-emphasis">Fecha</div>
            <div class="text-body-1">{{ formatearFecha(ventaSeleccionada.fecha) }}</div>
          </div>
          <div class="mb-4">
            <div class="text-caption text-medium-emphasis">Método de pago</div>
            <v-chip size="small" color="primary" variant="tonal">
              {{ ventaSeleccionada.metodo_pago }}
            </v-chip>
          </div>
          <div class="mb-4">
            <div class="text-caption text-medium-emphasis mb-2">Productos</div>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="text-right">Cant.</th>
                  <th class="text-right">Precio</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in ventaSeleccionada.items" :key="item.id">
                  <td>{{ obtenerNombreProducto(item.producto_id) }}</td>
                  <td class="text-right">{{ item.cantidad }}</td>
                  <td class="text-right">{{ formatearUSD(item.precio_unitario) }}</td>
                  <td class="text-right">{{ formatearUSD(item.subtotal) }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <v-divider class="mb-3" />
          <div class="d-flex justify-space-between align-center">
            <span class="text-h6 font-weight-bold">Total</span>
            <span class="text-h5 font-weight-bold" style="color: #1A1A2E">
              {{ formatearUSD(ventaSeleccionada.total) }}
            </span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.ventas-view {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
