import Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import { DDL_EVENTS, DDL_OPEN_TURNS, DDL_INDICES } from '@vibetime/core'
import type { NormalizedEvent } from '@vibetime/core'
import type { TodaySummary, OpenTurn, AgentStatus } from '../shared/ipc-types.js'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, existsSync } from 'node:fs'

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

export function queryTodaySummary(): TodaySummary {
  const db = getDb()
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const from = Math.floor(startOfDay.getTime() / 1000)
  const to = Math.floor(now.getTime() / 1000)

  const events = db
    .prepare('SELECT * FROM events WHERE ts >= ? AND ts <= ? ORDER BY ts ASC')
    .all(from, to) as NormalizedEvent[]

  const projectMap = new Map<string, { total: number; agents: Map<string, number> }>()
  let turnCount = 0

  for (const ev of events) {
    let entry = projectMap.get(ev.project)
    if (!entry) {
      entry = { total: 0, agents: new Map() }
      projectMap.set(ev.project, entry)
    }
    if (ev.duration_sec) entry.total += ev.duration_sec
    if (ev.event_type === 'turn_start') turnCount++
    const agentTotal = entry.agents.get(ev.agent) ?? 0
    entry.agents.set(ev.agent, agentTotal + (ev.duration_sec ?? 0))
  }

  const projects = [...projectMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => ({
      name,
      total: data.total,
      agents: [...data.agents.entries()]
        .filter(([, t]) => t > 0)
        .map(([agent, total]) => ({ agent, total })),
    }))

  return {
    date: now.toLocaleDateString('en-CA'), // YYYY-MM-DD
    grandTotal: projects.reduce((sum, p) => sum + p.total, 0),
    projects,
    turnCount,
    activeProjectCount: projectMap.size,
  }
}

export function queryOpenTurnsForIpc(): OpenTurn[] {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const rows = db.prepare('SELECT * FROM open_turns').all() as Array<{
    turn_id: string
    agent: string
    project: string
    session_id: string
    started_at: number
    timezone: string
  }>
  return rows.map((row) => ({
    ...row,
    elapsed: now - row.started_at,
  }))
}

export function queryAgentStatus(): AgentStatus[] {
  const agents = ['claude-code', 'codex', 'cursor'] as const

  function checkAgent(agent: string): boolean {
    try {
      switch (agent) {
        case 'claude-code': {
          const path = `${process.env.HOME}/.claude/settings.json`
          if (!existsSync(path)) return false
          const data = JSON.parse(readFileSync(path, 'utf-8'))
          return !!(data.hooks && Object.keys(data.hooks).length > 0)
        }
        case 'codex': {
          const path = `${process.env.HOME}/.codex/hooks.json`
          if (!existsSync(path)) return false
          const data = JSON.parse(readFileSync(path, 'utf-8'))
          return !!(data.hooks && Object.keys(data.hooks).length > 0)
        }
        case 'cursor': {
          const path = `${process.env.HOME}/.cursor/hooks.json`
          if (!existsSync(path)) return false
          const data = JSON.parse(readFileSync(path, 'utf-8'))
          return !!(data.hooks && Object.keys(data.hooks).length > 0)
        }
        default:
          return false
      }
    } catch {
      return false
    }
  }

  return agents.map((agent) => ({
    agent,
    installed: checkAgent(agent),
  }))
}
