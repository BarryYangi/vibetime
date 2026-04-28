// Source: PRD §8 / DEC-011 / ADPT-01 / RESEARCH §A.1 + §C + §G.
//
// Claude Code adapter. Pure logic. No imports beyond `events.ts` types.
// No filesystem, no node:* builtins, no third-party runtime deps (DEC-006).
// Caller (Phase 3 hook) post-processes `event.project` via `resolveProject`
// before SQLite insert (RESEARCH §D Option 3).

import type { AdapterFn, EventType, NormalizedEvent } from '../events.js'

// Per-vendor event-name → event_type lookup. Claude Code emits all four
// locked V0 events (RESEARCH §A.1). Other Claude events appearing post-PRD
// (UserPromptExpansion, PostToolBatch, SubagentStart/Stop, etc.) are NOT in
// V0 scope — adapter returns null for any name absent from this table.
const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  UserPromptSubmit: 'turn_start',
  Stop: 'turn_end',
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
}

// Per-vendor required-fields type guard. Claude Code's common-input fields
// guarantee `session_id` and `cwd` on every documented hook event.
function hasRequired(p: unknown): p is { session_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}

/**
 * Claude Code adapter (PRD §8 / DEC-011 / ADPT-01).
 *
 * Maps `UserPromptSubmit` / `Stop` / `SessionStart` / `SessionEnd` to a
 * NormalizedEvent. `turn_id` is derived as `${session_id}-${ts}` (PRD §8
 * — Claude has no native turn ID). The unrounded fractional `ts` keeps
 * collisions practically impossible for human-paced agent turns
 * (RESEARCH §G.7).
 *
 * Returns a NormalizedEvent whose `project` field is the raw `cwd` string
 * extracted from the vendor payload. The hook layer (Phase 3) is
 * responsible for replacing this via `resolveProject({ cwd, aliases,
 * gitRemoteUrl })` BEFORE persisting to SQLite (PRD §6 / DEC-010 /
 * RESEARCH §D Option 3).
 *
 * Pure. Never throws. Returns `null` on unparseable / unmapped input.
 */
export const adaptClaudeCode: AdapterFn = (rawPayload, eventName) => {
  // belt-and-braces: explicit type guards below already cover documented
  // inputs; this catch is for exotic Proxy/getter abuse to satisfy the
  // never-throws contract (DEC-011). Same intentional pattern as
  // resolveProject in project.ts:62-97. NOT redundant.
  try {
    const event_type = EVENT_TYPES[eventName]
    if (!event_type) return null

    if (!hasRequired(rawPayload)) return null

    // ts at call time — NOT module scope (RESEARCH §G.1).
    const ts = Date.now() / 1000
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // turn_id derivation per PRD §8: only for turn_* events. Use the
    // unrounded fractional ts so two same-second calls still differ
    // (RESEARCH §G.7 collision-resistance).
    const turn_id =
      event_type === 'turn_start' || event_type === 'turn_end'
        ? `${rawPayload.session_id}-${ts}`
        : undefined

    // V0 meta whitelist (RESEARCH §G.8): model + source on session_start;
    // reason on session_end. Drop prompt / stop_reason / permission_mode /
    // transcript_path / agent_type — those are forward-extensibility data
    // the schema does not require and may carry sensitive content.
    const meta: Record<string, unknown> = {}
    if (event_type === 'session_start') {
      const model = (rawPayload as { model?: unknown }).model
      if (typeof model === 'string') meta.model = model
      const source = (rawPayload as { source?: unknown }).source
      if (typeof source === 'string') meta.source = source
    }
    if (event_type === 'session_end') {
      const reason = (rawPayload as { reason?: unknown }).reason
      if (typeof reason === 'string') meta.reason = reason
    }

    const event: NormalizedEvent = {
      agent: 'claude-code',
      event_type,
      project: rawPayload.cwd,
      session_id: rawPayload.session_id,
      ts,
      timezone,
      // Spread-omit pattern for exactOptionalPropertyTypes — never assign
      // `undefined` literally, OMIT the key entirely.
      ...(turn_id !== undefined ? { turn_id } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }
    return event
  } catch {
    // See try-block comment above. Last line of defense for the
    // never-throws contract; covers Proxy-with-throwing-getters and any
    // other exotic input that bypasses our explicit guards.
    return null
  }
}
