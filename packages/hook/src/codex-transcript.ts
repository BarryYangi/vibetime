import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CodexTurnCompletion } from '@vibetime/core'
import { findCodexTurnCompletionInTranscripts } from '@vibetime/core'

export interface FindCodexTurnCompletionInput {
  sessionId: string
  turnId: string
  startedAt: number
  homeDir?: string
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

export function findCodexTurnCompletion(
  input: FindCodexTurnCompletionInput,
): CodexTurnCompletion | null {
  const homeDir = input.homeDir ?? process.env.HOME
  if (!homeDir) return null

  const transcripts = candidateTranscriptPaths(homeDir, input.sessionId, input.startedAt).map(
    (transcriptPath) => ({
      transcriptPath,
      content: readFileSync(transcriptPath, 'utf8'),
    }),
  )

  return findCodexTurnCompletionInTranscripts({
    turnId: input.turnId,
    startedAt: input.startedAt,
    transcripts,
  })
}
