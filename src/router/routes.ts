import type { RouteRecordRaw } from 'vue-router'

// REQ-UX-7: every route registers `meta.breadcrumb` so the global
// AppBar has a single source of truth for the navigation trail. The
// shape is `string[]` where the last label is the current page and
// ancestors are joined with `/` to build the back-target (see
// `resolverBreadcrumbDeMeta`). Catalog/events/POS routes get nested
// crumbs; the catch-all redirect has no breadcrumb (it's never
// rendered, just reroutes to /).
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { breadcrumb: ['Inicio'] },
  },
  {
    path: '/materias-primas',
    name: 'materias-primas',
    component: () => import('@/views/MateriasPrimasView.vue'),
    meta: { breadcrumb: ['Inicio', 'materias-primas'] },
  },
  {
    path: '/recetas',
    name: 'recetas',
    component: () => import('@/views/RecetasView.vue'),
    meta: { breadcrumb: ['Inicio', 'recetas'] },
  },
  {
    path: '/recetas/:id',
    name: 'receta-detalle',
    component: () => import('@/views/RecetaDetalleView.vue'),
    meta: { breadcrumb: ['Inicio', 'recetas', 'Detalle'] },
  },
  {
    path: '/eventos',
    name: 'eventos',
    component: () => import('@/views/EventosView.vue'),
    meta: { breadcrumb: ['Inicio', 'eventos'] },
  },
  {
    path: '/eventos/:id',
    name: 'evento-detalle',
    component: () => import('@/views/EventoDetalleView.vue'),
    meta: { breadcrumb: ['Inicio', 'eventos', 'Detalle'] },
  },
  {
    path: '/eventos/:id/planificar',
    name: 'planificar-evento',
    component: () => import('@/views/PlanificarEventoView.vue'),
    meta: { breadcrumb: ['Inicio', 'eventos', 'Planificar'] },
  },
  {
    path: '/eventos/:id/productos',
    name: 'evento-productos',
    component: () => import('@/views/EventoProductosView.vue'),
    meta: { breadcrumb: ['Inicio', 'eventos', 'Productos'] },
  },
  {
    path: '/eventos/:id/reporte',
    name: 'evento-reporte',
    component: () => import('@/views/ReporteEventoView.vue'),
    meta: { breadcrumb: ['Inicio', 'eventos', 'Reporte'] },
  },
  {
    path: '/productos',
    name: 'productos',
    component: () => import('@/views/ProductosView.vue'),
    meta: { breadcrumb: ['Inicio', 'productos'] },
  },
  {
    path: '/pos',
    name: 'pos',
    // PosView ships in PR3 — the box-office surface (grid + cart +
    // registrar venta flow). Lazy-loaded so the chunk stays small.
    component: () => import('@/views/PosView.vue'),
    meta: { breadcrumb: ['Inicio', 'pos'] },
  },
  {
    path: '/pos/cierre',
    name: 'pos-cierre',
    // CierresCajaView ships in PR4 — close review screen with
    // CierreResumenCard + breakdown + imprevistos list + "Registrar
    // cierre" action.
    component: () => import('@/views/CierresCajaView.vue'),
    meta: { breadcrumb: ['Inicio', 'pos', 'Cierre'] },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
