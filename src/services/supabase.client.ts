import { createClient } from '@supabase/supabase-js'

import { env } from '@/utils/env'
import type { Database } from '@/types'

// The `env` import at the top triggers Zod fail-fast at module load
// (utils/env.ts throws ZodError with the friendly message if either
// VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing/malformed).
// `supabase.auth` is part of the default client and is the surface the
// useAuth composable will bind to in a later slice.
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
