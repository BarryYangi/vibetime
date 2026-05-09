import { describe, expect, it } from 'vitest'
import { adaptGeminiCli } from './gemini-cli.js'

describe('adaptGeminiCli', () => {
  it('BeforeAgent -> turn_start with derived turn_id', () => {
    const event = adaptGeminiCli(
      {
        session_id: 'gemini-session',
        cwd: '/Users/barry/project',
        hook_event_name: 'BeforeAgent',
        timestamp: '2026-05-09T12:34:56.789Z',
        prompt: 'ship it',
      },
      'BeforeAgent',
    )

    expect(event?.agent).toBe('gemini-cli')
    expect(event?.event_type).toBe('turn_start')
    expect(event?.project).toBe('/Users/barry/project')
    expect(event?.session_id).toBe('gemini-session')
    expect(event?.turn_id).toBe('gemini-session-1778330096789')
    expect(event?.ts).toBe(1778330096.789)
  })

  it('BeforeAgent keeps model meta when present on the payload', () => {
    const event = adaptGeminiCli(
      {
        session_id: 'gemini-session',
        cwd: '/x',
        hook_event_name: 'BeforeAgent',
        timestamp: '2026-05-09T12:34:56.789Z',
        llm_request: { model: 'gemini-3-pro' },
      },
      'BeforeAgent',
    )

    expect(event?.event_type).toBe('turn_start')
    expect(event?.meta).toEqual({ model: 'gemini-3-pro' })
  })

  it('BeforeModel -> turn_start metadata enrichment with model and no turn_id', () => {
    const event = adaptGeminiCli(
      {
        session_id: 'gemini-session',
        cwd: '/x',
        hook_event_name: 'BeforeModel',
        timestamp: '2026-05-09T12:34:57.000Z',
        llm_request: { model: 'gemini-3-pro' },
      },
      'BeforeModel',
    )

    expect(event?.event_type).toBe('turn_start')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.meta).toEqual({ model: 'gemini-3-pro' })
  })

  it('AfterAgent -> turn_end without turn_id for store-side pairing', () => {
    const event = adaptGeminiCli(
      {
        session_id: 'gemini-session',
        cwd: '/Users/barry/project',
        hook_event_name: 'AfterAgent',
        timestamp: '2026-05-09T12:35:26.789Z',
        prompt: 'ship it',
        prompt_response: 'done',
      },
      'AfterAgent',
    )

    expect(event?.agent).toBe('gemini-cli')
    expect(event?.event_type).toBe('turn_end')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.ts).toBe(1778330126.789)
  })

  it('SessionStart -> session_start with source meta', () => {
    const event = adaptGeminiCli(
      {
        session_id: 'gemini-session',
        cwd: '/x',
        hook_event_name: 'SessionStart',
        timestamp: '2026-05-09T12:00:00.000Z',
        source: 'startup',
      },
      'SessionStart',
    )

    expect(event?.event_type).toBe('session_start')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.meta).toEqual({ source: 'startup' })
  })

  it('SessionEnd -> session_end with reason meta', () => {
    const event = adaptGeminiCli(
      {
        session_id: 'gemini-session',
        cwd: '/x',
        hook_event_name: 'SessionEnd',
        timestamp: '2026-05-09T12:00:00.000Z',
        reason: 'exit',
      },
      'SessionEnd',
    )

    expect(event?.event_type).toBe('session_end')
    expect(event && 'turn_id' in event).toBe(false)
    expect(event?.meta).toEqual({ reason: 'exit' })
  })

  it('returns null on unknown event name', () => {
    expect(adaptGeminiCli({ session_id: 's', cwd: '/x' }, 'AfterModel')).toBeNull()
  })

  it('returns null on missing required base fields', () => {
    expect(adaptGeminiCli({ session_id: 's' }, 'BeforeAgent')).toBeNull()
    expect(adaptGeminiCli({ cwd: '/x' }, 'BeforeAgent')).toBeNull()
  })

  it('never throws on null input', () => {
    expect(() => adaptGeminiCli(null, 'BeforeAgent')).not.toThrow()
    expect(adaptGeminiCli(null, 'BeforeAgent')).toBeNull()
  })
})
