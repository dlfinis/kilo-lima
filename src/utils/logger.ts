// logger.ts — minimal observability utility.
//
// The project does not pull a third-party logger; the only existing
// log site is `console.error('[pwa] ...', error)` in usePwaUpdate.ts.
// This module codifies that pattern so failure sites can emit a
// structured event without a new dependency.
//
// Contract:
//   - logError(scope, message, context?) → emits a single console.error
//     with a tagged prefix and the structured context as the second arg.
//   - Never throws (LSP — never-throw contract; failures of the logger
//     itself must never crash the calling site).
//   - No global state, no persistence, no external I/O. A future
//     slice can swap the implementation for a real aggregator by
//     re-exporting a compatible signature.
//
// logTrace optionally records to the in-memory trace buffer (see
// trace.ts) when it is enabled. The buffer backs the
// `window.__kiloLima__.traces` debug hook so a developer/operator
// can inspect the flow timeline without filtering console levels.

import { recordTrace } from './trace'

export type LogContext = Record<string, unknown> | null | undefined

// createTraceId — generates a unique correlation id for tracing a flow
// across multiple log sites. Uses crypto.randomUUID() (broadly available
// in modern browsers and Node ≥19) with a `trc_` prefix so developers
// can visually distinguish trace ids from other UUID-like tokens in
// console output.
export function createTraceId(): string {
  try {
    return `trc_${crypto.randomUUID()}`
  } catch {
    // Fallback for environments without crypto (extremely rare in 2026).
    // Still produces a unique-enough id for a single-user PWA.
    return `trc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  }
}

// logTrace — structured trace event for developer/operator observability.
//
// Emits via console.debug so a developer can filter traces from
// informational logs (console.info) and error diagnostics
// (console.error) without parsing the message text. Each trace event
// includes a timestamp so the operator can follow the timeline when
// replaying console output.
//
// Contract (same as logError / logInfo):
//   - Never throws (LSP — never-throw contract).
//   - No global state, no persistence, no external I/O.
//   - `scope` is a short token ([carrito], [corregirVenta], etc.).
//   - `event` describes what happened (item-added, rpc-called, loaded).
//   - `context` is optional structured data.
export function logTrace(
  scope: string,
  event: string,
  context?: LogContext,
): void {
  try {
    const ts = new Date().toISOString()
    const tag = `[${scope}] ${event} ${ts}`
    if (context === null || context === undefined) {
      console.debug(tag)
    } else {
      console.debug(tag, context)
    }
    // Also record to the in-memory trace buffer when enabled.
    // `recordTrace` is a no-op when the buffer is disabled, so this
    // path is zero-cost in production (disabled by default).
    const traceId = typeof context?.traceId === 'string' ? context.traceId : undefined
    const { traceId: _, ...rest } = (context ?? {}) as Record<string, unknown>
    recordTrace({
      scope,
      event,
      timestamp: ts,
      traceId,
      context: Object.keys(rest).length > 0 ? rest : undefined,
    })
  } catch {
    // Never throw. A failing logger is worse than no logger.
  }
}

export function logError(
  scope: string,
  message: string,
  context?: LogContext,
): void {
  try {
    const tag = `[${scope}] ${message}`
    if (context === null || context === undefined) {
      console.error(tag)
    } else {
      console.error(tag, context)
    }
  } catch {
    // Never throw. A failing logger is worse than no logger.
  }
}

// logInfo — non-error observability. Same contract as logError but
// emits via console.info so a future log aggregator can split
// informational traces from error diagnostics without parsing the
// message text. Useful for "request started", "data received",
// "operation completed", and retry paths.
export function logInfo(
  scope: string,
  message: string,
  context?: LogContext,
): void {
  try {
    const tag = `[${scope}] ${message}`
    if (context === null || context === undefined) {
      console.info(tag)
    } else {
      console.info(tag, context)
    }
  } catch {
    // Never throw. A failing logger is worse than no logger.
  }
}