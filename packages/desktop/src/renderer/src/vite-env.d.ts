/// <reference types="vite/client" />

import type { IpcChannel, IpcPushEvent, IpcMethods, IpcResult } from '../../shared/ipc-types'

interface VibetimeApi {
  invoke<T extends IpcChannel>(
    channel: T,
    ...args: IpcMethods[T]['args'] extends void ? [] : [IpcMethods[T]['args']]
  ): Promise<IpcResult<IpcMethods[T]['result']>>
  onPush(callback: (event: IpcPushEvent) => void): () => void
}

declare global {
  interface Window {
    api: VibetimeApi
  }
}
