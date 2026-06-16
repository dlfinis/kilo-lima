import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Extends vite.config so plugin transforms (vue, vuetify) apply to .spec files.
// setupFiles is a forward reference — the file is created in PR2 (Task 2.6).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['src/**/*.{test,spec}.ts'],
    },
  }),
)
