import type { RouteRecordRaw } from 'vue-router'

// Single lazy route + catch-all redirect. Real domain routes (POS, reports,
// inventory, etc.) will be added in later slices — each as its own lazy chunk.
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
