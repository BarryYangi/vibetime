import { describe, expect, it } from 'vitest'
import { DDL_USAGE_PRICING_CACHE, DDL_USAGE_RECORDS, DDL_USAGE_SCAN_STATE } from '../schema.js'
import { USAGE_AGENTS, USAGE_REFRESH_FREQUENCIES } from './types.js'

describe('usage contracts', () => {
  it('keeps usage scope limited to claude code and codex', () => {
    expect(USAGE_AGENTS).toEqual(['claude-code', 'codex'])
  })

  it('defines supported usage refresh frequencies', () => {
    expect(USAGE_REFRESH_FREQUENCIES).toEqual(['15m', '30m', '1h', '4h'])
  })

  it('defines idempotent usage storage ddl without transcript fields', () => {
    expect(DDL_USAGE_RECORDS).toContain('CREATE TABLE usage_records')
    expect(DDL_USAGE_RECORDS).toContain('UNIQUE(agent, source_file_key, source_row_key)')
    expect(DDL_USAGE_SCAN_STATE).toContain('CREATE TABLE usage_scan_state')
    expect(DDL_USAGE_PRICING_CACHE).toContain('CREATE TABLE usage_pricing_cache')

    const ddl = [DDL_USAGE_RECORDS, DDL_USAGE_SCAN_STATE, DDL_USAGE_PRICING_CACHE].join('\n')
    for (const key of [
      'prompt',
      'response',
      'tool_args',
      'arguments',
      'content',
      'rawTranscript',
      'transcript_line',
    ]) {
      expect(ddl).not.toContain(key)
    }
  })
})
