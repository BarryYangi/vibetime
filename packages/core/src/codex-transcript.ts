import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface FindCodexTaskCompletionInput {
  sessionId: string
  turnId: string
  startedAt: number
  homeDir?: string
}

export interface CodexTaskCompletion {
  completedAt: number
  transcriptPath: string
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function sessionDayDir(homeDir: string, epochSec: number): string {
  const date = new Date(epochSec * 1000)
  return join(
    homeDir,
    '.codex',
    'sessions',
    String(date.getFullYear()),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  )
}

function candidateTranscriptPaths(homeDir: string, sessionId: string, startedAt: number): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  for (const dayOffset of [-1, 0, 1]) {
    const dir = sessionDayDir(homeDir, startedAt + dayOffset * 24 * 60 * 60)
    if (!existsSync(dir)) continue

    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.jsonl') || !entry.includes(sessionId)) continue
      const fullPath = join(dir, entry)
      if (seen.has(fullPath)) continue
      seen.add(fullPath)
      results.push(fullPath)
    }
  }

  return results
}

export function findCodexTaskCompletion(
  input: FindCodexTaskCompletionInput,
): CodexTaskCompletion | null {
  const homeDir = input.homeDir ?? process.env.HOME
  if (!homeDir) return null

  const candidates = candidateTranscriptPaths(homeDir, input.sessionId, input.startedAt)
  for (const transcriptPath of candidates) {
    const lines = readFileSync(transcriptPath, 'utf8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const record = JSON.parse(line) as {
          timestamp?: string
          payload?: { type?: string; turn_id?: string; completed_at?: unknown }
        }

        if (
          record.payload?.type !== 'task_complete' ||
          record.payload.turn_id !== input.turnId
        ) {
          continue
        }

        const completedAt =
          typeof record.payload.completed_at === 'number'
            ? record.payload.completed_at
            : record.timestamp
              ? Math.floor(new Date(record.timestamp).getTime() / 1000)
              : NaN

        if (!Number.isFinite(completedAt) || completedAt < input.startedAt) continue

        return { completedAt, transcriptPath }
      } catch {
        continue
      }
    }
  }

  return null
}
