// Config read/write for ~/.vibetime/config.toml.
// FS-02: config.toml with [projects] and [display].timezone defaults.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { ensureVibetimeDir } from './fs.js'

// Compute at call time so tests can override process.env.HOME
function getConfigPath(): string {
  return `${process.env.HOME}/.vibetime/config.toml`
}

export interface VibetimeConfig {
  projects: Record<string, string>
  display: {
    timezone: string
  }
}

const DEFAULT_CONFIG: VibetimeConfig = {
  projects: {},
  display: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
}

/**
 * Read config.toml, creating it with defaults if it doesn't exist.
 * Uses simple TOML parsing for V0 (only need [projects] and [display]).
 */
export function readConfig(): VibetimeConfig {
  ensureVibetimeDir()

  if (!existsSync(getConfigPath())) {
    writeConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }

  try {
    const raw = readFileSync(getConfigPath(), 'utf-8')
    const config = parseToml(raw)
    return {
      projects: config.projects ?? {},
      display: {
        timezone: config.display?.timezone ?? DEFAULT_CONFIG.display.timezone,
      },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

/**
 * Write config to config.toml.
 */
export function writeConfig(config: VibetimeConfig): void {
  ensureVibetimeDir()
  const content = serializeToml(config)
  writeFileSync(getConfigPath(), content, 'utf-8')
}

/**
 * Simple TOML serializer for V0 config structure.
 * Only handles flat keys and [section] tables.
 */
function serializeToml(config: VibetimeConfig): string {
  const lines: string[] = []
  lines.push('[projects]')
  for (const [key, value] of Object.entries(config.projects)) {
    lines.push(`${key} = "${value}"`)
  }
  lines.push('')
  lines.push('[display]')
  lines.push(`timezone = "${config.display.timezone}"`)
  return lines.join('\n') + '\n'
}

/**
 * Simple TOML parser for V0 config structure.
 * Only handles flat keys and [section] tables.
 */
function parseToml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let currentSection: Record<string, string> = {}
  let currentSectionName = ''

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const sectionMatch = trimmed.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      if (currentSectionName) {
        result[currentSectionName] = currentSection
      }
      currentSectionName = sectionMatch[1]
      currentSection = {}
      continue
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*"?(.+?)"?$/)
    if (kvMatch && currentSectionName) {
      currentSection[kvMatch[1]] = kvMatch[2].replace(/^"|"$/g, '')
    }
  }

  if (currentSectionName) {
    result[currentSectionName] = currentSection
  }

  return result
}
