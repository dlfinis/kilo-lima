import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'

// vite-plugin-vuetify must be registered BEFORE @vitejs/plugin-vue
// so its autoImport transform runs first and tags components for tree-shaking.
export default defineConfig({
  plugins: [
    vuetify({ autoImport: true }),
    vue(),
  ],
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
