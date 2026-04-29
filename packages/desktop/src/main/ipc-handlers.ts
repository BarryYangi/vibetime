import { ipcMain } from 'electron'
import type { IpcResult } from '../shared/ipc-types.js'
import {
  queryTodaySummary,
  queryOpenTurnsForIpc,
  queryAgentStatus,
  writeAndNotify,
} from './db.js'
import { readConfig, writeConfig } from '@vibetime/hook/config'
import { installAgent } from '@vibetime/hook/install'

export function registerIpcHandlers(): void {
  ipcMain.handle('getTodaySummary', async (): Promise<IpcResult<ReturnType<typeof queryTodaySummary>>> => {
    try {
      return { ok: true, data: queryTodaySummary() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('getOpenTurns', async (): Promise<IpcResult<ReturnType<typeof queryOpenTurnsForIpc>>> => {
    try {
      return { ok: true, data: queryOpenTurnsForIpc() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('getAgentStatus', async (): Promise<IpcResult<ReturnType<typeof queryAgentStatus>>> => {
    try {
      return { ok: true, data: queryAgentStatus() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('getConfig', async (): Promise<IpcResult<ReturnType<typeof readConfig>>> => {
    try {
      return { ok: true, data: readConfig() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('updateConfig', async (_event, config): Promise<IpcResult<void>> => {
    try {
      const current = readConfig()
      writeConfig({ ...current, ...config })
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('installAgent', async (_event, { agent }): Promise<IpcResult<void>> => {
    try {
      writeAndNotify(() => installAgent(agent))
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
