import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcPushEvent, IpcMethods, IpcResult } from '../shared/ipc-types'

const api = {
  invoke<T extends IpcChannel>(
    channel: T,
    ...args: IpcMethods[T]['args'] extends void ? [] : [IpcMethods[T]['args']]
  ): Promise<IpcResult<IpcMethods[T]['result']>> {
    return ipcRenderer.invoke(channel, ...args)
  },
  onPush(callback: (event: IpcPushEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, data: IpcPushEvent) => callback(data)
    ipcRenderer.on('push', handler)
    return () => { ipcRenderer.removeListener('push', handler) }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type VibetimeApi = typeof api
