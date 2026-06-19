import { z } from 'zod'

// Fail-fast at module import: missing or malformed .env.local must surface
// during `pnpm dev` / `pnpm build` with a clear variable name, not at the
// first Supabase call deep in a service.
//
// Supabase v2+ (2024+) renamed the legacy "anon" key to "publishable" to
// distinguish it from the secret/service_role key. We accept BOTH names
// (PUBLISHABLE preferred, ANON_KEY as a fallback) so existing projects
// and the new Dashboard default both work without editing .env.local.
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL debe ser una URL válida'),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY) no puede estar vacío'),
})

const parsed = schema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
})

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  // Throw a ZodError (per spec REQ-BE-3) with the friendly multi-line
  // message preserved for the solo dev's DX. instanceof ZodError === true.
  const err = new z.ZodError(parsed.error.issues)
  err.message = `Configuración de entorno inválida:\n${issues}`
  throw err
}

export const env = parsed.data
export type Env = z.infer<typeof schema>
