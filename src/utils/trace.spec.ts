// trace.spec.ts
// Tests for the minimal in-memory trace buffer that backs the
// `window.__kiloLima__.traces` debug hook. The buffer is a ring of
// the last N trace events; each event carries a scope, message,
// timestamp, and optional traceId + context.
//
// Contract:
//   - `recordTrace(event)` appends to the ring buffer. At most
//     `TRACE_BUFFER_SIZE` events are retained.
//   - `getTraceBuffer()` returns a snapshot of all stored events
//     (most recent first).
//   - `clearTraceBuffer()` empties the store.
//   - The buffer is a pure-data store — no side effects, never throws.
//   - `enableTraceBuffer()` and `disableTraceBuffer()` toggle
//     recording. Disabled by default to avoid overhead in production.
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearTraceBuffer,
  disableTraceBuffer,
  enableTraceBuffer,
  getTraceBuffer,
  recordTrace,
  type TraceEvent,
} from './trace'

beforeEach(() => {
  clearTraceBuffer()
  enableTraceBuffer()
})

describe('recordTrace + getTraceBuffer', () => {
  it('stores a single trace event and returns it via getTraceBuffer', () => {
    const event: TraceEvent = {
      scope: 'cargarPorEvento',
      event: 'load-start',
      timestamp: new Date().toISOString(),
      traceId: 'trc_abc',
      context: { eventoId: 'e-1' },
    }
    recordTrace(event)
    const buffer = getTraceBuffer()
    expect(buffer).toHaveLength(1)
    expect(buffer[0]).toMatchObject({
      scope: 'cargarPorEvento',
      event: 'load-start',
      traceId: 'trc_abc',
    })
  })

  it('returns events in insertion order (most recent first)', () => {
    recordTrace({ scope: 'a', event: 'first', timestamp: 't1' })
    recordTrace({ scope: 'a', event: 'second', timestamp: 't2' })
    recordTrace({ scope: 'a', event: 'third', timestamp: 't3' })
    const buffer = getTraceBuffer()
    expect(buffer.map((e) => e.event)).toEqual(['third', 'second', 'first'])
  })

  it('caps at TRACE_BUFFER_SIZE (ring buffer, triangulation)', () => {
    // Fill beyond the expected capacity.
    for (let i = 0; i < 120; i++) {
      recordTrace({ scope: 's', event: `evt-${i}`, timestamp: `t${i}` })
    }
    const buffer = getTraceBuffer()
    // Default cap is 100.
    expect(buffer.length).toBeLessThanOrEqual(100)
    // The newest events are kept — the oldest get evicted.
    expect(buffer[0]?.event).toBe('evt-119')
    expect(buffer[buffer.length - 1]?.event).toBe('evt-20')
  })
})

describe('clearTraceBuffer', () => {
  it('empties the buffer', () => {
    recordTrace({ scope: 'a', event: 'x', timestamp: 't1' })
    recordTrace({ scope: 'a', event: 'y', timestamp: 't2' })
    clearTraceBuffer()
    expect(getTraceBuffer()).toEqual([])
  })
})

describe('enable/disable trace buffer', () => {
  it('ignores recordTrace when disabled', () => {
    disableTraceBuffer()
    recordTrace({ scope: 'a', event: 'x', timestamp: 't1' })
    expect(getTraceBuffer()).toEqual([])
  })

  it('resumes recording when re-enabled', () => {
    disableTraceBuffer()
    recordTrace({ scope: 'a', event: 'x', timestamp: 't1' })
    enableTraceBuffer()
    recordTrace({ scope: 'a', event: 'y', timestamp: 't2' })
    expect(getTraceBuffer()).toHaveLength(1)
    expect(getTraceBuffer()[0]?.event).toBe('y')
  })
})
