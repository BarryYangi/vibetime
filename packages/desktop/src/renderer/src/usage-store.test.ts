import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IpcResult,
  UsageRefreshResult,
  UsageSummary,
  UsageSummaryArgs,
} from '../../shared/ipc-types'
import {
  activeUsageQueryAtom,
  clearActiveUsageQuery,
  handlePush,
  refreshUsageSummary,
  runUsageRefresh,
  store,
  usageRefreshStateAtom,
  usageSummariesAtom,
  usageSummaryCacheKey,
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

const baseArgs: UsageSummaryArgs = {
  periodDays: 30,
  agent: 'all',
  project: null,
  model: null,
  includeSidechain: true,
}

function makeUsageSummary(
  periodDays: UsageSummary['periodDays'],
  totalTokens: number,
  estimatedCostUsd: number | null = 1.23,
): UsageSummary {
  return {
    periodDays,
    totals: {
      totalTokens,
      estimatedCostUsd,
      unknownCostTokens: estimatedCostUsd === null ? totalTokens : 0,
      recordCount: totalTokens > 0 ? 1 : 0,
    },
    daily: [],
    pricingStatus: estimatedCostUsd === null ? 'unknown_model' : 'fresh',
    tokenBreakdown: {
      inputTokens: totalTokens,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens,
    },
    byAgent: [],
    byModel: [],
    byProject: [],
    auditRows: [],
    availableFilters: { agents: ['claude-code', 'codex'], models: ['gpt-5'], projects: ['app'] },
  }
}

function makeUsageRefreshResult(): UsageRefreshResult {
  return {
    frequency: '30m',
    scannedAt: 1778842800,
    recordsFound: 2,
    recordsInserted: 1,
    pricingStatus: 'fresh',
  }
}

describe('usage renderer store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    clearActiveUsageQuery()
    store.set(usageSummariesAtom, {})
    store.set(usageRefreshStateAtom, { status: 'idle', error: null, lastResult: null })
  })

  it('stores Usage summaries by serialized period and filter key', async () => {
    const summary = makeUsageSummary(30, 1234)
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'getUsageSummary') return { ok: true, data: summary }
      return { ok: false, error: 'unexpected channel' }
    })
    vi.stubGlobal('window', { api: { invoke } })

    const result = await refreshUsageSummary(baseArgs)

    expect(result).toEqual({ ok: true, data: summary })
    expect(store.get(activeUsageQueryAtom)).toEqual(baseArgs)
    expect(store.get(usageSummariesAtom)[usageSummaryCacheKey(baseArgs)]?.totals.totalTokens).toBe(
      1234,
    )
  })

  it('ignores stale Usage summary refreshes when a newer refresh wins', async () => {
    const first = deferred<IpcResult<UsageSummary>>()
    const second = deferred<IpcResult<UsageSummary>>()
    const invoke = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    vi.stubGlobal('window', { api: { invoke } })

    const firstRefresh = refreshUsageSummary(baseArgs)
    const secondRefresh = refreshUsageSummary(baseArgs)

    second.resolve({ ok: true, data: makeUsageSummary(30, 2000) })
    await flushPromises()
    first.resolve({ ok: true, data: makeUsageSummary(30, 1) })

    await expect(secondRefresh).resolves.toEqual({ ok: true, data: makeUsageSummary(30, 2000) })
    await expect(firstRefresh).resolves.toBeNull()
    expect(store.get(usageSummariesAtom)[usageSummaryCacheKey(baseArgs)]?.totals.totalTokens).toBe(
      2000,
    )
  })

  it('supports cache-first page open flow and preserves cached totals on refresh failure', async () => {
    const cached = makeUsageSummary(30, 900, null)
    const refreshed = makeUsageSummary(30, 1200, 2.4)
    const calls: Array<{ channel: string; args: unknown }> = []
    const invoke = vi.fn(async (channel: string, args: unknown) => {
      calls.push({ channel, args })
      if (channel === 'getUsageSummary')
        return { ok: true, data: calls.length === 1 ? cached : refreshed }
      if (channel === 'refreshUsage') return { ok: false, error: 'network unavailable' }
      return { ok: false, error: 'unexpected channel' }
    })
    vi.stubGlobal('window', { api: { invoke } })

    await refreshUsageSummary(baseArgs)
    const refreshResult = await runUsageRefresh()

    expect(refreshResult).toEqual({ ok: false, error: 'network unavailable' })
    expect(store.get(usageSummariesAtom)[usageSummaryCacheKey(baseArgs)]?.totals.totalTokens).toBe(
      900,
    )
    expect(
      store.get(usageSummariesAtom)[usageSummaryCacheKey(baseArgs)]?.totals.estimatedCostUsd,
    ).toBeNull()
    expect(store.get(usageRefreshStateAtom).status).toBe('error')
    expect(calls.map((call) => call.channel)).toEqual(['getUsageSummary', 'refreshUsage'])
  })

  it('surfaces Usage summary IPC rejection as an explicit error result', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('ipc offline')
    })
    vi.stubGlobal('window', { api: { invoke } })

    await expect(refreshUsageSummary(baseArgs)).resolves.toEqual({
      ok: false,
      error: 'Error: ipc offline',
    })
    expect(store.get(usageSummariesAtom)).toEqual({})
  })

  it('manual refresh invokes refreshUsage once and records the result', async () => {
    const refreshResult = makeUsageRefreshResult()
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'refreshUsage') return { ok: true, data: refreshResult }
      return { ok: false, error: 'unexpected channel' }
    })
    vi.stubGlobal('window', { api: { invoke } })

    await expect(runUsageRefresh()).resolves.toEqual({ ok: true, data: refreshResult })

    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith('refreshUsage')
    expect(store.get(usageRefreshStateAtom)).toEqual({
      status: 'success',
      error: null,
      lastResult: refreshResult,
    })
  })

  it('refreshes Usage on push only after Usage has loaded once', async () => {
    const calls: string[] = []
    const invoke = vi.fn(async (channel: string) => {
      calls.push(channel)
      if (channel === 'getTodayLiveState') return { ok: true, data: null }
      if (channel === 'getMenubarState') {
        return { ok: true, data: { todayTotal: 0, active: false, projects: [], activeTurns: [] } }
      }
      if (channel === 'getUsageSummary') return { ok: true, data: makeUsageSummary(30, 88) }
      return { ok: false, error: 'unexpected channel' }
    })
    vi.stubGlobal('window', { api: { invoke } })

    handlePush({ type: 'usage-changed' })
    await flushPromises()

    expect(calls).toEqual([])

    await refreshUsageSummary(baseArgs)
    handlePush({ type: 'usage-changed' })
    await flushPromises()

    expect(calls).toEqual(['getUsageSummary', 'getUsageSummary'])
  })
})
