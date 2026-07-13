import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'

// Light theme only (REQ-UI-4). Palette from design section 10.
// `accent #FF6B35` is the brief's "color de ventas" — POS-confirmation
// toasts and sale buttons use it in future slices.
//
// Visual polish: softer success green (less fluorescent), warmer
// background for a cleaner POS surface.
export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#1976D2',
          secondary: '#424242',
          accent: '#FF6B35',
          success: '#16A34A',
          warning: '#FFC107',
          error: '#F44336',
          background: '#F3F4F5',
          'surface-variant': '#F8F9FA',
        },
      },
    },
  },
})
