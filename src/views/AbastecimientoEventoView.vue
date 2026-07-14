<script setup lang="ts">
// REQ-ABASTECIMIENTO-1..3: Abastecimiento view for event purchases.
// Owns the purchase form (registrar_compra_insumo RPC), displays the
// compras_insumos list for the event, and shows related stock movements.
// Correction dialog uses registrar_correccion for purchase adjustments.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAbastecimientoStore } from '@/stores/abastecimiento.store'
import { useStockMovementsStore } from '@/stores/stockMovements.store'
import { useIngredients } from '@/composables/useIngredients'
import { useSociosStore } from '@/stores/socios.store'
import type {
  CompraInsumo,
  MateriaPrima,
  RegistrarCompraInsumoInput,
  RegistrarCorreccionInput,
  StockMovement,
} from '@/types'

const route = useRoute()
const router = useRouter()

const eventoId = computed<string | null>(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null
})

const abastecimientoStore = useAbastecimientoStore()
const stockMovementsStore = useStockMovementsStore()
const { materiasPrimas } = useIngredients()
const sociosStore = useSociosStore()

// Purchase dialog state
const dialogoCompra = ref(false)
const socioId = ref<string | null>(null)
const materiaPrimaId = ref<string | null>(null)
const cantidad = ref<number>(0)
const costoTotal = ref<number>(0)
const fechaCompra = ref<string>(new Date().toISOString().slice(0, 10))
const descripcionCompra = ref<string>('')
const erroresForm = ref<Record<string, string>>({})

// Correction dialog state
const dialogoCorreccion = ref(false)
const movimientoACorregir = ref<StockMovement | null>(null)
const cantidadCorregida = ref<number>(0)
const motivoCorreccion = ref<string>('')
const erroresCorreccion = ref<Record<string, string>>({})

// Derived data
const compras = computed<CompraInsumo[]>(() =>
  eventoId.value ? (abastecimientoStore.comprasInsumos.get(eventoId.value) ?? []) : [],
)

const movimientosEvento = computed<StockMovement[]>(() =>
  stockMovementsStore.movements.filter((m) => m.evento_id === eventoId.value),
)

const materiasMap = computed<Map<string, MateriaPrima>>(() => {
  const map = new Map<string, MateriaPrima>()
  for (const mp of materiasPrimas.value) {
    map.set(mp.id, mp)
  }
  return map
})

const socios = computed(() => sociosStore.socios)

// Computed costo_unitario from costo_total / cantidad
const costoUnitarioCalculado = computed(() => {
  if (cantidad.value > 0 && costoTotal.value > 0) {
    return +(costoTotal.value / cantidad.value).toFixed(4)
  }
  return 0
})

// Purchase form validation
function validarCompra(): boolean {
  const e: Record<string, string> = {}
  if (!socioId.value) e.socio = 'El socio es obligatorio'
  if (!materiaPrimaId.value) e.materiaPrima = 'La materia prima es obligatoria'
  if (cantidad.value <= 0) e.cantidad = 'La cantidad debe ser mayor a 0'
  if (costoTotal.value <= 0) e.costoTotal = 'El costo total debe ser mayor a 0'
  erroresForm.value = e
  return Object.keys(e).length === 0
}

// Correction form validation
function validarCorreccion(): boolean {
  const e: Record<string, string> = {}
  if (cantidadCorregida.value <= 0) e.cantidadCorregida = 'La cantidad corregida debe ser mayor a 0'
  if (!motivoCorreccion.value.trim()) e.motivo = 'El motivo de la corrección es obligatorio'
  erroresCorreccion.value = e
  return Object.keys(e).length === 0
}

async function manejarCompraSubmit() {
  if (!validarCompra() || !eventoId.value) return

  const input: RegistrarCompraInsumoInput = {
    socio_id: socioId.value!,
    materia_prima_id: materiaPrimaId.value!,
    cantidad: cantidad.value,
    costo_unitario: costoUnitarioCalculado.value,
    costo_total: costoTotal.value,
    evento_id: eventoId.value,
    descripcion: descripcionCompra.value.trim() || null,
    fecha: fechaCompra.value,
  }

  const res = await abastecimientoStore.registrarCompraInsumo(input)
  if (!res.error) {
    dialogoCompra.value = false
    // Refresh stock movements to show the new purchase
    await stockMovementsStore.cargarMovimientos()
    await stockMovementsStore.cargarStockActual()
    resetearFormCompra()
  }
}

async function manejarCorreccionSubmit() {
  if (!validarCorreccion() || !movimientoACorregir.value) return

  const input: RegistrarCorreccionInput = {
    movimiento_id: movimientoACorregir.value.id,
    cantidad_corregida: cantidadCorregida.value,
    motivo: motivoCorreccion.value.trim(),
    fecha: new Date().toISOString().slice(0, 10),
  }

  const res = await stockMovementsStore.registrarCorreccion(input)
  if (!res.error) {
    dialogoCorreccion.value = false
    await stockMovementsStore.cargarMovimientos()
    await stockMovementsStore.cargarStockActual()
    resetearFormCorreccion()
  }
}

function abrirCorreccion(mov: StockMovement) {
  movimientoACorregir.value = mov
  cantidadCorregida.value = Math.abs(mov.cantidad)
  motivoCorreccion.value = ''
  erroresCorreccion.value = {}
  dialogoCorreccion.value = true
}

function resetearFormCompra() {
  socioId.value = null
  materiaPrimaId.value = null
  cantidad.value = 0
  costoTotal.value = 0
  fechaCompra.value = new Date().toISOString().slice(0, 10)
  descripcionCompra.value = ''
  erroresForm.value = {}
}

function resetearFormCorreccion() {
  movimientoACorregir.value = null
  cantidadCorregida.value = 0
  motivoCorreccion.value = ''
  erroresCorreccion.value = {}
}

function nombreMateria(id: string): string {
  return materiasMap.value.get(id)?.nombre ?? id.slice(0, 8)
}

function signoCantidad(cant: number): string {
  if (cant > 0) return '+'
  if (cant < 0) return ''
  return ''
}

function costoUnitarioDeCompra(compra: CompraInsumo): string {
  if (compra.cantidad > 0) {
    return (compra.costo_total / compra.cantidad).toFixed(2)
  }
  return '0.00'
}

function volverDetalle() {
  if (eventoId.value) {
    router.push({ name: 'evento-detalle', params: { id: eventoId.value } })
  }
}

onMounted(async () => {
  if (eventoId.value) {
    await abastecimientoStore.cargarComprasInsumos(eventoId.value)
    await stockMovementsStore.cargarMovimientos()
    await stockMovementsStore.cargarStockActual()
    if (sociosStore.socios.length === 0) {
      await sociosStore.cargarTodos()
    }
  }
  const ingredientsStore = useIngredients()
  if (materiasPrimas.value.length === 0) {
    await ingredientsStore.cargarTodas()
  }
})
</script>

<template>
  <v-container>
    <v-progress-linear
      v-if="abastecimientoStore.cargando || stockMovementsStore.cargando"
      indeterminate
      color="primary"
    />

    <v-alert
      v-if="abastecimientoStore.error"
      type="error"
      class="mb-4"
    >
      {{ abastecimientoStore.error }}
    </v-alert>

    <template v-if="eventoId">
      <div class="d-flex align-center ga-3 mb-4 flex-wrap">
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="volverDetalle">
          Volver
        </v-btn>
        <h1>Abastecimiento</h1>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-cart-plus"
          data-testid="abastecimiento-nueva-compra"
          @click="dialogoCompra = true"
        >
          Nueva compra
        </v-btn>
      </div>

      <!-- Compras list -->
      <v-card class="mb-4">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon>mdi-cart</v-icon>
          Compras de insumos
        </v-card-title>
        <v-card-text>
          <v-list v-if="compras.length > 0" data-testid="abastecimiento-compras-list">
            <v-list-item
              v-for="compra in compras"
              :key="compra.id"
              :data-testid="`abastecimiento-compra-${compra.id}`"
            >
              <template #title>
                {{ nombreMateria(compra.materia_prima_id) }}
              </template>
              <template #subtitle>
                {{ compra.fecha.slice(0, 10) }} —
                {{ compra.cantidad }} × ${{ costoUnitarioDeCompra(compra) }}
              </template>
              <template #append>
                <span class="font-weight-bold">${{ compra.costo_total.toFixed(2) }}</span>
              </template>
            </v-list-item>
          </v-list>
          <div v-else class="text-center text-medium-emphasis py-4">
            No hay compras registradas para este evento
          </div>
        </v-card-text>
      </v-card>

      <!-- Stock movements for this event -->
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon>mdi-swap-horizontal</v-icon>
          Movimientos de inventario
        </v-card-title>
        <v-card-text>
          <v-list v-if="movimientosEvento.length > 0" data-testid="abastecimiento-movimientos-list">
            <v-list-item
              v-for="mov in movimientosEvento"
              :key="mov.id"
            >
              <template #title>
                {{ nombreMateria(mov.materia_prima_id) }} —
                {{ mov.tipo === 'correccion' ? 'Corrección' : mov.tipo === 'compra' ? 'Compra' : mov.tipo }}
              </template>
              <template #subtitle>
                {{ mov.fecha.slice(0, 10) }}
                <template v-if="mov.tipo === 'correccion' && mov.motivo">
                  — Motivo: {{ mov.motivo }}
                </template>
                <template v-if="mov.costo_unitario_snapshot">
                  — Costo u.: ${{ mov.costo_unitario_snapshot.toFixed(2) }}
                </template>
              </template>
              <template #append>
                <span
                  :class="mov.cantidad > 0 ? 'text-success' : 'text-error'"
                  class="font-weight-bold"
                >
                  {{ signoCantidad(mov.cantidad) }}{{ mov.cantidad }}
                </span>
                <v-btn
                  v-if="mov.tipo === 'compra'"
                  icon="mdi-pencil"
                  size="small"
                  variant="text"
                  :data-testid="`abastecimiento-corregir-${mov.id}`"
                  @click="abrirCorreccion(mov)"
                />
              </template>
            </v-list-item>
          </v-list>
          <div v-else class="text-center text-medium-emphasis py-4">
            No hay movimientos de inventario para este evento
          </div>
        </v-card-text>
      </v-card>
    </template>

    <v-alert v-else type="warning">
      No se encontró el evento
    </v-alert>

    <!-- Purchase dialog -->
    <v-dialog v-model="dialogoCompra" max-width="500">
      <v-card>
        <v-card-title>Registrar compra de insumo</v-card-title>
        <v-card-text>
          <v-select
            v-model="socioId"
            :items="socios"
            item-title="nombre"
            item-value="id"
            label="Socio"
            :error-messages="erroresForm.socio ? [erroresForm.socio] : []"
            data-testid="abastecimiento-compra-socio"
          />
          <v-select
            v-model="materiaPrimaId"
            :items="materiasPrimas"
            item-title="nombre"
            item-value="id"
            label="Materia prima"
            :error-messages="erroresForm.materiaPrima ? [erroresForm.materiaPrima] : []"
            data-testid="abastecimiento-compra-materia"
          />
          <v-text-field
            v-model.number="cantidad"
            label="Cantidad"
            type="number"
            min="0.01"
            step="0.01"
            :error-messages="erroresForm.cantidad ? [erroresForm.cantidad] : []"
            data-testid="abastecimiento-compra-cantidad"
          />
          <v-text-field
            v-model.number="costoTotal"
            label="Costo total (USD)"
            type="number"
            min="0.01"
            step="0.01"
            :error-messages="erroresForm.costoTotal ? [erroresForm.costoTotal] : []"
            data-testid="abastecimiento-compra-costo-total"
          />
          <v-text-field
            v-model="fechaCompra"
            label="Fecha"
            type="date"
            data-testid="abastecimiento-compra-fecha"
          />
          <v-text-field
            v-model="descripcionCompra"
            label="Descripción (opcional)"
            data-testid="abastecimiento-compra-descripcion"
          />
          <p v-if="cantidad > 0 && costoTotal > 0" class="text-caption text-medium-emphasis">
            Costo unitario: ${{ costoUnitarioCalculado.toFixed(4) }}
          </p>
          <div class="d-flex ga-2 mt-2">
            <v-btn
              color="primary"
              data-testid="abastecimiento-compra-guardar"
              :disabled="cantidad <= 0 || costoTotal <= 0 || !socioId || !materiaPrimaId"
              @click="manejarCompraSubmit"
            >
              Guardar
            </v-btn>
            <v-btn variant="text" @click="dialogoCompra = false; resetearFormCompra()">
              Cancelar
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Correction dialog -->
    <v-dialog v-model="dialogoCorreccion" max-width="500">
      <v-card v-if="movimientoACorregir">
        <v-card-title>Corregir movimiento</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-2">
            Movimiento original: {{ movimientoACorregir.tipo }} —
            {{ nombreMateria(movimientoACorregir.materia_prima_id) }} —
            cantidad {{ movimientoACorregir.cantidad }}
          </p>
          <v-text-field
            v-model.number="cantidadCorregida"
            label="Cantidad corregida"
            type="number"
            min="0.01"
            step="0.01"
            :error-messages="erroresCorreccion.cantidadCorregida ? [erroresCorreccion.cantidadCorregida] : []"
            data-testid="abastecimiento-correccion-cantidad"
          />
          <v-textarea
            v-model="motivoCorreccion"
            label="Motivo de la corrección"
            :error-messages="erroresCorreccion.motivo ? [erroresCorreccion.motivo] : []"
            data-testid="abastecimiento-correccion-motivo"
          />
          <div class="d-flex ga-2 mt-2">
            <v-btn
              color="warning"
              data-testid="abastecimiento-correccion-guardar"
              :disabled="!motivoCorreccion.trim() || cantidadCorregida <= 0"
              @click="manejarCorreccionSubmit"
            >
              Corregir
            </v-btn>
            <v-btn variant="text" @click="dialogoCorreccion = false; resetearFormCorreccion()">
              Cancelar
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>
