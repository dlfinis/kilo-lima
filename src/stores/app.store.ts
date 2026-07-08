import { ref } from 'vue'
import { defineStore } from 'pinia'

// Setup-style Pinia store. Every future domain store follows this template:
// reactive state via `ref`, actions as plain functions, return the public
// surface so Pinia can wire the reactivity to the consumer.
export const useAppStore = defineStore('app', () => {
  const appName = ref('KiloLima')

  function setAppName(nuevo: string) {
    appName.value = nuevo
  }

  return { appName, setAppName }
})
