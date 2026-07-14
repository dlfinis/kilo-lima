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
  // catalog-domain-refactor / Slice 3: canonical preparation routes.
  // /recetas and /productos/recetas redirect to the new canonical
  // /productos/preparaciones surface. Legacy deep links preserve their
  // params.
  {
    path: '/recetas',
    redirect: '/productos/preparaciones',
  },
  {
    path: '/recetas/:id',
    redirect: (to) => `/productos/preparaciones/${to.params.id as string}`,
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
        // catalog-domain-refactor / Slice 3: canonical preparation route.
        // Name kept as 'recetas' for backward compat — internal named-route
        // navigations still resolve.
        path: 'preparaciones',
        name: 'recetas',
        component: () => import('@/views/RecetasView.vue'),
        meta: { breadcrumb: ['Inicio', 'Productos', 'Preparaciones'] },
      },
      {
        // catalog-domain-refactor / Slice 3: canonical preparation detail.
        // Name kept as 'receta-detalle' for backward compat.
        path: 'preparaciones/:id',
        name: 'receta-detalle',
        component: () => import('@/views/RecetaDetalleView.vue'),
        meta: { breadcrumb: ['Inicio', 'Productos', 'Preparaciones', 'Detalle'] },
      },
      {
        // Legacy redirect: /productos/recetas → /productos/preparaciones
        path: 'recetas',
        redirect: '/productos/preparaciones',
      },
      {
        // Legacy redirect: /productos/recetas/:id → /productos/preparaciones/:id
        path: 'recetas/:id',
        redirect: (to) => `/productos/preparaciones/${to.params.id as string}`,
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
  // event-product-management-refactor: unified Gestión productos surface.
  // /eventos/:id/gestion is the canonical event-product workflow. Legacy
  // /productos and /planificar redirect here so existing bookmarks/links
  // keep working (spec: Compatibilidad de rutas heredadas).
  {
    path: '/eventos/:id/gestion',
    name: 'evento-gestion',
    component: () => import('@/views/EventoGestionView.vue'),
    meta: { breadcrumb: ['Inicio', 'eventos', 'Gestión productos'] },
  },
  // Legacy redirects: /eventos/:id/productos and /eventos/:id/planificar
  // → /eventos/:id/gestion. Path-level redirects so existing bookmarks
  // and links keep working. Named routes removed — production code uses
  // href-based navigation to /gestion.
  {
    path: '/eventos/:id/planificar',
    redirect: (to) => `/eventos/${to.params.id as string}/gestion`,
  },
  {
    path: '/eventos/:id/productos',
    redirect: (to) => `/eventos/${to.params.id as string}/gestion`,
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
    component: () => import('@/views/VentasView.vue'),
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
