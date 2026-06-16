import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// vite-plugin-vuetify@2.1.3's autoImport transform injects JS imports for
// every <v-*> tag it sees in a template. Those imports pull in Vuetify
// component CSS files (e.g. vuetify/lib/components/VApp/VApp.css) which the
// jsdom test environment cannot resolve on its own. `server.deps.inline`
// forces Vite to pre-bundle vuetify through its own transform pipeline —
// Vite's built-in CSS plugin then strips the styles at load time instead
// of letting Node's ESM loader reject the .css extension.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['src/**/*.{test,spec}.ts'],
      server: {
        deps: {
          inline: ['vuetify'],
        },
      },
    },
  }),
)
