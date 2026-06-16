import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// Foundation PR1 boots the minimum app shell: Vue + Pinia.
// Plugin order is intentionally minimal — Vuetify lands in PR2, router in
// PR2 Task 2.8, and provide() services land in PR3. Mount is always last.
const app = createApp(App)
app.use(createPinia())
app.mount('#app')
