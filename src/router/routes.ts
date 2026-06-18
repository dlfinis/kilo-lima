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
    path: '/materias-primas',
    name: 'materias-primas',
    component: () => import('@/views/MateriasPrimasView.vue'),
  },
  {
    path: '/recetas',
    name: 'recetas',
    component: () => import('@/views/RecetasView.vue'),
  },
  {
    path: '/recetas/:id',
    name: 'receta-detalle',
    component: () => import('@/views/RecetaDetalleView.vue'),
  },
  {
    path: '/eventos',
    name: 'eventos',
    component: () => import('@/views/EventosView.vue'),
  },
  {
    path: '/eventos/:id',
    name: 'evento-detalle',
    component: () => import('@/views/EventoDetalleView.vue'),
  },
  {
    path: '/eventos/:id/planificar',
    name: 'planificar-evento',
    component: () => import('@/views/PlanificarEventoView.vue'),
  },
  {
    path: '/productos',
    name: 'productos',
    component: () => import('@/views/ProductosView.vue'),
  },
  {
    path: '/pos',
    name: 'pos',
    // PosView ships in PR3 — the box-office surface (grid + cart +
    // registrar venta flow). Lazy-loaded so the chunk stays small.
    component: () => import('@/views/PosView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
