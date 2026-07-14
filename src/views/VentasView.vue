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

// KPIs (calculated on filtered sales)
const totalVentas = computed(() => {
  return ventasFiltradas.value.reduce((sum, v) => sum + v.total, 0)
})

const cantidadVentas = computed(() => ventasFiltradas.value.length)

const promedioVenta = computed(() => {
  if (cantidadVentas.value === 0) return 0
  return totalVentas.value / cantidadVentas.value
})

// Filter by payment method
const filtroMetodoPago = ref<MetodoPago | null>(null)

// Filter by product
const filtroProductoId = ref<string | null>(null)

// Filter by date range
const fechaInicio = ref<string | null>(null)
const fechaFin = ref<string | null>(null)
const mostrarFechasPersonalizadas = ref(false)
const rangoRapidoActivo = ref<string | null>(null)

// Quick date range options
function setRangoRapido(rango: string) {
  const ahora = new Date()
  rangoRapidoActivo.value = rango
  
  switch (rango) {
    case 'hoy':
      // Hoy desde medianoche hasta ahora
      fechaInicio.value = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0).toISOString().split('T')[0]
      fechaFin.value = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59).toISOString().split('T')[0]
      break
    case 'ayer':
      // Ayer completo
      const ayer = new Date(ahora)
      ayer.setDate(ayer.getDate() - 1)
      fechaInicio.value = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate(), 0, 0, 0).toISOString().split('T')[0]
      fechaFin.value = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate(), 23, 59, 59).toISOString().split('T')[0]
      break
    case 'semana':
      // Últimos 7 días incluyendo hoy
      const hace7Dias = new Date(ahora)
      hace7Dias.setDate(hace7Dias.getDate() - 6) // -6 porque incluimos hoy
      fechaInicio.value = new Date(hace7Dias.getFullYear(), hace7Dias.getMonth(), hace7Dias.getDate(), 0, 0, 0).toISOString().split('T')[0]
      fechaFin.value = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59).toISOString().split('T')[0]
      break
    case 'mes':
      // Desde el primer día del mes hasta hoy
      const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0)
      fechaInicio.value = primerDiaMes.toISOString().split('T')[0]
      fechaFin.value = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59).toISOString().split('T')[0]
      break
    case 'personalizado':
      mostrarFechasPersonalizadas.value = true
      break
  }
}

const ventasFiltradas = computed(() => {
  let result = ventasDelEvento.value
  
  // Filter by payment method
  if (filtroMetodoPago.value) {
    result = result.filter((v) => v.metodo_pago === filtroMetodoPago.value)
  }
  
  // Filter by product
  if (filtroProductoId.value) {
    result = result.filter((v) => 
      v.items.some((item) => item.producto_id === filtroProductoId.value)
    )
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

// Tabs
const tabActiva = ref<'ventas' | 'analisis'>('ventas')

// Analysis filters (independent from sales list filters)
const analisisFiltroFechaInicio = ref<string | null>(null)
const analisisFiltroFechaFin = ref<string | null>(null)
const analisisFiltroCategoria = ref<string | null>(null)

const CATEGORIAS_PRODUCTO = [
  { value: 'dulce', label: 'Dulce' },
  { value: 'salado', label: 'Salado' },
  { value: 'helado', label: 'Helado' },
  { value: 'bebida', label: 'Bebida' },
]

// Product sales analysis (with independent filters)
const analisisProductos = computed(() => {
  let ventasParaAnalisis = ventasDelEvento.value
  
  // Apply analysis date filter
  if (analisisFiltroFechaInicio.value) {
    const inicio = new Date(analisisFiltroFechaInicio.value)
    inicio.setHours(0, 0, 0, 0)
    ventasParaAnalisis = ventasParaAnalisis.filter((v) => new Date(v.fecha) >= inicio)
  }
  
  if (analisisFiltroFechaFin.value) {
    const fin = new Date(analisisFiltroFechaFin.value)
    fin.setHours(23, 59, 59, 999)
    ventasParaAnalisis = ventasParaAnalisis.filter((v) => new Date(v.fecha) <= fin)
  }
  
  const productoMap = new Map<string, { nombre: string; cantidad: number; total: number; categoria: string | null }>()
  
  ventasParaAnalisis.forEach((venta) => {
    venta.items.forEach((item) => {
      const producto = productosStore.productos.find((p) => p.id === item.producto_id)
      if (!producto) return
      
      const actual = productoMap.get(item.producto_id) || { 
        nombre: producto.nombre, 
        cantidad: 0, 
        total: 0,
        categoria: producto.categoria 
      }
      actual.cantidad += item.cantidad
      actual.total += item.subtotal
      productoMap.set(item.producto_id, actual)
    })
  })
  
  let result = Array.from(productoMap.values())
  
  // Filter by category
  if (analisisFiltroCategoria.value) {
    result = result.filter((p) => p.categoria === analisisFiltroCategoria.value)
  }
  
  return result.sort((a, b) => b.total - a.total)
})

function limpiarFiltrosAnalisis() {
  analisisFiltroFechaInicio.value = null
  analisisFiltroFechaFin.value = null
  analisisFiltroCategoria.value = null
}

// Get unique products from filtered sales
const productosEnVentas = computed(() => {
  const productoIds = new Set<string>()
  ventasFiltradas.value.forEach((venta) => {
    venta.items.forEach((item) => productoIds.add(item.producto_id))
  })
  return Array.from(productoIds).map((id) => ({
    id,
    nombre: obtenerNombreProducto(id),
  }))
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
  filtroProductoId.value = null
  fechaInicio.value = null
  fechaFin.value = null
  mostrarFechasPersonalizadas.value = false
  rangoRapidoActivo.value = null
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
    await productosStore.cargarTodas()
  }
  
  // Auto-select active event if available
  const eventoActivo = eventsStore.eventos.find((e) => e.estado === 'en_curso')
  if (eventoActivo) {
    eventoSeleccionadoId.value = eventoActivo.id
    await cargarDatos()
    // Default to today's sales
    setRangoRapido('hoy')
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

function obtenerIconoMetodoPago(metodo: MetodoPago): string {
  const iconos: Record<MetodoPago, string> = {
    efectivo: 'mdi-cash',
    transferencia: 'mdi-bank-transfer',
    tarjeta: 'mdi-credit-card',
    mixto: 'mdi-swap-horizontal',
  }
  return iconos[metodo] || 'mdi-cash'
}

function formatearMetodoPago(metodo: MetodoPago): string {
  const labels: Record<MetodoPago, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta',
    mixto: 'Mixto',
  }
  return labels[metodo] || metodo
}

// Delete sale functionality
const dialogoEliminarAbierto = ref(false)
const ventaAEliminar = ref<VentaConItems | null>(null)

function abrirDialogoEliminar(venta: VentaConItems) {
  ventaAEliminar.value = venta
  dialogoEliminarAbierto.value = true
}

async function confirmarEliminar() {
  if (!ventaAEliminar.value) return
  try {
    await ventasStore.eliminarVenta(ventaAEliminar.value.id)
    dialogoEliminarAbierto.value = false
    ventaAEliminar.value = null
    // Recargar datos para actualizar KPIs
    await cargarDatos()
  } catch (error) {
    console.error('Error al eliminar venta:', error)
    // TODO: Mostrar error al usuario
  }
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

      <!-- Tabs -->
      <v-tabs v-model="tabActiva" class="mb-4">
        <v-tab value="ventas">
          <v-icon start>mdi-receipt</v-icon>
          Ventas
        </v-tab>
        <v-tab value="analisis">
          <v-icon start>mdi-chart-bar</v-icon>
          Análisis
        </v-tab>
      </v-tabs>

      <v-window v-model="tabActiva">
        <!-- Ventas Tab -->
        <v-window-item value="ventas">

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
          
          <div class="d-flex align-center ga-2 flex-wrap mb-3">
            <span class="text-body-2 font-weight-medium">Producto:</span>
            <v-select
              v-model="filtroProductoId"
              :items="productosEnVentas"
              item-title="nombre"
              item-value="id"
              label="Todos los productos"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              style="max-width: 300px"
              data-testid="ventas-filtro-producto"
            />
          </div>
          
          <div class="d-flex align-center ga-2 flex-wrap">
            <span class="text-body-2 font-weight-medium">Rango de fechas:</span>
            <v-chip
              :color="rangoRapidoActivo === 'hoy' ? 'primary' : undefined"
              :variant="rangoRapidoActivo === 'hoy' ? 'flat' : 'tonal'"
              size="small"
              data-testid="ventas-rango-hoy"
              @click="setRangoRapido('hoy')"
            >
              Hoy
            </v-chip>
            <v-chip
              :color="rangoRapidoActivo === 'ayer' ? 'primary' : undefined"
              :variant="rangoRapidoActivo === 'ayer' ? 'flat' : 'tonal'"
              size="small"
              data-testid="ventas-rango-ayer"
              @click="setRangoRapido('ayer')"
            >
              Ayer
            </v-chip>
            <v-chip
              :color="rangoRapidoActivo === 'semana' ? 'primary' : undefined"
              :variant="rangoRapidoActivo === 'semana' ? 'flat' : 'tonal'"
              size="small"
              data-testid="ventas-rango-semana"
              @click="setRangoRapido('semana')"
            >
              Última semana
            </v-chip>
            <v-chip
              :color="rangoRapidoActivo === 'mes' ? 'primary' : undefined"
              :variant="rangoRapidoActivo === 'mes' ? 'flat' : 'tonal'"
              size="small"
              data-testid="ventas-rango-mes"
              @click="setRangoRapido('mes')"
            >
              Este mes
            </v-chip>
            <v-chip
              :color="mostrarFechasPersonalizadas ? 'primary' : undefined"
              :variant="mostrarFechasPersonalizadas ? 'flat' : 'tonal'"
              size="small"
              prepend-icon="mdi-calendar-edit"
              data-testid="ventas-rango-personalizado"
              @click="setRangoRapido('personalizado')"
            >
              Personalizado
            </v-chip>
            
            <v-spacer />
            
            <v-btn
              v-if="filtroMetodoPago || filtroProductoId || fechaInicio || fechaFin"
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
          
          <!-- Custom date range (only shown when activated) -->
          <div v-if="mostrarFechasPersonalizadas" class="d-flex align-center ga-2 flex-wrap mt-3">
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
              <v-icon color="primary">
                {{ obtenerIconoMetodoPago(venta.metodo_pago) }}
              </v-icon>
            </template>
            <v-list-item-title class="font-weight-medium">
              {{ formatearUSD(venta.total) }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ formatearFecha(venta.fecha) }} · {{ formatearMetodoPago(venta.metodo_pago) }} · {{ venta.items.length }} item(s)
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                icon="mdi-delete"
                variant="text"
                size="x-small"
                color="error"
                data-testid="ventas-eliminar-btn"
                @click.stop="abrirDialogoEliminar(venta)"
              />
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
            {{ filtroMetodoPago || filtroProductoId ? 'No hay ventas con este filtro' : 'Sin ventas registradas' }}
          </p>
        </div>
      </v-card>
        </v-window-item>

        <!-- Analysis Tab -->
        <v-window-item value="analisis">
      <!-- Analysis Filters -->
      <v-card class="mb-4" data-testid="ventas-analisis-filtros">
        <v-card-text>
          <div class="d-flex align-center ga-2 flex-wrap mb-3">
            <span class="text-body-2 font-weight-medium">Rango de fechas:</span>
            <v-text-field
              v-model="analisisFiltroFechaInicio"
              type="date"
              label="Desde"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 180px"
              data-testid="ventas-analisis-fecha-inicio"
            />
            <span>—</span>
            <v-text-field
              v-model="analisisFiltroFechaFin"
              type="date"
              label="Hasta"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 180px"
              data-testid="ventas-analisis-fecha-fin"
            />
          </div>
          
          <div class="d-flex align-center ga-2 flex-wrap">
            <span class="text-body-2 font-weight-medium">Categoría:</span>
            <v-chip
              :color="analisisFiltroCategoria === null ? 'primary' : undefined"
              :variant="analisisFiltroCategoria === null ? 'flat' : 'tonal'"
              size="small"
              data-testid="ventas-analisis-categoria-todas"
              @click="analisisFiltroCategoria = null"
            >
              Todas
            </v-chip>
            <v-chip
              v-for="cat in CATEGORIAS_PRODUCTO"
              :key="cat.value"
              :color="analisisFiltroCategoria === cat.value ? 'primary' : undefined"
              :variant="analisisFiltroCategoria === cat.value ? 'flat' : 'tonal'"
              size="small"
              :data-testid="`ventas-analisis-categoria-${cat.value}`"
              @click="analisisFiltroCategoria = analisisFiltroCategoria === cat.value ? null : cat.value"
            >
              {{ cat.label }}
            </v-chip>
            
            <v-spacer />
            
            <v-btn
              v-if="analisisFiltroFechaInicio || analisisFiltroFechaFin || analisisFiltroCategoria"
              size="small"
              variant="text"
              color="error"
              prepend-icon="mdi-filter-remove"
              data-testid="ventas-analisis-limpiar"
              @click="limpiarFiltrosAnalisis"
            >
              Limpiar
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- Analysis Table -->
      <v-card v-if="analisisProductos.length > 0" data-testid="ventas-analisis-productos">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-chart-bar</v-icon>
          Análisis por producto
        </v-card-title>
        <v-divider />
        <v-table density="compact">
          <thead>
            <tr>
              <th>Producto</th>
              <th class="text-right">Categoría</th>
              <th class="text-right">Cantidad vendida</th>
              <th class="text-right">Total vendido</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="producto in analisisProductos" :key="producto.nombre">
              <td>{{ producto.nombre }}</td>
              <td class="text-right text-caption">{{ producto.categoria || '—' }}</td>
              <td class="text-right">{{ producto.cantidad }}</td>
              <td class="text-right font-weight-medium">{{ formatearUSD(producto.total) }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card v-else class="text-center py-8">
        <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-chart-bar</v-icon>
        <p class="text-medium-emphasis mb-0">No hay datos para mostrar con los filtros seleccionados</p>
      </v-card>
        </v-window-item>
      </v-window>
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
          <div class="d-flex align-center ga-4 mb-4">
            <div>
              <div class="text-caption text-medium-emphasis">Método de pago</div>
              <div class="d-flex align-center">
                <v-icon class="mr-2" color="primary">
                  {{ obtenerIconoMetodoPago(ventaSeleccionada.metodo_pago) }}
                </v-icon>
                <span class="text-body-1 font-weight-medium">
                  {{ formatearMetodoPago(ventaSeleccionada.metodo_pago) }}
                </span>
              </div>
            </div>
            <v-divider vertical />
            <div>
              <div class="text-caption text-medium-emphasis">Fecha</div>
              <div class="text-body-1">{{ formatearFecha(ventaSeleccionada.fecha) }}</div>
            </div>
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

    <!-- Delete sale confirmation dialog -->
    <v-dialog
      v-model="dialogoEliminarAbierto"
      max-width="500"
      data-testid="ventas-eliminar-dialogo"
    >
      <v-card v-if="ventaAEliminar">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" color="error">mdi-alert-circle</v-icon>
          Eliminar venta
          <v-spacer />
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="dialogoEliminarAbierto = false"
          />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <p class="text-body-1 mb-3">
            ¿Estás seguro de que deseas eliminar esta venta?
          </p>
          <v-alert type="warning" variant="tonal" density="compact">
            <div class="text-body-2">
              <strong>Fecha:</strong> {{ formatearFecha(ventaAEliminar.fecha) }}<br />
              <strong>Total:</strong> {{ formatearUSD(ventaAEliminar.total) }}<br />
              <strong>Productos:</strong> {{ ventaAEliminar.items.length }} item(s)
            </div>
          </v-alert>
          <p class="text-caption text-medium-emphasis mt-3 mb-0">
            Esta acción no se puede deshacer.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="dialogoEliminarAbierto = false"
          >
            Cancelar
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            @click="confirmarEliminar"
          >
            Eliminar
          </v-btn>
        </v-card-actions>
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
