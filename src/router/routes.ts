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
    redirect: '/inventario',
  },
  {
    path: '/inventario',
    name: 'inventario',
    component: () => import('@/views/InventarioView.vue'),
    meta: { breadcrumb: ['Inicio', 'Inventario'] },
  },
  {
    path: '/recetas',
    redirect: '/productos/recetas',
  },
  {
    path: '/recetas/:id',
    redirect: (to) => `/productos/recetas/${to.params.id as string}`,
  },
  // ---- Productos (Phase 6) ----
  {
    path: '/productos',
    component: () => import('@/components/layout/ProductosLayout.vue'),
    children: [
      {
        path: '',
        name: 'productos',
        component: () => import('@/views/ProductosView.vue'),
        meta: { breadcrumb: ['Inicio', 'Productos'] },
      },
      {
        path: 'recetas',
        name: 'recetas',
        component: () => import('@/views/RecetasView.vue'),
        meta: { breadcrumb: ['Inicio', 'Productos', 'Recetas'] },
      },
      {
        path: 'recetas/:id',
        name: 'receta-detalle',
        component: () => import('@/views/RecetaDetalleView.vue'),
        meta: { breadcrumb: ['Inicio', 'Productos', 'Recetas', 'Detalle'] },
      },
    ],
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
    path: '/eventos/:id/contabilidad',
    name: 'contabilidad-evento',
    component: () => import('@/views/ContabilidadEventoView.vue'),
    meta: { breadcrumb: ['Inicio', 'eventos', 'Contabilidad'] },
  },
  // ---- Redirects: legacy → new routes ----
  {
    path: '/contabilidad',
    redirect: '/reportes/contabilidad',
  },
  {
    path: '/rentabilidad',
    redirect: '/reportes/rentabilidad',
  },
  // ---- Reportes (Phase 5) ----
  {
    path: '/reportes',
    component: () => import('@/components/layout/ReportesLayout.vue'),
    children: [
      {
        path: '',
        name: 'reportes-resumen',
        component: () => import('@/views/ReportesView.vue'),
        meta: { breadcrumb: ['Inicio', 'Reportes', 'Resumen'] },
      },
      {
        path: 'contabilidad',
        name: 'reportes-contabilidad',
        component: () => import('@/views/ContabilidadView.vue'),
        meta: { breadcrumb: ['Inicio', 'Reportes', 'Contabilidad'] },
      },
      {
        path: 'rentabilidad',
        name: 'reportes-rentabilidad',
        component: () => import('@/views/RentabilidadView.vue'),
        meta: { breadcrumb: ['Inicio', 'Reportes', 'Rentabilidad'] },
      },
    ],
  },
  // ---- POS ----
  {
    path: '/pos',
    name: 'pos',
    component: () => import('@/views/PosView.vue'),
    meta: { breadcrumb: ['Inicio', 'pos'] },
  },
  {
    path: '/pos/cierre',
    name: 'pos-cierre',
    component: () => import('@/views/CierresCajaView.vue'),
    meta: { breadcrumb: ['Inicio', 'pos', 'Cierre'] },
  },
  {
    path: '/ventas',
    name: 'ventas',
    component: () => import('@/views/FeatureComingSoonView.vue'),
    props: { title: 'Ventas', icon: 'mdi-cash-register', section: 'Operación' },
    meta: { breadcrumb: ['Inicio', 'Operación', 'Ventas'] },
  },
  {
    path: '/gastos',
    name: 'gastos',
    component: () => import('@/views/FeatureComingSoonView.vue'),
    props: { title: 'Gastos', icon: 'mdi-file-document-edit', section: 'Operación' },
    meta: { breadcrumb: ['Inicio', 'Operación', 'Gastos'] },
  },
  {
    path: '/costos',
    name: 'costos',
    component: () => import('@/views/FeatureComingSoonView.vue'),
    props: { title: 'Costos', icon: 'mdi-calculator', section: 'Planificación' },
    meta: { breadcrumb: ['Inicio', 'Planificación', 'Costos'] },
  },
  {
    path: '/ajustes',
    name: 'ajustes',
    component: () => import('@/views/FeatureComingSoonView.vue'),
    props: { title: 'Ajustes', icon: 'mdi-cog', section: 'Configuración' },
    meta: { breadcrumb: ['Inicio', 'Configuración', 'Ajustes'] },
  },
  {
    path: '/equipo',
    name: 'equipo',
    component: () => import('@/views/FeatureComingSoonView.vue'),
    props: { title: 'Equipo', icon: 'mdi-account-group', section: 'Configuración' },
    meta: { breadcrumb: ['Inicio', 'Configuración', 'Equipo'] },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
