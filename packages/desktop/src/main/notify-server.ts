import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IpcPushEvent } from '../shared/ipc-types.js'
import { notifyRenderer } from './db.js'
import { logger } from './logger.js'

const SOCKET_DIR = join(homedir(), '.vibetime')
const SOCKET_PATH =
  process.platform === 'win32' ? '\\\\.\\pipe\\vibetime-notify' : join(SOCKET_DIR, 'notify.sock')

let server: Server | null = null
let notifyTimer: ReturnType<typeof setTimeout> | null = null
let pendingEvent: IpcPushEvent = { type: 'db-changed' }

function scheduleNotify(event: IpcPushEvent): void {
  pendingEvent = event
  if (notifyTimer) clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    notifyRenderer(pendingEvent)
  }, 60)
}

export function startNotifyServer(): void {
  if (server) return

  if (process.platform !== 'win32') {
    mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o700 })
  }

  if (process.platform !== 'win32' && existsSync(SOCKET_PATH)) {
    rmSync(SOCKET_PATH, { force: true })
  }

  server = createServer((socket) => {
    let buffer = ''
    socket.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line) continue
        try {
          const payload = JSON.parse(line) as IpcPushEvent
          if (payload && payload.type === 'db-changed') {
            scheduleNotify(payload)
          }
        } catch {
          // Malformed payloads are ignored — do NOT fall back to refreshing the
          // renderer, otherwise any local process writing garbage to the socket
          // could trigger arbitrary UI/db churn.
        }
      }
    })
    socket.on('error', (err) => {
      logger.warn('notify socket client error', { message: String(err) })
      socket.destroy()
    })
  })

  server.on('error', (err) => {
    logger.error('notify server crashed', err, { socketPath: SOCKET_PATH })
    stopNotifyServer()
  })

  server.listen(SOCKET_PATH)
}

export function stopNotifyServer(): void {
  if (notifyTimer) {
    clearTimeout(notifyTimer)
    notifyTimer = null
  }

  server?.close()
  server = null

  if (process.platform !== 'win32' && existsSync(SOCKET_PATH)) {
    rmSync(SOCKET_PATH, { force: true })
  }
}
