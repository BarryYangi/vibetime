import { createConnection } from 'node:net'
import { NOTIFY_SOCKET_PATH } from './constants.js'
import { appendLog } from './log.js'

export interface HookNotification {
  type: 'db-changed'
  agent: string
  event_type: string
  session_id: string
  project: string
  ts: number
}

/**
 * Best-effort desktop notification. Failure must never affect hook success.
 */
export async function notifyDesktop(payload: HookNotification): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false
    const socket = createConnection(NOTIFY_SOCKET_PATH)

    const finish = () => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve()
    }

    socket.setTimeout(75, finish)
    socket.on('connect', () => {
      socket.end(`${JSON.stringify(payload)}\n`)
    })
    socket.on('close', finish)
    socket.on('timeout', finish)
    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(err.code ?? '')) {
        appendLog(`Desktop notify skipped: ${err}`)
      }
      finish()
    })
  })
}
