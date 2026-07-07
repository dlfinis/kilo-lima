// trace.ts — minimal in-memory trace buffer for developer observability.
//
// The trace buffer exposes recently emitted trace events via
// `window.__kiloLima__.traces` so a developer or operator can inspect
// the flow timeline without filtering console levels. Each event
// carries a scope, event name, timestamp, and optional traceId +
// structured context.
//
// Contract:
//   - The buffer is a ring — at most TRACE_BUFFER_SIZE events are
//     retained (oldest evicted first).
//   - Recording is disabled by default. Call `enableTraceBuffer()`
//     to activate it. In production the buffer stays off to avoid
//     memory pressure.
//   - Pure-data store: no side effects beyond the ring buffer,
//     never throws.
//   - All functions are synchronous — the buffer is a simple array
//     rotation, not an async queue.

export interface TraceEvent {
  scope: string
  event: string
  timestamp: string
  traceId?: string
  context?: Record<string, unknown>
}

const TRACE_BUFFER_SIZE = 100

let _buffer: TraceEvent[] = []
let _enabled = false

export function enableTraceBuffer(): void {
  _enabled = true
}

export function disableTraceBuffer(): void {
  _enabled = false
}

export function recordTrace(event: TraceEvent): void {
  if (!_enabled) return
  if (_buffer.length >= TRACE_BUFFER_SIZE) {
    // Ring buffer: drop oldest to make room.
    _buffer.shift()
  }
  _buffer.push(event)
}

export function getTraceBuffer(): ReadonlyArray<TraceEvent> {
  // Return most recent first for console readability.
  return [..._buffer].reverse()
}

export function clearTraceBuffer(): void {
  _buffer = []
}
