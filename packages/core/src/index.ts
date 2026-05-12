// Public API of @vibetime/core. Imported by `hook` and `desktop` (Phase 3+).

export { adaptClaudeCode, adaptCodex, adaptCursor, adaptGeminiCli } from './adapters/index.js'
export { getAgentColorHex } from './agent-theme.js'
export type {
  CodexTranscriptCandidate,
  CodexTurnCompletion,
  FindCodexTurnCompletionInTranscriptsInput,
} from './codex-transcript.js'
export { findCodexTurnCompletionInTranscripts } from './codex-transcript.js'
export type { AdapterFn, Agent, EventType, NormalizedEvent } from './events.js'
export type {
  HistoryCalendarDay,
  HistoryEvent,
  HistoryHourlyCell,
  HistoryPeriodCompare,
  HistoryPeriodDays,
  HistoryProjectAgentTotal,
  HistorySummary,
  HistoryTopProjectRow,
  HistoryTrendDay,
  HistoryTurnDuration,
} from './history.js'
export {
  buildHistorySummaryFromEvents,
  HISTORY_PERIODS,
  HISTORY_TURN_START_BUFFER_SEC,
  historyLowerBound,
  isHistoryPeriodDays,
} from './history.js'
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
