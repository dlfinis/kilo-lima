import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'

// vue() MUST be registered BEFORE vite-plugin-vuetify — the Vuetify plugin
// throws at config resolution otherwise (it depends on the Vue plugin's
// filter to know which files are .vue SFCs for autoImport). This matches
// the official Vuetify 3 install guide and overrides the original
// design §10 ordering note.
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
