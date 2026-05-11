// Persist-failure breadcrumbs for ~/.vibetime/hook-health.json.
// This file is the only durable signal that the hook tried to write events but
// SQLite refused (busy / locked / corrupt / disk full / permissions). The
// happy-path hook stays exit 0 and silent; `vibetime health` and manual
// diagnosis read this file to surface data-loss risk.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureVibetimeDir } from './fs.js'
import { vibetimeDir } from './paths.js'

export interface HookHealthFailure {
  ts: number // unix epoch seconds
  message: string
  agent: string
  event_type: string
}

export interface HookHealthState {
  lastError: HookHealthFailure | null
  consecutiveFailures: number
  recentFailures: HookHealthFailure[] // last 24h, capped at HEALTH_MAX_RECENT
}

const HEALTH_RETENTION_SEC = 24 * 60 * 60
const HEALTH_MAX_RECENT = 100 // bound memory regardless of failure rate
const HEALTH_MESSAGE_MAX_LEN = 500 // bound size of any single error message

function getHealthPath(): string {
  return join(vibetimeDir(), 'hook-health.json')
}

function emptyState(): HookHealthState {
  return { lastError: null, consecutiveFailures: 0, recentFailures: [] }
}

function readState(): HookHealthState {
  try {
    const raw = readFileSync(getHealthPath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as HookHealthState).recentFailures)
    ) {
      const candidate = parsed as HookHealthState
      return {
        lastError: candidate.lastError ?? null,
        consecutiveFailures: Number.isFinite(candidate.consecutiveFailures)
          ? candidate.consecutiveFailures
          : 0,
        recentFailures: candidate.recentFailures,
      }
    }
  } catch {
    // Missing or corrupt — start fresh.
  }
  return emptyState()
}

function atomicWrite(content: string): void {
  ensureVibetimeDir()
  const finalPath = getHealthPath()
  // Atomic replace via tmp + rename so readers never see a half-written file.
  const tmp = `${finalPath}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, finalPath)
}

export function recordPersistFailure(input: {
  message: string
  agent: string
  event_type: string
  now?: number
}): void {
  try {
    const state = readState()
    const now = input.now ?? Math.floor(Date.now() / 1000)
    const failure: HookHealthFailure = {
      ts: now,
      message: input.message.slice(0, HEALTH_MESSAGE_MAX_LEN),
      agent: input.agent,
      event_type: input.event_type,
    }
    const cutoff = now - HEALTH_RETENTION_SEC
    const recent = [...state.recentFailures.filter((f) => f.ts >= cutoff), failure].slice(
      -HEALTH_MAX_RECENT,
    )
    const next: HookHealthState = {
      lastError: failure,
      consecutiveFailures: state.consecutiveFailures + 1,
      recentFailures: recent,
    }
    atomicWrite(`${JSON.stringify(next, null, 2)}\n`)
  } catch {
    // Hook must exit 0 — health bookkeeping must never crash the hook.
  }
}

// Cheap on the happy path: no health file → no read, no write.
export function recordPersistSuccess(): void {
  try {
    if (!existsSync(getHealthPath())) return
    const state = readState()
    if (state.consecutiveFailures === 0) return
    const next: HookHealthState = {
      ...state,
      consecutiveFailures: 0,
    }
    atomicWrite(`${JSON.stringify(next, null, 2)}\n`)
  } catch {
    // Same contract — never throw.
  }
}

export function readHookHealth(): HookHealthState {
  return readState()
}
