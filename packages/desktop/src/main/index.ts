import { join } from 'node:path'
import type { MenuItemConstructorOptions } from 'electron'
import { app, BrowserWindow, Menu } from 'electron'
import { startDbChangeWatcher, stopDbChangeWatcher } from './db.js'
import { registerIpcHandlers } from './ipc-handlers'
import { startNotifyServer, stopNotifyServer } from './notify-server.js'

const APP_NAME = 'VibeTime'
const MIN_WINDOW_WIDTH = 960
const MIN_WINDOW_HEIGHT = 640

function configureAppIdentity() {
  app.setName(APP_NAME)
  app.setAppUserModelId('ee.yct.vibetime')
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
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
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

// CLI subcommands that should run headless
const CLI_COMMANDS = ['today', 'project', 'export', 'version', 'install', 'uninstall', 'help']
const cliCommand = process.argv.find((arg) => CLI_COMMANDS.includes(arg))
const isCliMode = !!cliCommand && !process.argv.some((arg) => arg.includes('electron'))

if (isCliMode) {
  const { runCli } = await import('@vibetime/hook/cli')
  await runCli()
  app.quit()
} else {
  configureAppIdentity()

  app.whenReady().then(() => {
    configureApplicationMenu()
    registerIpcHandlers()
    startNotifyServer()
    startDbChangeWatcher()

    const win = new BrowserWindow({
      title: APP_NAME,
      width: 1200,
      height: 800,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      ...(process.platform === 'darwin' && {
        backgroundColor: '#00000000',
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 14, y: 12 },
        transparent: true,
        vibrancy: 'under-window' as const,
        visualEffectState: 'active' as const,
      }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
      },
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopNotifyServer()
    stopDbChangeWatcher()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Re-create window on macOS dock click
    }
  })
}
