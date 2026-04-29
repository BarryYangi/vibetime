// Hook log with rotation (~10MB cap). All diagnostics go here — hook stdout is silent.

import { statSync, renameSync, appendFileSync, mkdirSync } from 'node:fs'
import { LOG_PATH, MAX_LOG_SIZE } from './constants.js'

/**
 * Append a timestamped line to ~/.vibetime/hook.log.
 * Rotates the log file if it exceeds MAX_LOG_SIZE.
 * Never throws — hook must exit 0.
 */
export function appendLog(message: string): void {
  try {
    mkdirSync(`${process.env.HOME}/.vibetime`, { recursive: true, mode: 0o700 })
    try {
      const stat = statSync(LOG_PATH)
      if (stat.size > MAX_LOG_SIZE) {
        renameSync(LOG_PATH, `${LOG_PATH}.1`)
      }
    } catch {
      // File doesn't exist yet — fine
    }
    const line = `[${new Date().toISOString()}] ${message}\n`
    appendFileSync(LOG_PATH, line)
  } catch {
    // Last resort: swallow. Hook must never surface errors.
  }
}
