import localforage from 'localforage'

import { localforageInstance } from '@/services/localforage.client'
import type { IStorageService } from '@/services/storage.interface'

// `localforage` does not export its `LocalForage` interface, so we derive the
// instance type from `createInstance`'s return — keeps us in sync with whatever
// shape the library ships.
type LocalforageInstance = ReturnType<typeof localforage.createInstance>

// Concrete adapter binding the LSP contract to localforage. The constructor
// takes the LocalForage instance so tests can inject an in-memory fake
// (tests/setup.ts already exposes a Map-backed mock) without touching this file.
export class LocalforageStorageService implements IStorageService {
  constructor(private readonly store: LocalforageInstance) {}

  async guardar<T>(clave: string, datos: T): Promise<void> {
    await this.store.setItem(clave, datos)
  }

  async obtener<T>(clave: string): Promise<T | null> {
    const valor = await this.store.getItem<T>(clave)
    // Defensive: some drivers historically returned `undefined` for missing keys.
    return valor === undefined ? null : valor
  }

  async eliminar(clave: string): Promise<void> {
    await this.store.removeItem(clave)
  }

  async listarClaves(): Promise<string[]> {
    return this.store.keys()
  }
}

// Singleton consumed by the services plugin (DIP — call sites `inject` this
// rather than importing the module directly).
export const storageService: IStorageService = new LocalforageStorageService(localforageInstance)
