import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// vue() MUST be registered BEFORE vite-plugin-vuetify — the Vuetify plugin
// throws at config resolution otherwise (it depends on the Vue plugin's
// filter to know which files are .vue SFCs for autoImport). This matches
// the official Vuetify 3 install guide and overrides the original
// design §10 ordering note.
//
// VitePWA is registered after Vuetify so its build-step manifest emission
// runs alongside the final Vite plugin pipeline. devOptions.enabled = true
// keeps the SW live during `pnpm dev` for manual testing of the
// install / offline flow before the PWA ships.
export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kilo-Lima',
        short_name: 'KiloLima',
        description: 'PWA personal para gestionar costos y ventas de postres en ferias',
        theme_color: '#1976D2',
        background_color: '#FAFAFA',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {},
      devOptions: { enabled: true },
    }),
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
