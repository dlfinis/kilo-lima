// REQ-UX-5..8 + REQ-UX-25: pure helpers that turn `route.meta.breadcrumb`
// into the shape BreadcrumbNav and useNavegacion consume. No Vue, no
// router — trivially unit-testable.
//
// `formatearEtiquetaBreadcrumb` accepts either a kebab-case slug or a
// pre-formatted string. The slug formatter handles the simple case used
// by `resolverBreadcrumbDeMeta` (e.g. "materias-primas" → "Materias
// primas"); pre-formatted strings pass through unchanged so callers can
// supply human-readable labels without paying for a slug reformat.
//
// `resolverBreadcrumbDeMeta` reads `route.meta.breadcrumb` and produces
// the canonical `BreadcrumbItem[]`: every item except the last gets a
// `to` (its `title`, optionally normalised), the last gets `disabled`
// and no `to` (current page). When `meta.breadcrumb` is missing or
// empty, returns the single-item fallback `[{ title: 'Inicio', to: '/' }]`
// so the AppBar still renders something coherent on direct deep-links.
export interface BreadcrumbItem {
  title: string
  to?: string
  disabled?: boolean
}

export type EtiquetaCruda = string

export function formatearEtiquetaBreadcrumb(etiqueta: EtiquetaCruda): string {
  if (typeof etiqueta !== 'string' || etiqueta.length === 0) return etiqueta
  // Already formatted (has a space) → pass through.
  if (etiqueta.includes(' ')) return etiqueta
  // Kebab-case slug → "primer-segundo" → "Primer segundo".
  // Lowercase the whole string first so an input like
  // "MATERIAS-PRIMAS" still renders as "Materias primas" (only the
  // first character of the whole label is capitalised).
  const lower = etiqueta.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1).replace(/-/g, ' ')
}

export function resolverBreadcrumbDeMeta(
  meta: { breadcrumb?: readonly EtiquetaCruda[] } | undefined,
): BreadcrumbItem[] {
  const crudos = meta?.breadcrumb
  if (!crudos || crudos.length === 0) {
    return [{ title: 'Inicio', to: '/' }]
  }
  const total = crudos.length
  return crudos.map((etiqueta, indice) => {
    const title = formatearEtiquetaBreadcrumb(etiqueta)
    const esUltimo = indice === total - 1
    // A single-crumb root stays a link (you can re-navigate to `/`);
    // only the last of a multi-crumb trail is `disabled` (current page).
    if (esUltimo && total > 1) {
      return { title, disabled: true }
    }
    // Build the ancestor "to" by walking the meta's raw labels (so the
    // routing target mirrors how the route was registered). The first
    // label is the canonical home crumb and always links to `/`.
    const rutaAcumulada = '/' + crudos.slice(1, indice + 1).join('/')
    return { title, to: rutaAcumulada } satisfies BreadcrumbItem
  })
}