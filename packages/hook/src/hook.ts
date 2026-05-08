// Hook mode main logic — stdin → adapter → SQLite.
// HOOK-01: <50ms cold start (Bun binary).
// HOOK-02: always exit 0, no stdout/stderr.
// HOOK-04: uses core adapters (adaptClaudeCode, adaptCodex, adaptCursor).
// REC-01: calls recoverOrphans on session_start.
// Agent detection: --source arg first, then event name matching.

import { basename, isAbsolute, resolve as resolvePath } from 'node:path'
import type { Agent, NormalizedEvent } from '@vibetime/core'
import { adaptClaudeCode, adaptCodex, adaptCursor, resolveProject } from '@vibetime/core'
import { readConfig } from './config.js'
import { appendLog } from './log.js'
import { notifyDesktop } from './notify.js'
import { reconcileCodexCompletedTurns, recoverOrphans } from './recovery.js'
import { closeDatabase, openDatabase, persistEvent } from './store.js'

/**
 * Detect agent type from event name or --source argument.
 * Primary: --source argument (Claude Code supports this).
 * Fallback: event name matching against known agent event types.
 * Returns null if agent cannot be determined.
 */
export function detectAgent(payload: Record<string, unknown>, argv: string[]): Agent | null {
  // Check --source argument first
  const sourceIdx = argv.indexOf('--source')
  const sourceArg = sourceIdx === -1 ? undefined : argv[sourceIdx + 1]
  if (sourceArg) {
    const source = sourceArg.toLowerCase()
    if (source === 'claude' || source === 'claude-code') return 'claude-code'
    if (source === 'codex') return 'codex'
    if (source === 'cursor') return 'cursor'
  }

  // Event name matching
  const eventName = (payload.hook_event_name || payload.event || '') as string

  // Claude Code events: UserPromptSubmit, Stop, SessionStart, SessionEnd
  if (['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd'].includes(eventName)) {
    return 'claude-code'
  }

  // Codex events (same names, no SessionEnd per adapter contract)
  if (['UserPromptSubmit', 'Stop', 'SessionStart'].includes(eventName)) {
    return 'codex'
  }

  // Cursor events (camelCase)
  if (['beforeSubmitPrompt', 'stop', 'sessionStart', 'sessionEnd'].includes(eventName)) {
    return 'cursor'
  }

  return null
}

/**
 * Get git remote URL for project resolution.
 * Uses Bun.spawnSync for fast execution — array args, no shell (T-03-08 mitigation).
 */
function getGitRemoteUrl(cwd: string): string | null {
  try {
    const result = Bun.spawnSync(['git', '-C', cwd, 'config', '--get', 'remote.origin.url'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (result.exitCode === 0 && result.stdout) {
      return result.stdout.toString().trim()
    }
    return null
  } catch {
    return null
  }
}

export function normalizeProjectCwd(rawCwd: string, currentCwd = process.cwd()): string {
  const cwd = typeof rawCwd === 'string' ? rawCwd.trim() : ''

  if (!cwd || cwd === '.') {
    return currentCwd
  }

  if (currentCwd && !isAbsolute(cwd)) {
    return cwd === basename(currentCwd) ? currentCwd : resolvePath(currentCwd, cwd)
  }

  return cwd
}

export function resolveHookProject(input: {
  rawCwd: string
  aliases?: Readonly<Record<string, string>>
  currentCwd?: string
  readGitRemoteUrl?: (cwd: string) => string | null
}): string {
  const cwd = normalizeProjectCwd(input.rawCwd, input.currentCwd ?? process.cwd())
  const readGitRemoteUrl = input.readGitRemoteUrl ?? getGitRemoteUrl

  return resolveProject({
    cwd,
    gitRemoteUrl: readGitRemoteUrl(cwd),
    ...(input.aliases ? { aliases: input.aliases } : {}),
  })
}

/**
 * Adapter dispatch map — maps Agent to the matching core adapter.
 */
const adapters: Record<
  Agent,
  (rawPayload: Record<string, unknown>, eventName: string) => NormalizedEvent | null
> = {
  'claude-code': adaptClaudeCode,
  codex: adaptCodex,
  cursor: adaptCursor,
}

/**
 * Run the hook in HOOK mode.
 * Reads stdin, parses JSON, detects agent, calls adapter, resolves project, persists to SQLite.
 * Always exits 0, even on error (HOOK-02, PRD §7).
 * No stdout/stderr output (HOOK-02) — errors go to hook.log.
 */
export async function runHook(): Promise<void> {
  let db: ReturnType<typeof openDatabase> | null = null

  try {
    // 1. Read stdin
    const raw = await Bun.stdin.text()
    if (!raw.trim()) {
      process.exit(0)
    }

    // 2. Parse JSON (T-03-07: JSON.parse in try/catch, exit 0 on failure)
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(raw)
    } catch (err) {
      appendLog(`Failed to parse stdin JSON: ${err}`)
      process.exit(0)
    }

    // 3. Detect agent
    const agent = detectAgent(payload, process.argv)
    if (!agent) {
      appendLog(`Could not detect agent from event: ${JSON.stringify(payload)}`)
      process.exit(0)
    }

    // 4. Call adapter (HOOK-04)
    const adapter = adapters[agent]
    const eventName = (payload.hook_event_name || payload.event || '') as string
    const event = adapter(payload, eventName)

    if (!event) {
      if (agent === 'codex' && (eventName === 'Stop' || eventName === 'UserPromptSubmit')) {
        appendLog(
          `Dropped codex hook event=${eventName} session_id_type=${typeof payload.session_id} turn_id_type=${typeof payload.turn_id} cwd_type=${typeof payload.cwd}`,
        )
      }
      // Adapter returned null — no-op event, silently exit
      process.exit(0)
    }

    // 5. Resolve project (Phase 2 decision — hook layer post-processes via resolveProject)
    const config = readConfig()
    event.project = resolveHookProject({
      rawCwd: event.project,
      aliases: config.projects,
    })

    // 6. Persist to SQLite
    db = openDatabase()
    if (agent === 'codex') {
      reconcileCodexCompletedTurns(db, event.session_id)
    }
    persistEvent(db, event)

    // 7. Crash recovery on session_start (REC-01)
    if (event.event_type === 'session_start') {
      recoverOrphans(db, event.session_id)
    }

    // 8. Notify the desktop app after the write transaction is complete.
    await notifyDesktop({
      type: 'db-changed',
      agent: event.agent,
      event_type: event.event_type,
      session_id: event.session_id,
      project: event.project,
      ts: event.ts,
    })
  } catch (err) {
    // Last line of defense — never throw (HOOK-02)
    appendLog(`Unhandled error in hook: ${err}`)
  } finally {
    // Close database connection
    if (db) {
      closeDatabase(db)
    }
    // Always exit 0 (HOOK-02, PRD §7)
    process.exit(0)
  }
}
