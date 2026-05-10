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
import { app, ipcMain, nativeTheme } from 'electron'
import type {
  AppInfo,
  AppPreferences,
  HistoryPeriodDays,
  IpcResult,
  VibetimeConfig,
} from '../shared/ipc-types.js'
import { APP_LANGUAGES, APP_THEMES, HISTORY_PERIODS } from '../shared/ipc-types.js'
import {
  queryAgentStatus,
  queryHistorySummary,
  queryMenubarState,
  queryTodayLiveState,
  writeAndNotify,
} from './db.js'
import { getUpdateState, runUpdateAction, runUpdateCheck } from './updater.js'
import { normalizeAppRoute } from './window-security.js'

const VALID_AGENTS = new Set(['claude-code', 'codex', 'cursor', 'gemini-cli'])
const VALID_HISTORY_PERIODS = new Set<number>(HISTORY_PERIODS)
const VALID_APP_LANGUAGES = new Set<string>(APP_LANGUAGES)
const VALID_APP_THEMES = new Set<string>(APP_THEMES)

declare const __VIBETIME_COMMIT_HASH__: string

function assertValidAgent(agent: unknown): asserts agent is string {
  if (typeof agent !== 'string' || !VALID_AGENTS.has(agent)) {
    throw new Error('Invalid agent. Supported: claude-code, codex, cursor, gemini-cli')
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
    language: config.app.language,
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    theme: config.app.theme,
    lastView: config.app.last_view,
  }
}

function normalizeAppLanguage(language: unknown, fallback: AppPreferences['language']) {
  return typeof language === 'string' && VALID_APP_LANGUAGES.has(language)
    ? (language as AppPreferences['language'])
    : fallback
}

function normalizeAppTheme(theme: unknown, fallback: AppPreferences['theme']) {
  return typeof theme === 'string' && VALID_APP_THEMES.has(theme)
    ? (theme as AppPreferences['theme'])
    : fallback
}

function applyNativeTheme(theme: AppPreferences['theme']) {
  nativeTheme.themeSource = theme
}

function assertValidHistoryArgs(args: unknown): asserts args is { periodDays: HistoryPeriodDays } {
  const periodDays = (args as { periodDays?: unknown } | undefined)?.periodDays
  if (typeof periodDays !== 'number' || !VALID_HISTORY_PERIODS.has(periodDays)) {
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
      applyNativeTheme(current.app.theme)
      const openAtLogin = app.getLoginItemSettings().openAtLogin
      let next = current
      if (current.app.open_at_login !== openAtLogin) {
        next = mergeConfig(current, { app: { ...current.app, open_at_login: openAtLogin } })
        writeConfig(next)
      }
      return { ok: true, data: appPreferencesFromConfig(next) }
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
            language: normalizeAppLanguage(preferences.language, current.app.language),
            open_at_login: openAtLogin,
            theme: normalizeAppTheme(preferences.theme, current.app.theme),
            last_view:
              preferences.lastView === undefined
                ? current.app.last_view
                : normalizeAppRoute(preferences.lastView),
          },
        })
        writeConfig(next)
        if (preferences.theme !== undefined) {
          applyNativeTheme(next.app.theme)
        }
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

  ipcMain.handle('getAppInfo', async (): Promise<IpcResult<AppInfo>> => {
    try {
      return {
        ok: true,
        data: {
          version: app.getVersion(),
          commitHash: __VIBETIME_COMMIT_HASH__,
          dbPath: join(homedir(), '.vibetime', 'data.db'),
        },
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'getUpdateState',
    async (): Promise<IpcResult<ReturnType<typeof getUpdateState>>> => {
      try {
        return { ok: true, data: getUpdateState() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'runUpdateCheck',
    async (): Promise<IpcResult<ReturnType<typeof getUpdateState>>> => {
      try {
        return { ok: true, data: await runUpdateCheck() }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'runUpdateAction',
    async (): Promise<IpcResult<ReturnType<typeof getUpdateState>>> => {
      try {
        return { ok: true, data: await runUpdateAction() }
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
