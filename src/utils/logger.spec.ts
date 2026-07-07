// logger.spec.ts
// Tests for the minimal observability utility. The project does not
// have a third-party logger and the only existing logging convention
// is `console.error('[scope] message', error)` in src/composables/usePwaUpdate.ts.
// This utility codifies that pattern so failure sites can emit a
// structured event without pulling in a logging library.
//
// Key contract:
//   - logError(scope, message, context?) → emits a single console.error
//     with a tagged prefix and the structured context as a payload.
//   - Never throws (LSP — never-throw contract).
//   - Scopes are short tokens ([cargarPorEvento], [corregirVenta], etc.)
//     so a future log aggregator can group by scope.
//   - No side effects beyond console.error — no global state, no
//     persistence. Tests stub console.error to assert the call.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTraceId, logTrace, logError, logInfo } from './logger'

let spy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  spy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  spy.mockRestore()
})

// ---------------------------------------------------------------
// logInfo — non-error observability
// Uses console.info so a future log aggregator can split
// informational traces from error diagnostics without parsing the
// message text. Same never-throw contract and [scope] prefix.
// ---------------------------------------------------------------
describe('logInfo', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
  })

  it('emits exactly one console.info with a tagged [scope] prefix', () => {
    logInfo('cargarPorEvento', 'loading ventas for evento e-1')
    expect(infoSpy).toHaveBeenCalledTimes(1)
    const [first] = infoSpy.mock.calls[0] ?? []
    expect(typeof first).toBe('string')
    expect(String(first)).toMatch(
      /^\[cargarPorEvento\]\s+loading ventas for evento e-1/,
    )
  })

  it('forwards a structured context object as a second argument', () => {
    logInfo('corregirVenta', 'correction started', {
      ventaId: 'v-1',
      eventoId: 'e-1',
      nuevoTotal: 60,
      itemsCount: 2,
    })
    expect(infoSpy).toHaveBeenCalledTimes(1)
    const [, context] = infoSpy.mock.calls[0] ?? []
    expect(context).toEqual({
      ventaId: 'v-1',
      eventoId: 'e-1',
      nuevoTotal: 60,
      itemsCount: 2,
    })
  })

  it('never throws — even if context is undefined or null', () => {
    expect(() => logInfo('a', 'b')).not.toThrow()
    expect(() => logInfo('a', 'b', undefined)).not.toThrow()
    expect(() => logInfo('a', 'b', null)).not.toThrow()
    expect(infoSpy).toHaveBeenCalledTimes(3)
  })

  it('uses console.info, not console.error (non-error semantics)', () => {
    logInfo('scope', 'everything is fine')
    // console.info was called, console.error was NOT.
    expect(infoSpy).toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('keeps the prefix even when the message contains colons or brackets (triangulation)', () => {
    logInfo('cargarPorEvento', 'ventas loaded: 5 rows [e-1]')
    const [first] = infoSpy.mock.calls[0] ?? []
    expect(String(first)).toMatch(
      /^\[cargarPorEvento\]\s+ventas loaded: 5 rows \[e-1\]$/,
    )
  })
})

describe('logError', () => {
  it('emits exactly one console.error with a tagged [scope] prefix', () => {
    logError('cargarPorEvento', 'fetch failed')
    expect(spy).toHaveBeenCalledTimes(1)
    const [first] = spy.mock.calls[0] ?? []
    expect(typeof first).toBe('string')
    expect(String(first)).toMatch(/^\[cargarPorEvento\]\s+fetch failed/)
  })

  it('forwards a structured context object as a second argument', () => {
    logError('corregirVenta', 'RPC failed', {
      eventoId: 'e-1',
      ventaId: 'v-1',
      errorCode: 'PGRST301',
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const [, context] = spy.mock.calls[0] ?? []
    expect(context).toEqual({
      eventoId: 'e-1',
      ventaId: 'v-1',
      errorCode: 'PGRST301',
    })
  })

  it('never throws — even if context is undefined or null', () => {
    expect(() => logError('a', 'b')).not.toThrow()
    expect(() => logError('a', 'b', undefined)).not.toThrow()
    expect(() => logError('a', 'b', null)).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('forwards Error instances verbatim (the underlying cause)', () => {
    const cause = new Error('boom')
    logError('scope', 'wrapped', { cause })
    const [, context] = spy.mock.calls[0] ?? []
    expect((context as { cause: unknown }).cause).toBe(cause)
  })

  it('keeps the prefix even when the message contains colons or brackets', () => {
    logError('foo', 'bar: baz [qux]')
    const [first] = spy.mock.calls[0] ?? []
    expect(String(first)).toMatch(/^\[foo\]\s+bar: baz \[qux\]$/)
  })
})

// ---------------------------------------------------------------
// createTraceId — unique correlation id per call
// ---------------------------------------------------------------
describe('createTraceId', () => {
  it('returns a non-empty string', () => {
    const id = createTraceId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('returns a different id on each call', () => {
    const a = createTraceId()
    const b = createTraceId()
    const c = createTraceId()
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
    expect(a).not.toBe(c)
  })

  it('returns ids that look like prefixed hex (triangulation)', () => {
    const id = createTraceId()
    // Should contain a known prefix and hex-like chars
    expect(id).toMatch(/^trc_/)
    expect(id.slice(4).length).toBeGreaterThanOrEqual(8)
  })
})

// ---------------------------------------------------------------
// logTrace — structured trace events with correlation
// Uses console.debug so a developer can filter traces from
// informational logs. Emits a [scope] prefix, timestamp, optional
// traceId, and optional context.
// ---------------------------------------------------------------
describe('logTrace', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    debugSpy.mockRestore()
  })

  it('emits exactly one console.debug with a tagged [scope] prefix', () => {
    logTrace('carrito', 'item-added', { productoId: 'p-1' })
    expect(debugSpy).toHaveBeenCalledTimes(1)
    const [first] = debugSpy.mock.calls[0] ?? []
    expect(typeof first).toBe('string')
    expect(String(first)).toMatch(/^\[carrito\]\s+item-added\s/)
  })

  it('includes an ISO timestamp in the trace message', () => {
    logTrace('carrito', 'item-added')
    const [first] = debugSpy.mock.calls[0] ?? []
    expect(String(first)).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('forwards a structured context object as a second argument', () => {
    logTrace('corregirVenta', 'rpc-called', {
      ventaId: 'v-1',
      traceId: 'trc_abc123',
    })
    expect(debugSpy).toHaveBeenCalledTimes(1)
    const [, context] = debugSpy.mock.calls[0] ?? []
    expect(context as Record<string, unknown>).toMatchObject({
      ventaId: 'v-1',
      traceId: 'trc_abc123',
    })
  })

  it('never throws — even if context is undefined or null', () => {
    expect(() => logTrace('a', 'b')).not.toThrow()
    expect(() => logTrace('a', 'b', undefined)).not.toThrow()
    expect(() => logTrace('a', 'b', null)).not.toThrow()
    expect(debugSpy).toHaveBeenCalledTimes(3)
  })

  it('uses console.debug, not console.info or console.error (trace semantics)', () => {
    logTrace('scope', 'event')
    expect(debugSpy).toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('keeps the prefix even when the event name contains colons or brackets (triangulation)', () => {
    logTrace('carrito', 'cantidad:changed [p-1]')
    const [first] = debugSpy.mock.calls[0] ?? []
    expect(String(first)).toMatch(
      /^\[carrito\]\s+cantidad:changed \[p-1\]\s/,
    )
  })
})