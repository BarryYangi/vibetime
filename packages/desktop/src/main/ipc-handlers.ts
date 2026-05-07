import { readConfig, writeConfig } from '@vibetime/hook/config'
import { installAgent, uninstallAgent } from '@vibetime/hook/install'
import { ipcMain } from 'electron'
import type { AppPreferences, IpcResult, VibetimeConfig } from '../shared/ipc-types.js'
import {
  queryAgentStatus,
  queryHistorySummary,
  queryMenubarState,
  queryTodayLiveState,
  writeAndNotify,
} from './db.js'

const VALID_AGENTS = new Set(['claude-code', 'codex', 'cursor'])

function assertValidAgent(agent: unknown): asserts agent is string {
  if (typeof agent !== 'string' || !VALID_AGENTS.has(agent)) {
    throw new Error('Invalid agent. Supported: claude-code, codex, cursor')
  }
}

function mergeConfig(current: VibetimeConfig, patch: Partial<VibetimeConfig>): VibetimeConfig {
  return {
    projects: patch.projects ?? current.projects,
    display: { ...current.display, ...patch.display },
    app: { ...current.app, ...patch.app },
  }
}

function appPreferencesFromConfig(config: VibetimeConfig): AppPreferences {
  return {
    openAtLogin: config.app.open_at_login,
    autoLaunchPrompted: config.app.auto_launch_prompted,
    lastView: config.app.last_view,
  }
}

export function registerIpcHandlers(actions: { showMainWindow?: (route?: string) => void } = {}): void {
  ipcMain.handle(
    'getTodayLiveState',
    async (): Promise<IpcResult<ReturnType<typeof queryTodayLiveState>>> => {
      try {
        return { ok: true, data: queryTodayLiveState() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('getHistorySummary', async (_event, args): Promise<IpcResult<ReturnType<typeof queryHistorySummary>>> => {
    try {
      return { ok: true, data: queryHistorySummary(args) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('getMenubarState', async (): Promise<IpcResult<ReturnType<typeof queryMenubarState>>> => {
    try {
      return { ok: true, data: queryMenubarState() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'getAgentStatus',
    async (): Promise<IpcResult<ReturnType<typeof queryAgentStatus>>> => {
      try {
        return { ok: true, data: queryAgentStatus() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('getConfig', async (): Promise<IpcResult<ReturnType<typeof readConfig>>> => {
    try {
      return { ok: true, data: readConfig() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('updateConfig', async (_event, config): Promise<IpcResult<void>> => {
    try {
      const current = readConfig()
      writeConfig(mergeConfig(current, config))
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('getAppPreferences', async (): Promise<IpcResult<AppPreferences>> => {
    try {
      return { ok: true, data: appPreferencesFromConfig(readConfig()) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'updateAppPreferences',
    async (_event, preferences: Partial<AppPreferences>): Promise<IpcResult<AppPreferences>> => {
      try {
        const current = readConfig()
        const next = mergeConfig(current, {
          app: {
            open_at_login: preferences.openAtLogin ?? current.app.open_at_login,
            auto_launch_prompted:
              preferences.autoLaunchPrompted ?? current.app.auto_launch_prompted,
            last_view: preferences.lastView ?? current.app.last_view,
          },
        })
        writeConfig(next)
        return { ok: true, data: appPreferencesFromConfig(next) }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('showMainWindow', async (_event, args): Promise<IpcResult<void>> => {
    try {
      actions.showMainWindow?.(args?.route)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('installAgent', async (_event, { agent }): Promise<IpcResult<void>> => {
    try {
      assertValidAgent(agent)
      writeAndNotify(() => installAgent(agent))
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('uninstallAgent', async (_event, { agent }): Promise<IpcResult<void>> => {
    try {
      assertValidAgent(agent)
      writeAndNotify(() => uninstallAgent(agent))
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
