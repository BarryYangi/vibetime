import { fileURLToPath } from 'node:url'
import { type UtilityProcess, utilityProcess } from 'electron'
import type { IpcPushEvent } from '../shared/ipc-types.js'
import { notifyRenderer } from './db.js'
import { logger } from './logger.js'
import type { DesktopUsageRefreshResult, UsageRefreshOptions } from './usage-service.js'

type UsageWorkerRequest = {
  requestId: number
  type: 'refresh'
  refreshPricing: boolean
}

type UsageWorkerResponse =
  | { requestId: number; type: 'result'; result: DesktopUsageRefreshResult }
  | { requestId: number; type: 'error'; error: string }
  | { type: 'push'; event: IpcPushEvent }

type PendingRefresh = {
  reject: (error: Error) => void
  resolve: (result: DesktopUsageRefreshResult) => void
}

const USAGE_REFRESH_WORKER_PATH = fileURLToPath(
  new URL('./usage-refresh-worker.js', import.meta.url),
)

let usageWorker: UtilityProcess | null = null
let usageWorkerSpawn: Promise<void> | null = null
let nextRequestId = 1
const pendingRefreshes = new Map<number, PendingRefresh>()

function rejectPendingRefreshes(error: Error): void {
  for (const pending of pendingRefreshes.values()) pending.reject(error)
  pendingRefreshes.clear()
}

function handleWorkerMessage(message: UsageWorkerResponse): void {
  if (message.type === 'push') {
    notifyRenderer(message.event)
    return
  }

  const pending = pendingRefreshes.get(message.requestId)
  if (!pending) return
  pendingRefreshes.delete(message.requestId)

  if (message.type === 'result') {
    pending.resolve(message.result)
  } else {
    pending.reject(new Error(message.error))
  }
}

function ensureUsageWorker(): { process: UtilityProcess; spawned: Promise<void> } {
  if (usageWorker?.pid && usageWorkerSpawn) {
    return { process: usageWorker, spawned: usageWorkerSpawn }
  }

  const worker = utilityProcess.fork(USAGE_REFRESH_WORKER_PATH, [], {
    ...(process.platform === 'darwin' ? { allowLoadingUnsignedLibraries: true } : {}),
    serviceName: 'VibeTime Usage Ingestion',
    stdio: 'pipe',
  })
  usageWorker = worker
  usageWorkerSpawn = new Promise((resolve, reject) => {
    worker.once('spawn', resolve)
    worker.once('exit', (code) => reject(new Error(`Usage worker exited before spawn: ${code}`)))
  })

  worker.on('message', handleWorkerMessage)
  worker.stderr?.on('data', (chunk) => {
    logger.error('usage worker stderr', String(chunk))
  })
  worker.once('exit', (code) => {
    if (usageWorker === worker) {
      usageWorker = null
      usageWorkerSpawn = null
    }
    rejectPendingRefreshes(new Error(`Usage worker exited: ${code}`))
  })
  worker.once('error', (type, location) => {
    rejectPendingRefreshes(new Error(`Usage worker error: ${type} at ${location}`))
  })

  return { process: worker, spawned: usageWorkerSpawn }
}

export async function runUsageRefreshInUtilityProcess(
  options: UsageRefreshOptions,
): Promise<DesktopUsageRefreshResult> {
  const worker = ensureUsageWorker()
  await worker.spawned

  const requestId = nextRequestId
  nextRequestId += 1

  return new Promise((resolve, reject) => {
    pendingRefreshes.set(requestId, { resolve, reject })
    const request: UsageWorkerRequest = {
      requestId,
      type: 'refresh',
      refreshPricing: options.refreshPricing ?? true,
    }
    try {
      worker.process.postMessage(request)
    } catch (error) {
      pendingRefreshes.delete(requestId)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function stopUsageRefreshUtilityProcess(): void {
  const worker = usageWorker
  usageWorker = null
  usageWorkerSpawn = null
  rejectPendingRefreshes(new Error('Usage worker stopped'))
  worker?.kill()
}
