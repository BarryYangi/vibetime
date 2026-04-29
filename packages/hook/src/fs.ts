// Filesystem utilities for ~/.vibetime/ directory management.

import { mkdirSync } from 'node:fs'

/**
 * Ensure the ~/.vibetime/ directory exists with mode 0700.
 * Idempotent — safe to call on every hook invocation.
 */
export function ensureVibetimeDir(): string {
  const dir = `${process.env.HOME}/.vibetime`
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}
