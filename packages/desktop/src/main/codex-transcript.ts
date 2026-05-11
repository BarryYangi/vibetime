import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CodexTurnCompletion } from '@vibetime/core'
import { findCodexTurnCompletionInTranscripts } from '@vibetime/core'

export interface FindCodexTurnCompletionInput {
  sessionId: string
  turnId: string
  startedAt: number
  homeDir?: string
}

// Cache transcript contents keyed by absolute path. mtime AND size are both
// checked because mtime can lag (cp -p, clock skew, network FS), and size can
// stay constant for in-place rewrites. Together they're a robust freshness
// signal for append-only jsonl transcripts.
type TranscriptCacheEntry = {
  mtimeMs: number
  size: number
  content: string
}
const transcriptCache = new Map<string, TranscriptCacheEntry>()
const TRANSCRIPT_CACHE_MAX = 32

function readTranscriptCached(transcriptPath: string): string | null {
  try {
    const stat = statSync(transcriptPath)
    const cached = transcriptCache.get(transcriptPath)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.content
    }
    const content = readFileSync(transcriptPath, 'utf8')
    transcriptCache.set(transcriptPath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      content,
    })
    if (transcriptCache.size > TRANSCRIPT_CACHE_MAX) {
      const oldest = transcriptCache.keys().next().value
      if (oldest !== undefined) transcriptCache.delete(oldest)
    }
    return content
  } catch {
    // File was deleted, moved, or otherwise inaccessible. Drop the stale cache
    // entry and bail. The caller already tolerates null transcripts.
    transcriptCache.delete(transcriptPath)
    return null
  }
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
  const homeDir = input.homeDir ?? homedir()
  if (!homeDir) return null

  const transcripts: Array<{ transcriptPath: string; content: string }> = []
  for (const transcriptPath of candidateTranscriptPaths(
    homeDir,
    input.sessionId,
    input.startedAt,
  )) {
    const content = readTranscriptCached(transcriptPath)
    if (content === null) continue
    transcripts.push({ transcriptPath, content })
  }

  return findCodexTurnCompletionInTranscripts({
    turnId: input.turnId,
    startedAt: input.startedAt,
    transcripts,
  })
}
