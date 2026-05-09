// Source: PRD §8 / DEC-011 / ADPT-03 / RESEARCH §A.3 + §C + §D + §G.4 / §G.6 / §G.8.
//
// Cursor adapter. Pure logic. No imports beyond `events.ts` types.
// Caller (Phase 3 hook) post-processes `event.project` via `resolveProject`
// before SQLite insert (RESEARCH §D Option 3).

import type { AdapterFn, EventType, NormalizedEvent } from '../events.js'

// Cursor uses camelCase event names (unlike Claude / Codex PascalCase).
const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  beforeSubmitPrompt: 'turn_start',
  stop: 'turn_end',
  sessionStart: 'session_start',
  sessionEnd: 'session_end',
}

// Required for turn events: conversation_id (session) + generation_id (turn).
function hasRequiredTurn(p: unknown): p is { conversation_id: string; generation_id: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { conversation_id?: unknown }).conversation_id === 'string' &&
    typeof (p as { generation_id?: unknown }).generation_id === 'string'
  )
}

// Required for session events: only conversation_id (generation_id may be
// absent — no turn is in flight at session boundaries).
function hasRequiredSession(p: unknown): p is { conversation_id: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { conversation_id?: unknown }).conversation_id === 'string'
  )
}

/**
 * Cursor adapter (PRD §8 / DEC-011 / ADPT-03).
 *
 * Maps `beforeSubmitPrompt` / `stop` / `sessionStart` / `sessionEnd`.
 * Field renames:
 *   - `session_id` ← `conversation_id`
 *   - `turn_id`    ← `generation_id`  (turn events only)
 *   - `project`    ← `workspace_roots[0]`
 *
 * Cursor's `workspace_roots` is a `string[]` and V0 reads index 0 only —
 * documented known limitation per PRD §8 (workspace_roots[1..] ignored).
 * If `workspace_roots` is empty / missing / not-an-array, `project` is
 * set to '' and the hook layer's `resolveProject` promotes it to
 * '_unknown' before persistence (RESEARCH §G.4 + §D Option 3 + project.ts
 * fallback chain).
 *
 * `model` is opportunistic on session events per RESEARCH §A.3 — the
 * Cursor docs assert `model` is universal in the base schema yet omit it
 * from the per-event references for `sessionStart` / `sessionEnd`. We
 * extract via typeof guard; absent ⇒ omit from `meta`.
 *
 * Returns a NormalizedEvent whose `project` field is the raw cwd string
 * extracted from `workspace_roots[0]`. The hook layer (Phase 3) is
 * responsible for replacing this via `resolveProject({ cwd, aliases,
 * gitRemoteUrl })` BEFORE persisting to SQLite (RESEARCH §D Option 3).
 *
 * Pure. Never throws. Returns `null` on unparseable / unmapped input.
 */
export const adaptCursor: AdapterFn = (rawPayload, eventName) => {
  // belt-and-braces: explicit type guards below already cover documented
  // inputs; this catch is for exotic Proxy/getter abuse to satisfy the
  // never-throws contract (DEC-011). Same intentional pattern as
  // resolveProject in project.ts:62-97. NOT redundant.
  try {
    const event_type = EVENT_TYPES[eventName]
    if (!event_type) return null

    const isTurn = event_type === 'turn_start' || event_type === 'turn_end'

    if (isTurn) {
      if (!hasRequiredTurn(rawPayload)) return null
    } else {
      if (!hasRequiredSession(rawPayload)) return null
    }

    // ts at call time — NOT module scope (RESEARCH §G.1).
    const ts = Date.now() / 1000
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // workspace_roots[0] extraction with empty / missing / wrong-type
    // guard (RESEARCH §G.4). noUncheckedIndexedAccess makes ws[0] return
    // string | undefined.
    const ws = (rawPayload as { workspace_roots?: unknown }).workspace_roots
    const cwd = Array.isArray(ws) && typeof ws[0] === 'string' ? ws[0] : ''

    // session_id ← conversation_id; turn_id ← generation_id (turn-only).
    // Two-step `unknown` cast on the generation_id branch so TS does not
    // complain about the intersection with the session-narrowed
    // `{ conversation_id }` shape — the runtime hasRequiredTurn guard above
    // already proves the field is present.
    const session_id = (rawPayload as { conversation_id: string }).conversation_id
    const turn_id = isTurn
      ? (rawPayload as unknown as { generation_id: string }).generation_id
      : undefined

    // Meta whitelist: persist vendor-provided model on session_start and
    // turn_start. Do not infer it for stop. Keep reason on session_end.
    // Drop status / loop_count / duration_ms / etc.
    const meta: Record<string, unknown> = {}
    if (event_type === 'session_start' || event_type === 'turn_start') {
      const model = (rawPayload as { model?: unknown }).model
      if (typeof model === 'string') meta.model = model
    }
    if (event_type === 'session_end') {
      const reason = (rawPayload as { reason?: unknown }).reason
      if (typeof reason === 'string') meta.reason = reason
    }

    const event: NormalizedEvent = {
      agent: 'cursor',
      event_type,
      project: cwd,
      session_id,
      ts,
      timezone,
      ...(turn_id !== undefined ? { turn_id } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }
    return event
  } catch {
    // See try-block comment above. Last line of defense for the
    // never-throws contract.
    return null
  }
}
