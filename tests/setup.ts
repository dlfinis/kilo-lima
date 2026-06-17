import { vi } from 'vitest'
import type { Database, ServiceError } from '@/types'

// jsdom does not implement window.matchMedia. Vuetify's responsive
// composables read it on first paint and would crash without this stub.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom does not implement ResizeObserver. Vuetify's <v-app> uses it for
// layout sizing on first mount. The stub records callbacks so they can be
// inspected but never invokes them.
class ResizeObserverStub {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub

// localforage hits IndexedDB / WebSQL in jsdom, which is unreliable in
// unit tests. The Map-backed stub keeps every call synchronous-shaped
// (async signatures preserved) and resets between test files when
// vitest re-evaluates this module.
const map = new Map<string, unknown>()

vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      config: () => {},
      setItem: async (k: string, v: unknown) => {
        map.set(k, v)
      },
      getItem: async (k: string) => (map.has(k) ? map.get(k)! : null),
      removeItem: async (k: string) => {
        map.delete(k)
      },
      keys: async () => Array.from(map.keys()),
    }),
    getItem: async (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: async (k: string, v: unknown) => {
      map.set(k, v)
    },
  },
}))

// Chainable Supabase mock per design §10 (catalog PR2). The mock replaces
// `createClient` so every `inject('supabase')` and every factory-built
// service gets the same chainable builder. `__resetSupabaseMock()` is
// exported so each test starts with a clean call log and a fresh response
// shape (REQ-CATALOG-34). Tests that need a specific payload call
// `__resetSupabaseMock({ data: [...], error: null })` in beforeEach.
type Respuesta<T> = { data: T | null; error: ServiceError | null }

interface LlamadaSupabase {
  metodo: string
  args: unknown[]
}

// Queue of pending responses — each `then`/`single`/`maybeSingle` consumes
// one. Tests push responses in call order; the queue is drained FIFO.
// Falls back to `__mockDefault` when the queue is empty (single-call paths
// only need the default response).
let __mockLlamadas: LlamadaSupabase[] = []
let __mockCola: Respuesta<unknown>[] = []
let __mockDefault: Respuesta<unknown> = { data: [], error: null }

function consumir(): Respuesta<unknown> {
  if (__mockCola.length > 0) return __mockCola.shift() as Respuesta<unknown>
  return __mockDefault
}

function crearBuilder(): Record<string, unknown> {
  const registrar = (metodo: string) => (...args: unknown[]) => {
    __mockLlamadas.push({ metodo, args })
    return builder
  }
  const builder: Record<string, unknown> = {
    from: registrar('from'),
    select: registrar('select'),
    insert: registrar('insert'),
    update: registrar('update'),
    delete: registrar('delete'),
    eq: registrar('eq'),
    order: registrar('order'),
  }
  builder.single = async (...args: unknown[]) => {
    registrar('single')(...args)
    return consumir()
  }
  builder.maybeSingle = async (...args: unknown[]) => {
    registrar('maybeSingle')(...args)
    return consumir()
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(consumir())
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => crearBuilder() as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient<Database>>,
}))

export function __resetSupabaseMock<T>(respuesta?: Respuesta<T> | Respuesta<T>[]) {
  __mockLlamadas = []
  __mockCola = []
  if (Array.isArray(respuesta)) {
    __mockCola = respuesta as Respuesta<unknown>[]
    __mockDefault = __mockCola.length > 0
      ? (__mockCola[__mockCola.length - 1] as Respuesta<unknown>)
      : { data: [], error: null }
  } else {
    __mockDefault = (respuesta ?? { data: [], error: null }) as Respuesta<unknown>
  }
}

export function __pushSupabaseResponse<T>(respuesta: Respuesta<T>) {
  __mockCola.push(respuesta as Respuesta<unknown>)
}

export function __getSupabaseMockCalls(): LlamadaSupabase[] {
  return __mockLlamadas
}
