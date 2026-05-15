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
      sourceRowKey: 'claude-session-1:req-claude-1:msg-claude-1',
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
      'claude-session-1:req-claude-1:msg-claude-1',
      'claude-session-1:req-claude-2:msg-claude-2',
      'claude-session-2:req-claude-3:msg-claude-3',
    ])
    expect(secondScan.records.map((record) => record.sourceRowKey)).toEqual(
      firstScan.records.map((record) => record.sourceRowKey),
    )
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
