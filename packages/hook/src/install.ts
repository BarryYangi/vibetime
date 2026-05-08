// Install hooks for AI coding agents (Claude Code, Codex, Cursor).
// CLI-01: idempotent — skips if vibetime hook already exists.
// CLI-02: Codex requires [features] hooks = true in config.toml.
// All operations backed up before modification; existing hooks preserved.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendLog } from './log.js'

export function resolveHookBinaryPath(): string {
  if (process.env.VIBETIME_HOOK_BINARY) return process.env.VIBETIME_HOOK_BINARY

  const cliBinaryName = process.platform === 'win32' ? 'vibetime.exe' : 'vibetime'
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    const packagedCliPath = join(resourcesPath, 'bin', cliBinaryName)
    if (existsSync(packagedCliPath)) return packagedCliPath
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const localCliPath = join(moduleDir, '..', cliBinaryName)
  if (existsSync(localCliPath)) return localCliPath

  return localCliPath
}

const CODEX_FEATURE_MARKER = '# vibetime-managed'
const CODEX_MANAGED_SECTION_MARKER = '# vibetime-managed-section'
const CODEX_FEATURE_KEY = 'hooks'
const CODEX_FEATURE_KEY_PATTERN = '(?:hooks|codex_hooks)'

function isVibetimeCommand(command: unknown): command is string {
  if (typeof command !== 'string') return false
  return /\bvibetime(?:\.exe)?\b/i.test(command) && command.includes('--source')
}

function ensureCodexHooksEnabled(configContent: string): string {
  const removeLegacyFlags = (content: string) =>
    content.replace(/^\s*codex_hooks\s*=\s*(?:true|false)\b.*(?:\n|$)/gm, '')

  if (/^\s*hooks\s*=\s*true\b/m.test(configContent)) {
    return removeLegacyFlags(configContent)
  }

  const managedTrueLine = `${CODEX_FEATURE_KEY} = true ${CODEX_FEATURE_MARKER}`
  const falseFlagPattern = /^(\s*)hooks\s*=\s*false\b.*$/m
  if (falseFlagPattern.test(configContent)) {
    return removeLegacyFlags(
      configContent.replace(falseFlagPattern, `$1${managedTrueLine}: previous=false`),
    )
  }

  const legacyTrueFlagPattern = /^(\s*)codex_hooks\s*=\s*true\b.*$/m
  if (legacyTrueFlagPattern.test(configContent)) {
    return removeLegacyFlags(
      configContent.replace(legacyTrueFlagPattern, `$1${CODEX_FEATURE_KEY} = true`),
    )
  }

  const legacyFalseFlagPattern = /^(\s*)codex_hooks\s*=\s*false\b.*$/m
  if (legacyFalseFlagPattern.test(configContent)) {
    return removeLegacyFlags(
      configContent.replace(legacyFalseFlagPattern, `$1${managedTrueLine}: previous=false`),
    )
  }

  if (configContent.includes('[features]')) {
    return configContent.replace(/\[features\]/, `[features]\n${managedTrueLine}`)
  }

  const prefix = configContent.length > 0 && !configContent.endsWith('\n') ? '\n' : ''
  return `${configContent}${prefix}\n[features]\n${CODEX_MANAGED_SECTION_MARKER}\n${managedTrueLine}\n`
}

function removeManagedCodexHooksFlag(configContent: string): string {
  const managedSectionPattern = new RegExp(
    `\\n?\\[features\\]\\n# vibetime-managed-section\\n\\s*${CODEX_FEATURE_KEY_PATTERN}\\s*=\\s*true\\s*# vibetime-managed[^\\n]*(?:\\n|$)`,
    'm',
  )
  if (managedSectionPattern.test(configContent)) {
    return configContent.replace(managedSectionPattern, '')
  }

  const previousFalsePattern = new RegExp(
    `^(\\s*)${CODEX_FEATURE_KEY_PATTERN}\\s*=\\s*true\\s*#\\s*vibetime-managed:\\s*previous=false[^\\n]*$`,
    'm',
  )
  if (previousFalsePattern.test(configContent)) {
    return configContent.replace(previousFalsePattern, `$1${CODEX_FEATURE_KEY} = false`)
  }

  const managedLinePattern = new RegExp(
    `^\\s*${CODEX_FEATURE_KEY_PATTERN}\\s*=\\s*true\\s*#\\s*vibetime-managed[^\\n]*(?:\\n|$)`,
    'm',
  )
  return configContent.replace(managedLinePattern, '')
}

/**
 * Install hooks for Claude Code.
 * Configures ~/.claude/settings.json with vibetime hooks.
 * Idempotent — skips if vibetime hook already exists.
 */
export function installClaudeCode(): void {
  const settingsPath = `${process.env.HOME}/.claude/settings.json`
  const hookBinaryPath = resolveHookBinaryPath()

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
    const command = `${hookBinaryPath} --source claude-code`

    for (const event of events) {
      const arr = (hooks[event] ?? []) as Array<{
        matcher?: string
        hooks?: Array<{ type: string; command: string }>
      }>

      // Find or create matcher group with matcher: "*"
      const existing = arr.find((g) => g.matcher === '*')
      if (existing) {
        existing.hooks = existing.hooks ?? []
        const hasVibetime = existing.hooks.some((h) => isVibetimeCommand(h.command))
        if (hasVibetime) {
          existing.hooks = existing.hooks.map((hook) =>
            isVibetimeCommand(hook.command) ? { ...hook, command } : hook,
          )
          continue
        }

        // Add vibetime hook to existing group
        existing.hooks.push({
          type: 'command',
          command,
        })
      } else {
        // Create new matcher group
        arr.push({
          matcher: '*',
          hooks: [{ type: 'command', command }],
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
  const hookBinaryPath = resolveHookBinaryPath()

  try {
    // Ensure directory exists
    mkdirSync(dirname(hooksPath), { recursive: true })

    // 1. Ensure config.toml has [features] hooks = true
    let configContent = ''
    if (existsSync(configPath)) {
      configContent = readFileSync(configPath, 'utf-8')
      // Backup before modification
      copyFileSync(configPath, `${configPath}.backup`)
    }

    const nextConfigContent = ensureCodexHooksEnabled(configContent)
    if (nextConfigContent !== configContent) {
      configContent = nextConfigContent
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
    const command = `${hookBinaryPath} --source codex`

    for (const event of events) {
      const arr = (hooks[event] ?? []) as Array<{
        hooks?: Array<{ type: string; command: string; timeout?: number }>
      }>

      let hasVibetime = false
      for (const group of arr) {
        if (!group.hooks?.some((h) => isVibetimeCommand(h.command))) continue
        hasVibetime = true
        group.hooks = group.hooks.map((hook) =>
          isVibetimeCommand(hook.command)
            ? { ...hook, type: 'command', command, timeout: 10 }
            : hook,
        )
      }
      if (hasVibetime) {
        hooks[event] = arr
        continue
      }

      // Add vibetime hook
      arr.push({
        hooks: [{ type: 'command', command, timeout: 10 }],
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
  const hookBinaryPath = resolveHookBinaryPath()

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
    const command = `${hookBinaryPath} --source cursor`

    for (const event of events) {
      const arr = (hooks[event] ?? []) as Array<{ command: string }>

      const hasVibetime = arr.some((h) => isVibetimeCommand(h.command))
      if (hasVibetime) {
        hooks[event] = arr.map((hook) =>
          isVibetimeCommand(hook.command) ? { ...hook, command } : hook,
        )
        continue
      }

      // Add vibetime hook (append to array)
      arr.push({ command })

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

/**
 * Uninstall vibetime hooks for Claude Code.
 * Preserves unrelated user hooks and only removes VibeTime hook commands.
 */
export function uninstallClaudeCode(): void {
  const settingsPath = `${process.env.HOME}/.claude/settings.json`

  try {
    if (!existsSync(settingsPath)) return

    copyFileSync(settingsPath, `${settingsPath}.backup`)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>

    for (const event of ['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd']) {
      const arr = (hooks[event] ?? []) as Array<{
        matcher?: string
        hooks?: Array<{ type: string; command: string }>
      }>

      const next = arr
        .map((group) => ({
          ...group,
          hooks: group.hooks?.filter((hook) => !isVibetimeCommand(hook.command)),
        }))
        .filter((group) => (group.hooks?.length ?? 0) > 0)

      if (next.length > 0) {
        hooks[event] = next
      } else {
        delete hooks[event]
      }
    }

    if (Object.keys(hooks).length > 0) {
      settings.hooks = hooks
    } else {
      delete settings.hooks
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  } catch (err) {
    appendLog(`Error uninstalling Claude Code hooks: ${err}`)
    throw err
  }
}

/**
 * Uninstall vibetime hooks for Codex CLI.
 * Preserves unrelated hooks and only restores hooks when Vibetime
 * marked the feature flag as one it changed during install.
 */
export function uninstallCodex(): void {
  const hooksPath = `${process.env.HOME}/.codex/hooks.json`
  const configPath = `${process.env.HOME}/.codex/config.toml`

  try {
    if (existsSync(hooksPath)) {
      copyFileSync(hooksPath, `${hooksPath}.backup`)

      const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8')) as Record<string, unknown>
      const hooks = (hooksData.hooks ?? {}) as Record<string, unknown[]>

      for (const event of Object.keys(hooks)) {
        const arr = (hooks[event] ?? []) as Array<{
          hooks?: Array<{ type: string; command: string; timeout?: number }>
        }>

        const next = arr
          .map((group) => ({
            ...group,
            hooks: group.hooks?.filter((hook) => !isVibetimeCommand(hook.command)),
          }))
          .filter((group) => (group.hooks?.length ?? 0) > 0)

        if (next.length > 0) {
          hooks[event] = next
        } else {
          delete hooks[event]
        }
      }

      hooksData.hooks = hooks
      writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2))
    }

    if (existsSync(configPath)) {
      const configContent = readFileSync(configPath, 'utf-8')
      const nextConfigContent = removeManagedCodexHooksFlag(configContent)
      if (nextConfigContent !== configContent) {
        copyFileSync(configPath, `${configPath}.backup`)
        writeFileSync(configPath, nextConfigContent)
      }
    }
  } catch (err) {
    appendLog(`Error uninstalling Codex hooks: ${err}`)
    throw err
  }
}

/**
 * Uninstall vibetime hooks for Cursor.
 * Preserves unrelated Cursor hooks.
 */
export function uninstallCursor(): void {
  const hooksPath = `${process.env.HOME}/.cursor/hooks.json`

  try {
    if (!existsSync(hooksPath)) return

    copyFileSync(hooksPath, `${hooksPath}.backup`)

    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8')) as Record<string, unknown>
    const hooks = (hooksData.hooks ?? {}) as Record<string, unknown[]>

    for (const event of Object.keys(hooks)) {
      const arr = (hooks[event] ?? []) as Array<{ command: string }>
      const next = arr.filter((hook) => !isVibetimeCommand(hook.command))

      if (next.length > 0) {
        hooks[event] = next
      } else {
        delete hooks[event]
      }
    }

    hooksData.hooks = hooks
    writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2))
  } catch (err) {
    appendLog(`Error uninstalling Cursor hooks: ${err}`)
    throw err
  }
}

/**
 * Uninstall vibetime hooks for the specified agent.
 */
export function uninstallAgent(agent: string): void {
  switch (agent) {
    case 'claude-code':
      uninstallClaudeCode()
      break
    case 'codex':
      uninstallCodex()
      break
    case 'cursor':
      uninstallCursor()
      break
    default:
      throw new Error(`Unknown agent: ${agent}. Supported: claude-code, codex, cursor`)
  }
}
