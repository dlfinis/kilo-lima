// REQ-UX-5, REQ-UX-6, REQ-UX-25: thin Vuetify v-breadcrumbs wrapper.
// Receives `items: BreadcrumbItem[]` from the parent (AppBar, which
// delegates to `useNavegacion().breadcrumbs`) and renders each crumb.
// Last item renders as a disabled title (no link, current page);
// ancestors render as router-link with the computed `to`.
<script setup lang="ts">
import type { BreadcrumbItem } from '@/utils/breadcrumb'

defineProps<{ items: BreadcrumbItem[] }>()
</script>

<template>
  <v-breadcrumbs :items="items" data-testid="breadcrumb-nav" class="px-2">
    <template #divider>
      <v-icon icon="mdi-chevron-right" size="small" />
    </template>
    <template #title="{ item }">
      <span
        :data-testid="item.disabled ? 'breadcrumb-current' : `breadcrumb-link-${item.title}`"
        :class="{ 'text-medium-emphasis': item.disabled }"
      >
        {{ item.title }}
      </span>
    </template>
  </v-breadcrumbs>
</template>