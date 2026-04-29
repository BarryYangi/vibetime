// Filesystem initialization for ~/.vibetime/ directory.
// FS-01: directory created with mode 0700.

import { mkdirSync } from 'node:fs'

/**
 * Ensure ~/.vibetime/ directory exists with mode 0700.
 * Returns the directory path.
 */
export function ensureVibetimeDir(): string {
  const dir = `${process.env.HOME}/.vibetime`
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}
