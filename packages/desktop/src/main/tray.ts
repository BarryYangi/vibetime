import { join } from 'node:path'
import { BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron'
import { formatMenubarTitle, queryMenubarState } from './db.js'

const DROPDOWN_WIDTH = 320
const DROPDOWN_HEIGHT = 360
const ACTIVE_REFRESH_MS = 10_000

let tray: Tray | null = null
let dropdownWindow: BrowserWindow | null = null
let activeRefreshTimer: ReturnType<typeof setInterval> | null = null
let trayActions: {
  openApp: () => void
  openSettings: () => void
  quitApp: () => void
} | null = null

function normalizedHash(route: string): string {
  return route.startsWith('/') ? route : `/${route}`
}

function loadRendererRoute(win: BrowserWindow, route: string): void {
  const hash = normalizedHash(route)
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function stopActiveRefresh(): void {
  if (activeRefreshTimer) {
    clearInterval(activeRefreshTimer)
    activeRefreshTimer = null
  }
}

function positionDropdown(): void {
  if (!tray || !dropdownWindow) return

  const trayBounds = tray.getBounds()
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x + trayBounds.width / 2,
    y: trayBounds.y + trayBounds.height / 2,
  })
  const { workArea } = display
  const centeredX = trayBounds.x + trayBounds.width / 2 - DROPDOWN_WIDTH / 2
  const x = Math.round(
    Math.min(Math.max(centeredX, workArea.x + 8), workArea.x + workArea.width - DROPDOWN_WIDTH - 8),
  )
  const y =
    process.platform === 'darwin'
      ? Math.round(trayBounds.y + trayBounds.height + 6)
      : Math.round(trayBounds.y - DROPDOWN_HEIGHT - 6)

  dropdownWindow.setBounds({ x, y, width: DROPDOWN_WIDTH, height: DROPDOWN_HEIGHT })
}

function getDropdownWindow(): BrowserWindow {
  if (dropdownWindow && !dropdownWindow.isDestroyed()) return dropdownWindow

  dropdownWindow = new BrowserWindow({
    title: 'VibeTime Menubar',
    width: DROPDOWN_WIDTH,
    height: DROPDOWN_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    transparent: process.platform === 'darwin',
    vibrancy: process.platform === 'darwin' ? 'popover' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  })

  dropdownWindow.on('blur', () => {
    dropdownWindow?.hide()
  })
  dropdownWindow.on('closed', () => {
    dropdownWindow = null
  })
  loadRendererRoute(dropdownWindow, '/menubar')
  return dropdownWindow
}

function toggleDropdown(): void {
  const win = getDropdownWindow()
  if (win.isVisible()) {
    win.hide()
    return
  }

  positionDropdown()
  refreshMenubarTray()
  win.show()
  win.focus()
}

function buildContextMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open', click: () => trayActions?.openApp() },
    { label: 'Settings', click: () => trayActions?.openSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => trayActions?.quitApp() },
  ])
}

export function createMenubarTray(actions: {
  openApp: () => void
  openSettings: () => void
  quitApp: () => void
}): void {
  trayActions = actions
  if (!tray || tray.isDestroyed()) {
    tray = new Tray(nativeImage.createEmpty())
    tray.setToolTip('VibeTime')
    tray.on('click', toggleDropdown)
    tray.on('right-click', () => {
      dropdownWindow?.hide()
      tray?.popUpContextMenu(buildContextMenu())
    })
  }

  refreshMenubarTray()
}

export function refreshMenubarTray(): void {
  if (!tray || tray.isDestroyed()) return

  const state = queryMenubarState()
  tray.setTitle(formatMenubarTitle(state))

  if (state.active && !activeRefreshTimer) {
    activeRefreshTimer = setInterval(refreshMenubarTray, ACTIVE_REFRESH_MS)
  } else if (!state.active) {
    stopActiveRefresh()
  }
}

export function destroyMenubarTray(): void {
  stopActiveRefresh()
  dropdownWindow?.destroy()
  dropdownWindow = null
  tray?.destroy()
  tray = null
  trayActions = null
}
