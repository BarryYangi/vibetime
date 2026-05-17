import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageRefreshResult, UsageSummary } from '../shared/ipc-types.js'

const handles = vi.hoisted(() => new Map<string, (event: unknown, args?: unknown) => unknown>())
const configMocks = vi.hoisted(() => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}))
const mocks = vi.hoisted(() => ({
  notifyRenderer: vi.fn(),
  queryUsageRefreshState: vi.fn(),
  queryUsageSummary: vi.fn(),
  startUsageBackgroundRefresh: vi.fn(),
  startUsageRefreshJob: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn(),
    getVersion: vi.fn(() => 'test'),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, args?: unknown) => unknown) => {
      handles.set(channel, handler)
    }),
  },
  nativeTheme: { themeSource: 'system' },
  shell: { openExternal: vi.fn() },
}))

vi.mock('@vibetime/hook/config', () => ({
  readConfig: configMocks.readConfig,
  writeConfig: configMocks.writeConfig,
}))

vi.mock('@vibetime/hook/install', () => ({
  getCliInstallStatus: vi.fn(),
  installAgent: vi.fn(),
  installUserCli: vi.fn(),
  uninstallAgent: vi.fn(),
  uninstallUserCli: vi.fn(),
}))

vi.mock('./db.js', () => ({
  notifyRenderer: mocks.notifyRenderer,
  queryAgentStatus: vi.fn(),
  queryHistorySummary: vi.fn(),
  queryMenubarState: vi.fn(),
  queryTodayLiveState: vi.fn(),
  writeAndNotify: vi.fn((fn: () => void) => fn()),
}))

vi.mock('./updater.js', () => ({
  getUpdateState: vi.fn(),
  runUpdateAction: vi.fn(),
  runUpdateCheck: vi.fn(),
}))

vi.mock('./usage-service.js', () => ({
  queryUsageRefreshState: mocks.queryUsageRefreshState,
  queryUsageSummary: mocks.queryUsageSummary,
  startUsageBackgroundRefresh: mocks.startUsageBackgroundRefresh,
  startUsageRefreshJob: mocks.startUsageRefreshJob,
}))

const summary: UsageSummary = {
  periodDays: 30,
  totals: { totalTokens: 0, estimatedCostUsd: null, unknownCostTokens: 0, recordCount: 0 },
  daily: [],
  pricingStatus: 'cached',
  tokenBreakdown: {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  },
  byAgent: [],
  byModel: [],
  byProject: [],
  projectModelMatrix: [],
  efficiency: {
    totals: {
      durationSec: 0,
      turnCount: 0,
      costPerHourUsd: null,
      costPerTurnUsd: null,
      tokensPerTurn: null,
    },
    daily: [],
    byAgent: [],
    byModel: [],
    byProject: [],
  },
  dataQuality: {
    assignedRecordCount: 0,
    unassigned: { totalTokens: 0, estimatedCostUsd: null, unknownCostTokens: 0, recordCount: 0 },
    unknownPrice: { totalTokens: 0, estimatedCostUsd: null, unknownCostTokens: 0, recordCount: 0 },
    attribution: [],
  },
  auditRows: [],
  availableFilters: { agents: [], models: [], projects: [] },
}

const refreshResult: UsageRefreshResult = {
  frequency: '15m',
  scannedAt: 1778814000,
  recordsFound: 0,
  recordsInserted: 0,
  pricingStatus: 'cached',
}

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const handler = handles.get(channel)
  if (!handler) throw new Error(`Missing handler: ${channel}`)
  return (await handler({}, args)) as T
}

describe('usage IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handles.clear()
    configMocks.readConfig.mockReturnValue({
      projects: {},
      display: { timezone: 'Asia/Shanghai' },
      app: {
        language: 'en',
        open_at_login: false,
        theme: 'system',
        last_view: '/',
        usage_refresh_frequency: '15m',
      },
    })
    const { registerIpcHandlers } = await import('./ipc-handlers.js')
    registerIpcHandlers()
  })

  it('rejects invalid usage summary arguments before service delegation', async () => {
    const invalidArgs = [
      { periodDays: 5 },
      { periodDays: 30, agent: 'cursor' },
      { periodDays: 30, project: 'x'.repeat(241) },
      { periodDays: 30, model: 'x'.repeat(241) },
      { periodDays: 30, includeSidechain: 'yes' },
    ]

    for (const args of invalidArgs) {
      await expect(invoke('getUsageSummary', args)).resolves.toEqual(
        expect.objectContaining({ ok: false, error: expect.any(String) }),
      )
    }
    expect(mocks.queryUsageSummary).not.toHaveBeenCalled()
  })

  it('delegates valid usage summary requests to the cache-first service', async () => {
    mocks.queryUsageSummary.mockReturnValue(summary)

    await expect(
      invoke('getUsageSummary', {
        periodDays: 30,
        agent: 'codex',
        project: 'vibetime',
        model: 'gpt-5-codex',
        includeSidechain: false,
      }),
    ).resolves.toEqual({ ok: true, data: summary })
    expect(mocks.queryUsageSummary).toHaveBeenCalledWith({
      periodDays: 30,
      agent: 'codex',
      project: 'vibetime',
      model: 'gpt-5-codex',
      includeSidechain: false,
    })
  })

  it('starts usage refresh with pricing without waiting for the background job', async () => {
    mocks.startUsageRefreshJob.mockReturnValue(refreshResult)

    await expect(invoke('refreshUsage')).resolves.toEqual({ ok: true, data: refreshResult })
    expect(mocks.startUsageRefreshJob).toHaveBeenCalledWith({ refreshPricing: true })
    expect(mocks.notifyRenderer).not.toHaveBeenCalledWith({ type: 'usage-changed' })
  })

  it('returns the current background usage refresh state', async () => {
    const refreshState = { status: 'loading', error: null, lastResult: refreshResult }
    mocks.queryUsageRefreshState.mockReturnValue(refreshState)

    await expect(invoke('getUsageRefreshState')).resolves.toEqual({
      ok: true,
      data: refreshState,
    })
  })

  it('maps usage refresh frequency through app preferences', async () => {
    await expect(invoke('getAppPreferences')).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ usageRefreshFrequency: '15m' }),
      }),
    )
  })

  it('persists valid usage refresh frequency and reschedules background refresh immediately', async () => {
    await expect(invoke('updateAppPreferences', { usageRefreshFrequency: '1m' })).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ usageRefreshFrequency: '1m' }),
      }),
    )

    expect(configMocks.writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({ usage_refresh_frequency: '1m' }),
      }),
    )
    expect(mocks.startUsageBackgroundRefresh).toHaveBeenCalledWith('1m')
  })

  it('rejects invalid usageRefreshFrequency preferences without persisting', async () => {
    await expect(invoke('updateAppPreferences', { usageRefreshFrequency: '4h' })).resolves.toEqual(
      expect.objectContaining({ ok: false, error: expect.stringMatching(/usageRefreshFrequency/) }),
    )

    expect(configMocks.writeConfig).not.toHaveBeenCalled()
    expect(mocks.startUsageBackgroundRefresh).not.toHaveBeenCalled()
  })
})
