// Public API of @vibetime/core. Imported by `hook` and `desktop` (Phase 3+).

export { adaptClaudeCode, adaptCodex, adaptCursor } from './adapters/index.js'
export type { AdapterFn, Agent, EventType, NormalizedEvent } from './events.js'
export type { ResolveProjectInput } from './project.js'
export { parseGitRemoteUrl, resolveProject } from './project.js'
export { DDL_EVENTS, DDL_INDICES, DDL_OPEN_TURNS, SCHEMA_VERSION } from './schema.js'
