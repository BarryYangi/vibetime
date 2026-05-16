import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MenuItemConstructorOptions, NativeImage } from 'electron'
import { Menu, nativeImage, Tray } from 'electron'
import { formatDurationMinuteSummary } from '../shared/format.js'
import type { MenubarState } from '../shared/ipc-types.js'
import { formatMenubarTitle, formatMenubarTooltip, queryMenubarState } from './db.js'
import { getUpdateState, runUpdateCheck } from './updater.js'
import {
  type DesktopMenubarUsageSummary,
  queryMenubarUsageSummary,
  runUsageRefresh,
} from './usage-service.js'

const MINUTE_SECONDS = 60
const FALLBACK_TITLE = '0m'
const FALLBACK_TOOLTIP = "VibeTime: unable to read today's activity"
const MENU_ICON_SIZE = 13
const MAIN_MODULE_DIR = dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null
let activeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let usageRefreshInProgress = false
let trayActions: {
  openApp: (route?: string) => void
  openSettings: () => void
  quitApp: () => void
} | null = null

type IconName = 'activity' | 'clock' | 'folder' | 'refresh' | 'usage' | 'warning'

const MACOS_SYMBOLS: Record<IconName, string> = {
  activity: 'waveform.path.ecg',
  clock: 'clock',
  folder: 'folder',
  refresh: 'arrow.clockwise',
  usage: 'chart.bar.xaxis',
  warning: 'exclamationmark.triangle',
}

const menuIcons = new Map<IconName, NativeImage>()

function menuIcon(name: IconName): NativeImage | undefined {
  if (process.platform !== 'darwin') return undefined

  const cached = menuIcons.get(name)
  if (cached) return cached

  const systemImage = nativeImage.createFromNamedImage(MACOS_SYMBOLS[name])
  if (systemImage.isEmpty()) return undefined

  const image = systemImage.resize({
    width: MENU_ICON_SIZE,
    height: MENU_ICON_SIZE,
    quality: 'best',
  })
  image.setTemplateImage(true)
  menuIcons.set(name, image)
  return image
}

function createTrayImage(): NativeImage {
  if (process.platform === 'darwin') {
    const image = nativeImage.createFromPath(join(MAIN_MODULE_DIR, '../../build/trayTemplate.png'))
    const trayImage = image.isEmpty()
      ? nativeImage.createFromNamedImage('NSImageNameStatusAvailable')
      : image
    trayImage.setTemplateImage(true)
    return trayImage
  }

  return nativeImage.createFromPath(join(MAIN_MODULE_DIR, '../../build/icon.ico'))
}

function activeElapsedSeconds(turn: MenubarState['activeTurns'][number]): number {
  return Math.max(0, Date.now() / 1000 - turn.started_at)
}

function truncateLabel(value: string, maxLength = 48): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function openRoute(route?: string): void {
  trayActions?.openApp(route)
}

function labelWithDuration(label: string, seconds: number): string {
  return `${label} · ${formatDurationMinuteSummary(seconds)}`
}

function formatUsd(value: number | null): string {
  if (value === null) return 'Unknown'
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

function formatUsageCost(value: number | null, recordCount: number): string {
  if (recordCount <= 0) return formatUsd(0)
  return formatUsd(value)
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, notation: 'compact' }).format(
    value,
  )
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 100)
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`
}

function readUsageSummary(): DesktopMenubarUsageSummary | null {
  try {
    return queryMenubarUsageSummary()
  } catch {
    return null
  }
}

function refreshUsageFromTray(): void {
  if (usageRefreshInProgress) return
  usageRefreshInProgress = true
  refreshMenubarTray()
  void runUsageRefresh({ refreshPricing: true })
    .catch(() => {
      // Tray refresh is best-effort; the full Usage page surfaces detailed errors.
    })
    .finally(() => {
      usageRefreshInProgress = false
      refreshMenubarTray()
    })
}

function usagePeriodMenuItem(
  label: string,
  period: DesktopMenubarUsageSummary['today'],
  comparisonLabel: string,
): MenuItemConstructorOptions {
  const comparison =
    period.costDeltaRatio === null
      ? 'local estimate'
      : `${comparisonLabel} ${formatSignedPercent(period.costDeltaRatio)}`
  return {
    label: `${label} · ${formatUsageCost(period.estimatedCostUsd, period.recordCount)}`,
    sublabel: `${formatTokens(period.totalTokens)} tokens · cache ${formatPercent(period.cacheHitRate)} · ${comparison}`,
    click: () => openRoute('/usage'),
  }
}

function usageMenuItem(): MenuItemConstructorOptions {
  const summary = readUsageSummary()
  if (!summary) {
    return {
      label: 'Usage',
      icon: menuIcon('usage'),
      submenu: [
        {
          label: 'Unable to read usage',
          icon: menuIcon('warning'),
          enabled: false,
        },
        { type: 'separator' },
        {
          label: usageRefreshInProgress ? 'Refreshing Usage...' : 'Refresh Usage',
          enabled: !usageRefreshInProgress,
          icon: menuIcon('refresh'),
          click: refreshUsageFromTray,
        },
      ],
    }
  }

  return {
    label: 'Usage',
    icon: menuIcon('usage'),
    submenu: [
      usagePeriodMenuItem('Today', summary.today, 'vs yesterday'),
      usagePeriodMenuItem('Last 7 days', summary.last7Days, 'vs previous 7d'),
      usagePeriodMenuItem('Last 30 days', summary.last30Days, 'vs previous 30d'),
      { type: 'separator' },
      {
        label: usageRefreshInProgress ? 'Refreshing Usage...' : 'Refresh Usage',
        enabled: !usageRefreshInProgress,
        icon: menuIcon('refresh'),
        click: refreshUsageFromTray,
      },
    ],
  }
}

function updateMenuItem(): MenuItemConstructorOptions {
  const status = getUpdateState().status
  return {
    label: status === 'checking' ? 'Checking for Updates...' : 'Check for Updates...',
    enabled: status !== 'checking',
    click: () => {
      trayActions?.openSettings()
      void runUpdateCheck().finally(() => refreshMenubarTray())
    },
  }
}

function readMenubarState(): MenubarState | null {
  try {
    return queryMenubarState()
  } catch {
    return null
  }
}

function stopActiveRefresh(): void {
  if (activeRefreshTimer) {
    clearTimeout(activeRefreshTimer)
    activeRefreshTimer = null
  }
}

function nextVisibleRefreshDelayMs(todayTotal: number): number {
  const total = Math.max(0, Math.floor(todayTotal))
  const remainder = total % MINUTE_SECONDS
  const secondsUntilNextMinute = remainder === 0 ? MINUTE_SECONDS : MINUTE_SECONDS - remainder
  return secondsUntilNextMinute * 1000
}

function scheduleActiveRefresh(state: MenubarState): void {
  stopActiveRefresh()

  activeRefreshTimer = setTimeout(() => {
    activeRefreshTimer = null
    refreshMenubarTray()
  }, nextVisibleRefreshDelayMs(state.todayTotal))
  activeRefreshTimer.unref?.()
}

function setMenubarTrayStatus(title: string, tooltip: string): void {
  if (!tray || tray.isDestroyed()) return
  tray.setToolTip(tooltip)
  if (process.platform === 'darwin') tray.setTitle(title, { fontType: 'monospacedDigit' })
}

function buildStatusMenu(): Menu {
  const state = readMenubarState()
  if (!state) {
    return Menu.buildFromTemplate([
      {
        label: 'VibeTime',
        sublabel: "Unable to read today's activity",
        icon: menuIcon('warning'),
      },
      { type: 'separator' },
      { label: 'Open', click: () => openRoute() },
      { label: 'Settings', click: () => trayActions?.openSettings() },
      updateMenuItem(),
      { type: 'separator' },
      { label: 'Quit', click: () => trayActions?.quitApp() },
    ])
  }

  const projectItems =
    state.projects.length > 0
      ? state.projects.map((project) => ({
          label: labelWithDuration(truncateLabel(project.name), project.total),
          icon: menuIcon('folder'),
          click: () => openRoute('/history'),
        }))
      : []

  const activeItems =
    state.activeTurns.length > 0
      ? state.activeTurns.map((turn) => ({
          label: labelWithDuration(truncateLabel(turn.project), activeElapsedSeconds(turn)),
          icon: menuIcon('activity'),
          click: () => openRoute('/live'),
        }))
      : []

  const template: MenuItemConstructorOptions[] = [
    {
      label: labelWithDuration('Today', state.todayTotal),
      icon: menuIcon('clock'),
      click: () => openRoute('/'),
    },
    { type: 'separator' },
    {
      label: state.active ? `${state.activeTurns.length} running` : 'No turn running',
      enabled: false,
    },
    ...activeItems,
    { type: 'separator' },
    {
      label: state.projects.length > 0 ? 'Top project' : 'No project today',
      enabled: false,
    },
    ...projectItems,
    { type: 'separator' },
    usageMenuItem(),
    { type: 'separator' },
    { label: 'Open', click: () => openRoute() },
    { label: 'Settings', click: () => trayActions?.openSettings() },
    updateMenuItem(),
    { type: 'separator' },
    { label: 'Quit', click: () => trayActions?.quitApp() },
  ]

  return Menu.buildFromTemplate(template)
}

function refreshTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return
  tray.setContextMenu(buildStatusMenu())
}

export function createMenubarTray(actions: {
  openApp: (route?: string) => void
  openSettings: () => void
  quitApp: () => void
}): void {
  trayActions = actions
  if (!tray || tray.isDestroyed()) {
    tray = new Tray(createTrayImage())
    tray.setToolTip('VibeTime')
    if (process.platform === 'win32') {
      tray.on('click', () => openRoute())
    }
  }

  refreshMenubarTray()
}

export function refreshMenubarTray(): void {
  if (!tray || tray.isDestroyed()) return

  const state = readMenubarState()
  if (!state) {
    setMenubarTrayStatus(FALLBACK_TITLE, FALLBACK_TOOLTIP)
    refreshTrayMenu()
    stopActiveRefresh()
    return
  }

  setMenubarTrayStatus(formatMenubarTitle(state), formatMenubarTooltip(state))
  refreshTrayMenu()

  if (state.active) {
    scheduleActiveRefresh(state)
  } else {
    stopActiveRefresh()
  }
}

export function destroyMenubarTray(): void {
  stopActiveRefresh()
  tray?.destroy()
  tray = null
  trayActions = null
}
