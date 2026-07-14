<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useProductosConfigurablesStore } from '@/stores/productosConfigurables.store'
import { useProductosStore } from '@/stores/productos.store'
import { useIngredientsStore } from '@/stores/ingredients.store'
import { formatearUSD } from '@/utils/format'
import type {
  ProductoConfigurableConGrupos,
  ProductoConfigurableInput,
  GrupoOpcionesInput,
  OpcionGrupoInput,
  AdicionalDisponibleInput,
} from '@/types'

const router = useRouter()
const configurablesStore = useProductosConfigurablesStore()
const productosStore = useProductosStore()
const ingredientsStore = useIngredientsStore()

// Productos disponibles para hacer configurables (que no sean ya configurables)
const productosDisponibles = computed(() => {
  const configurablesIds = new Set(configurablesStore.configurables.map((c) => c.producto_id))
  return productosStore.productos.filter((p) => !configurablesIds.has(p.id))
})

// Dialogs
const dialogoCrearAbierto = ref(false)
const dialogoEditarAbierto = ref(false)
const dialogoGrupoAbierto = ref(false)
const dialogoOpcionAbierto = ref(false)
const dialogoAdicionalAbierto = ref(false)

// Form state
const nuevoConfigurable = ref<ProductoConfigurableInput>({
  producto_id: '',
  costo_base_calculado: 0,
})

const configurableEditando = ref<ProductoConfigurableConGrupos | null>(null)

const nuevoGrupo = ref<GrupoOpcionesInput>({
  producto_configurable_id: '',
  nombre: '',
  tipo_calculo: 'promedio_categoria',
  incluidas_gratis: 1,
  precio_venta_extra: 0,
})

const nuevaOpcion = ref<OpcionGrupoInput>({
  grupo_id: '',
  materia_prima_id: '',
})

const nuevoAdicional = ref<AdicionalDisponibleInput>({
  materia_prima_id: '',
  precio_venta: 0,
  activo: true,
})

async function crearConfigurable() {
  if (!nuevoConfigurable.value.producto_id) return
  try {
    await configurablesStore.crear(nuevoConfigurable.value)
    dialogoCrearAbierto.value = false
    nuevoConfigurable.value = { producto_id: '', costo_base_calculado: 0 }
  } catch (error) {
    console.error('Error al crear configurable:', error)
  }
}

async function eliminarConfigurable(id: string) {
  if (!confirm('¿Eliminar este producto configurable?')) return
  try {
    await configurablesStore.eliminar(id)
  } catch (error) {
    console.error('Error al eliminar:', error)
  }
}

function abrirDialogoGrupo(configurable: ProductoConfigurableConGrupos) {
  configurableEditando.value = configurable
  nuevoGrupo.value = {
    producto_configurable_id: configurable.id,
    nombre: '',
    tipo_calculo: 'promedio_categoria',
    incluidas_gratis: 1,
    precio_venta_extra: 0,
  }
  dialogoGrupoAbierto.value = true
}

async function crearGrupo() {
  if (!nuevoGrupo.value.nombre) return
  try {
    await configurablesStore.crearGrupo(nuevoGrupo.value)
    dialogoGrupoAbierto.value = false
  } catch (error) {
    console.error('Error al crear grupo:', error)
  }
}

async function eliminarGrupo(id: string) {
  if (!confirm('¿Eliminar este grupo y todas sus opciones?')) return
  try {
    await configurablesStore.eliminarGrupo(id)
  } catch (error) {
    console.error('Error al eliminar grupo:', error)
  }
}

function abrirDialogoOpcion(grupoId: string) {
  if (!configurableEditando.value) return
  nuevoOpcion.value = { grupo_id: grupoId, materia_prima_id: '' }
  dialogoOpcionAbierto.value = true
}

async function agregarOpcion() {
  if (!nuevaOpcion.value.materia_prima_id) return
  try {
    await configurablesStore.agregarOpcion(nuevaOpcion.value)
    dialogoOpcionAbierto.value = false
  } catch (error) {
    console.error('Error al agregar opción:', error)
  }
}

async function eliminarOpcion(id: string) {
  if (!confirm('¿Eliminar esta opción?')) return
  try {
    await configurablesStore.eliminarOpcion(id)
  } catch (error) {
    console.error('Error al eliminar opción:', error)
  }
}

function abrirDialogoAdicional() {
  nuevoAdicional.value = { materia_prima_id: '', precio_venta: 0, activo: true }
  dialogoAdicionalAbierto.value = true
}

async function crearAdicional() {
  if (!nuevoAdicional.value.materia_prima_id || nuevoAdicional.value.precio_venta <= 0) return
  try {
    await configurablesStore.crearAdicional(nuevoAdicional.value)
    dialogoAdicionalAbierto.value = false
  } catch (error) {
    console.error('Error al crear adicional:', error)
  }
}

async function toggleAdicional(id: string, activo: boolean) {
  try {
    await configurablesStore.actualizarAdicional(id, { activo: !activo })
  } catch (error) {
    console.error('Error al actualizar adicional:', error)
  }
}

async function recalcularCosto(id: string) {
  try {
    await configurablesStore.recalcularCosto(id)
  } catch (error) {
    console.error('Error al recalcular costo:', error)
  }
}

function obtenerNombreProducto(productoId: string): string {
  return productosStore.productos.find((p) => p.id === productoId)?.nombre || 'Producto no encontrado'
}

onMounted(async () => {
  await Promise.all([
    configurablesStore.cargar(),
    productosStore.cargarTodos(),
    ingredientsStore.cargarTodas(),
  ])
})
</script>

<template>
  <div class="productos-configurables-view pa-4">
    <div class="d-flex align-center mb-4">
      <v-icon size="32" color="primary" class="mr-3">mdi-cog-outline</v-icon>
      <div>
        <h1 class="text-h5 font-weight-bold">Productos Configurables</h1>
        <p class="text-caption text-medium-emphasis mb-0">
          Gestiona productos con personalizaciones y adicionales
        </p>
      </div>
      <v-spacer />
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        :disabled="productosDisponibles.length === 0"
        @click="dialogoCrearAbierto = true"
      >
        Nuevo Configurable
      </v-btn>
    </div>

    <!-- Lista de productos configurables -->
    <v-row>
      <v-col
        v-for="configurable in configurablesStore.configurables"
        :key="configurable.id"
        cols="12"
        md="6"
        lg="4"
      >
        <v-card>
          <v-card-title class="d-flex align-center">
            <div class="flex-grow-1">
              <div class="text-subtitle-1 font-weight-bold">
                {{ obtenerNombreProducto(configurable.producto_id) }}
              </div>
              <div class="text-caption text-medium-emphasis">
                Costo base: {{ formatearUSD(configurable.costo_base_calculado) }}
              </div>
            </div>
            <v-btn
              icon="mdi-refresh"
              variant="text"
              size="small"
              title="Recalcular costo"
              @click="recalcularCosto(configurable.id)"
            />
            <v-btn
              icon="mdi-delete"
              variant="text"
              size="small"
              color="error"
              @click="eliminarConfigurable(configurable.id)"
            />
          </v-card-title>

          <v-divider />

          <v-card-text>
            <div v-if="configurable.grupos.length === 0" class="text-center text-medium-emphasis py-4">
              Sin grupos configurados
            </div>

            <div v-for="grupo in configurable.grupos" :key="grupo.id" class="mb-3">
              <div class="d-flex align-center mb-1">
                <v-chip size="small" color="primary" variant="tonal" class="mr-2">
                  {{ grupo.incluidas_gratis }} gratis
                </v-chip>
                <span class="text-body-2 font-weight-medium flex-grow-1">
                  {{ grupo.nombre }}
                </span>
                <v-btn
                  icon="mdi-plus"
                  variant="text"
                  size="x-small"
                  title="Agregar opción"
                  @click="abrirDialogoOpcion(grupo.id)"
                />
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  size="x-small"
                  color="error"
                  @click="eliminarGrupo(grupo.id)"
                />
              </div>

              <div v-if="grupo.opciones.length > 0" class="ml-4">
                <v-chip
                  v-for="opcion in grupo.opciones"
                  :key="opcion.id"
                  size="x-small"
                  variant="tonal"
                  class="mr-1 mb-1"
                  closable
                  @click:close="eliminarOpcion(opcion.id)"
                >
                  {{ opcion.materia_prima.nombre }}
                </v-chip>
              </div>
              <div v-else class="ml-4 text-caption text-medium-emphasis">
                Sin opciones
              </div>
            </div>

            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-plus"
              block
              @click="abrirDialogoGrupo(configurable)"
            >
              Agregar Grupo
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-alert
      v-if="configurablesStore.configurables.length === 0 && !configurablesStore.cargando"
      type="info"
      variant="tonal"
      class="mt-4"
    >
      No hay productos configurables. Crea uno para empezar.
    </v-alert>

    <!-- Sección de adicionales disponibles -->
    <v-divider class="my-6" />

    <div class="d-flex align-center mb-4">
      <v-icon size="24" color="primary" class="mr-2">mdi-puzzle-outline</v-icon>
      <h2 class="text-h6 font-weight-bold">Adicionales Disponibles</h2>
      <v-spacer />
      <v-btn
        color="primary"
        size="small"
        prepend-icon="mdi-plus"
        @click="abrirDialogoAdicional"
      >
        Nuevo Adicional
      </v-btn>
    </div>

    <v-table density="compact">
      <thead>
        <tr>
          <th>Materia Prima</th>
          <th class="text-right">Precio Venta</th>
          <th class="text-center">Estado</th>
          <th class="text-right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="adicional in configurablesStore.adicionales" :key="adicional.id">
          <td>{{ adicional.materia_prima.nombre }}</td>
          <td class="text-right">{{ formatearUSD(adicional.precio_venta) }}</td>
          <td class="text-center">
            <v-chip
              :color="adicional.activo ? 'success' : 'grey'"
              size="x-small"
              variant="tonal"
            >
              {{ adicional.activo ? 'Activo' : 'Inactivo' }}
            </v-chip>
          </td>
          <td class="text-right">
            <v-btn
              icon="mdi-power"
              variant="text"
              size="x-small"
              :color="adicional.activo ? 'success' : 'grey'"
              @click="toggleAdicional(adicional.id, adicional.activo)"
            />
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-alert
      v-if="configurablesStore.adicionales.length === 0 && !configurablesStore.cargando"
      type="info"
      variant="tonal"
      class="mt-4"
    >
      No hay adicionales disponibles. Agrega materias primas que se puedan vender por separado.
    </v-alert>

    <!-- Dialog: Crear Configurable -->
    <v-dialog v-model="dialogoCrearAbierto" max-width="500">
      <v-card>
        <v-card-title>Nuevo Producto Configurable</v-card-title>
        <v-card-text>
          <v-select
            v-model="nuevoConfigurable.producto_id"
            :items="productosDisponibles"
            item-title="nombre"
            item-value="id"
            label="Producto Base"
            variant="outlined"
          />
          <p class="text-caption text-medium-emphasis mt-2">
            El costo base se calculará automáticamente según los ingredientes y grupos de opciones.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogoCrearAbierto = false">Cancelar</v-btn>
          <v-btn color="primary" @click="crearConfigurable">Crear</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Crear Grupo -->
    <v-dialog v-model="dialogoGrupoAbierto" max-width="500">
      <v-card>
        <v-card-title>Nuevo Grupo de Opciones</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="nuevoGrupo.nombre"
            label="Nombre del Grupo"
            placeholder="Ej: Salsas, Toppings, Bolas extra"
            variant="outlined"
          />
          <v-text-field
            v-model.number="nuevoGrupo.incluidas_gratis"
            label="Cantidad Incluida Gratis"
            type="number"
            min="0"
            variant="outlined"
          />
          <v-text-field
            v-model.number="nuevoGrupo.precio_venta_extra"
            label="Precio Venta Extra (si aplica)"
            type="number"
            min="0"
            step="0.01"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogoGrupoAbierto = false">Cancelar</v-btn>
          <v-btn color="primary" @click="crearGrupo">Crear</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Agregar Opción -->
    <v-dialog v-model="dialogoOpcionAbierto" max-width="500">
      <v-card>
        <v-card-title>Agregar Opción</v-card-title>
        <v-card-text>
          <v-select
            v-model="nuevaOpcion.materia_prima_id"
            :items="ingredientsStore.materiasPrimas"
            item-title="nombre"
            item-value="id"
            label="Materia Prima"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogoOpcionAbierto = false">Cancelar</v-btn>
          <v-btn color="primary" @click="agregarOpcion">Agregar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Crear Adicional -->
    <v-dialog v-model="dialogoAdicionalAbierto" max-width="500">
      <v-card>
        <v-card-title>Nuevo Adicional Disponible</v-card-title>
        <v-card-text>
          <v-select
            v-model="nuevoAdicional.materia_prima_id"
            :items="ingredientsStore.materiasPrimas"
            item-title="nombre"
            item-value="id"
            label="Materia Prima"
            variant="outlined"
          />
          <v-text-field
            v-model.number="nuevoAdicional.precio_venta"
            label="Precio de Venta"
            type="number"
            min="0"
            step="0.01"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogoAdicionalAbierto = false">Cancelar</v-btn>
          <v-btn color="primary" @click="crearAdicional">Crear</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.productos-configurables-view {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
