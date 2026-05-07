// Public API of @vibetime/core. Imported by `hook` and `desktop` (Phase 3+).

export { adaptClaudeCode, adaptCodex, adaptCursor } from './adapters/index.js'
export type {
  CodexTurnCompletion,
  FindCodexTurnCompletionInput,
} from './codex-transcript.js'
export { findCodexTurnCompletion } from './codex-transcript.js'
export type { AdapterFn, Agent, EventType, NormalizedEvent } from './events.js'
export type { ResolveProjectInput } from './project.js'
export { parseGitRemoteUrl, resolveProject } from './project.js'
export { DDL_EVENTS, DDL_INDICES, DDL_OPEN_TURNS, SCHEMA_VERSION } from './schema.js'
export type {
  DayAllocation,
  DayAllocationInput,
  TimeWindowInput,
  TurnInterval,
  TurnIntervalInput,
} from './time.js'
export { allocateDurationByLocalDay, durationWithinWindow, resolveTurnInterval } from './time.js'
