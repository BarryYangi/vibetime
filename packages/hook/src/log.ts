// Log rotation for ~/.vibetime/hook.log.
// HOOK-03: rotation at ~10MB. appendLog never throws.

import { statSync, renameSync, appendFileSync } from 'node:fs'
import { MAX_LOG_SIZE } from './constants.js'
import { ensureVibetimeDir } from './fs.js'

// Compute at call time so tests can override process.env.HOME
function getLogPath(): string {
  return `${process.env.HOME}/.vibetime/hook.log`
}

/**
 * Append a message to hook.log with rotation at ~10MB.
 * Never throws — hook must never surface errors.
 */
export function appendLog(message: string): void {
  try {
    ensureVibetimeDir()

    // Check for rotation
    try {
      const logPath = getLogPath()
      const stat = statSync(logPath)
      if (stat.size > MAX_LOG_SIZE) {
        renameSync(logPath, `${logPath}.1`)
      }
    } catch {
      // File doesn't exist yet — fine
    }

    const line = `[${new Date().toISOString()}] ${message}\n`
    appendFileSync(getLogPath(), line)
  } catch {
    // Last resort: swallow. Hook must never surface errors.
  }
}
