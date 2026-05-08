import { app, type BrowserWindow, session } from 'electron'

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const APP_ROUTES = new Set(['/', '/live', '/history', '/settings'])

export function normalizeAppRoute(route: unknown, fallback = '/'): string {
  if (typeof route !== 'string') return fallback
  const path = route.startsWith('/') ? route : `/${route}`
  return APP_ROUTES.has(path) ? path : fallback
}

export function trustedRendererUrl(): string | null {
  const raw = process.env.ELECTRON_RENDERER_URL
  if (!raw) return null

  if (app.isPackaged) {
    throw new Error('ELECTRON_RENDERER_URL is not allowed in packaged builds')
  }

  const url = new URL(raw)
  const isLocalHttp = url.protocol === 'http:' && LOCAL_DEV_HOSTS.has(url.hostname)
  if (!isLocalHttp) {
    throw new Error('ELECTRON_RENDERER_URL must be a local http dev server')
  }

  url.hash = ''
  return url.toString()
}

export function configureSessionSecurity(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

export function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, targetUrl) => {
    const currentUrl = win.webContents.getURL()
    if (targetUrl !== currentUrl) {
      event.preventDefault()
    }
  })
}
