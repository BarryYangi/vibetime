import Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import { DDL_EVENTS, DDL_OPEN_TURNS, DDL_INDICES } from '@vibetime/core'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DB_PATH = join(homedir(), '.vibetime', 'data.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    db.pragma('foreign_keys = ON')
    db.exec(DDL_EVENTS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
    db.exec(DDL_OPEN_TURNS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
    for (const idx of DDL_INDICES) {
      db.exec(idx.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'))
    }
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function notifyRenderer(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('push', { type: 'db-changed' })
  }
}

export function writeAndNotify(fn: () => void): void {
  fn()
  notifyRenderer()
}
