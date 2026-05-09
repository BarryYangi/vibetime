// Source: Gemini CLI hooks reference, verified 2026-05-09:
// https://geminicli.com/docs/hooks/reference/
//
// Gemini CLI adapter. Pure logic. No imports beyond `events.ts` types.
// Caller (Phase 3 hook) post-processes `event.project` via `resolveProject`
// before SQLite insert.
//
// Gemini hook payloads provide `session_id`, `cwd`, `hook_event_name`, and
// `timestamp` as common fields. The documented turn boundary events do not
// provide a native turn id, so VibeTime derives a turn_id on `BeforeAgent`.
// The hook store pairs `AfterAgent` by closing the newest open turn for the
// same agent/session when no turn_id is present.

import type { AdapterFn, EventType, NormalizedEvent } from '../events.js'

const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  BeforeAgent: 'turn_start',
  BeforeModel: 'turn_start',
  AfterAgent: 'turn_end',
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
}

function hasRequiredBase(p: unknown): p is { session_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}

function parseHookTimestamp(raw: unknown): number {
  if (typeof raw !== 'string') return Date.now() / 1000
  const millis = Date.parse(raw)
  return Number.isFinite(millis) ? millis / 1000 : Date.now() / 1000
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '_')
}

function getModel(rawPayload: unknown): string | undefined {
  if (rawPayload === null || typeof rawPayload !== 'object') return undefined

  const topLevelModel = (rawPayload as { model?: unknown }).model
  if (typeof topLevelModel === 'string') return topLevelModel

  const llmRequest = (rawPayload as { llm_request?: unknown }).llm_request
  if (llmRequest && typeof llmRequest === 'object') {
    const model = (llmRequest as { model?: unknown }).model
    if (typeof model === 'string') return model
  }

  return undefined
}

/**
 * Gemini CLI adapter.
 *
 * Maps:
 *   - `BeforeAgent`  → `turn_start`
 *   - `BeforeModel`  → `turn_start` metadata enrichment when model is present
 *   - `AfterAgent`   → `turn_end`
 *   - `SessionStart` → `session_start`
 *   - `SessionEnd`   → `session_end`
 *
 * `turn_id` is generated for `BeforeAgent` only. `BeforeModel` / `AfterAgent`
 * have no stable documented turn identifier, so they intentionally omit
 * `turn_id`; the store layer enriches or closes the newest open turn in the
 * same agent/session.
 *
 * Pure. Never throws. Returns `null` on unparseable / unmapped input.
 */
export const adaptGeminiCli: AdapterFn = (rawPayload, eventName) => {
  try {
    const event_type = EVENT_TYPES[eventName]
    if (!event_type) return null
    if (!hasRequiredBase(rawPayload)) return null

    const ts = parseHookTimestamp((rawPayload as { timestamp?: unknown }).timestamp)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const turn_id =
      eventName === 'BeforeAgent'
        ? `${sanitizeIdPart(rawPayload.session_id)}-${Math.round(ts * 1000)}`
        : undefined

    const meta: Record<string, unknown> = {}
    if (event_type === 'session_start') {
      const source = (rawPayload as { source?: unknown }).source
      if (typeof source === 'string') meta.source = source
    }
    if (event_type === 'session_end') {
      const reason = (rawPayload as { reason?: unknown }).reason
      if (typeof reason === 'string') meta.reason = reason
    }
    if (eventName === 'BeforeAgent' || eventName === 'BeforeModel') {
      const model = getModel(rawPayload)
      if (model) meta.model = model
    }

    const event: NormalizedEvent = {
      agent: 'gemini-cli',
      event_type,
      project: rawPayload.cwd,
      session_id: rawPayload.session_id,
      ts,
      timezone,
      ...(turn_id !== undefined ? { turn_id } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }

    return event
  } catch {
    return null
  }
}
