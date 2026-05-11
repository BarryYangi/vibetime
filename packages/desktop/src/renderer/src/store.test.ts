import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HistoryPeriodDays,
  HistorySummary,
  TodayLiveState,
  TodaySummary,
} from '../../shared/ipc-types'
import {
  clearActiveHistoryPeriod,
  handlePush,
  historySummariesAtom,
  refreshHistorySummary,
  setTodayLiveState,
  store,
  todayLiveStateAtom,
} from './store'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function makeSummary(grandTotal: number): TodaySummary {
  return {
    date: '2026-05-07',
    grandTotal,
    projects: [],
    turnCount: 0,
    activeProjectCount: 0,
  }
}

function makeLiveState(revision: number, grandTotal: number): TodayLiveState {
  return {
    revision,
    serverNow: 1000,
    dayStart: 0,
    completed: makeSummary(grandTotal),
    activeTurns: [],
  }
}

function makeActiveLiveState(revision: number, turnId: string): TodayLiveState {
  return {
    ...makeLiveState(revision, 0),
    activeTurns: [
      {
        turn_id: turnId,
        agent: 'codex',
        project: 'test-project',
        session_id: 'session-1',
        started_at: 1000,
        timezone: 'Asia/Shanghai',
      },
    ],
  }
}

function makeHistorySummary(
  periodDays: HistoryPeriodDays,
  currentTotal: number = periodDays,
): HistorySummary {
  return {
    periodDays,
    calendar: [],
    trendProjects: [],
    trends: [],
    topProjects: [],
    hourlyMatrix: [],
    turnDurations: [],
    projectAgentTotals: [],
    periodCompare: {
      currentTotal,
      previousTotal: 0,
      delta: currentTotal,
      deltaRatio: null,
    },
  }
}

describe('handlePush', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    clearActiveHistoryPeriod()
    store.set(historySummariesAtom, {})
    store.set(todayLiveStateAtom, null)
  })

  it('refreshes today live state from the database', async () => {
    const calls: string[] = []
    const invoke = vi.fn(async (channel: string) => {
      calls.push(channel)
      if (channel === 'getTodayLiveState') return { ok: true, data: makeLiveState(1, 30) }
      if (channel === 'getMenubarState') {
        return { ok: true, data: { todayTotal: 30, active: false, projects: [], activeTurns: [] } }
      }
      return { ok: false, error: 'unexpected channel' }
    })
    vi.stubGlobal('window', { api: { invoke } })

    handlePush({ type: 'db-changed' })
    await flushPromises()

    expect(calls).toEqual(['getTodayLiveState', 'getMenubarState'])
    expect(store.get(todayLiveStateAtom)?.completed.grandTotal).toBe(30)
  })

  it('ignores stale refreshes when a newer db change arrives first', async () => {
    const requests: Array<{ channel: string; deferred: ReturnType<typeof deferred> }> = []
    const invoke = vi.fn((channel: string) => {
      const request = { channel, deferred: deferred<unknown>() }
      requests.push(request)
      return request.deferred.promise
    })
    vi.stubGlobal('window', { api: { invoke } })

    handlePush({ type: 'db-changed' })
    handlePush({ type: 'db-changed' })

    expect(requests.map((request) => request.channel)).toEqual([
      'getTodayLiveState',
      'getMenubarState',
      'getTodayLiveState',
      'getMenubarState',
    ])

    requests[3].deferred.resolve({
      ok: true,
      data: { todayTotal: 42, active: false, projects: [], activeTurns: [] },
    })
    requests[2].deferred.resolve({ ok: true, data: makeLiveState(2, 42) })
    await flushPromises()

    requests[0].deferred.resolve({ ok: true, data: makeLiveState(1, 1) })
    requests[1].deferred.resolve({
      ok: true,
      data: { todayTotal: 1, active: false, projects: [], activeTurns: [] },
    })
    await flushPromises()

    expect(store.get(todayLiveStateAtom)?.completed.grandTotal).toBe(42)
  })

  it('refreshes the active history period after History has loaded once', async () => {
    const calls: Array<{ channel: string; args: unknown }> = []
    const invoke = vi.fn(async (channel: string, args: unknown) => {
      calls.push({ channel, args })
      if (channel === 'getTodayLiveState') return { ok: true, data: makeLiveState(1, 30) }
      if (channel === 'getMenubarState') {
        return { ok: true, data: { todayTotal: 30, active: false, projects: [], activeTurns: [] } }
      }
      if (channel === 'getHistorySummary') {
        const periodDays = (args as { periodDays: HistoryPeriodDays }).periodDays
        return { ok: true, data: makeHistorySummary(periodDays, 100 + periodDays) }
      }
      return { ok: false, error: 'unexpected channel' }
    })
    vi.stubGlobal('window', { api: { invoke } })

    await refreshHistorySummary(30)
    handlePush({ type: 'db-changed' })
    await flushPromises()

    expect(calls.map((call) => call.channel)).toEqual([
      'getHistorySummary',
      'getTodayLiveState',
      'getMenubarState',
      'getHistorySummary',
    ])
    expect(calls[3]?.args).toEqual({ periodDays: 30 })
    expect(store.get(historySummariesAtom)[30]?.periodCompare.currentTotal).toBe(130)
  })

  it('does not let an older revision overwrite newer live state', () => {
    setTodayLiveState(makeLiveState(10, 100))
    setTodayLiveState(makeLiveState(9, 1))

    expect(store.get(todayLiveStateAtom)?.completed.grandTotal).toBe(100)
  })

  it('accepts equal-revision refreshes when active turns change', () => {
    setTodayLiveState(makeActiveLiveState(10, 'running-turn'))
    setTodayLiveState(makeLiveState(10, 100))

    expect(store.get(todayLiveStateAtom)?.activeTurns).toHaveLength(0)
  })
})
