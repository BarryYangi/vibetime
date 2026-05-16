import type Database from 'better-sqlite3'
import type { IpcPushEvent } from '../shared/ipc-types.js'
import { openDesktopDb } from './desktop-db.js'
import { configureUsageServiceRuntime, runUsageRefreshIngestion } from './usage-service.js'

type ParentPort = {
  on(event: 'message', listener: (messageEvent: { data: UsageWorkerRequest }) => void): void
  postMessage(message: UsageWorkerResponse): void
}

type UsageWorkerRequest = {
  requestId: number
  type: 'refresh'
  refreshPricing: boolean
}

type UsageWorkerResponse =
  | {
      requestId: number
      type: 'result'
      result: Awaited<ReturnType<typeof runUsageRefreshIngestion>>
    }
  | { requestId: number; type: 'error'; error: string }
  | { type: 'push'; event: IpcPushEvent }

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort
if (!parentPort) throw new Error('Usage refresh worker requires process.parentPort')

let db: Database.Database | null = null

function getWorkerDb(): Database.Database {
  db ??= openDesktopDb()
  return db
}

configureUsageServiceRuntime({
  getDb: getWorkerDb,
  notifyRenderer: (event) => {
    if (event) parentPort.postMessage({ type: 'push', event })
  },
})

parentPort.on('message', (messageEvent) => {
  const message = messageEvent.data
  if (message.type !== 'refresh') return
  void runUsageRefreshIngestion({
    db: getWorkerDb(),
    refreshPricing: message.refreshPricing,
    useDefaultAppRefreshPath: true,
  })
    .then((result) => {
      parentPort.postMessage({ requestId: message.requestId, type: 'result', result })
    })
    .catch((error) => {
      parentPort.postMessage({
        requestId: message.requestId,
        type: 'error',
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      })
    })
})

process.once('exit', () => {
  db?.close()
  db = null
})
