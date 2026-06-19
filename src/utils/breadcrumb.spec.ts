// REQ-UX-5..8: pure breadcrumb helpers. Formatear takes a kebab-case
// slug (or a pre-formatted label) and produces the visible title.
// `resolverBreadcrumbDeMeta` walks `route.meta.breadcrumb` and emits
// the canonical `BreadcrumbItem[]` — every ancestor gets a `to`, the
// last is `disabled` (current page). Missing/empty meta falls back to
// `[{ title: 'Inicio', to: '/' }]` so the AppBar still renders
// something coherent on deep-links without breadcrumbs registered.
import { describe, it, expect } from 'vitest'
import {
  formatearEtiquetaBreadcrumb,
  resolverBreadcrumbDeMeta,
} from './breadcrumb'

describe('formatearEtiquetaBreadcrumb', () => {
  it('converts a kebab-case slug to Title Case (REQ-UX-25)', () => {
    expect(formatearEtiquetaBreadcrumb('materias-primas')).toBe('Materias primas')
  })

  it('passes through an already-formatted label unchanged', () => {
    expect(formatearEtiquetaBreadcrumb('Planificación de evento')).toBe(
      'Planificación de evento',
    )
  })
})

describe('resolverBreadcrumbDeMeta', () => {
  it('builds the canonical items for a root route (single crumb)', () => {
    const items = resolverBreadcrumbDeMeta({ breadcrumb: ['Inicio'] })
    expect(items).toEqual([{ title: 'Inicio', to: '/', disabled: undefined }])
  })

  it('builds ancestor + disabled last for a nested meta', () => {
    const items = resolverBreadcrumbDeMeta({
      breadcrumb: ['Inicio', 'materias-primas', 'Detalle'],
    })
    expect(items).toEqual([
      { title: 'Inicio', to: '/', disabled: undefined },
      { title: 'Materias primas', to: '/materias-primas', disabled: undefined },
      { title: 'Detalle', disabled: true },
    ])
  })

  it('returns the Inicio fallback when meta.breadcrumb is missing or empty', () => {
    expect(resolverBreadcrumbDeMeta(undefined)).toEqual([
      { title: 'Inicio', to: '/' },
    ])
    expect(resolverBreadcrumbDeMeta({ breadcrumb: [] })).toEqual([
      { title: 'Inicio', to: '/' },
    ])
  })
})