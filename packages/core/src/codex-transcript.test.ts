import { describe, expect, it } from 'vitest'
import { findCodexTurnCompletionInTranscripts } from './codex-transcript.js'

describe('findCodexTurnCompletionInTranscripts', () => {
  it('finds task_complete for the target turn', () => {
    expect(
      findCodexTurnCompletionInTranscripts({
        turnId: 'turn-1',
        startedAt: 1778059801,
        transcripts: [
          {
            transcriptPath: '/tmp/session-1.jsonl',
            content: [
              JSON.stringify({
                timestamp: '2026-05-06T09:30:01.935Z',
                payload: { type: 'task_started', turn_id: 'turn-1' },
              }),
              JSON.stringify({
                timestamp: '2026-05-06T09:30:04.043Z',
                payload: { type: 'task_complete', turn_id: 'turn-1', completed_at: 1778059804 },
              }),
            ].join('\n'),
          },
        ],
      }),
    ).toEqual({
      completedAt: 1778059804,
      transcriptPath: '/tmp/session-1.jsonl',
    })
  })

  it('finds turn_aborted for an interrupted turn', () => {
    expect(
      findCodexTurnCompletionInTranscripts({
        turnId: 'turn-aborted',
        startedAt: 1778059801,
        transcripts: [
          {
            transcriptPath: '/tmp/session-aborted.jsonl',
            content: JSON.stringify({
              timestamp: '2026-05-06T09:30:03.000Z',
              payload: {
                type: 'turn_aborted',
                turn_id: 'turn-aborted',
                completed_at: 1778059803,
              },
            }),
          },
        ],
      }),
    ).toEqual({
      completedAt: 1778059803,
      transcriptPath: '/tmp/session-aborted.jsonl',
    })
  })

  it('uses the transcript timestamp when completed_at is floored before a fractional start', () => {
    expect(
      findCodexTurnCompletionInTranscripts({
        turnId: 'turn-fast-stop',
        startedAt: 1778059801.95,
        transcripts: [
          {
            transcriptPath: '/tmp/session-fast-stop.jsonl',
            content: JSON.stringify({
              timestamp: '2026-05-06T09:30:01.980Z',
              payload: {
                type: 'turn_aborted',
                turn_id: 'turn-fast-stop',
                completed_at: 1778059801,
              },
            }),
          },
        ],
      }),
    ).toEqual({
      completedAt: 1778059801.98,
      transcriptPath: '/tmp/session-fast-stop.jsonl',
    })
  })

  it('returns null when the turn has no completion marker', () => {
    expect(
      findCodexTurnCompletionInTranscripts({
        turnId: 'turn-3',
        startedAt: 1778059801,
        transcripts: [
          {
            transcriptPath: '/tmp/session-3.jsonl',
            content: JSON.stringify({
              timestamp: '2026-05-06T09:30:01.935Z',
              payload: { type: 'task_started', turn_id: 'turn-3' },
            }),
          },
        ],
      }),
    ).toBeNull()
  })

  it('ignores malformed transcript lines', () => {
    expect(
      findCodexTurnCompletionInTranscripts({
        turnId: 'turn-4',
        startedAt: 1778059801,
        transcripts: [
          {
            transcriptPath: '/tmp/session-4.jsonl',
            content: [
              'not json',
              JSON.stringify({
                timestamp: '2026-05-06T09:30:04.000Z',
                payload: { type: 'task_complete', turn_id: 'turn-4' },
              }),
            ].join('\n'),
          },
        ],
      }),
    ).toEqual({
      completedAt: 1778059804,
      transcriptPath: '/tmp/session-4.jsonl',
    })
  })
})
