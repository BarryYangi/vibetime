// Install hooks for AI coding agents (Claude Code, Codex, Cursor).
// CLI-01: idempotent — skips if vibetime hook already exists.
// CLI-02: Codex requires [features] codex_hooks = true in config.toml.
// All operations backed up before modification; existing hooks preserved.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { appendLog } from './log.js'

// Hook binary path — resolved from process.execPath (for compiled binary) or import.meta.dir (for dev)
const HOOK_BINARY_PATH = process.execPath.includes('vibetime')
  ? process.execPath
  : `${import.meta.dir}/../vibetime-hook`

/**
 * Install hooks for Claude Code.
 * Configures ~/.claude/settings.json with vibetime hooks.
 * Idempotent — skips if vibetime hook already exists.
 */
export function installClaudeCode(): void {
  const settingsPath = `${process.env.HOME}/.claude/settings.json`

  try {
    // Ensure directory exists
    mkdirSync(dirname(settingsPath), { recursive: true })

    // Read existing settings or create empty
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      } catch {
        // Backup corrupted file
        copyFileSync(settingsPath, `${settingsPath}.backup`)
      }
    }

    // Backup before modification
    if (existsSync(settingsPath)) {
      copyFileSync(settingsPath, `${settingsPath}.backup`)
    }

    // Initialize hooks structure
    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>
    const events = ['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd']

    for (const event of events) {
      const arr = (hooks[event] ?? []) as Array<{
        matcher?: string
        hooks?: Array<{ type: string; command: string }>
      }>

      // Find or create matcher group with matcher: "*"
      let existing = arr.find((g) => g.matcher === '*')
      if (existing) {
        // Check if vibetime hook already exists (idempotent)
        const hasVibetime = existing.hooks?.some((h) => h.command.includes('vibetime-hook'))
        if (hasVibetime) continue

        // Add vibetime hook to existing group
        existing.hooks = existing.hooks ?? []
        existing.hooks.push({ type: 'command', command: `${HOOK_BINARY_PATH} --source claude-code` })
      } else {
        // Create new matcher group
        arr.push({
          matcher: '*',
          hooks: [{ type: 'command', command: `${HOOK_BINARY_PATH} --source claude-code` }],
        })
      }

      hooks[event] = arr
    }

    settings.hooks = hooks
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  } catch (err) {
    appendLog(`Error installing Claude Code hooks: ${err}`)
    throw err
  }
}

/**
 * Install hooks for Codex CLI.
 * Configures ~/.codex/hooks.json and ~/.codex/config.toml.
 * Idempotent — skips if vibetime hook already exists.
 */
export function installCodex(): void {
  const hooksPath = `${process.env.HOME}/.codex/hooks.json`
  const configPath = `${process.env.HOME}/.codex/config.toml`

  try {
    // Ensure directory exists
    mkdirSync(dirname(hooksPath), { recursive: true })

    // 1. Ensure config.toml has [features] codex_hooks = true
    let configContent = ''
    if (existsSync(configPath)) {
      configContent = readFileSync(configPath, 'utf-8')
      // Backup before modification
      copyFileSync(configPath, `${configPath}.backup`)
    }

    // Check if codex_hooks = true already exists
    if (!configContent.includes('codex_hooks = true')) {
      // Add or update [features] section
      if (configContent.includes('[features]')) {
        // Add codex_hooks under existing [features]
        configContent = configContent.replace(
          /\[features\]/,
          '[features]\ncodex_hooks = true',
        )
      } else {
        // Add [features] section at end
        configContent += '\n[features]\ncodex_hooks = true\n'
      }
      writeFileSync(configPath, configContent)
    }

    // 2. Configure hooks.json
    let hooksData: Record<string, unknown> = { hooks: {} }
    if (existsSync(hooksPath)) {
      try {
        hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
      } catch {
        // Backup corrupted file
        copyFileSync(hooksPath, `${hooksPath}.backup`)
      }
    }

    // Backup before modification
    if (existsSync(hooksPath)) {
      copyFileSync(hooksPath, `${hooksPath}.backup`)
    }

    // Initialize hooks structure
    const hooks = (hooksData.hooks ?? {}) as Record<string, unknown[]>
    const events = ['SessionStart', 'UserPromptSubmit', 'Stop'] // No SessionEnd for Codex

    for (const event of events) {
      const arr = (hooks[event] ?? []) as Array<{
        hooks?: Array<{ type: string; command: string; timeout?: number }>
      }>

      // Check if vibetime hook already exists (idempotent)
      const hasVibetime = arr.some((g) =>
        g.hooks?.some((h) => h.command.includes('vibetime-hook')),
      )
      if (hasVibetime) continue

      // Add vibetime hook
      arr.push({
        hooks: [{ type: 'command', command: `${HOOK_BINARY_PATH} --source codex`, timeout: 10 }],
      })

      hooks[event] = arr
    }

    hooksData.hooks = hooks
    writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2))
  } catch (err) {
    appendLog(`Error installing Codex hooks: ${err}`)
    throw err
  }
}

/**
 * Install hooks for Cursor.
 * Configures ~/.cursor/hooks.json.
 * Idempotent — skips if vibetime hook already exists.
 */
export function installCursor(): void {
  const hooksPath = `${process.env.HOME}/.cursor/hooks.json`

  try {
    // Ensure directory exists
    mkdirSync(dirname(hooksPath), { recursive: true })

    // Read existing hooks or create default
    let hooksData: Record<string, unknown> = { version: 1, hooks: {} }
    if (existsSync(hooksPath)) {
      try {
        hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
      } catch {
        // Backup corrupted file
        copyFileSync(hooksPath, `${hooksPath}.backup`)
      }
    }

    // Backup before modification
    if (existsSync(hooksPath)) {
      copyFileSync(hooksPath, `${hooksPath}.backup`)
    }

    // Initialize hooks structure
    const hooks = (hooksData.hooks ?? {}) as Record<string, unknown[]>
    const events = ['beforeSubmitPrompt', 'stop', 'sessionStart', 'sessionEnd']

    for (const event of events) {
      const arr = (hooks[event] ?? []) as Array<{ command: string }>

      // Check if vibetime hook already exists (idempotent)
      const hasVibetime = arr.some((h) => h.command.includes('vibetime-hook'))
      if (hasVibetime) continue

      // Add vibetime hook (append to array)
      arr.push({ command: `${HOOK_BINARY_PATH} --source cursor` })

      hooks[event] = arr
    }

    hooksData.hooks = hooks
    writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2))
  } catch (err) {
    appendLog(`Error installing Cursor hooks: ${err}`)
    throw err
  }
}

/**
 * Install hooks for the specified agent.
 * Dispatches to the appropriate install function.
 */
export function installAgent(agent: string): void {
  switch (agent) {
    case 'claude-code':
      installClaudeCode()
      break
    case 'codex':
      installCodex()
      break
    case 'cursor':
      installCursor()
      break
    default:
      throw new Error(`Unknown agent: ${agent}. Supported: claude-code, codex, cursor`)
  }
}
