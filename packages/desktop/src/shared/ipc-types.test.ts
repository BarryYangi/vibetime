import { describe, expect, it, vi } from 'vitest'
import {
  USAGE_AGENT_FILTERS,
  USAGE_AGENTS,
  USAGE_REFRESH_FREQUENCIES,
  type IpcMethods,
  type IpcPushEvent,
  type UsageSummaryArgs,
} from './ipc-types.js'

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

describe('usage IPC contracts', () => {
  it('limits usage agents, filters, and refresh frequencies to renderer-safe enums', () => {
    expect(USAGE_AGENTS).toEqual(['claude-code', 'codex'])
    expect(USAGE_AGENT_FILTERS).toEqual(['all', 'claude-code', 'codex'])
    expect(USAGE_REFRESH_FREQUENCIES).toEqual(['15m', '30m', '1h', '4h'])
  })

  it('exposes summary args without scanner internals', () => {
    const args = {
      periodDays: 30,
      agent: 'all',
      project: 'vibetime',
      model: 'gpt-5-codex',
      includeSidechain: true,
    } satisfies UsageSummaryArgs

    expect(Object.keys(args).sort()).toEqual([
      'agent',
      'includeSidechain',
      'model',
      'periodDays',
      'project',
    ])
  })

  it('types usage methods and push notifications', () => {
    type Methods = keyof Pick<IpcMethods, 'getUsageSummary' | 'refreshUsage'>
    const methods: Methods[] = ['getUsageSummary', 'refreshUsage']
    const event: IpcPushEvent = { type: 'usage-changed' }

    expect(methods).toEqual(['getUsageSummary', 'refreshUsage'])
    expect(event.type).toBe('usage-changed')
  })

  it('adds usage methods to the preload allowlist', async () => {
    const { IPC_CHANNELS } = await import('../preload/index.js')

    expect(IPC_CHANNELS.has('getUsageSummary')).toBe(true)
    expect(IPC_CHANNELS.has('refreshUsage')).toBe(true)
    expect(IPC_CHANNELS.has('unknown' as keyof IpcMethods)).toBe(false)
  })
})
