import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('20260716180000_evento_productos_markups.sql', () => {
  it('clamps below-cost legacy markup totals before persisting the split', () => {
    const specPath = join(process.cwd(), 'supabase/migrations/20260716180000_evento_productos_markups.sql')
    const sql = readFileSync(specPath, 'utf8')

    expect(sql).toContain('ganancia_markup = least(greatest(r.markup_total, 0), 2.00)')
    expect(sql).toContain('contribucion_markup = greatest(greatest(r.markup_total, 0) - least(greatest(r.markup_total, 0), 2.00), 0)')
  })
})
