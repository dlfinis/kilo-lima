import 'vuetify/styles'
import { createVuetify } from 'vuetify'

// Light theme only (REQ-UI-4). Palette from design section 10.
// `accent #FF6B35` is the brief's "color de ventas" — POS-confirmation
// toasts and sale buttons use it in future slices.
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
          success: '#4CAF50',
          warning: '#FFC107',
          error: '#F44336',
          background: '#FAFAFA',
        },
      },
    },
  },
})
