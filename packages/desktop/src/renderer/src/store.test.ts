import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodayLiveState, TodaySummary } from '../../shared/ipc-types'
import { handlePush, setTodayLiveState, store, todayLiveStateAtom } from './store'

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

describe('handlePush', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    store.set(todayLiveStateAtom, null)
  })

  it('refreshes today live state from the database', async () => {
    const calls: string[] = []
    const invoke = vi.fn(async (channel: string) => {
      calls.push(channel)
      if (channel === 'getTodayLiveState') return { ok: true, data: makeLiveState(1, 30) }
      return { ok: false, error: 'unexpected channel' }
    })
    vi.stubGlobal('window', { api: { invoke } })

    handlePush({ type: 'db-changed' })
    await flushPromises()

    expect(calls).toEqual(['getTodayLiveState'])
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
      'getTodayLiveState',
    ])

    requests[1].deferred.resolve({ ok: true, data: makeLiveState(2, 42) })
    await flushPromises()

    requests[0].deferred.resolve({ ok: true, data: makeLiveState(1, 1) })
    await flushPromises()

    expect(store.get(todayLiveStateAtom)?.completed.grandTotal).toBe(42)
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
