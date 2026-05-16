import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { scanCodexUsageTranscript, scanCodexUsageTranscripts } from './codex-scanner.js'

function readFixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
}

describe('scanCodexUsageTranscript', () => {
  it('extracts last_token_usage deltas', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/codex-token-count.jsonl',
      sourceFileBasename: 'codex-token-count.jsonl',
      content: readFixture('codex-token-count.jsonl'),
    })

    const first = result.records.find((record) => record.turnId === 'codex-turn-1')

    expect(first).toMatchObject({
      agent: 'codex',
      sourceFileKey: 'codex/sessions/codex-token-count.jsonl',
      sourceFileBasename: 'codex-token-count.jsonl',
      sessionId: 'codex-session-1',
      turnId: 'codex-turn-1',
      project: null,
      ts: 1778806812,
      model: 'gpt-5-codex',
      attributionMethod: 'unmatched',
      attributionConfidence: 0,
      meta: { sourceKind: 'codex-token-count' },
      tokens: {
        inputTokens: 1200,
        cachedInputTokens: 300,
        cacheCreationInputTokens: 0,
        outputTokens: 210,
        reasoningOutputTokens: 48,
        totalTokens: 1410,
      },
    })
  })

  it('falls back to cumulative total_token_usage deltas', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/codex-token-count.jsonl',
      sourceFileBasename: 'codex-token-count.jsonl',
      content: readFixture('codex-token-count.jsonl'),
    })

    const deltas = result.records
      .filter((record) => record.turnId === 'codex-turn-2')
      .map((record) => record.tokens)

    expect(deltas).toEqual([
      {
        inputTokens: 800,
        cachedInputTokens: 160,
        cacheCreationInputTokens: 0,
        outputTokens: 300,
        reasoningOutputTokens: 72,
        totalTokens: 1100,
      },
      {
        inputTokens: 550,
        cachedInputTokens: 60,
        cacheCreationInputTokens: 0,
        outputTokens: 180,
        reasoningOutputTokens: 30,
        totalTokens: 730,
      },
    ])
  })

  it('preserves cached input output and reasoning tokens', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/codex-token-count.jsonl',
      sourceFileBasename: 'codex-token-count.jsonl',
      content: readFixture('codex-token-count.jsonl'),
    })

    expect(result.records.map((record) => record.tokens.cachedInputTokens)).toEqual([
      300, 160, 60, 0,
    ])
    expect(result.records.map((record) => record.tokens.outputTokens)).toEqual([210, 300, 180, 96])
    expect(result.records.map((record) => record.tokens.reasoningOutputTokens)).toEqual([
      48, 72, 30, 0,
    ])
    expect(result.records[0]?.tokens.totalTokens).toBe(1410)
  })

  it('includes cache tokens when total_tokens is absent', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/no-total.jsonl',
      sourceFileBasename: 'no-total.jsonl',
      content: JSON.stringify({
        timestamp: '2026-05-15T03:00:00.000Z',
        type: 'token_count',
        session_id: 'codex-session-no-total',
        turn_id: 'codex-turn-no-total',
        model: 'gpt-5-codex',
        last_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 40,
          cache_creation_input_tokens: 10,
          output_tokens: 20,
          reasoning_output_tokens: 5,
        },
      }),
    })

    expect(result.records[0]?.tokens).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 40,
      cacheCreationInputTokens: 0,
      outputTokens: 20,
      reasoningOutputTokens: 5,
      totalTokens: 120,
    })
  })

  it('extracts current Codex event_msg payload.info token counts', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/current-shape.jsonl',
      sourceFileBasename: 'current-shape.jsonl',
      content: [
        JSON.stringify({
          timestamp: '2026-05-15T03:59:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'real-codex-session',
            cwd: '/Users/barry/Documents/Project/i/vibetime',
            git: {
              repository_url: 'https://github.com/BarryYangi/vibetime.git',
            },
            model_provider: 'openai',
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T04:00:00.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'real-codex-turn',
            cwd: '/Users/barry/Documents/Project/i/vibetime',
            model: 'gpt-5.5',
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T04:00:12.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 30,
                reasoning_output_tokens: 5,
                total_tokens: 155,
              },
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 30,
                reasoning_output_tokens: 5,
                total_tokens: 155,
              },
            },
          },
        }),
      ].join('\n'),
    })

    expect(result.records).toEqual([
      expect.objectContaining({
        sessionId: 'real-codex-session',
        turnId: 'real-codex-turn',
        project: 'BarryYangi/vibetime',
        ts: 1778817612,
        model: 'gpt-5.5',
        tokens: {
          inputTokens: 100,
          cachedInputTokens: 20,
          cacheCreationInputTokens: 0,
          outputTokens: 30,
          reasoningOutputTokens: 5,
          totalTokens: 130,
        },
      }),
    ])
  })

  it('keeps a resolved Codex project label when a later Windows cwd appears', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/windows-cwd.jsonl',
      sourceFileBasename: 'windows-cwd.jsonl',
      content: [
        JSON.stringify({
          timestamp: '2026-05-15T03:59:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-windows',
            project: 'vibetime',
            model_provider: 'openai',
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T04:00:00.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'codex-turn-windows',
            cwd: 'C:\\Users\\barry\\Documents\\Project\\i\\vibetime',
            model: 'gpt-5.5',
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T04:00:12.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 30,
                reasoning_output_tokens: 5,
              },
            },
          },
        }),
      ].join('\n'),
    })

    expect(result.records[0]).toMatchObject({
      project: 'vibetime',
      turnId: 'codex-turn-windows',
    })
  })

  it('ignores malformed rows', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/malformed.jsonl',
      sourceFileBasename: 'malformed.jsonl',
      content: [
        'not-json',
        JSON.stringify({
          timestamp: '2026-05-15T03:00:00.000Z',
          type: 'token_count',
          session_id: 'codex-session-malformed',
          turn_id: 'codex-turn-malformed',
          model: 'gpt-5',
          last_token_usage: {
            input_tokens: 10,
            cached_input_tokens: 0,
            output_tokens: 5,
            reasoning_output_tokens: 0,
            total_tokens: 15,
          },
        }),
      ].join('\n'),
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0]?.sessionId).toBe('codex-session-malformed')
  })

  it('keeps duplicate source keys stable', () => {
    const candidate = {
      sourceFileKey: 'codex/sessions/codex-duplicate-session.jsonl',
      sourceFileBasename: 'codex-duplicate-session.jsonl',
      content: readFixture('codex-duplicate-session.jsonl'),
    }

    const firstScan = scanCodexUsageTranscript(candidate)
    const secondScan = scanCodexUsageTranscripts([candidate])

    expect(firstScan.records.map((record) => record.sourceRowKey)).toEqual([
      'codex-session-dup:0001',
      'codex-session-dup:0002',
    ])
    expect(secondScan.records.map((record) => record.sourceRowKey)).toEqual(
      firstScan.records.map((record) => record.sourceRowKey),
    )
  })

  it('does not deduplicate separate Codex token rows that share a turn id', () => {
    const result = scanCodexUsageTranscript({
      sourceFileKey: 'codex/sessions/shared-turn-id.jsonl',
      sourceFileBasename: 'shared-turn-id.jsonl',
      content: [
        JSON.stringify({
          timestamp: '2026-05-15T03:00:00.000Z',
          type: 'turn_context',
          payload: { turn_id: 'codex-turn-shared', model: 'gpt-5.5' },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T03:00:10.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            id: 'codex-turn-shared',
            info: {
              last_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 30,
                reasoning_output_tokens: 5,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T03:00:20.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            id: 'codex-turn-shared',
            info: {
              last_token_usage: {
                input_tokens: 50,
                cached_input_tokens: 10,
                output_tokens: 15,
                reasoning_output_tokens: 2,
              },
            },
          },
        }),
      ].join('\n'),
    })

    expect(result.records).toHaveLength(2)
    expect(result.records.map((record) => record.turnId)).toEqual([
      'codex-turn-shared',
      'codex-turn-shared',
    ])
    expect(result.records.map((record) => record.tokens.totalTokens)).toEqual([130, 65])
  })
})
