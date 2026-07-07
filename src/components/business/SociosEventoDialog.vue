<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import type { EventoSocio, EventoSocioInput, Socio, SocioInput } from '@/types'
import { useSociosStore } from '@/stores/socios.store'

const props = defineProps<{
  eventoId: string
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const sociosStore = useSociosStore()
const { socios, cargando } = storeToRefs(sociosStore)

const eventosSocios = ref<EventoSocio[]>([])

const socioSeleccionado = ref<string | null>(null)
const porcentajeGanancia = ref<number>(0)
const porcentajesEditando = reactive<Record<string, number>>({})

const nuevoNombre = ref<string>('')
const nuevoEmail = ref<string>('')
const nuevoTelefono = ref<string>('')
const erroresCrear = ref<Record<string, string>>({})

const socioVinculo = ref<string | null>(null)
const porcentajeVinculo = ref<number>(0)
const erroresVinculo = ref<Record<string, string>>({})

const sociosDisponibles = computed<Socio[]>(() => {
  const vinculados = new Set(eventosSocios.value.map((es) => es.socio_id))
  return socios.value.filter((s) => !vinculados.has(s.id))
})

const sociosDelEvento = computed<(EventoSocio & { socio_nombre: string })[]>(() => {
  return eventosSocios.value.map((es) => ({
    ...es,
    socio_nombre: sociosStore.nombreSocio(es.socio_id),
  }))
})

watch(
  () => props.modelValue,
  async (abierto) => {
    if (!abierto) return
    if (socios.value.length === 0) await sociosStore.cargarTodos()
    await sociosStore.cargarSociosEvento(props.eventoId)
    eventosSocios.value = sociosStore.evento_socios.get(props.eventoId) ?? []
    limpiarFormularios()
  },
)

function cerrar() {
  emit('update:modelValue', false)
}

function limpiarFormularios() {
  socioSeleccionado.value = null
  porcentajeGanancia.value = 0
  nuevoNombre.value = ''
  nuevoEmail.value = ''
  nuevoTelefono.value = ''
  socioVinculo.value = null
  porcentajeVinculo.value = 0
  erroresCrear.value = {}
  erroresVinculo.value = {}
  Object.keys(porcentajesEditando).forEach((k) => delete porcentajesEditando[k])
}

function initPorcentaje(es: EventoSocio) {
  if (!(es.id in porcentajesEditando)) {
    porcentajesEditando[es.id] = es.porcentaje_ganancia
  }
}

function asyncVincularDelListado(socioId: string) {
  const input: EventoSocioInput = {
    evento_id: props.eventoId,
    socio_id: socioId,
    porcentaje_ganancia: 0,
  }
  return vincular(input)
}

async function vincular(input: EventoSocioInput) {
  erroresVinculo.value = {}
  if (!input.socio_id) {
    erroresVinculo.value.socio = 'Selecciona un socio'
    return
  }
  if (input.porcentaje_ganancia < 0 || input.porcentaje_ganancia > 1) {
    erroresVinculo.value.porcentaje = 'El porcentaje debe estar entre 0 y 1'
    return
  }
  const res = await sociosStore.vincularSocio(input)
  if (!res.error) {
    eventosSocios.value = sociosStore.evento_socios.get(props.eventoId) ?? []
    socioVinculo.value = null
    porcentajeVinculo.value = 0
  }
}

async function desvincular(id: string) {
  await sociosStore.desvincularSocio(props.eventoId, id)
  eventosSocios.value = sociosStore.evento_socios.get(props.eventoId) ?? []
}

async function guardarPorcentaje(id: string) {
  const nuevo = porcentajesEditando[id]
  if (nuevo === undefined) return
  await sociosStore.actualizarVinculacion(id, {
    porcentaje_ganancia: Math.min(1, Math.max(0, nuevo)),
  } as unknown as Partial<EventoSocioInput>)
  await sociosStore.cargarSociosEvento(props.eventoId)
  eventosSocios.value = sociosStore.evento_socios.get(props.eventoId) ?? []
}

async function crearSocio() {
  erroresCrear.value = {}
  if (!nuevoNombre.value.trim()) {
    erroresCrear.value.nombre = 'El nombre es obligatorio'
    return
  }
  const input: SocioInput = {
    nombre: nuevoNombre.value.trim(),
    email: nuevoEmail.value.trim() || null,
    telefono: nuevoTelefono.value.trim() || null,
    notas: null,
  }
  const res = await sociosStore.crear(input)
  if (res.error) {
    erroresCrear.value.general = 'No se pudo crear el socio'
    return
  }
  nuevoNombre.value = ''
  nuevoEmail.value = ''
  nuevoTelefono.value = ''
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="700"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-account-group</v-icon>
        Socios del evento
        <v-spacer />
        <v-btn icon variant="text" @click="cerrar">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-alert v-if="cargando" type="info" density="compact" class="mb-3">
          Cargando socios...
        </v-alert>

        <v-list v-if="sociosDisponibles.length" density="compact" class="mb-4">
          <v-list-subheader>Socios disponibles</v-list-subheader>
          <v-list-item
            v-for="socio in sociosDisponibles"
            :key="socio.id"
          >
            <template #title>
              {{ socio.nombre }}
              <span v-if="socio.email" class="text-caption text-medium-emphasis ml-2">
                {{ socio.email }}
              </span>
            </template>
            <template #append>
              <v-btn
                size="small"
                color="primary"
                @click="asyncVincularDelListado(socio.id)"
                data-testid="agregar-socio"
              >
                Agregar
              </v-btn>
            </template>
          </v-list-item>
        </v-list>

        <v-list v-if="sociosDelEvento.length" density="compact" class="mb-4">
          <v-list-subheader>Socios del evento</v-list-subheader>
          <v-list-item
            v-for="es in sociosDelEvento"
            :key="es.id"
            @click="initPorcentaje(es)"
          >
            <template #title>
              {{ es.socio_nombre }}
            </template>
            <template #append>
              <div class="d-flex align-center ga-2">
                <v-text-field
                  v-model="porcentajesEditando[es.id]"
                  type="number"
                  density="compact"
                  hide-details
                  style="max-width: 100px"
                  label="% ganancia"
                  min="0"
                  max="1"
                  step="0.01"
                  @blur="guardarPorcentaje(es.id)"
                  @keyup.enter="guardarPorcentaje(es.id)"
                  data-testid="porcentaje-ganancia"
                />
                <v-btn
                  icon
                  size="small"
                  color="error"
                  variant="text"
                  @click="desvincular(es.id)"
                  data-testid="desvincular-socio"
                >
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </div>
            </template>
          </v-list-item>
        </v-list>

        <v-divider class="my-3" />

        <div class="text-subtitle-1 font-weight-medium mb-2">Vincular nuevo socio</div>
        <div class="d-flex align-start ga-2">
          <v-select
            v-model="socioVinculo"
            :items="sociosDisponibles"
            item-title="nombre"
            item-value="id"
            label="Seleccionar socio"
            class="flex-grow-1"
            :error-messages="erroresVinculo.socio ? [erroresVinculo.socio] : []"
            clearable
            data-testid="select-socio-vincular"
          />
          <v-text-field
            v-model.number="porcentajeVinculo"
            type="number"
            label="% ganancia"
            style="max-width: 120px"
            min="0"
            max="1"
            step="0.01"
            :error-messages="erroresVinculo.porcentaje ? [erroresVinculo.porcentaje] : []"
            data-testid="porcentaje-vincular"
          />
          <v-btn
            color="primary"
            @click="
              vincular({
                evento_id: eventoId,
                socio_id: socioVinculo ?? '',
                porcentaje_ganancia: porcentajeVinculo,
              })
            "
            data-testid="btn-vincular"
          >
            Vincular
          </v-btn>
        </div>

        <v-divider class="my-3" />

        <div class="text-subtitle-1 font-weight-medium mb-2">Crear socio nuevo</div>
        <v-alert
          v-if="erroresCrear.general"
          type="error"
          density="compact"
          class="mb-2"
        >
          {{ erroresCrear.general }}
        </v-alert>
        <div class="d-flex flex-wrap ga-2 align-start">
          <v-text-field
            v-model="nuevoNombre"
            label="Nombre"
            class="flex-grow-1"
            :error-messages="erroresCrear.nombre ? [erroresCrear.nombre] : []"
            data-testid="nuevo-socio-nombre"
          />
          <v-text-field
            v-model="nuevoEmail"
            label="Email (opcional)"
            class="flex-grow-1"
            data-testid="nuevo-socio-email"
          />
          <v-text-field
            v-model="nuevoTelefono"
            label="Teléfono (opcional)"
            class="flex-grow-1"
            data-testid="nuevo-socio-telefono"
          />
          <v-btn
            color="primary"
            class="align-self-center"
            @click="crearSocio"
            data-testid="btn-crear-socio"
          >
            Crear
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
