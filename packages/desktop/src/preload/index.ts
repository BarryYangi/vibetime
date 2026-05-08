import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcMethods, IpcPushEvent, IpcResult } from '../shared/ipc-types'

const IPC_CHANNELS = new Set<IpcChannel>([
  'getTodayLiveState',
  'getHistorySummary',
  'getMenubarState',
  'getAgentStatus',
  'getConfig',
  'updateConfig',
  'getAppPreferences',
  'updateAppPreferences',
  'showMainWindow',
  'installAgent',
  'uninstallAgent',
])

function rendererPlatform(): NodeJS.Platform {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform
  }
  if (navigator.userAgent.includes('Mac OS X')) return 'darwin'
  if (navigator.userAgent.includes('Windows')) return 'win32'
  return 'linux'
}

const api = {
  platform: rendererPlatform(),
  invoke<T extends IpcChannel>(
    channel: T,
    ...args: IpcMethods[T]['args'] extends void ? [] : [IpcMethods[T]['args']]
  ): Promise<IpcResult<IpcMethods[T]['result']>> {
    if (!IPC_CHANNELS.has(channel)) {
      return Promise.resolve({ ok: false, error: 'Invalid IPC channel' })
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  onPush(callback: (event: IpcPushEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: IpcPushEvent) => callback(data)
    ipcRenderer.on('push', handler)
    return () => {
      ipcRenderer.removeListener('push', handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type VibetimeApi = typeof api
