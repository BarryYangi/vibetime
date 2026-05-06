import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findCodexTaskCompletion } from './codex-transcript.js'

const tempDirs: string[] = []

function writeTranscript(
  homeDir: string,
  datePath: string,
  sessionId: string,
  lines: string[],
): string {
  const dir = join(homeDir, '.codex', 'sessions', datePath)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `rollout-2026-05-06T15-15-15-${sessionId}.jsonl`)
  writeFileSync(file, `${lines.join('\n')}\n`)
  return file
}

describe('findCodexTaskCompletion', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true })
    }
  })

  it('finds task_complete for the target turn in the started-at day transcript', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'vibetime-core-codex-'))
    tempDirs.push(homeDir)
    const sessionId = 'session-1'
    const turnId = 'turn-1'
    const transcriptPath = writeTranscript(homeDir, '2026/05/06', sessionId, [
      JSON.stringify({
        timestamp: '2026-05-06T09:30:01.935Z',
        payload: { type: 'task_started', turn_id: turnId },
      }),
      JSON.stringify({
        timestamp: '2026-05-06T09:30:04.043Z',
        payload: { type: 'task_complete', turn_id: turnId, completed_at: 1778059804 },
      }),
    ])

    expect(
      findCodexTaskCompletion({
        homeDir,
        sessionId,
        turnId,
        startedAt: 1778059801,
      }),
    ).toEqual({
      completedAt: 1778059804,
      transcriptPath,
    })
  })

  it('searches the previous day as a fallback window', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'vibetime-core-codex-'))
    tempDirs.push(homeDir)
    const sessionId = 'session-2'
    const turnId = 'turn-2'
    writeTranscript(homeDir, '2026/05/05', sessionId, [
      JSON.stringify({
        timestamp: '2026-05-05T23:59:59.000Z',
        payload: { type: 'task_complete', turn_id: turnId, completed_at: 1778025599 },
      }),
    ])

    expect(
      findCodexTaskCompletion({
        homeDir,
        sessionId,
        turnId,
        startedAt: 1778025000,
      }),
    ).toEqual({
      completedAt: 1778025599,
      transcriptPath: join(
        homeDir,
        '.codex',
        'sessions',
        '2026',
        '05',
        '05',
        `rollout-2026-05-06T15-15-15-${sessionId}.jsonl`,
      ),
    })
  })

  it('returns null when the turn has no task_complete', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'vibetime-core-codex-'))
    tempDirs.push(homeDir)
    const sessionId = 'session-3'
    writeTranscript(homeDir, '2026/05/06', sessionId, [
      JSON.stringify({
        timestamp: '2026-05-06T09:30:01.935Z',
        payload: { type: 'task_started', turn_id: 'turn-3' },
      }),
    ])

    expect(
      findCodexTaskCompletion({
        homeDir,
        sessionId,
        turnId: 'turn-3',
        startedAt: 1778059801,
      }),
    ).toBeNull()
  })
})
