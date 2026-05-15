import type { UsageRefreshResult, UsageSummary } from '../shared/ipc-types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handles = vi.hoisted(() => new Map<string, (event: unknown, args?: unknown) => unknown>())
const mocks = vi.hoisted(() => ({
  notifyRenderer: vi.fn(),
  queryUsageSummary: vi.fn(),
  runUsageRefresh: vi.fn(),
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
  readConfig: vi.fn(() => ({
    projects: {},
    display: { timezone: 'Asia/Shanghai' },
    app: { language: 'en', open_at_login: false, theme: 'system', last_view: '/' },
  })),
  writeConfig: vi.fn(),
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
  queryUsageSummary: mocks.queryUsageSummary,
  runUsageRefresh: mocks.runUsageRefresh,
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
  auditRows: [],
  availableFilters: { agents: [], models: [], projects: [] },
}

const refreshResult: UsageRefreshResult = {
  frequency: '30m',
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

  it('refreshes usage with pricing and emits usage-changed after success', async () => {
    mocks.runUsageRefresh.mockResolvedValue(refreshResult)

    await expect(invoke('refreshUsage')).resolves.toEqual({ ok: true, data: refreshResult })
    expect(mocks.runUsageRefresh).toHaveBeenCalledWith({ refreshPricing: true })
    expect(mocks.notifyRenderer).toHaveBeenCalledWith({ type: 'usage-changed' })
  })
})
