import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOG_DIR = join(homedir(), '.vibetime')
const LOG_PATH = join(LOG_DIR, 'main.log')
// Mirror the hook log policy (10MB rotate). Keeping it small means tail-ing the
// log to diagnose a crash stays cheap on slow disks / network homes.
const MAX_LOG_SIZE = 10 * 1024 * 1024

type LogLevel = 'info' | 'warn' | 'error'

function formatLine(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const ctx = context && Object.keys(context).length > 0 ? ` ${safeJson(context)}` : ''
  return `[${ts}] ${level.toUpperCase()} ${message}${ctx}\n`
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    // Circular refs, BigInt, etc. — fall back to a shallow toString so logging
    // never explodes for an unloggable context.
    return String(value)
  }
}

function rotateIfNeeded(): void {
  try {
    const stat = statSync(LOG_PATH)
    if (stat.size > MAX_LOG_SIZE) {
      renameSync(LOG_PATH, `${LOG_PATH}.1`)
    }
  } catch {
    // File doesn't exist yet — fine.
  }
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 })
    rotateIfNeeded()
    appendFileSync(LOG_PATH, formatLine(level, message, context))
  } catch {
    // Last resort: swallow. Main process must never crash on logging.
  }
}

function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack }
  }
  return { value: String(err) }
}

export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    write('info', message, context)
  },
  warn(message: string, context?: Record<string, unknown>): void {
    write('warn', message, context)
  },
  error(message: string, err?: unknown, context?: Record<string, unknown>): void {
    write('error', message, {
      ...(context ?? {}),
      ...(err === undefined ? {} : describeError(err)),
    })
  },
}
