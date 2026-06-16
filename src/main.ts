import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { vuetify } from '@/plugins/vuetify'

// Plugin order matters (design section 2): Pinia → Vuetify → (Router in
// Task 2.8) → (services in PR3) → mount. Mount is always last so every
// plugin's provide() is in place before the first render.
const app = createApp(App)
app.use(createPinia())
app.use(vuetify)
app.mount('#app')
