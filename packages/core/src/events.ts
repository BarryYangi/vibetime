// Source: PRD §8 / DEC-011 / CON-adapter-contract — locked, verbatim.
//
// Adapters in `packages/core` consume vendor hook payloads and return a
// NormalizedEvent or null. Adapters MUST be pure and MUST NOT throw.

export type Agent = 'claude-code' | 'codex' | 'cursor'

export type EventType = 'turn_start' | 'turn_end' | 'session_start' | 'session_end'

export interface NormalizedEvent {
  agent: Agent
  event_type: EventType
  project: string
  session_id: string
  turn_id?: string
  ts: number
  timezone: string
  meta?: Record<string, unknown>
}

/**
 * Adapter contract: pure function from raw vendor payload to a NormalizedEvent.
 *
 * Returns `null` when:
 *   - the payload is unparseable
 *   - the event is irrelevant
 *
 * MUST NOT throw under any input. Bulletproof — adapter is called from a
 * silent hook process where any thrown error degrades the agent UX.
 */
export type AdapterFn = (rawPayload: unknown, eventName: string) => NormalizedEvent | null
