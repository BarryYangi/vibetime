// Source: PRD §8 / DEC-011 / ADPT-02 / RESEARCH §A.2 + §C + §G.5 / §G.6 / §G.8.
//
// Codex CLI adapter. Pure logic. No imports beyond `events.ts` types.
// Caller (Phase 3 hook) post-processes `event.project` via `resolveProject`
// before SQLite insert (RESEARCH §D Option 3).
//
// SessionEnd is DELIBERATELY banned in this adapter:
//   - Codex does NOT emit SessionEnd. Verified absent from the published
//     schema directory `codex-rs/hooks/schema/generated/` on 2026-04-28
//     (RESEARCH §A.2). The published schemas are session-start, user-
//     prompt-submit, pre-tool-use, permission-request, post-tool-use,
//     stop. No session-end.command.
//   - Phase 3's hook lifecycle synthesizes a session_end record from a
//     process-exit fallback (PRD §8 Codex caveat) and writes it directly
//     to SQLite without going through this adapter (RESEARCH §G.5).
//   - Therefore feeding `eventName === 'SessionEnd'` (or any case variant)
//     into this adapter is treated as poisoned input and rejected with
//     null. This guards against future-vendor drift contaminating data.

import type { AdapterFn, EventType, NormalizedEvent } from '../events.js'

// Per-vendor event-name → event_type lookup. Codex emits exactly three
// V0-mapped events. SessionEnd is DELIBERATELY OMITTED — see file header.
const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  UserPromptSubmit: 'turn_start',
  Stop: 'turn_end',
  SessionStart: 'session_start',
}

// For turn-scoped events Codex requires session_id + turn_id + cwd.
function hasRequiredTurn(p: unknown): p is { session_id: string; turn_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { turn_id?: unknown }).turn_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}

// For session-scoped events Codex provides session_id + cwd; turn_id is
// absent (no turn is in flight at session boundaries).
function hasRequiredSession(p: unknown): p is { session_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}

/**
 * Codex CLI adapter (PRD §8 / DEC-011 / ADPT-02).
 *
 * Maps `UserPromptSubmit` / `Stop` / `SessionStart` only. Codex's
 * `SessionEnd` is NOT emitted by the vendor (RESEARCH §A.2 / §G.5) — the
 * adapter rejects that event name with `null`. Phase 3's hook lifecycle
 * synthesizes session_end via process-exit fallback.
 *
 * `turn_id` is taken verbatim from `payload.turn_id` (vendor-provided);
 * unlike Claude Code, no derivation is needed.
 *
 * Returns a NormalizedEvent whose `project` field is the raw `cwd` string
 * extracted from the vendor payload. The hook layer (Phase 3) is
 * responsible for replacing this via `resolveProject({ cwd, aliases,
 * gitRemoteUrl })` BEFORE persisting to SQLite (RESEARCH §D Option 3).
 *
 * Pure. Never throws. Returns `null` on unparseable / unmapped / banned
 * input.
 */
export const adaptCodex: AdapterFn = (rawPayload, eventName) => {
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

    // Codex turn_id is vendor-provided (NOT derived). Only present on turns.
    // Two-step `unknown` cast so TS does not complain about the intersection
    // with the session-narrowed `{ session_id; cwd }` shape — the runtime
    // hasRequiredTurn guard above already proves the field is present.
    const turn_id = isTurn ? (rawPayload as unknown as { turn_id: string }).turn_id : undefined

    // Meta whitelist: persist vendor-provided model on session_start and
    // turn_start. Do not infer it for Stop. No session_end branch — Codex
    // doesn't emit it. Drop stop_hook_active / last_assistant_message etc.
    const meta: Record<string, unknown> = {}
    if (event_type === 'session_start' || event_type === 'turn_start') {
      const model = (rawPayload as { model?: unknown }).model
      if (typeof model === 'string') meta.model = model
    }
    if (event_type === 'session_start') {
      const source = (rawPayload as { source?: unknown }).source
      if (typeof source === 'string') meta.source = source
    }

    const event: NormalizedEvent = {
      agent: 'codex',
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
    // See try-block comment above. Last line of defense for the
    // never-throws contract.
    return null
  }
}
