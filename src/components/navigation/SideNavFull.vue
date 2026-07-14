<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSidebarRail } from '@/composables/useSidebarRail'

const route = useRoute()
const bp = useBreakpoint()
const { rail } = useSidebarRail()
const isPermanent = computed(() => bp.value === 'web')
const showSectionHeaders = computed(() => !(isPermanent.value && rail.value))

const modelValue = defineModel<boolean>({ default: false })

const openedGroups = ref<string[]>([])

// Auto-open groups based on current route path
watch(
  () => route.path,
  (path) => {
    const next: string[] = []
    if (path.startsWith('/productos') || path.startsWith('/inventario')) {
      next.push('productos')
    }
    if (path.startsWith('/reportes')) {
      next.push('reportes')
    }
    openedGroups.value = next
  },
  { immediate: true },
)

function navigate(): void {
  if (isPermanent.value) return
  modelValue.value = false
}

function isActive(itemRoute: string): boolean {
  if (itemRoute === '/') return route.path === '/'
  return route.path.startsWith(itemRoute)
}
</script>

<template>
  <v-navigation-drawer
    data-testid="side-nav-full"
    v-bind="isPermanent ? { permanent: true } : { temporary: true }"
    :model-value="isPermanent ? true : modelValue"
    :rail="isPermanent ? rail : false"
    width="240"
    color="surface"
    @update:model-value="(v: boolean) => { if (!isPermanent) modelValue = v }"
  >
    <v-list density="comfortable" nav :indent="8" v-model:opened="openedGroups">
      <v-list-subheader v-if="showSectionHeaders" class="text-overline">Operación</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-home"
        title="Inicio"
        to="/"
        :active="isActive('/')"
        active-class="v-list-item--active"
        @click="navigate"
      />

      <v-list-item
        prepend-icon="mdi-cash-register"
        title="Caja"
        to="/pos"
        :active="isActive('/pos')"
        active-class="v-list-item--active"
        @click="navigate"
      />

      <v-list-item
        prepend-icon="mdi-history"
        title="Ventas"
        to="/ventas"
        :active="isActive('/ventas')"
        active-class="v-list-item--active"
        @click="navigate"
      />

      <v-list-item
        prepend-icon="mdi-file-document-edit"
        title="Gastos"
        to="/gastos"
        :active="isActive('/gastos')"
        active-class="v-list-item--active"
        @click="navigate"
      />

      <v-list-subheader v-if="showSectionHeaders" class="text-overline">Planificación</v-list-subheader>

      <v-list-group value="productos" prepend-icon="mdi-package-variant" fluid>
        <template #activator="{ props }">
          <v-list-item v-bind="props" title="Productos" />
        </template>
        <v-list-item
          prepend-icon="mdi-chef-hat"
          title="Preparaciones"
          to="/productos/preparaciones"
          :active="isActive('/productos/preparaciones')"
          active-class="v-list-item--active"
          @click="navigate"
        />
        <v-list-item
          prepend-icon="mdi-warehouse"
          title="Materia prima"
          to="/inventario"
          :active="isActive('/inventario')"
          active-class="v-list-item--active"
          @click="navigate"
        />
      </v-list-group>

      <v-list-item
        prepend-icon="mdi-calendar-star"
        title="Eventos"
        to="/eventos"
        :active="isActive('/eventos')"
        active-class="v-list-item--active"
        @click="navigate"
      />

      <v-list-subheader v-if="showSectionHeaders" class="text-overline">Análisis</v-list-subheader>

      <v-list-group value="reportes" prepend-icon="mdi-chart-bar" fluid>
        <template #activator="{ props }">
          <v-list-item v-bind="props" title="Reportes" />
        </template>
        <v-list-item
          prepend-icon="mdi-chart-box-outline"
          title="Rentabilidad"
          to="/reportes/rentabilidad"
          :active="isActive('/reportes/rentabilidad')"
          active-class="v-list-item--active"
          @click="navigate"
        />
      </v-list-group>

      <v-list-subheader v-if="showSectionHeaders" class="text-overline">Configuración</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-cog"
        title="Ajustes"
        to="/ajustes"
        :active="isActive('/ajustes')"
        active-class="v-list-item--active"
        @click="navigate"
      />

      <v-list-item
        prepend-icon="mdi-account-group"
        title="Equipo"
        to="/equipo"
        :active="isActive('/equipo')"
        active-class="v-list-item--active"
        @click="navigate"
      />
    </v-list>
  </v-navigation-drawer>
</template>
