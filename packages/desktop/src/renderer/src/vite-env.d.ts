/// <reference types="vite/client" />

import type { IpcChannel, IpcMethods, IpcPushEvent, IpcResult } from '../../shared/ipc-types'

interface VibetimeApi {
  platform: NodeJS.Platform
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
