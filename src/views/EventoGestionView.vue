<script setup lang="ts">
// event-product-management-refactor / Phase 3: unified Gestión productos
// view at `/eventos/:id/gestion`. This is the canonical event-product
// workflow — combines inclusion, pricing (two-slider model), planned
// production units, cost, and contribution in a single row.
//
// Data sources:
//   - epStore (evento_productos): inclusion, pricing, margins
//   - ppStore (producto_produccion): planned units per event product
//   - productosStore + recipesStore + ingredientsStore: cost derivation
//   - useProyeccionCostos: event-level projection rail
//
// Mutations:
//   - epStore.toggleIncluido: flip included/excluded
//   - epStore.actualizarPrecio: write precio_venta + margen
//   - ppStore.upsert: write unidades_a_producir by evento_producto_id
//
// Layout: main table (flex-grow) + projection rail (secondary), matching
// the PlanificarEventoView pattern.
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EventoStatusChip from '@/components/business/EventoStatusChip.vue'
import IngredientesEventoPanel from '@/components/business/IngredientesEventoPanel.vue'
import MargenSlider from '@/components/business/MargenSlider.vue'
import ProyeccionCostosCard from '@/components/business/ProyeccionCostosCard.vue'
import { useEvents } from '@/composables/useEvents'
import { useIngredientesEvento } from '@/composables/useIngredientesEvento'
import { useProyeccionCostos } from '@/composables/useProyeccionCostos'
import { useEventoProductosStore } from '@/stores/eventoProductos.store'
import { useProductoProduccionStore } from '@/stores/productoProduccion.store'
import { useProductosStore } from '@/stores/productos.store'
import { useRecipesStore } from '@/stores/recipes.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { calcularCostoReceta } from '@/composables/useCalculoReceta'
import { estadoEsEditable } from '@/utils/estado'
import { formatearUSD, formatearUSDInput, parsearUSDInput } from '@/utils/format'
import type {
  EventoProducto,
  ProductoProduccion,
} from '@/types'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const { eventoActual, cargarPorId } = useEvents()
const epStore = useEventoProductosStore()
const ppStore = useProductoProduccionStore()
const productosStore = useProductosStore()
const recipesStore = useRecipesStore()
const ingredientsStore = useIngredientsStore()
const proyeccion = useProyeccionCostos(eventoId)
const ingredientesEvento = useIngredientesEvento(eventoId)

// Editable gate based on evento state.
const editable = computed(() =>
  eventoActual.value ? estadoEsEditable(eventoActual.value.estado) : false,
)

// ---- Unified row data ----
// Merge ALL evento_productos (including excluded) with optional production
// data from producto_produccion. Each row gets: EP fields + product name +
// unit cost + optional unidades_a_producir + optional pp.id for upserts.
interface FilaGestion {
  // evento_producto
  ep_id: string
  producto_id: string
  incluido: boolean
  precio_venta: number | null
  margen: number | null
  // producto
  producto_nombre: string
  producto_categoria: string | null
  producto_icono: string | null
  producto_color: string | null
  receta_id: string
  receta_nombre: string
  // derived
  costo_unitario: number
  // producto_produccion (optional — null when no row exists yet)
  pp_id: string | null
  unidades_a_producir: number
}

const filasGestion = computed<FilaGestion[]>(() => {
  const id = eventoId.value
  if (!id) return []

  const epRows = epStore.productosPorEvento.get(id) ?? []
  const ppRows = ppStore.produccionPorEvento.get(id) ?? []
  const ppByEp = new Map<string, ProductoProduccion>()
  for (const pp of ppRows) {
    ppByEp.set(pp.evento_producto_id, pp)
  }

  const productoMap = new Map(productosStore.productos.map((p) => [p.id, p]))
  const recetaMap = new Map(recipesStore.recetas.map((r) => [r.id, r]))
  const materiaMap = new Map(ingredientsStore.materiasPrimas.map((m) => [m.id, m]))

  return epRows.map<FilaGestion>((ep) => {
    const producto = productoMap.get(ep.producto_id)
    const receta = producto ? recetaMap.get(producto.receta_id) : null
    const pp = ppByEp.get(ep.id) ?? null

    // Cost from receta ingredients (same pattern as usePreciosEvento).
    let costo = 0
    if (receta && receta.ingredientes.length > 0) {
      const calculo = calcularCostoReceta(
        receta.ingredientes.map((ing) => ({
          ingrediente: ing,
          materiaPrima: materiaMap.get(ing.materia_prima_id) ?? null,
        })),
        receta.rendimiento_unidades,
      )
      costo = calculo.costoPorUnidad
    }

    return {
      ep_id: ep.id,
      producto_id: ep.producto_id,
      incluido: ep.incluido,
      precio_venta: ep.precio_venta,
      margen: ep.margen,
      producto_nombre: producto?.nombre ?? '(producto sin nombre)',
      producto_categoria: producto?.categoria ?? null,
      producto_icono: producto?.icono ?? null,
      producto_color: producto?.color ?? null,
      receta_id: producto?.receta_id ?? '',
      receta_nombre: receta?.nombre ?? '',
      costo_unitario: costo,
      pp_id: pp?.id ?? null,
      unidades_a_producir: pp?.unidades_a_producir ?? 0,
    }
  })
})

// ---- Two-slider pricing model (same as EventoProductosView) ----
// REQ-UX-27: ganancia% (green) and contribución% (orange) stacked.
// Price = Costo × (1 + ganancia% + contribución%).
const gananciaPct = ref<Record<string, number>>({})
const contribucionPct = ref<Record<string, number>>({})

// ---- Precio text input (controlled, same as EventoProductosView) ----
const precioTexto = ref<Record<string, string>>({})

function precioTextoFor(productoId: string, precio: number | null): string {
  return precioTexto.value[productoId] ?? formatearUSDInput(precio ?? 0)
}

// ---- Units text input (controlled for production units) ----
const unidadesTexto = ref<Record<string, string>>({})

function unidadesTextoFor(productoId: string, unidades: number): string {
  return unidadesTexto.value[productoId] ?? (unidades > 0 ? String(unidades) : '')
}

// ---- Loading state ----
const cargandoCompleto = ref(false)
const cargando = computed(() => epStore.cargando || ppStore.cargando || cargandoCompleto.value)
const errorCarga = computed(() => epStore.error ?? ppStore.error)

// ---- Initialize slider percentages from loaded data ----
function initSliderPct(fila: FilaGestion): { ganancia: number; contribucion: number } {
  const eventoMargen = eventoActual.value?.margen_ganancia ?? 0.30
  const costo = fila.costo_unitario
  const precio = fila.precio_venta ?? 0
  if (costo <= 0) return { ganancia: eventoMargen, contribucion: 0.10 }

  const rawEp = epStore.productosPorEvento
    .get(eventoId.value ?? '')
    ?.find((p) => p.producto_id === fila.producto_id)
  const isNew = !rawEp || rawEp.precio_venta === null || rawEp.precio_venta === undefined

  const totalMarkup = precio > 0 && costo > 0 ? (precio / costo) - 1 : 0
  const SLIDER_MAX = 2.00

  if (isNew) {
    const contribDefault = 0.10
    const contribucion = Math.max(0, Math.min(contribDefault, totalMarkup))
    const ganancia = Math.max(0, Math.min(SLIDER_MAX, totalMarkup - contribucion))
    return { ganancia, contribucion }
  }

  const ganancia = Math.min(SLIDER_MAX, Math.max(0, totalMarkup * 0.60))
  const contribucion = Math.min(SLIDER_MAX, Math.max(0, totalMarkup * 0.40))
  return { ganancia, contribucion }
}

function initSliderPcts() {
  const nextG: Record<string, number> = {}
  const nextC: Record<string, number> = {}
  for (const fila of filasGestion.value) {
    const pcts = initSliderPct(fila)
    nextG[fila.producto_id] = pcts.ganancia
    nextC[fila.producto_id] = pcts.contribucion
  }
  gananciaPct.value = nextG
  contribucionPct.value = nextC
}

function initPrecioTexto() {
  const next: Record<string, string> = {}
  for (const fila of filasGestion.value) {
    next[fila.producto_id] = formatearUSDInput(fila.precio_venta ?? 0)
  }
  precioTexto.value = next
}

function initUnidadesTexto() {
  const next: Record<string, string> = {}
  for (const fila of filasGestion.value) {
    next[fila.producto_id] = fila.unidades_a_producir > 0 ? String(fila.unidades_a_producir) : ''
  }
  unidadesTexto.value = next
}

// ---- Data loading ----
async function cargar() {
  if (!eventoId.value) return
  cargandoCompleto.value = true
  try {
    await cargarPorId(eventoId.value)
    await Promise.all([
      epStore.cargarPorEvento(eventoId.value),
      ppStore.cargarPorEvento(eventoId.value),
      recipesStore.recetas.length === 0 ? recipesStore.cargarTodas() : Promise.resolve(),
      ingredientsStore.materiasPrimas.length === 0
        ? ingredientsStore.cargarTodas()
        : Promise.resolve(),
      productosStore.productos.length === 0 ? productosStore.cargarTodas() : Promise.resolve(),
    ])
    await nextTick()
    initSliderPcts()
    initPrecioTexto()
    initUnidadesTexto()
  } finally {
    cargandoCompleto.value = false
  }
}

onMounted(cargar)

// ---- Mutations ----
async function alToggleIncluido(ep: EventoProducto) {
  if (!eventoId.value) return
  await epStore.toggleIncluido(eventoId.value, ep.producto_id)
}

async function alCambiarGanancia(fila: FilaGestion, pct: number) {
  if (!eventoId.value) return
  const prevGanancia = gananciaPct.value[fila.producto_id] ?? 0
  const prevContrib = contribucionPct.value[fila.producto_id] ?? 0
  const prevPrecioTexto = precioTexto.value[fila.producto_id]
  gananciaPct.value = { ...gananciaPct.value, [fila.producto_id]: pct }
  const nuevoPrecio = fila.costo_unitario * (1 + pct + prevContrib)
  precioTexto.value = { ...precioTexto.value, [fila.producto_id]: formatearUSDInput(nuevoPrecio) }
  const res = await epStore.actualizarPrecio(eventoId.value, fila.producto_id, nuevoPrecio, pct + prevContrib)
  if (res.error) {
    gananciaPct.value = { ...gananciaPct.value, [fila.producto_id]: prevGanancia }
    if (prevPrecioTexto !== undefined) {
      precioTexto.value = { ...precioTexto.value, [fila.producto_id]: prevPrecioTexto }
    }
  }
}

async function alCambiarContribucion(fila: FilaGestion, pct: number) {
  if (!eventoId.value) return
  const prevGanancia = gananciaPct.value[fila.producto_id] ?? 0
  const prevContrib = contribucionPct.value[fila.producto_id] ?? 0
  const prevPrecioTexto = precioTexto.value[fila.producto_id]
  contribucionPct.value = { ...contribucionPct.value, [fila.producto_id]: pct }
  const nuevoPrecio = fila.costo_unitario * (1 + prevGanancia + pct)
  precioTexto.value = { ...precioTexto.value, [fila.producto_id]: formatearUSDInput(nuevoPrecio) }
  const res = await epStore.actualizarPrecio(eventoId.value, fila.producto_id, nuevoPrecio, prevGanancia + pct)
  if (res.error) {
    contribucionPct.value = { ...contribucionPct.value, [fila.producto_id]: prevContrib }
    if (prevPrecioTexto !== undefined) {
      precioTexto.value = { ...precioTexto.value, [fila.producto_id]: prevPrecioTexto }
    }
  }
}

// Price text input redistribution (same logic as EventoProductosView).
function redistributeFromPrecio(productoId: string, nuevoPrecio: number) {
  const fila = filasGestion.value.find((f) => f.producto_id === productoId)
  if (!fila || !eventoId.value) return
  const costo = fila.costo_unitario
  if (costo <= 0) return
  const totalMarkup = (nuevoPrecio / costo) - 1
  const currentContrib = contribucionPct.value[productoId] ?? 0.10
  const nuevaContrib = totalMarkup >= currentContrib ? currentContrib : Math.max(0, totalMarkup)
  const nuevaGanancia = totalMarkup - nuevaContrib
  contribucionPct.value = { ...contribucionPct.value, [productoId]: nuevaContrib }
  gananciaPct.value = { ...gananciaPct.value, [productoId]: nuevaGanancia }
  const margenEquiv = nuevaGanancia + nuevaContrib
  epStore.actualizarPrecio(eventoId.value, productoId, nuevoPrecio, margenEquiv)
}

function onPrecioInput(productoId: string, valor: string): void {
  precioTexto.value = { ...precioTexto.value, [productoId]: valor }
  const parsed = parsearUSDInput(valor)
  if (!Number.isNaN(parsed) && parsed >= 0) {
    redistributeFromPrecio(productoId, parsed)
  }
}

function onPrecioBlur(productoId: string): void {
  const fila = filasGestion.value.find((f) => f.producto_id === productoId)
  if (!fila) return
  const parsed = parsearUSDInput(precioTexto.value[productoId] ?? '')
  const normalized = !Number.isNaN(parsed) && parsed >= 0 ? parsed : (fila.precio_venta ?? 0)
  precioTexto.value = { ...precioTexto.value, [productoId]: formatearUSDInput(normalized) }
  if (!Number.isNaN(parsed) && parsed !== (fila.precio_venta ?? 0) && parsed >= 0) {
    redistributeFromPrecio(productoId, parsed)
  }
}

// Production units: save on blur or Enter.
async function alGuardarUnidades(fila: FilaGestion) {
  if (!eventoId.value) return
  const texto = unidadesTexto.value[fila.producto_id] ?? ''
  const parsed = parseInt(texto, 10)
  if (Number.isNaN(parsed) || parsed < 0) {
    // Invalid — revert to current value.
    unidadesTexto.value = { ...unidadesTexto.value, [fila.producto_id]: fila.unidades_a_producir > 0 ? String(fila.unidades_a_producir) : '' }
    return
  }
  if (parsed === 0 && fila.pp_id === null) {
    // No existing row and zero units → nothing to create.
    unidadesTexto.value = { ...unidadesTexto.value, [fila.producto_id]: '' }
    return
  }
  const res = await ppStore.upsert(eventoId.value, fila.ep_id, parsed)
  if (res.error) {
    unidadesTexto.value = { ...unidadesTexto.value, [fila.producto_id]: fila.unidades_a_producir > 0 ? String(fila.unidades_a_producir) : '' }
  }
}

function onUnidadesInput(productoId: string, valor: string): void {
  unidadesTexto.value = { ...unidadesTexto.value, [productoId]: valor }
}

// ---- Catalog initialization and product addition ----
async function alInicializar() {
  if (!eventoId.value) return
  await epStore.inicializarDesdeCatalogo(eventoId.value)
  // Reload production data after initialization.
  await ppStore.cargarPorEvento(eventoId.value)
  await nextTick()
  initSliderPcts()
  initPrecioTexto()
  initUnidadesTexto()
}

const dialogoAgregarAbierto = ref<boolean>(false)
const productosDisponibles = computed(() => {
  const todas = new Set(
    epStore.productosPorEvento.get(eventoId.value ?? '')?.map((ep) => ep.producto_id) ?? [],
  )
  return productosStore.productos
    .filter((p) => !todas.has(p.id))
    .map((p) => {
      const receta = recipesStore.recetas.find((r) => r.id === p.receta_id)
      return {
        id: p.id,
        nombre: receta?.nombre ?? '(sin receta)',
        disponible: p.disponible,
      }
    })
})

function abrirDialogoAgregar() {
  dialogoAgregarAbierto.value = true
  if (productosStore.productos.length === 0) {
    void productosStore.cargarTodas()
  }
}

async function alAgregarProducto(productoId: string) {
  if (!eventoId.value) return
  await epStore.agregar(eventoId.value, productoId)
}

// ---- Navigation ----
function volver() {
  if (eventoId.value) router.push({ name: 'evento-detalle', params: { id: eventoId.value } })
}

// ---- Computed helpers ----
// Total contribution: sum of (contribución unitaria × unidades_a_producir)
// for all included products with production data.
const contribucionTotal = computed<number>(() => {
  return filasGestion.value
    .filter((f) => f.incluido)
    .reduce((total, f) => {
      const contribUnit = f.costo_unitario * (contribucionPct.value[f.producto_id] ?? 0)
      return total + contribUnit * f.unidades_a_producir
    }, 0)
})

// Total planned units across all included products.
const totalUnidades = computed<number>(() => {
  return filasGestion.value
    .filter((f) => f.incluido)
    .reduce((sum, f) => sum + f.unidades_a_producir, 0)
})

// Total planned investment: sum of (costo × unidades) for included products.
const inversionTotal = computed<number>(() => {
  return filasGestion.value
    .filter((f) => f.incluido)
    .reduce((sum, f) => sum + f.costo_unitario * f.unidades_a_producir, 0)
})
</script>

<template>
  <v-container>
    <v-progress-linear v-if="cargando" indeterminate color="primary"
      data-testid="evento-gestion-loading" />

    <v-alert v-if="errorCarga && !cargando" type="error" class="mb-4"
      data-testid="evento-gestion-error">
      {{ errorCarga }}
    </v-alert>

    <template v-if="eventoActual">
      <div class="d-flex align-center ga-3 mb-2">
        <h1 data-testid="evento-gestion-titulo">{{ eventoActual.nombre }}</h1>
        <EventoStatusChip v-if="eventoActual.estado" :estado="eventoActual.estado" />
      </div>
      <p class="mb-2 text-medium-emphasis" data-testid="evento-gestion-fechas">
        Gestión productos
      </p>

      <v-alert v-if="!editable" type="warning" class="mb-4"
        data-testid="evento-gestion-alerta-cerrado">
        Evento cerrado — no editable
      </v-alert>

      <div class="d-flex ga-2 mb-4">
        <v-btn variant="text" prepend-icon="mdi-arrow-left"
          data-testid="evento-gestion-volver" @click="volver">
          Volver al evento
        </v-btn>
      </div>

      <!-- Empty state: no products configured yet -->
      <v-card v-if="filasGestion.length === 0 && !cargando" class="pa-4 text-center"
        data-testid="evento-gestion-empty">
        <p class="mb-3">No hay productos configurados todavía.</p>
        <v-btn v-if="editable" color="primary" variant="flat"
          data-testid="evento-gestion-inicializar" @click="alInicializar">
          Inicializar desde catálogo
        </v-btn>
      </v-card>

      <!-- Main layout: table + projection rail -->
      <div v-if="filasGestion.length > 0" class="gestion-grid d-flex ga-4">
        <v-card class="pa-4 flex-grow-1" data-testid="evento-gestion-tabla-card">
          <div class="d-flex align-center justify-space-between mb-3">
            <h2 class="text-h6">Productos del evento</h2>
            <div class="d-flex ga-2">
              <v-btn
                v-if="editable"
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-plus"
                data-testid="evento-gestion-agregar"
                @click="abrirDialogoAgregar"
              >
                Agregar producto
              </v-btn>
            </div>
          </div>

          <!-- Summary chips: grouped in a subtle container for faster scanning -->
          <div class="summary-bar d-flex ga-3 mb-4 flex-wrap bg-grey-lighten-5 rounded pa-2">
            <v-chip size="small" color="primary" variant="tonal"
              data-testid="evento-gestion-total-productos">
              {{ filasGestion.filter(f => f.incluido).length }} incluido(s)
            </v-chip>
            <v-chip size="small" variant="tonal"
              data-testid="evento-gestion-total-unidades">
              {{ totalUnidades }} und. planificadas
            </v-chip>
            <v-chip size="small" color="orange-darken-2" variant="tonal"
              data-testid="evento-gestion-contribucion-total">
              Contribución: ${{ contribucionTotal.toFixed(2) }}
            </v-chip>
            <v-chip size="small" color="info" variant="tonal"
              data-testid="evento-gestion-inversion-total">
              Inversión: ${{ inversionTotal.toFixed(2) }}
            </v-chip>
          </div>

          <v-data-table
            :items="filasGestion"
            :headers="[
              { title: '', key: 'incluido', sortable: false, width: 56 },
              { title: 'Producto', key: 'producto_nombre' },
              { title: 'Und. a producir', key: 'unidades_a_producir', width: 155, align: 'center' },
              { title: 'Costo prod.', key: 'costo_total_prod', width: 110, align: 'end' },
              { title: 'Precio venta', key: 'precio_final', width: 130, align: 'center' },
              { title: 'Márgenes', key: 'margenes', minWidth: 260 },
              { title: 'Contrib. total', key: 'contribucion_unit', width: 120, align: 'end' },
            ]"
            density="compact"
            data-testid="evento-gestion-tabla"
          >
            <!-- Include toggle -->
            <template #[`item.incluido`]="{ item }">
              <v-checkbox-btn
                :model-value="item.incluido"
                :disabled="!editable"
                :data-testid="`evento-gestion-incluido-${item.producto_id}`"
                @update:model-value="alToggleIncluido({ id: item.ep_id, producto_id: item.producto_id, incluido: item.incluido } as EventoProducto)"
              />
            </template>

            <!-- Product identity: name + recipe + unit cost (hierarchy priority 1) -->
            <template #[`item.producto_nombre`]="{ item }">
              <div>
                <span class="font-weight-medium">{{ item.producto_nombre }}</span>
                <div class="text-caption text-medium-emphasis">
                  {{ item.receta_nombre }}
                  <template v-if="item.costo_unitario > 0">
                    · {{ formatearUSD(item.costo_unitario) }}/und.
                  </template>
                </div>
              </div>
            </template>

            <!-- Total production cost per product line (hierarchy priority 1) -->
            <template #[`item.costo_total_prod`]="{ item }">
              <span :class="{ 'text-medium-emphasis': item.unidades_a_producir === 0 }">
                {{ formatearUSD(item.costo_unitario * item.unidades_a_producir) }}
              </span>
            </template>

            <!-- Production units: editable input -->
            <template #[`item.unidades_a_producir`]="{ item }">
              <v-text-field
                :model-value="unidadesTextoFor(item.producto_id, item.unidades_a_producir)"
                type="text"
                inputmode="numeric"
                density="compact"
                hide-details
                :disabled="!editable"
                :data-testid="`evento-gestion-unidades-${item.producto_id}`"
                class="text-center mx-auto"
                style="width: 100%"
                @update:model-value="(v) => onUnidadesInput(item.producto_id, v)"
                @blur="() => alGuardarUnidades(item)"
                @keydown.enter="() => alGuardarUnidades(item)"
              />
            </template>

            <!-- Two-slider pricing: ganancia (green) + contribución (orange), stacked
                 vertically with compact labels so the operator can distinguish them
                 at a glance instead of parsing two identical side-by-side sliders. -->
            <template #[`item.margenes`]="{ item }">
              <div class="margenes-cell">
                <div class="d-flex align-center ga-1 mb-1">
                  <span class="text-caption font-weight-medium text-green-darken-2 slider-label">Gan.</span>
                  <MargenSlider
                    :model-value="gananciaPct[item.producto_id] ?? 0"
                    :costo="item.costo_unitario"
                    color="green"
                    :disabled="!editable"
                    @update:model-value="(m) => alCambiarGanancia(item, m)"
                  />
                </div>
                <div class="d-flex align-center ga-1">
                  <span class="text-caption font-weight-medium text-orange-darken-2 slider-label">Cont.</span>
                  <MargenSlider
                    :model-value="contribucionPct[item.producto_id] ?? 0"
                    :costo="item.costo_unitario"
                    color="orange"
                    :disabled="!editable"
                    @update:model-value="(m) => alCambiarContribucion(item, m)"
                  />
                </div>
              </div>
            </template>

            <!-- Price text input -->
            <template #[`item.precio_final`]="{ item }">
              <v-text-field
                :model-value="precioTextoFor(item.producto_id, item.precio_venta)"
                type="text"
                inputmode="decimal"
                density="compact"
                hide-details
                :disabled="!editable"
                :color="(item.precio_venta ?? 0) < (item.costo_unitario ?? 0) ? 'error' : undefined"
                :data-testid="`evento-gestion-precio-${item.producto_id}`"
                class="text-center mx-auto"
                style="max-width: 140px"
                prefix="$"
                @update:model-value="(v) => onPrecioInput(item.producto_id, v)"
                @blur="() => onPrecioBlur(item.producto_id)"
              />
            </template>

            <!-- Total planned contribution: unidades × costo × contribución% -->
            <template #[`item.contribucion_unit`]="{ item }">
              <span class="font-weight-medium text-orange-darken-2">
                ${{ ((item.unidades_a_producir ?? 0) * (item.costo_unitario ?? 0) * (contribucionPct[item.producto_id] ?? 0)).toFixed(2) }}
              </span>
            </template>
          </v-data-table>

          <IngredientesEventoPanel :resultado="ingredientesEvento" />
        </v-card>

        <!-- Projection rail -->
        <div class="gestion-rail">
          <ProyeccionCostosCard :proyeccion="proyeccion" />
        </div>
      </div>

      <!-- Add product dialog -->
      <v-dialog v-model="dialogoAgregarAbierto" max-width="520"
        data-testid="evento-gestion-dialogo-agregar">
        <v-card>
          <v-card-title>Agregar producto al evento</v-card-title>
          <v-card-text>
            <p v-if="productosDisponibles.length === 0" class="text-disabled mb-0">
              Todos los productos del catálogo ya están en este evento.
            </p>
            <v-list v-else lines="two">
              <v-list-item
                v-for="producto in productosDisponibles"
                :key="producto.id"
                :data-testid="`evento-gestion-dialogo-item-${producto.id}`"
              >
                <v-list-item-title>{{ producto.nombre }}</v-list-item-title>
                <v-list-item-subtitle v-if="!producto.disponible" class="text-warning">
                  Producto no disponible en el catálogo
                </v-list-item-subtitle>
                <template #append>
                  <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    :data-testid="`evento-gestion-dialogo-agregar-${producto.id}`"
                    @click="alAgregarProducto(producto.id)"
                  >
                    Agregar
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" data-testid="evento-gestion-dialogo-cerrar"
              @click="dialogoAgregarAbierto = false">
              Cerrar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </v-container>
</template>

<style scoped>
/* gestion-grid: same rail pattern as PlanificarEventoView — the
   projection rail is secondary supporting context with reduced
   visual weight so the product table dominates the layout.
   Tightened further for Gestion view: narrower column + zero-grow
   so it never steals space from the data table. */
.gestion-rail {
  min-width: 220px;
  max-width: 260px;
  flex: 0 1 240px;
}

/* Margenes cell: sliders are narrower in table context so the
   stacked layout stays compact and label/slider alignment is
   consistent across rows. The per-slider price text is hidden here
   — it's redundant with the price column and can mislead because it
   shows only that slider's markup × cost, not the full price. */
.margenes-cell :deep(.margen-slider-input) {
  max-width: 150px;
}
.margenes-cell :deep([data-testid="margen-slider-precio"]) {
  display: none;
}

/* Fixed-width slider label so "Gan." / "Cont." don't jitter
   between rows when one slider has a wider % value. */
.slider-label {
  display: inline-block;
  min-width: 36px;
}
</style>
