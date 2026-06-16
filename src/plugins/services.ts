import type { App } from 'vue'

import { supabase } from '@/services/supabase.client'
import { storageService } from '@/services/storage.service'

// DIP entry point (design section 3, section 6). Consumers `inject('supabase')`
// and `inject('storageService')` instead of importing the modules directly,
// so tests can swap in fakes and the offline-sync slice can replace
// storageService with a remote-cache adapter without touching call sites.
export const servicesPlugin = {
  install(app: App) {
    app.provide('supabase', supabase)
    app.provide('storageService', storageService)
  },
}
