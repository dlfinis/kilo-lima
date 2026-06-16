import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { vuetify } from '@/plugins/vuetify'
import { router } from '@/router'
import { servicesPlugin } from '@/plugins/services'

// Plugin order matters (design section 2): Pinia → Vuetify → Router →
// servicesPlugin → mount. servicesPlugin must run BEFORE mount so every
// `inject('supabase')` / `inject('storageService')` resolves during the
// first render. Mount is always last.
const app = createApp(App)
app.use(createPinia())
app.use(vuetify)
app.use(router)
app.use(servicesPlugin)
app.mount('#app')
