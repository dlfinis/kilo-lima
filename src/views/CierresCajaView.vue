<script setup lang="ts">
// REQ-POS-30, REQ-POS-31, REQ-POS-33, REQ-POS-34, REQ-POS-35,
// REQ-POS-36, REQ-POS-37, REQ-POS-40, REQ-POS-44, REQ-POS-46,
// REQ-POS-49, REQ-POS-54, REQ-POS-55: cierre de caja view.
//
// 4 states:
//   1. Loading — `cargando` from cierresStore
//   2. Error — `error` from cierresStore
//   3. Empty / no evento — no evento en_curso (caja guard)
//   4. Data — CierreResumenCard + breakdown by categoria + imprevistos
//      list + ventas count + "Registrar cierre" button gated on
//      estadoEsEditable
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import CierreResumenCard from '@/components/business/CierreResumenCard.vue'
import GastoImprevistoForm from '@/components/business/GastoImprevistoForm.vue'
import GastoImprevistoListItem from '@/components/business/GastoImprevistoListItem.vue'
import { useCierreCaja } from '@/composables/useCierreCaja'
import { useEvents } from '@/composables/useEvents'
import { useGastosImprevistos } from '@/composables/useGastosImprevistos'
import { useGastosFijos } from '@/composables/useGastosFijos'
import { useVentas } from '@/composables/useVentas'
import { estadoEsEditable } from '@/utils/estado'
import type { CierreCajaInput, GastoImprevistoInput } from '@/types'

const router = useRouter()
const { eventos, cargarTodas, cambiarEstado } = useEvents()
const { gastosPorEvento: gastosFijosPorEvento, cargarPorEvento: cargarGastosFijos } = useGastosFijos()
const { ventas, cargarPorEvento: cargarVentas } = useVentas()
const {
  gastosPorEvento: gastosImprevistosPorEvento,
  cargando: cargandoImprevistos,
  cargarPorEvento: cargarImprevistos,
  crear: crearImprevisto,
  eliminar: eliminarImprevisto,
  totalPorEvento,
} = useGastosImprevistos()

const eventoEnCurso = computed(() => eventos.value.find((e) => e.estado === 'en_curso') ?? null)
const eventoActivo = computed(() => eventoEnCurso.value ?? eventos.value[0] ?? null)

const { cierre, cargando, error, resumen, cargarPorEvento: cargarCierre, registrarCierre } =
  useCierreCaja(() => eventoActivo.value?.id ?? null)

const cargandoTotal = computed(() => cargando.value || cargandoImprevistos.value)
const editable = computed(() =>
  eventoActivo.value ? estadoEsEditable(eventoActivo.value.estado) : false,
)

const ETIQUETAS_FIJAS: Record<string, string> = {
  renta: 'Renta',
  transporte: 'Transporte',
  permisos: 'Permisos',
  publicidad: 'Publicidad',
  servicios: 'Servicios',
  otro: 'Otro',
}
const ETIQUETAS_IMPREVISTO: Record<string, string> = {
  insumos_extra: 'Insumos extra',
  transporte: 'Transporte',
  reparacion: 'Reparación',
  propina: 'Propina',
  otro: 'Otro',
}

function agruparPorCategoria<K extends string>(
  lista: Array<{ monto: number; [k: string]: unknown }>,
  campo: K,
): Array<{ categoria: string; monto: number }> {
  const mapa = new Map<string, number>()
  for (const item of lista) {
    const cat = (item[campo] as string | null) ?? 'otro'
    mapa.set(cat, (mapa.get(cat) ?? 0) + item.monto)
  }
  return Array.from(mapa.entries()).map(([categoria, monto]) => ({ categoria, monto }))
}

const gastosFijosPorCategoria = computed(() => {
  if (!eventoActivo.value) return []
  const raw = gastosFijosPorEvento.value.get(eventoActivo.value.id)
  const lista = Array.isArray(raw) ? raw : []
  return agruparPorCategoria(lista, 'categoria')
})

const gastosImprevistosPorCategoria = computed(() => {
  if (!eventoActivo.value) return []
  const raw = gastosImprevistosPorEvento.value.get(eventoActivo.value.id)
  const lista = Array.isArray(raw) ? raw : []
  return agruparPorCategoria(lista, 'categoria')
})

const listaImprevistos = computed(() => {
  if (!eventoActivo.value) return []
  return gastosImprevistosPorEvento.value.get(eventoActivo.value.id) ?? []
})

const totalGastosFijos = computed(() =>
  eventoActivo.value
    ? (gastosFijosPorEvento.value.get(eventoActivo.value.id) ?? []).reduce(
        (acc, g) => acc + g.monto,
        0,
      )
    : 0,
)
const totalImprevistos = computed(() =>
  eventoActivo.value ? totalPorEvento(eventoActivo.value.id).value : 0,
)
const totalVentas = computed(() => {
  if (!eventoActivo.value) return 0
  return ventas.value
    .filter((v) => v.evento_id === eventoActivo.value!.id)
    .reduce((acc, v) => acc + v.total, 0)
})
const cantidadVentas = computed(() => {
  if (!eventoActivo.value) return 0
  return ventas.value.filter((v) => v.evento_id === eventoActivo.value!.id).length
})

// pos-redesign (REQ-POS-12): pass the per-evento ventas to the
// resumen card so it can render the per-metodo comprobante_numero
// range. Same filter as `totalVentas` / `cantidadVentas`.
const ventasParaCierre = computed(() => {
  if (!eventoActivo.value) return []
  return ventas.value.filter((v) => v.evento_id === eventoActivo.value!.id)
})

type Dialogo =
  | { tipo: 'cerrado' }
  | { tipo: 'crear' }
  | { tipo: 'eliminar'; id: string }

const dialogo = ref<Dialogo>({ tipo: 'cerrado' })
const dialogoCerrar = ref(false)
const editValores = computed(() => null)

async function manejarSubmitImprevisto(input: GastoImprevistoInput) {
  if (!eventoActivo.value) return
  await crearImprevisto({
    evento_id: eventoActivo.value.id,
    monto: input.monto,
    motivo: input.motivo,
    categoria: input.categoria ?? 'otro',
  })
  dialogo.value = { tipo: 'cerrado' }
}

async function confirmarEliminarImprevisto() {
  if (dialogo.value.tipo !== 'eliminar') return
  await eliminarImprevisto(dialogo.value.id)
  dialogo.value = { tipo: 'cerrado' }
}

async function confirmarCierre() {
  if (!eventoActivo.value || !resumen.value) return
  const r = resumen.value
  const input: CierreCajaInput = {
    evento_id: eventoActivo.value.id,
    total_ventas: r.totalVentas,
    total_gastos_fijos: r.totalGastosFijos,
    total_gastos_imprevistos: r.totalGastosImprevistos,
    utilidad_bruta: r.utilidadBruta,
    efectivo_esperado: r.efectivoEsperado,
    efectivo_real: r.efectivoReal,
    diferencia: r.diferencia,
    notas: null,
  }
  const res = await registrarCierre(input)
  dialogoCerrar.value = false
  if (!res.error) {
    if (eventoActivo.value.estado === 'en_curso') {
      await cambiarEstado(eventoActivo.value.id, 'cerrado')
    }
    await router.push(`/eventos/${eventoActivo.value.id}`)
  }
}

function reintentar() {
  if (eventoActivo.value) cargarTodo(eventoActivo.value.id)
}

async function cargarTodo(eventoId: string) {
  // Sequential awaits — the chainable Supabase mock consumes one
  // response per `.await` in FIFO order, and the cierre's
  // `.maybeSingle()` chain is async (Promise-wrapped) which can race
  // with the parallel listarPorEvento chains under `Promise.all`.
  await cargarVentas(eventoId)
  await cargarGastosFijos(eventoId)
  await cargarImprevistos(eventoId)
  await cargarCierre(eventoId)
}

onMounted(async () => {
  await cargarTodas()
  await nextTick()
  if (eventoActivo.value) await cargarTodo(eventoActivo.value.id)
})
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 data-testid="cierre-titulo">Cierre de caja</h1>
      <v-btn
        v-if="eventoActivo"
        variant="text"
        :href="`/eventos/${eventoActivo.id}`"
        data-testid="cierre-volver-evento"
      >
        Volver al evento
      </v-btn>
    </div>

    <v-progress-linear
      v-if="cargandoTotal"
      indeterminate
      color="primary"
      class="mb-2"
      data-testid="cierre-cargando"
    />

    <v-alert
      v-if="error && !cargandoTotal"
      type="error"
      class="mb-4"
      data-testid="cierre-error"
    >
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="reintentar">Reintentar</v-btn>
      </template>
    </v-alert>

    <v-alert
      v-if="!eventoActivo && !cargandoTotal && !error"
      type="warning"
      class="mb-4"
      data-testid="cierre-sin-evento"
    >
      <p class="text-h6 mb-2">No hay un evento para cerrar</p>
      <p class="mb-3">Activá un evento en /eventos primero.</p>
      <v-btn color="primary" :href="'/eventos'" data-testid="cierre-ir-eventos">
        Ir a Eventos
      </v-btn>
    </v-alert>

    <template v-if="eventoActivo">
      <v-card class="pa-4 mb-4" data-testid="cierre-evento-info">
        <h2 class="text-h6">{{ eventoActivo.nombre }}</h2>
        <p class="text-medium-emphasis">
          {{ cantidadVentas }} venta(s) — Total: ${{ totalVentas.toFixed(2) }}
        </p>
        <p v-if="cierre" class="text-caption">
          Cierre existente: {{ cierre.fecha_cierre }}
        </p>
      </v-card>

      <CierreResumenCard :resumen="resumen" :ventas="ventasParaCierre" />

      <v-card class="pa-4 mb-4" data-testid="cierre-desglose">
        <h3 class="text-subtitle-1 mb-2">Desglose por categoría</h3>
        <div class="mb-2">
          <strong>Gastos fijos</strong>
          <ul class="ml-4">
            <li
              v-for="item in gastosFijosPorCategoria"
              :key="`f-${item.categoria}`"
            >
              {{ ETIQUETAS_FIJAS[item.categoria] ?? item.categoria }} —
              ${{ item.monto.toFixed(2) }}
            </li>
            <li
              v-if="gastosFijosPorCategoria.length === 0"
              class="text-medium-emphasis"
            >
              Sin gastos fijos
            </li>
          </ul>
        </div>
        <div>
          <strong>Gastos imprevistos</strong>
          <ul class="ml-4">
            <li
              v-for="item in gastosImprevistosPorCategoria"
              :key="`i-${item.categoria}`"
            >
              {{ ETIQUETAS_IMPREVISTO[item.categoria] ?? item.categoria }} —
              ${{ item.monto.toFixed(2) }}
            </li>
            <li
              v-if="gastosImprevistosPorCategoria.length === 0"
              class="text-medium-emphasis"
            >
              Sin imprevistos
            </li>
          </ul>
        </div>
      </v-card>

      <v-card class="pa-4 mb-4" data-testid="cierre-imprevistos">
        <div class="d-flex align-center justify-space-between mb-2">
          <h3 class="text-subtitle-1 mb-0">Imprevistos</h3>
          <v-btn
            v-if="editable"
            size="small"
            color="primary"
            prepend-icon="mdi-plus"
            data-testid="cierre-imprevistos-nuevo"
            @click="dialogo = { tipo: 'crear' }"
          >
            Nuevo imprevisto
          </v-btn>
        </div>
        <p class="text-medium-emphasis mb-2">
          Total: ${{ totalImprevistos.toFixed(2) }}
        </p>
        <v-list v-if="listaImprevistos.length > 0">
          <GastoImprevistoListItem
            v-for="gasto in listaImprevistos"
            :key="gasto.id"
            :gasto="gasto"
            :editable="editable"
            @eliminar="(id) => { dialogo = { tipo: 'eliminar', id } }"
          />
        </v-list>
        <p v-else class="text-medium-emphasis">No hay gastos imprevistos</p>
      </v-card>

      <v-card class="pa-4" data-testid="cierre-acciones">
        <v-alert
          v-if="cantidadVentas === 0 && editable && !cierre"
          type="warning"
          density="compact"
          class="mb-3"
          data-testid="cierre-zero-ventas-alerta"
        >
          No hay ventas registradas — ¿estás seguro de cerrar?
        </v-alert>
        <v-btn
          v-if="editable && !cierre"
          color="primary"
          size="large"
          prepend-icon="mdi-cash-register"
          data-testid="cierre-boton-registrar"
          @click="dialogoCerrar = true"
        >
          Registrar cierre
        </v-btn>
        <v-alert
          v-else-if="cierre"
          type="success"
          class="mb-0"
          data-testid="cierre-ya-registrado"
        >
          Cierre ya registrado para este evento
        </v-alert>
        <v-alert v-else type="info" class="mb-0" data-testid="cierre-bloqueado">
          El evento está cerrado — solo lectura
        </v-alert>
      </v-card>
    </template>

    <v-dialog
      :model-value="dialogo.tipo === 'crear'"
      max-width="600"
      @update:model-value="(v) => { if (!v) dialogo = { tipo: 'cerrado' } }"
    >
      <v-card>
        <v-card-title>Nuevo gasto imprevisto</v-card-title>
        <v-card-text>
          <GastoImprevistoForm
            :valores-iniciales="editValores"
            :editable="editable"
            @submit="manejarSubmitImprevisto"
            @cancel="dialogo = { tipo: 'cerrado' }"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="dialogo.tipo === 'eliminar'"
      max-width="400"
      @update:model-value="(v) => { if (!v) dialogo = { tipo: 'cerrado' } }"
    >
      <v-card v-if="dialogo.tipo === 'eliminar'">
        <v-card-title>¿Eliminar este imprevisto?</v-card-title>
        <v-card-text>Esta acción no se puede deshacer.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogo = { tipo: 'cerrado' }">Cancelar</v-btn>
          <v-btn
            color="error"
            data-testid="cierre-confirmar-eliminar"
            @click="confirmarEliminarImprevisto"
          >
            Eliminar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="dialogoCerrar"
      max-width="500"
      data-testid="cierre-dialogo-confirmar"
    >
      <v-card>
        <v-card-title>¿Registrar cierre?</v-card-title>
        <v-card-text>
          <v-alert
            v-if="cantidadVentas === 0"
            type="warning"
            density="compact"
            class="mb-3"
            data-testid="cierre-zero-ventas-alerta"
          >
            No hay ventas registradas — ¿estás seguro de cerrar?
          </v-alert>
          <p>Total ventas: <strong>${{ totalVentas.toFixed(2) }}</strong></p>
          <p>
            Total gastos:
            <strong>${{ (totalGastosFijos + totalImprevistos).toFixed(2) }}</strong>
          </p>
          <p>
            Utilidad bruta:
            <strong>${{ (totalVentas - totalGastosFijos - totalImprevistos).toFixed(2) }}</strong>
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogoCerrar = false">Cancelar</v-btn>
          <v-btn
            color="primary"
            data-testid="cierre-confirmar-registrar"
            @click="confirmarCierre"
          >
            Confirmar cierre
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>