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
    language: 'en' | 'zh'
    open_at_login: boolean
    theme: 'system' | 'light' | 'dark'
    last_view: string
  }
}

const DEFAULT_CONFIG: VibetimeConfig = {
  projects: {},
  display: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  app: {
    language: 'en',
    open_at_login: false,
    theme: 'system',
    last_view: '/',
  },
}

function readEnum<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
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
        timezone: readString(config.display?.timezone, DEFAULT_CONFIG.display.timezone),
      },
      app: {
        language: readEnum(config.app?.language, ['en', 'zh'], DEFAULT_CONFIG.app.language),
        open_at_login: readBoolean(config.app?.open_at_login, DEFAULT_CONFIG.app.open_at_login),
        theme: readEnum(config.app?.theme, ['system', 'light', 'dark'], DEFAULT_CONFIG.app.theme),
        last_view: readString(config.app?.last_view, DEFAULT_CONFIG.app.last_view),
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
    lines.push(`"${escapeTomlString(key)}" = "${escapeTomlString(value)}"`)
  }
  lines.push('')
  lines.push('[display]')
  lines.push(`timezone = "${escapeTomlString(config.display.timezone)}"`)
  lines.push('')
  lines.push('[app]')
  lines.push(`language = "${config.app.language}"`)
  lines.push(`open_at_login = ${config.app.open_at_login}`)
  lines.push(`theme = "${config.app.theme}"`)
  lines.push(`last_view = "${escapeTomlString(config.app.last_view)}"`)
  return `${lines.join('\n')}\n`
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function unescapeTomlString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function parseTomlValue(rawValue: string): string | boolean {
  const value = rawValue.trim()
  if (value === 'true') return true
  if (value === 'false') return false
  if (value.startsWith('"') && value.endsWith('"')) {
    return unescapeTomlString(value.slice(1, -1))
  }
  return value
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

    const kvMatch = trimmed.match(/^(?:"((?:\\.|[^"\\])*)"|([A-Za-z0-9_-]+))\s*=\s*(.+)$/)
    if (kvMatch && currentSectionName) {
      const key = kvMatch[1] ? unescapeTomlString(kvMatch[1]) : kvMatch[2]
      const rawValue = kvMatch[3]
      if (!key || rawValue === undefined) continue
      currentSection[key] = parseTomlValue(rawValue)
    }
  }

  if (currentSectionName) {
    result[currentSectionName] = currentSection
  }

  return result as Partial<VibetimeConfig>
}
