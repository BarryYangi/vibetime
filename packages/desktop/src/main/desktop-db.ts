import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  DDL_EVENTS,
  DDL_INDICES,
  DDL_OPEN_TURNS,
  DDL_USAGE_INDICES,
  DDL_USAGE_PRICING_CACHE,
  DDL_USAGE_RECORDS,
  DDL_USAGE_SCAN_STATE,
} from '@vibetime/core'
import Database from 'better-sqlite3'

export const DB_PATH = join(homedir(), '.vibetime', 'data.db')
export const DB_DIR = join(homedir(), '.vibetime')
export const DB_FILES = new Set(['data.db', 'data.db-wal', 'data.db-shm'])

export function openDesktopDb(): Database.Database {
  mkdirSync(DB_DIR, { recursive: true, mode: 0o700 })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  initializeDesktopDbSchema(db)
  return db
}

export function initializeDesktopDbSchema(handle: Database.Database): void {
  handle.exec(DDL_EVENTS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
  handle.exec(DDL_OPEN_TURNS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
  handle.exec(DDL_USAGE_RECORDS.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
  handle.exec(DDL_USAGE_SCAN_STATE.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
  handle.exec(DDL_USAGE_PRICING_CACHE.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
  for (const idx of [...DDL_INDICES, ...DDL_USAGE_INDICES]) {
    handle.exec(idx.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'))
  }
}
