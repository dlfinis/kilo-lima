import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { vuetify } from '@/plugins/vuetify'
import { router } from '@/router'

// Plugin order matters (design section 2): Pinia → Vuetify → Router →
// (services in PR3) → mount. Mount is always last so every plugin's
// provide() is in place before the first render.
const app = createApp(App)
app.use(createPinia())
app.use(vuetify)
app.use(router)
app.mount('#app')
