export type HookUsageEventFixture = {
  agent: 'claude-code' | 'codex'
  event_type: 'turn_start' | 'turn_end'
  project: string
  session_id: string
  turn_id: string | null
  ts: number
  timezone: string
  duration_sec: number | null
  meta: Record<string, unknown> | null
}

export const HOOK_USAGE_EVENTS: HookUsageEventFixture[] = [
  {
    agent: 'codex',
    event_type: 'turn_start',
    project: 'vibetime',
    session_id: 'codex-session-1',
    turn_id: 'codex-turn-1',
    ts: 1778806800,
    timezone: 'Asia/Shanghai',
    duration_sec: null,
    meta: { model: 'gpt-5-codex' },
  },
  {
    agent: 'codex',
    event_type: 'turn_end',
    project: 'vibetime',
    session_id: 'codex-session-1',
    turn_id: 'codex-turn-1',
    ts: 1778806872,
    timezone: 'Asia/Shanghai',
    duration_sec: 72,
    meta: { model: 'gpt-5-codex' },
  },
  {
    agent: 'claude-code',
    event_type: 'turn_end',
    project: 'vibetime',
    session_id: 'claude-session-1',
    turn_id: 'claude-turn-window',
    ts: 1778814285,
    timezone: 'Asia/Shanghai',
    duration_sec: 360,
    meta: { model: 'claude-sonnet-4-5' },
  },
  {
    agent: 'claude-code',
    event_type: 'turn_end',
    project: 'fallback-project',
    session_id: 'claude-session-project-fallback',
    turn_id: null,
    ts: 1778814600,
    timezone: 'Asia/Shanghai',
    duration_sec: 180,
    meta: { model: 'claude-sonnet-4-5' },
  },
  {
    agent: 'codex',
    event_type: 'turn_end',
    project: '_unknown',
    session_id: 'codex-unmatched-session',
    turn_id: 'codex-unmatched-turn',
    ts: 1778816400,
    timezone: 'Asia/Shanghai',
    duration_sec: 45,
    meta: null,
  },
]
