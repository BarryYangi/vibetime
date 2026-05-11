import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readConfig } from '@vibetime/hook/config'
import type { MenuItemConstructorOptions } from 'electron'
import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import {
  setDbChangeListener,
  startDbChangeWatcher,
  startReconcileLoop,
  stopDbChangeWatcher,
  stopReconcileLoop,
} from './db.js'
import { registerIpcHandlers } from './ipc-handlers'
import { logger } from './logger.js'
import { startNotifyServer, stopNotifyServer } from './notify-server.js'
import { createMenubarTray, destroyMenubarTray, refreshMenubarTray } from './tray.js'
import { startAutomaticUpdateChecks, stopAutomaticUpdateChecks } from './updater.js'
import {
  configureSessionSecurity,
  hardenWindow,
  normalizeAppRoute,
  trustedRendererUrl,
} from './window-security.js'

const APP_NAME = 'VibeTime'
const MIN_WINDOW_WIDTH = 960
const MIN_WINDOW_HEIGHT = 640

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function configureAppIdentity() {
  app.setName(APP_NAME)
  app.setAppUserModelId('ee.barry.vibetime.desktop')
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
  })
}

function configureApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: APP_NAME,
            submenu: [
              { label: `About ${APP_NAME}`, role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { label: `Hide ${APP_NAME}`, accelerator: 'Command+H', role: 'hide' },
              { label: 'Hide Others', accelerator: 'Command+Alt+H', role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { label: `Quit ${APP_NAME}`, accelerator: 'Command+Q', role: 'quit' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        // Reload / DevTools are dev-only; hide in packaged builds.
        ...(app.isPackaged
          ? ([] satisfies MenuItemConstructorOptions[])
          : ([
              { role: 'reload' },
              { role: 'forceReload' },
              { role: 'toggleDevTools' },
              { type: 'separator' },
            ] satisfies MenuItemConstructorOptions[])),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(process.platform === 'darwin'
          ? ([
              { role: 'zoom' },
              { type: 'separator' },
              { role: 'front' },
            ] satisfies MenuItemConstructorOptions[])
          : ([{ role: 'close' }] satisfies MenuItemConstructorOptions[])),
      ],
    },
    ...(process.platform === 'darwin'
      ? []
      : [
          {
            label: APP_NAME,
            submenu: [{ label: `Quit ${APP_NAME}`, role: 'quit' }],
          } satisfies MenuItemConstructorOptions,
        ]),
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function lastViewRoute(): string {
  try {
    return normalizeAppRoute(readConfig().app.last_view)
  } catch {
    return '/'
  }
}

function applyStoredNativeTheme(): void {
  try {
    nativeTheme.themeSource = readConfig().app.theme
  } catch {
    nativeTheme.themeSource = 'system'
  }
}

function loadRendererRoute(win: BrowserWindow, route: string): void {
  const hash = normalizeAppRoute(route)
  const rendererUrl = trustedRendererUrl()
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}#${hash}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function createMainWindow(route = lastViewRoute()): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  applyStoredNativeTheme()

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1200,
    height: 800,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 12 },
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
        }
      : { autoHideMenuBar: true }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      // NOTE: sandbox stays false until preload is shipped as CJS. Electron
      // forbids ESM preload (.mjs) under sandbox: true and silently fails to
      // expose the contextBridge API, producing a blank renderer.
      sandbox: false,
      nodeIntegration: false,
      // Keep web contents transparent so macOS vibrancy remains visible without
      // making the whole NSWindow transparent during Dock restore animations.
      transparent: process.platform === 'darwin',
    },
  })

  hardenWindow(mainWindow)

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideMainWindow()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  loadRendererRoute(mainWindow, route)
  return mainWindow
}

function showMainWindow(route?: string): void {
  const targetRoute = route ?? lastViewRoute()
  const win = createMainWindow(targetRoute)
  if (route) {
    loadRendererRoute(win, normalizeAppRoute(route))
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function hideMainWindow(): void {
  mainWindow?.hide()
}

function quitApp(): void {
  isQuitting = true
  app.quit()
}

function startUpdateChecksSafely(): void {
  try {
    startAutomaticUpdateChecks()
  } catch (err) {
    logger.error('Unable to start update checks', err)
  }
}

// CLI subcommands that should run headless.
const CLI_COMMANDS = new Set([
  'today',
  'project',
  'export',
  'version',
  'install',
  'uninstall',
  'help',
])

function extractCliArgs(argv: string[]): string[] {
  const candidateArgs = argv.slice(1)
  const commandIndex = candidateArgs.findIndex((arg) => CLI_COMMANDS.has(arg))
  return commandIndex === -1 ? [] : candidateArgs.slice(commandIndex)
}

const cliArgs = extractCliArgs(process.argv)
const isCliMode = cliArgs.length > 0

function firstExistingPath(paths: string[]): string | null {
  return paths.find((path) => existsSync(path)) ?? null
}

function platformBinaryName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name
}

function resolvePackagedCliBinary(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const binaryName = platformBinaryName('vibetime')
  return firstExistingPath([
    ...(process.env.VIBETIME_CLI_BINARY ? [process.env.VIBETIME_CLI_BINARY] : []),
    ...(resourcesPath ? [join(resourcesPath, 'bin', binaryName)] : []),
    join(__dirname, '../../../hook', binaryName),
    join(__dirname, '../../../hook/vibetime'),
  ])
}

if (isCliMode) {
  const cliBinaryPath = resolvePackagedCliBinary()
  if (!cliBinaryPath) {
    console.error('Error: VibeTime CLI binary is missing from the app bundle.')
    app.exit(1)
  } else {
    const result = spawnSync(cliBinaryPath, cliArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        VIBETIME_HOOK_BINARY: cliBinaryPath,
      },
    })

    if (result.error) {
      console.error(`Error: ${result.error.message}`)
      app.exit(1)
    }

    app.exit(result.status ?? 0)
  }
} else {
  configureAppIdentity()

  app.whenReady().then(() => {
    configureApplicationMenu()
    configureSessionSecurity()
    registerIpcHandlers({ showMainWindow })
    startNotifyServer()
    startDbChangeWatcher()
    startReconcileLoop()
    startUpdateChecksSafely()
    createMenubarTray({
      openApp: (route) => showMainWindow(route),
      openSettings: () => showMainWindow('/settings'),
      quitApp,
    })
    setDbChangeListener(() => refreshMenubarTray())
    showMainWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    isQuitting = true
    setDbChangeListener(null)
    stopAutomaticUpdateChecks()
    destroyMenubarTray()
    stopNotifyServer()
    stopDbChangeWatcher()
    stopReconcileLoop()
  })

  app.on('activate', () => {
    showMainWindow()
  })
}
