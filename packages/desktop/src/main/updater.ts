import { readConfig } from '@vibetime/hook/config'
import { app, BrowserWindow, dialog, shell } from 'electron'
import type { AppUpdateState } from '../shared/ipc-types.js'
import { notifyRenderer } from './db.js'

const STARTUP_CHECK_DELAY_MS = 30_000
const PERIODIC_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000
const RELEASES_URL = 'https://github.com/BarryYangi/vibetime/releases'
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/BarryYangi/vibetime/releases/latest'
const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`
const CHECK_TIMEOUT_MS = 10_000

let updateState = initialUpdateState()
let startupCheckTimer: ReturnType<typeof setTimeout> | null = null
let periodicCheckTimer: ReturnType<typeof setInterval> | null = null
let updateCheckPromise: Promise<AppUpdateState> | null = null

function initialUpdateState(): AppUpdateState {
  return {
    status: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    error: null,
    lastCheckedAt: null,
  }
}

function setUpdateState(patch: Partial<AppUpdateState>): void {
  updateState = {
    ...updateState,
    currentVersion: app.getVersion(),
    ...patch,
  }
  notifyRenderer({ type: 'update-state-changed' })
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function compareVersions(a: string, b: string): number {
  const aParts = normalizeVersion(a).split(/[.-]/)
  const bParts = normalizeVersion(b).split(/[.-]/)
  const length = Math.max(aParts.length, bParts.length)

  for (let index = 0; index < length; index += 1) {
    const left = aParts[index] ?? '0'
    const right = bParts[index] ?? '0'
    const leftNumber = Number(left)
    const rightNumber = Number(right)

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1
      continue
    }

    const stringCompare = left.localeCompare(right)
    if (stringCompare !== 0) return stringCompare > 0 ? 1 : -1
  }

  return 0
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function openReleasePage(): Promise<AppUpdateState> {
  await shell.openExternal(LATEST_RELEASE_URL)
  return getUpdateState()
}

function dialogLanguage(): 'en' | 'zh' {
  try {
    return readConfig().app.language === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

function dialogParent(): BrowserWindow | undefined {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed())
}

async function showMessageBox(
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  const parent = dialogParent()
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
}

async function showNoUpdateDialog(): Promise<void> {
  const language = dialogLanguage()
  await showMessageBox({
    type: 'info',
    title: language === 'zh' ? '已是最新版' : 'Up to Date',
    message:
      language === 'zh'
        ? `VibeTime ${app.getVersion()} 已是最新版。`
        : `VibeTime ${app.getVersion()} is up to date.`,
    buttons: [language === 'zh' ? '好' : 'OK'],
    defaultId: 0,
    noLink: true,
  })
}

async function showUpdateAvailableDialog(version: string | null): Promise<boolean> {
  const language = dialogLanguage()
  const text =
    language === 'zh'
      ? {
          title: '发现新版本',
          message: version ? `VibeTime ${version} 可用。` : 'VibeTime 有新版本可用。',
          detail: '请前往发布页下载新版安装包。',
          later: '稍后',
          confirm: '打开发布页',
        }
      : {
          title: 'Update Available',
          message: version
            ? `VibeTime ${version} is available.`
            : 'A VibeTime update is available.',
          detail: 'Open the release page to download the new installer.',
          later: 'Later',
          confirm: 'Open Release',
        }

  const result = await showMessageBox({
    type: 'info',
    title: text.title,
    message: text.message,
    detail: text.detail,
    buttons: [text.later, text.confirm],
    cancelId: 0,
    defaultId: 1,
    noLink: true,
  })

  return result.response === 1
}

async function showUpdateErrorDialog(message: string): Promise<void> {
  const language = dialogLanguage()
  await showMessageBox({
    type: 'error',
    title: language === 'zh' ? '更新检查失败' : 'Update Check Failed',
    message: language === 'zh' ? '暂时无法检查更新。' : 'VibeTime could not check for updates.',
    detail: message,
    buttons: [language === 'zh' ? '好' : 'OK'],
    defaultId: 0,
    noLink: true,
  })
}

function showUpdateAvailableDialogLater(version: string | null): void {
  void showUpdateAvailableDialog(version)
    .then((shouldOpenRelease) => {
      if (shouldOpenRelease) return openReleasePage()
      return undefined
    })
    .catch((error) => console.error(errorMessage(error)))
}

function showNoUpdateDialogLater(): void {
  void showNoUpdateDialog().catch((error) => console.error(errorMessage(error)))
}

function showUpdateErrorDialogLater(message: string): void {
  void showUpdateErrorDialog(message).catch((error) => console.error(errorMessage(error)))
}

async function fetchLatestReleaseVersion(): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)

  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `VibeTime/${app.getVersion()}`,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`GitHub release check failed: ${response.status}`)
    }

    const data = (await response.json()) as { tag_name?: unknown; name?: unknown }
    const version =
      typeof data.tag_name === 'string'
        ? data.tag_name
        : typeof data.name === 'string'
          ? data.name
          : ''
    if (!version) throw new Error('Latest release has no version tag')
    return normalizeVersion(version)
  } finally {
    clearTimeout(timeout)
  }
}

async function resolveLatestVersion(): Promise<string | null> {
  const latestVersion = await fetchLatestReleaseVersion()
  return compareVersions(latestVersion, app.getVersion()) > 0 ? latestVersion : null
}

async function checkForUpdates(interactive: boolean): Promise<AppUpdateState> {
  if (updateState.status === 'checking') return getUpdateState()

  const previousState = getUpdateState()
  if (previousState.status === 'available' && previousState.availableVersion) {
    setUpdateState({ error: null })
  } else {
    setUpdateState({ status: 'checking', error: null })
  }

  try {
    const latestVersion = await resolveLatestVersion()
    if (latestVersion) {
      setUpdateState({
        status: 'available',
        availableVersion: latestVersion,
        error: null,
        lastCheckedAt: Date.now(),
      })

      if (interactive) showUpdateAvailableDialogLater(latestVersion)
      return getUpdateState()
    }

    setUpdateState({
      status: 'idle',
      availableVersion: null,
      error: null,
      lastCheckedAt: Date.now(),
    })
    if (interactive) showNoUpdateDialogLater()
  } catch (error) {
    const message = errorMessage(error)
    const keepAvailable = previousState.status === 'available' && previousState.availableVersion
    setUpdateState({
      status: keepAvailable ? 'available' : interactive ? 'error' : 'idle',
      availableVersion: keepAvailable ? previousState.availableVersion : null,
      error: interactive ? message : null,
      lastCheckedAt: Date.now(),
    })
    if (interactive) showUpdateErrorDialogLater(message)
  }

  return getUpdateState()
}

function runSerializedUpdateCheck(): Promise<AppUpdateState> {
  if (updateCheckPromise) return updateCheckPromise
  updateCheckPromise = checkForUpdates(true).finally(() => {
    updateCheckPromise = null
  })
  return updateCheckPromise
}

export function startAutomaticUpdateChecks(): void {
  if (startupCheckTimer || periodicCheckTimer) return

  startupCheckTimer = setTimeout(() => {
    startupCheckTimer = null
    void checkForUpdates(false)
  }, STARTUP_CHECK_DELAY_MS)
  startupCheckTimer.unref?.()

  periodicCheckTimer = setInterval(() => {
    void checkForUpdates(false)
  }, PERIODIC_CHECK_INTERVAL_MS)
  periodicCheckTimer.unref?.()
}

export function stopAutomaticUpdateChecks(): void {
  if (startupCheckTimer) {
    clearTimeout(startupCheckTimer)
    startupCheckTimer = null
  }
  if (periodicCheckTimer) {
    clearInterval(periodicCheckTimer)
    periodicCheckTimer = null
  }
}

export function getUpdateState(): AppUpdateState {
  return {
    ...updateState,
    currentVersion: app.getVersion(),
  }
}

export function runUpdateCheck(): Promise<AppUpdateState> {
  return runSerializedUpdateCheck()
}

export function runUpdateAction(): Promise<AppUpdateState> {
  return openReleasePage()
}
