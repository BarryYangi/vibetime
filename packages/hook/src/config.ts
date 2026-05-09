// Config read/write for ~/.vibetime/config.toml.
// FS-02: config.toml with [projects] and [display].timezone defaults.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureVibetimeDir } from './fs.js'

// Compute at call time so tests can override process.env.HOME
function getConfigPath(): string {
  return join(ensureVibetimeDir(), 'config.toml')
}

export interface VibetimeConfig {
  projects: Record<string, string>
  display: {
    timezone: string
  }
  app: {
    open_at_login: boolean
    last_view: string
  }
}

const DEFAULT_CONFIG: VibetimeConfig = {
  projects: {},
  display: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  app: {
    open_at_login: false,
    last_view: '/',
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
      app: {
        open_at_login: config.app?.open_at_login ?? DEFAULT_CONFIG.app.open_at_login,
        last_view: config.app?.last_view ?? DEFAULT_CONFIG.app.last_view,
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
  lines.push('')
  lines.push('[app]')
  lines.push(`open_at_login = ${config.app.open_at_login}`)
  lines.push(`last_view = "${config.app.last_view}"`)
  return `${lines.join('\n')}\n`
}

/**
 * Simple TOML parser for V0 config structure.
 * Only handles flat keys and [section] tables.
 */
function parseToml(raw: string): Partial<VibetimeConfig> {
  const result: Record<string, Record<string, string | boolean>> = {}
  let currentSection: Record<string, string | boolean> = {}
  let currentSectionName = ''

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const sectionMatch = trimmed.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      if (currentSectionName) {
        result[currentSectionName] = currentSection
      }
      currentSectionName = sectionMatch[1] ?? ''
      currentSection = {}
      continue
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*"?(.+?)"?$/)
    if (kvMatch && currentSectionName) {
      const key = kvMatch[1]
      const rawValue = kvMatch[2]?.replace(/^"|"$/g, '')
      if (!key || rawValue === undefined) continue
      currentSection[key] = rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue
    }
  }

  if (currentSectionName) {
    result[currentSectionName] = currentSection
  }

  return result as Partial<VibetimeConfig>
}
