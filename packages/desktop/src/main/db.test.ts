import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

async function loadDbModule() {
  return import('./db')
}

function makeCompletedTurn(input: {
  project: string
  turnId: string
  start: number
  end: number
  agent?: string
}) {
  const agent = input.agent ?? 'codex'
  return [
    {
      schema_version: 1,
      agent,
      event_type: 'turn_start',
      project: input.project,
      session_id: 'session-1',
      turn_id: input.turnId,
      ts: input.start,
      timezone: 'Asia/Shanghai',
      duration_sec: null,
      meta: null,
    },
    {
      schema_version: 1,
      agent,
      event_type: 'turn_end',
      project: input.project,
      session_id: 'session-1',
      turn_id: input.turnId,
      ts: input.end,
      timezone: 'Asia/Shanghai',
      duration_sec: input.end - input.start,
      meta: null,
    },
  ]
}

describe('queryHistorySummary', () => {
  it('returns a dense 365-day calendar', async () => {
    const { buildHistorySummaryFromEvents } = await loadDbModule()
    const now = new Date(2026, 4, 7, 12, 0, 0)
    const end = Math.floor(now.getTime() / 1000)
    const events = makeCompletedTurn({ project: 'alpha', turnId: 'turn-1', start: end - 120, end })

    const summary = buildHistorySummaryFromEvents(events as never, { periodDays: 30, now })

    expect(summary.calendar).toHaveLength(365)
    expect(summary.calendar.some((day) => day.total > 0)).toBe(true)
    expect(summary.hourlyMatrix).toHaveLength(7 * 24)
    expect(summary.hourlyMatrix.some((cell) => cell.total > 0)).toBe(true)
    expect(summary.turnDurations).toHaveLength(1)
    expect(summary.projectAgentTotals[0]?.project).toBe('alpha')
    expect(summary.periodCompare.currentTotal).toBeGreaterThan(0)
  })

  it('groups trend data into Top 5 plus Others', async () => {
    const { buildHistorySummaryFromEvents } = await loadDbModule()
    const now = new Date(2026, 4, 7, 12, 0, 0)
    const end = Math.floor(now.getTime() / 1000)
    const events = []

    for (let i = 0; i < 7; i += 1) {
      events.push(
        ...makeCompletedTurn({
          project: `project-${i}`,
          turnId: `turn-${i}`,
          start: end - 60 * (i + 1),
          end: end - 60 * i,
        }),
      )
    }

    const summary = buildHistorySummaryFromEvents(events as never, { periodDays: 30, now })

    expect(summary.trendProjects).toContain('Others')
    expect(summary.trendProjects.length).toBeLessThanOrEqual(6)
  })
})

describe('formatMenubarTitle', () => {
  it('formats idle and duration threshold states', async () => {
    const { formatMenubarTitle } = await loadDbModule()

    expect(
      formatMenubarTitle({ todayTotal: 0, active: false, projects: [], activeTurns: [] }),
    ).toBe('●')
    expect(formatMenubarTitle({ todayTotal: 0, active: true, projects: [], activeTurns: [] })).toBe(
      '● <1m',
    )
    expect(
      formatMenubarTitle({ todayTotal: 42, active: true, projects: [], activeTurns: [] }),
    ).toBe('● <1m')
    expect(
      formatMenubarTitle({ todayTotal: 47 * 60, active: false, projects: [], activeTurns: [] }),
    ).toBe('● 47m')
    expect(
      formatMenubarTitle({
        todayTotal: 5 * 3600 + 23 * 60,
        active: true,
        projects: [],
        activeTurns: [],
      }),
    ).toBe('● 5h 23m')
    expect(
      formatMenubarTitle({ todayTotal: 5 * 3600, active: false, projects: [], activeTurns: [] }),
    ).toBe('● 5h')
  })
})
