// LSP contract for storage adapters (design section 6, spec REQ-OFF-2).
// Every concrete storage — IndexedDB via localforage, future Supabase
// remote cache, in-memory test double — implements this surface so the
// offline-sync slice can swap providers without touching call sites.
export interface IStorageService {
  guardar<T>(clave: string, datos: T): Promise<void>
  obtener<T>(clave: string): Promise<T | null>
  eliminar(clave: string): Promise<void>
  listarClaves(): Promise<string[]>
}
