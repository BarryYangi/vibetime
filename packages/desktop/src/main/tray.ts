import type { MenuItemConstructorOptions, NativeImage } from 'electron'
import { Menu, nativeImage, Tray } from 'electron'
import type { MenubarState } from '../shared/ipc-types.js'
import { formatMenubarTitle, queryMenubarState } from './db.js'

const MINUTE_SECONDS = 60
const FALLBACK_TITLE = '●'
const MENU_ICON_SIZE = 13

let tray: Tray | null = null
let activeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let trayActions: {
  openApp: (route?: string) => void
  openSettings: () => void
  quitApp: () => void
} | null = null

type IconName = 'activity' | 'clock' | 'folder' | 'open' | 'settings' | 'power' | 'warning'

const MACOS_SYMBOLS: Record<IconName, string> = {
  activity: 'waveform.path.ecg',
  clock: 'clock',
  folder: 'folder',
  open: 'macwindow',
  settings: 'gearshape',
  power: 'power',
  warning: 'exclamationmark.triangle',
}

const menuIcons = new Map<IconName, NativeImage>()

function prepareTemplateImage(image: NativeImage, size: number): NativeImage {
  const resized = image.resize({
    width: size,
    height: size,
    quality: 'best',
  })
  resized.setTemplateImage(true)
  return resized
}

function icon(name: IconName): NativeImage {
  const cached = menuIcons.get(name)
  if (cached) return cached

  const systemImage = nativeImage.createFromNamedImage(MACOS_SYMBOLS[name])
  const image = prepareTemplateImage(systemImage, MENU_ICON_SIZE)
  menuIcons.set(name, image)
  return image
}

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  if (whole < 3600) return `${Math.floor(whole / 60)}m`

  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
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
  return `${label} · ${formatDuration(seconds)}`
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

function setMenubarTrayTitle(title: string): void {
  if (!tray || tray.isDestroyed()) return
  tray.setTitle(title)
}

function buildStatusMenu(): Menu {
  const state = readMenubarState()
  if (!state) {
    return Menu.buildFromTemplate([
      { label: 'VibeTime', sublabel: 'Unable to read today’s activity', icon: icon('warning') },
      { type: 'separator' },
      { label: 'Open', icon: icon('open'), click: () => openRoute() },
      { label: 'Settings', icon: icon('settings'), click: () => trayActions?.openSettings() },
      { type: 'separator' },
      { label: 'Quit', icon: icon('power'), click: () => trayActions?.quitApp() },
    ])
  }

  const projectItems =
    state.projects.length > 0
      ? state.projects.map((project) => ({
          label: labelWithDuration(truncateLabel(project.name), project.total),
          icon: icon('folder'),
          click: () => openRoute('/history'),
        }))
      : []

  const activeItems =
    state.activeTurns.length > 0
      ? state.activeTurns.map((turn) => ({
          label: labelWithDuration(truncateLabel(turn.project), activeElapsedSeconds(turn)),
          icon: icon('activity'),
          click: () => openRoute('/live'),
        }))
      : []

  const template: MenuItemConstructorOptions[] = [
    {
      label: labelWithDuration('Today', state.todayTotal),
      icon: icon('clock'),
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
    { label: 'Open', icon: icon('open'), click: () => openRoute() },
    { label: 'Settings', icon: icon('settings'), click: () => trayActions?.openSettings() },
    { type: 'separator' },
    { label: 'Quit', icon: icon('power'), click: () => trayActions?.quitApp() },
  ]

  return Menu.buildFromTemplate(template)
}

function showStatusMenu(): void {
  if (!tray || tray.isDestroyed()) return
  tray.popUpContextMenu(buildStatusMenu())
}

export function createMenubarTray(actions: {
  openApp: (route?: string) => void
  openSettings: () => void
  quitApp: () => void
}): void {
  trayActions = actions
  if (!tray || tray.isDestroyed()) {
    tray = new Tray(nativeImage.createEmpty())
    tray.setToolTip('VibeTime')
    tray.setIgnoreDoubleClickEvents(true)
    tray.on('click', showStatusMenu)
    tray.on('right-click', showStatusMenu)
  }

  refreshMenubarTray()
}

export function refreshMenubarTray(): void {
  if (!tray || tray.isDestroyed()) return

  const state = readMenubarState()
  if (!state) {
    setMenubarTrayTitle(FALLBACK_TITLE)
    stopActiveRefresh()
    return
  }

  setMenubarTrayTitle(formatMenubarTitle(state))

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
