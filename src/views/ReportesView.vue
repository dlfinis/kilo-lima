<template>
  <div data-testid="reportes-view" class="reportes-view pa-4">
    <!-- Insights banner at top (prominent) -->
    <InsightsBanner />

    <!-- Context-adaptive panel -->
    <DuringEventPanel v-if="context === 'during'" />
    <PostEventPanel v-else :evento-id="activeEventId" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReportContext } from '@/composables/useReportContext'
import { useEventoActivo } from '@/composables/useEventoActivo'
import InsightsBanner from '@/components/reportes/InsightsBanner.vue'
import DuringEventPanel from '@/components/reportes/DuringEventPanel.vue'
import PostEventPanel from '@/components/reportes/PostEventPanel.vue'

const { reportContext } = useReportContext()
const { activeEvent } = useEventoActivo()

const context = computed(() => reportContext.value)
const activeEventId = computed(() => activeEvent.value?.id ?? null)
</script>
