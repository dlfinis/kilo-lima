import { vi } from 'vitest'

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
