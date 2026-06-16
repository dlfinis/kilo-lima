import { z } from 'zod'

// Fail-fast at module import: missing or malformed .env.local must surface
// during `pnpm dev` / `pnpm build` with a clear variable name, not at the
// first Supabase call deep in a service.
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL debe ser una URL válida'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'VITE_SUPABASE_ANON_KEY no puede estar vacío'),
})

const parsed = schema.safeParse(import.meta.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Configuración de entorno inválida:\n${issues}`)
}

export const env = parsed.data
export type Env = z.infer<typeof schema>
