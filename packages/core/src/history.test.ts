import { describe, expect, it } from 'vitest'
import { buildHistorySummaryFromEvents, type HistoryEvent, isHistoryPeriodDays } from './history.js'

function makeCompletedTurn(input: {
  project: string
  turnId: string
  start: number
  end: number
  agent?: string
}): HistoryEvent[] {
  const agent = input.agent ?? 'codex'
  return [
    {
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

describe('buildHistorySummaryFromEvents', () => {
  it('returns the GUI History summary shape from completed turns', () => {
    const now = new Date(2026, 4, 7, 12, 0, 0)
    const end = Math.floor(now.getTime() / 1000)
    const events = makeCompletedTurn({
      project: 'alpha',
      turnId: 'turn-1',
      start: end - 25 * 60,
      end,
    })

    const summary = buildHistorySummaryFromEvents(events, { periodDays: 30, now })

    expect(summary.periodDays).toBe(30)
    expect(summary.calendar).toHaveLength(365)
    expect(summary.calendar.some((day) => day.total > 0)).toBe(true)
    expect(summary.hourlyMatrix).toHaveLength(7 * 24)
    expect(summary.hourlyMatrix.some((cell) => cell.total > 0)).toBe(true)
    expect(summary.turnDurations).toHaveLength(1)
    expect(summary.topProjects[0]).toMatchObject({
      project: 'alpha',
      total: 25 * 60,
      turns: 1,
    })
    expect(summary.projectAgentTotals[0]?.project).toBe('alpha')
    expect(summary.periodCompare.currentTotal).toBe(25 * 60)
  })

  it('groups trend data into top 5 plus Others', () => {
    const now = new Date(2026, 4, 7, 12, 0, 0)
    const end = Math.floor(now.getTime() / 1000)
    const events: HistoryEvent[] = []

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

    const summary = buildHistorySummaryFromEvents(events, { periodDays: 30, now })

    expect(summary.trendProjects).toContain('Others')
    expect(summary.trendProjects.length).toBeLessThanOrEqual(6)
  })

  it('ignores abandoned and stale synthetic turn ends', () => {
    const now = new Date(2026, 4, 7, 12, 0, 0)
    const end = Math.floor(now.getTime() / 1000)
    const events: HistoryEvent[] = [
      ...makeCompletedTurn({
        project: 'alpha',
        turnId: 'turn-1',
        start: end - 60,
        end,
      }),
      {
        agent: 'codex',
        event_type: 'turn_end',
        project: 'alpha',
        session_id: 'session-1',
        turn_id: 'turn-stale',
        ts: end,
        timezone: 'Asia/Shanghai',
        duration_sec: null,
        meta: JSON.stringify({ reason: 'stale_sweep' }),
      },
    ]

    const summary = buildHistorySummaryFromEvents(events, { periodDays: 30, now })

    expect(summary.periodCompare.currentTotal).toBe(60)
    expect(summary.turnDurations).toHaveLength(1)
  })
})

describe('isHistoryPeriodDays', () => {
  it('accepts only supported GUI History periods', () => {
    expect(isHistoryPeriodDays(7)).toBe(true)
    expect(isHistoryPeriodDays(30)).toBe(true)
    expect(isHistoryPeriodDays(90)).toBe(true)
    expect(isHistoryPeriodDays(365)).toBe(true)
    expect(isHistoryPeriodDays(14)).toBe(false)
  })
})
