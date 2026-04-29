import { ipcMain } from 'electron'
import type { IpcChannel } from '../shared/ipc-types'

export function registerIpcHandlers(): void {
  const channels: IpcChannel[] = [
    'getTodaySummary', 'getOpenTurns', 'getAgentStatus',
    'getConfig', 'updateConfig', 'installAgent',
  ]
  for (const channel of channels) {
    ipcMain.handle(channel, async () => {
      return { ok: false, error: 'Not implemented yet' }
    })
  }
}
