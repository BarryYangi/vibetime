import { homedir } from 'node:os'
import { join } from 'node:path'
import { readConfig, writeConfig } from '@vibetime/hook/config'
import {
  getCliInstallStatus,
  installAgent,
  installUserCli,
  uninstallAgent,
  uninstallUserCli,
} from '@vibetime/hook/install'
import { app, ipcMain } from 'electron'
import type { AppPreferences, IpcResult, VibetimeConfig } from '../shared/ipc-types.js'
import {
  queryAgentStatus,
  queryHistorySummary,
  queryMenubarState,
  queryTodayLiveState,
  writeAndNotify,
} from './db.js'
import { normalizeAppRoute } from './window-security.js'

const VALID_AGENTS = new Set(['claude-code', 'codex', 'cursor'])
const VALID_HISTORY_PERIODS = new Set([7, 30, 90, 365])

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
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    lastView: config.app.last_view,
  }
}

function assertValidHistoryArgs(args: unknown): asserts args is { periodDays: 7 | 30 | 90 | 365 } {
  const periodDays = (args as { periodDays?: unknown } | undefined)?.periodDays
  if (!VALID_HISTORY_PERIODS.has(periodDays as 7 | 30 | 90 | 365)) {
    throw new Error('Invalid history period')
  }
}

export function registerIpcHandlers(
  actions: { showMainWindow?: (route?: string) => void } = {},
): void {
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

  ipcMain.handle(
    'getHistorySummary',
    async (_event, args): Promise<IpcResult<ReturnType<typeof queryHistorySummary>>> => {
      try {
        assertValidHistoryArgs(args)
        return { ok: true, data: queryHistorySummary(args) }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'getMenubarState',
    async (): Promise<IpcResult<ReturnType<typeof queryMenubarState>>> => {
      try {
        return { ok: true, data: queryMenubarState() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

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
      const current = readConfig()
      const openAtLogin = app.getLoginItemSettings().openAtLogin
      if (current.app.open_at_login !== openAtLogin) {
        writeConfig(mergeConfig(current, { app: { ...current.app, open_at_login: openAtLogin } }))
      }
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
        if (preferences.openAtLogin !== undefined) {
          app.setLoginItemSettings({ openAtLogin: preferences.openAtLogin })
        }
        const openAtLogin = app.getLoginItemSettings().openAtLogin
        const next = mergeConfig(current, {
          app: {
            open_at_login: openAtLogin,
            last_view:
              preferences.lastView === undefined
                ? current.app.last_view
                : normalizeAppRoute(preferences.lastView),
          },
        })
        writeConfig(next)
        return { ok: true, data: appPreferencesFromConfig(next) }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'getCliInstallStatus',
    async (): Promise<IpcResult<ReturnType<typeof getCliInstallStatus>>> => {
      try {
        return { ok: true, data: getCliInstallStatus() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'installCli',
    async (): Promise<IpcResult<ReturnType<typeof getCliInstallStatus>>> => {
      try {
        return { ok: true, data: installUserCli() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'uninstallCli',
    async (): Promise<IpcResult<ReturnType<typeof getCliInstallStatus>>> => {
      try {
        return { ok: true, data: uninstallUserCli() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'getAppInfo',
    async (): Promise<IpcResult<{ version: string; dbPath: string }>> => {
      try {
        return {
          ok: true,
          data: {
            version: app.getVersion(),
            dbPath: join(homedir(), '.vibetime', 'data.db'),
          },
        }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('showMainWindow', async (_event, args): Promise<IpcResult<void>> => {
    try {
      actions.showMainWindow?.(
        args?.route === undefined ? undefined : normalizeAppRoute(args.route),
      )
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
