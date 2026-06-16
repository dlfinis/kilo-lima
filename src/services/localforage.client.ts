import localforage from 'localforage'

// Named instance so future storage services (offline-sync slice) can coexist
// with any other library that also uses IndexedDB under the hood.
export const localforageInstance = localforage.createInstance({
  name: 'kilo-lima',
  storeName: 'kilo_lima_store',
})
