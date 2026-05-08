import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IpcPushEvent } from '../shared/ipc-types.js'
import { notifyRenderer } from './db.js'

const SOCKET_DIR = join(homedir(), '.vibetime')
const SOCKET_PATH = join(SOCKET_DIR, 'notify.sock')

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

  mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o700 })
  if (existsSync(SOCKET_PATH)) {
    rmSync(SOCKET_PATH, { force: true })
  }

  server = createServer((socket) => {
    let buffer = ''
    socket.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        try {
          const payload = JSON.parse(line) as IpcPushEvent
          if (payload.type === 'db-changed') {
            scheduleNotify(payload)
          }
        } catch {
          scheduleNotify({ type: 'db-changed' })
        }
      }
    })
    socket.on('error', () => {
      socket.destroy()
    })
  })

  server.on('error', () => {
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

  if (existsSync(SOCKET_PATH)) {
    rmSync(SOCKET_PATH, { force: true })
  }
}
