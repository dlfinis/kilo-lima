# Offline Sync Architecture — Kilo-Lima

> **Status**: ARCHITECTURE DOCUMENT — implementation deferred to the `offline-sync` slice.
> **Foundation ships**: `IStorageService` contract, `LocalforageStorageService` implementation, `useOnlineStatus()` composable, `vite-plugin-pwa` service worker (generateSW).
> **Foundation does NOT ship**: sync queue, sync service, custom service worker, `useSyncStatus`.

---

## Chosen Architecture

**Optimistic UI + localforage Write-Ahead Log + Pinia Sync Queue + Service Worker Background Sync API replay.**

### Why This Fits Kilo-Lima

- **Single user, intermittent connectivity at fairs** — no need for CRDTs, no multi-device merge. Last-write-wins by timestamp is sufficient.
- **POS context** — the user taps "Sold!" and needs immediate feedback. Optimistic UI is mandatory; waiting for Supabase (50ms+ latency) would feel broken on a flaky 4G connection.
- **Fair connectivity** — seconds-to-minutes of outage, not multi-hour blackouts. Background Sync API (with a `sync` event registered in the service worker) is the right primitive for this window. Fallback: retry on `online` event from the queue.

---

## Data Flow

```
User taps "Sold!" in POS view
        │
        ▼
Pinia store: pos.store.ts
        │
        ├─── 1. Append { id, op, payload, ts } to syncQueue
        ├─── 2. Write to localforage (persist)
        ├─── 3. Update local cache optimistically
        └─── 4. UI re-renders immediately (green toast)
        │
        ▼
Attempt Supabase insert/update
        │
   ┌────┴────┐
   ▼         ▼
Success    Failure
   │         │
Remove     Queue entry stays
from       in localforage
queue      │
           ▼
     SW registers 'sync' event
     (Background Sync API)
           │
           ▼
     Browser fires sync when online
     SW drains queue → Supabase
           │
           ▼
     On reconnect: queue status → 'synced'
     UI shows green indicator
```

---

## Key Primitives

| Primitive | Role | Location |
|-----------|------|----------|
| `IStorageService` | LSP contract: `guardar`, `obtener`, `eliminar`, `listarClaves` | `src/services/storage.interface.ts` |
| `LocalforageStorageService` | localforage-backed implementation | `src/services/storage.service.ts` |
| `SyncQueueStore` (future) | Pinia store: holds pending operations | `src/stores/sync.queue.store.ts` (deferred) |
| `SyncService` (future) | Orchestrates queue drain, retry, conflict resolution | `src/services/sync.service.ts` (deferred) |
| Custom SW (future) | `injectManifest` strategy, `sync` event handler | `custom-sw.ts` (deferred) |
| `useSyncStatus` (future) | Exposes `estadoSincronizacion: Ref<'synced' \| 'pending' \| 'offline'>` | `src/composables/useSyncStatus.ts` (deferred) |
| `useOnlineStatus` | `online: Ref<boolean>` from `navigator.onLine` | `src/composables/useOnlineStatus.ts` (SHIPS in foundation) |

---

## Conflict Resolution

**Last-write-wins by timestamp.** Every queue entry carries a `ts: number` (Date.now() at mutation time). When the SW replays, the latest timestamp wins. No CRDTs needed — single user, no concurrent edits.

---

## Alternatives Considered (Rejected)

| Alternative | Why Rejected |
|-------------|-------------|
| Pull-only on reconnect (no queue) | Loses offline-entered sales — unacceptable for a POS. |
| Supabase Realtime + multi-client sync | Overkill — no second client exists. |
| Service-worker-only sync (no Pinia queue) | No optimistic UI — bad UX for sales feedback. |
| `idb-keyval` instead of localforage | Would require hand-writing the queue index. localforage is the brief's locked choice; swap cost is low if it ever breaks. |

---

## What Foundation Provides

Foundation installs the sync **primitives** so the `offline-sync` slice can build on stable contracts:

- `localforage` client configured (`src/services/localforage.client.ts`)
- `IStorageService` contract (`src/services/storage.interface.ts`)
- `LocalforageStorageService` implementation (`src/services/storage.service.ts`)
- `useOnlineStatus()` composable — network awareness
- `vite-plugin-pwa` with `generateSW` — service worker precaching the app shell
- This architecture document — the deferred team knows the intent

---

## What the `offline-sync` Slice Must Build

1. `src/stores/sync.queue.store.ts` — Pinia store holding `{ id, op, payload, ts }[]` with `agregar`, `eliminar`, `drenar` actions.
2. `src/services/sync.service.ts` — reads queue, calls Supabase, handles success/failure, updates queue.
3. `src/services/online-sync.interface.ts` — `IOnlineSyncService` contract (LSP for future storage backends).
4. Switch `vite-plugin-pwa` from `generateSW` to `injectManifest` with a custom `custom-sw.ts` handling the `sync` event.
5. `src/composables/useSyncStatus.ts` — exposes `estadoSincronizacion` ref for the UI.
6. POS store integration: `pos.store.ts` writes to the sync queue before Supabase calls; reads from local cache optimistically.
