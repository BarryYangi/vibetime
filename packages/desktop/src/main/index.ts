import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc-handlers'

// CLI subcommands that should run headless
const CLI_COMMANDS = ['today', 'project', 'export', 'version', 'install', 'help']
const cliCommand = process.argv.find((arg) => CLI_COMMANDS.includes(arg))
const isCliMode = !!cliCommand && !process.argv.some((arg) => arg.includes('electron'))

if (isCliMode) {
  const { runCli } = await import('@vibetime/hook/cli')
  await runCli()
  app.quit()
} else {
  app.whenReady().then(() => {
    registerIpcHandlers()

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Re-create window on macOS dock click
    }
  })
}
