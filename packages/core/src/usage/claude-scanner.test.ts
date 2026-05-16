import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { scanClaudeUsageTranscript, scanClaudeUsageTranscripts } from './claude-scanner.js'

function readFixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
}

describe('scanClaudeUsageTranscript', () => {
  it('extracts assistant message usage', () => {
    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude/projects/vibetime/assistant.jsonl',
      sourceFileBasename: 'assistant.jsonl',
      content: readFixture('claude-assistant-usage.jsonl'),
    })

    expect(result.records[0]).toMatchObject({
      agent: 'claude-code',
      sourceFileKey: 'claude/projects/vibetime/assistant.jsonl',
      sourceFileBasename: 'assistant.jsonl',
      sourceRowKey: 'claude-session-1:msg-claude-1:req-claude-1',
      sessionId: 'claude-session-1',
      turnId: null,
      project: null,
      ts: 1778814000,
      model: 'claude-sonnet-4-5',
      attributionMethod: 'unmatched',
      attributionConfidence: 0,
      meta: { isSidechain: false, sourceKind: 'claude-assistant-usage' },
      tokens: {
        inputTokens: 1800,
        cachedInputTokens: 620,
        cacheCreationInputTokens: 240,
        outputTokens: 360,
        reasoningOutputTokens: 0,
        totalTokens: 3020,
      },
    })
  })

  it('preserves cache creation and read tokens from cache_creation_input_tokens and cache_read_input_tokens', () => {
    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude/projects/vibetime/assistant.jsonl',
      sourceFileBasename: 'assistant.jsonl',
      content: readFixture('claude-assistant-usage.jsonl'),
    })

    expect(result.records[1]?.tokens.cacheCreationInputTokens).toBe(0)
    expect(result.records[1]?.tokens.cachedInputTokens).toBe(300)
    expect(result.records[1]?.meta).toEqual({
      isSidechain: true,
      subagentType: 'reviewer',
      sourceKind: 'claude-assistant-usage',
      claudePathRole: 'parent',
      modelProvider: 'anthropic',
    })
  })

  it('deduplicates streaming assistant rows', () => {
    const candidate = {
      sourceFileKey: 'claude/projects/vibetime/assistant.jsonl',
      sourceFileBasename: 'assistant.jsonl',
      content: readFixture('claude-assistant-usage.jsonl'),
    }

    const firstScan = scanClaudeUsageTranscript(candidate)
    const secondScan = scanClaudeUsageTranscripts([candidate])

    expect(firstScan.records).toHaveLength(3)
    expect(firstScan.records.map((record) => record.sourceRowKey)).toEqual([
      'claude-session-1:msg-claude-1:req-claude-1',
      'claude-session-1:msg-claude-2:req-claude-2',
      'claude-session-2:msg-claude-3:req-claude-3',
    ])
    expect(secondScan.records.map((record) => record.sourceRowKey)).toEqual(
      firstScan.records.map((record) => record.sourceRowKey),
    )
  })

  it('keeps the most complete streaming chunk for the same message and request id', () => {
    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude/projects/vibetime/streaming.jsonl',
      sourceFileBasename: 'streaming.jsonl',
      content: [
        JSON.stringify({
          timestamp: '2026-05-15T03:00:00.000Z',
          sessionId: 'claude-session-stream',
          requestId: 'req-stream',
          type: 'assistant',
          message: {
            id: 'msg-stream',
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 100, output_tokens: 20 },
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T03:00:01.000Z',
          sessionId: 'claude-session-stream',
          requestId: 'req-stream',
          type: 'assistant',
          message: {
            id: 'msg-stream',
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 100, cache_read_input_tokens: 40, output_tokens: 90 },
          },
        }),
      ].join('\n'),
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      sourceRowKey: 'claude-session-stream:msg-stream:req-stream',
      tokens: expect.objectContaining({ totalTokens: 230 }),
    })
  })

  it('keeps the final streaming chunk to match Claude log semantics', () => {
    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude/projects/vibetime/streaming-final.jsonl',
      sourceFileBasename: 'streaming-final.jsonl',
      content: [
        JSON.stringify({
          timestamp: '2026-05-15T03:00:00.000Z',
          sessionId: 'claude-session-stream',
          requestId: 'req-stream',
          type: 'assistant',
          message: {
            id: 'msg-stream',
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 100, cache_read_input_tokens: 40, output_tokens: 90 },
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T03:00:01.000Z',
          sessionId: 'claude-session-stream',
          requestId: 'req-stream',
          type: 'assistant',
          message: {
            id: 'msg-stream',
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 100, output_tokens: 20 },
          },
        }),
      ].join('\n'),
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      sourceRowKey: 'claude-session-stream:msg-stream:req-stream',
      tokens: expect.objectContaining({ totalTokens: 120 }),
    })
  })

  it('deduplicates parent and subagent copies by canonical Claude row identity', () => {
    const parent = {
      sourceFileKey: 'claude:parent:session.jsonl',
      sourceFileBasename: 'session.jsonl',
      sourcePath: '/Users/barry/.claude/projects/vibetime/session.jsonl',
      content: JSON.stringify({
        timestamp: '2026-05-15T03:00:00.000Z',
        sessionId: 'claude-session-cross-file',
        requestId: 'req-cross-file',
        type: 'assistant',
        isSidechain: false,
        message: {
          id: 'msg-cross-file',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    }
    const subagent = {
      sourceFileKey: 'claude:subagent:session.jsonl',
      sourceFileBasename: 'session.jsonl',
      sourcePath: '/Users/barry/.claude/projects/vibetime/subagents/session.jsonl',
      content: JSON.stringify({
        timestamp: '2026-05-15T03:00:00.000Z',
        sessionId: 'claude-session-cross-file',
        requestId: 'req-cross-file',
        type: 'assistant',
        isSidechain: true,
        message: {
          id: 'msg-cross-file',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    }

    const result = scanClaudeUsageTranscripts([subagent, parent])

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      sourceFileKey: 'claude:parent:session.jsonl',
      sourceRowKey: 'claude-session-cross-file:msg-cross-file:req-cross-file',
      meta: expect.objectContaining({
        isSidechain: false,
        claudePathRole: 'parent',
      }),
    })
  })

  it('detects Claude subagent logs from Windows paths', () => {
    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude:windows-subagent:session.jsonl',
      sourceFileBasename: 'session.jsonl',
      sourcePath: 'C:\\Users\\barry\\.claude\\projects\\vibetime\\subagents\\session.jsonl',
      content: JSON.stringify({
        timestamp: '2026-05-15T03:00:00.000Z',
        sessionId: 'claude-session-windows-subagent',
        requestId: 'req-windows-subagent',
        type: 'assistant',
        message: {
          id: 'msg-windows-subagent',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    })

    expect(result.records[0]?.meta).toMatchObject({
      claudePathRole: 'subagent',
    })
  })

  it('uses alternate session id fields for canonical Claude dedupe', () => {
    const parent = {
      sourceFileKey: 'claude:parent:session.jsonl',
      sourceFileBasename: 'session.jsonl',
      sourcePath: '/Users/barry/.claude/projects/vibetime/session.jsonl',
      content: JSON.stringify({
        timestamp: '2026-05-15T03:00:00.000Z',
        session_id: 'claude-session-snake-case',
        request_id: 'req-snake-case',
        type: 'assistant',
        message: {
          id: 'msg-snake-case',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    }
    const subagent = {
      sourceFileKey: 'claude:subagent:session.jsonl',
      sourceFileBasename: 'session.jsonl',
      sourcePath: '/Users/barry/.claude/projects/vibetime/subagents/session.jsonl',
      content: JSON.stringify({
        timestamp: '2026-05-15T03:00:00.000Z',
        metadata: { sessionId: 'claude-session-snake-case' },
        request_id: 'req-snake-case',
        type: 'assistant',
        isSidechain: true,
        message: {
          id: 'msg-snake-case',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
    }

    const result = scanClaudeUsageTranscripts([subagent, parent])

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      sourceFileKey: 'claude:parent:session.jsonl',
      sourceRowKey: 'claude-session-snake-case:msg-snake-case:req-snake-case',
      sessionId: 'claude-session-snake-case',
    })
  })

  it('handles missing optional fields', () => {
    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude/projects/vibetime/assistant.jsonl',
      sourceFileBasename: 'assistant.jsonl',
      content: readFixture('claude-assistant-usage.jsonl'),
    })

    expect(result.records[2]).toMatchObject({
      sessionId: 'claude-session-2',
      model: 'unknown-future-model',
      meta: { sourceKind: 'claude-assistant-usage' },
      tokens: {
        inputTokens: 510,
        cachedInputTokens: 0,
        cacheCreationInputTokens: 0,
        outputTokens: 70,
        reasoningOutputTokens: 0,
        totalTokens: 580,
      },
    })
  })

  it('skips synthetic zero-usage rows and preserves cwd for project attribution', () => {
    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude/projects/vibetime/synthetic.jsonl',
      sourceFileBasename: 'synthetic.jsonl',
      content: [
        JSON.stringify({
          timestamp: '2026-05-15T03:00:00.000Z',
          cwd: '/Users/barry/Documents/Project/i/vibetime',
          sessionId: 'claude-session-synthetic',
          requestId: 'req-synthetic',
          type: 'assistant',
          message: {
            id: 'msg-synthetic',
            model: '<synthetic>',
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
        JSON.stringify({
          timestamp: '2026-05-15T03:01:00.000Z',
          cwd: '/Users/barry/Documents/Project/i/vibetime',
          sessionId: 'claude-session-real',
          requestId: 'req-real',
          type: 'assistant',
          message: {
            id: 'msg-real',
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 12, output_tokens: 3 },
          },
        }),
      ].join('\n'),
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      sessionId: 'claude-session-real',
      project: '/Users/barry/Documents/Project/i/vibetime',
      model: 'claude-sonnet-4-5',
      tokens: expect.objectContaining({ totalTokens: 15 }),
    })
  })

  it('drops privacy canary content from output', () => {
    const fixture = readFixture('claude-privacy-canary.jsonl')
    expect(fixture).toContain('SECRET_PROMPT_CANARY')
    expect(fixture).toContain('SECRET_RESPONSE_CANARY')
    expect(fixture).toContain('SECRET_TOOL_ARG_CANARY')

    const result = scanClaudeUsageTranscript({
      sourceFileKey: 'claude/projects/vibetime/privacy.jsonl',
      sourceFileBasename: 'privacy.jsonl',
      content: fixture,
    })

    const serialized = JSON.stringify(result)
    expect(result.records).toHaveLength(1)
    expect(serialized).not.toContain('SECRET_PROMPT_CANARY')
    expect(serialized).not.toContain('SECRET_RESPONSE_CANARY')
    expect(serialized).not.toContain('SECRET_TOOL_ARG_CANARY')
  })
})
