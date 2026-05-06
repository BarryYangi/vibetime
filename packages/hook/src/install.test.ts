// Tests for install.ts — agent hook installation.
// CLI-01: idempotency. CLI-02: Codex features flag.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import {
  installAgent,
  installClaudeCode,
  installCodex,
  installCursor,
  uninstallAgent,
  uninstallClaudeCode,
  uninstallCodex,
  uninstallCursor,
} from './install.js'

let testHome: string
let originalHome: string

beforeEach(() => {
  // Save original HOME and create isolated test directory
  originalHome = process.env.HOME ?? ''
  testHome = `${originalHome}/.vibetime-test-install-${Date.now()}`
  process.env.HOME = testHome
})

afterEach(() => {
  // Restore original HOME and cleanup
  process.env.HOME = originalHome
  if (existsSync(testHome)) {
    rmSync(testHome, { recursive: true, force: true })
  }
})

describe('installClaudeCode — happy paths', () => {
  it('creates settings.json with hooks for 4 events', () => {
    installClaudeCode()

    const settingsPath = `${testHome}/.claude/settings.json`
    expect(existsSync(settingsPath)).toBe(true)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks).toBeDefined()

    const events = ['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd']
    for (const event of events) {
      expect(settings.hooks[event]).toBeDefined()
      expect(Array.isArray(settings.hooks[event])).toBe(true)
      const group = settings.hooks[event].find((g: { matcher?: string }) => g.matcher === '*')
      expect(group).toBeDefined()
      expect(
        group.hooks.some((h: { command: string }) => h.command.includes('vibetime-hook')),
      ).toBe(true)
    }
  })

  it('is idempotent — second run does not duplicate hooks', () => {
    installClaudeCode()
    installClaudeCode()

    const settingsPath = `${testHome}/.claude/settings.json`
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))

    for (const event of ['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd']) {
      const group = settings.hooks[event].find((g: { matcher?: string }) => g.matcher === '*')
      const vibetimeHooks = group.hooks.filter((h: { command: string }) =>
        h.command.includes('vibetime-hook'),
      )
      expect(vibetimeHooks.length).toBe(1)
    }
  })

  it('preserves existing hooks', () => {
    const settingsPath = `${testHome}/.claude/settings.json`
    mkdirSync(`${testHome}/.claude`, { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '*',
              hooks: [{ type: 'command', command: 'existing-hook' }],
            },
          ],
        },
        otherSetting: 'preserved',
      }),
    )

    installClaudeCode()

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.otherSetting).toBe('preserved')
    const group = settings.hooks.UserPromptSubmit.find(
      (g: { matcher?: string }) => g.matcher === '*',
    )
    expect(group.hooks.some((h: { command: string }) => h.command === 'existing-hook')).toBe(true)
    expect(group.hooks.some((h: { command: string }) => h.command.includes('vibetime-hook'))).toBe(
      true,
    )
  })

  it('creates backup before modification', () => {
    const settingsPath = `${testHome}/.claude/settings.json`
    mkdirSync(`${testHome}/.claude`, { recursive: true })
    writeFileSync(settingsPath, JSON.stringify({ original: true }))

    installClaudeCode()

    expect(existsSync(`${settingsPath}.backup`)).toBe(true)
    const backup = JSON.parse(readFileSync(`${settingsPath}.backup`, 'utf-8'))
    expect(backup.original).toBe(true)
  })

  it('uses --source claude-code flag in command', () => {
    installClaudeCode()

    const settingsPath = `${testHome}/.claude/settings.json`
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const group = settings.hooks.UserPromptSubmit.find(
      (g: { matcher?: string }) => g.matcher === '*',
    )
    expect(group.hooks[0].command).toContain('--source claude-code')
  })
})

describe('installCodex — happy paths', () => {
  it('creates hooks.json with 3 events (no SessionEnd)', () => {
    installCodex()

    const hooksPath = `${testHome}/.codex/hooks.json`
    expect(existsSync(hooksPath)).toBe(true)

    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(hooksData.hooks).toBeDefined()
    expect(hooksData.hooks.SessionStart).toBeDefined()
    expect(hooksData.hooks.UserPromptSubmit).toBeDefined()
    expect(hooksData.hooks.Stop).toBeDefined()
    // No SessionEnd for Codex
    expect(hooksData.hooks.SessionEnd).toBeUndefined()
  })

  it('sets [features] codex_hooks = true in config.toml', () => {
    installCodex()

    const configPath = `${testHome}/.codex/config.toml`
    expect(existsSync(configPath)).toBe(true)

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('codex_hooks = true')
  })

  it('is idempotent — second run does not duplicate hooks', () => {
    installCodex()
    installCodex()

    const hooksPath = `${testHome}/.codex/hooks.json`
    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))

    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
      const vibetimeEntries = hooksData.hooks[event].filter(
        (g: { hooks?: Array<{ command: string }> }) =>
          g.hooks?.some((h) => h.command.includes('vibetime-hook')),
      )
      expect(vibetimeEntries.length).toBe(1)
    }
  })

  it('preserves existing codex_hooks = true in config.toml', () => {
    const configPath = `${testHome}/.codex/config.toml`
    mkdirSync(`${testHome}/.codex`, { recursive: true })
    writeFileSync(configPath, '[features]\ncodex_hooks = true\nother_flag = false\n')

    installCodex()

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('codex_hooks = true')
    expect(content).toContain('other_flag = false')
  })

  it('marks codex_hooks changes when enabling a previous false flag', () => {
    const configPath = `${testHome}/.codex/config.toml`
    mkdirSync(`${testHome}/.codex`, { recursive: true })
    writeFileSync(configPath, '[features]\ncodex_hooks = false\nother_flag = false\n')

    installCodex()

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('codex_hooks = true # vibetime-managed: previous=false')
    expect(content).toContain('other_flag = false')
  })

  it('creates backup before modification', () => {
    const hooksPath = `${testHome}/.codex/hooks.json`
    mkdirSync(`${testHome}/.codex`, { recursive: true })
    writeFileSync(hooksPath, JSON.stringify({ hooks: {} }))

    installCodex()

    expect(existsSync(`${hooksPath}.backup`)).toBe(true)
  })
})

describe('installCursor — happy paths', () => {
  it('creates hooks.json with 4 events', () => {
    installCursor()

    const hooksPath = `${testHome}/.cursor/hooks.json`
    expect(existsSync(hooksPath)).toBe(true)

    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(hooksData.hooks).toBeDefined()

    const events = ['beforeSubmitPrompt', 'stop', 'sessionStart', 'sessionEnd']
    for (const event of events) {
      expect(hooksData.hooks[event]).toBeDefined()
      expect(Array.isArray(hooksData.hooks[event])).toBe(true)
      expect(
        hooksData.hooks[event].some((h: { command: string }) =>
          h.command.includes('vibetime-hook'),
        ),
      ).toBe(true)
    }
  })

  it('is idempotent — second run does not duplicate hooks', () => {
    installCursor()
    installCursor()

    const hooksPath = `${testHome}/.cursor/hooks.json`
    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))

    for (const event of ['beforeSubmitPrompt', 'stop', 'sessionStart', 'sessionEnd']) {
      const vibetimeHooks = hooksData.hooks[event].filter((h: { command: string }) =>
        h.command.includes('vibetime-hook'),
      )
      expect(vibetimeHooks.length).toBe(1)
    }
  })

  it('preserves existing hooks', () => {
    const hooksPath = `${testHome}/.cursor/hooks.json`
    mkdirSync(`${testHome}/.cursor`, { recursive: true })
    writeFileSync(
      hooksPath,
      JSON.stringify({
        version: 1,
        hooks: {
          beforeSubmitPrompt: [{ command: 'existing-hook' }],
        },
      }),
    )

    installCursor()

    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(hooksData.version).toBe(1)
    expect(
      hooksData.hooks.beforeSubmitPrompt.some(
        (h: { command: string }) => h.command === 'existing-hook',
      ),
    ).toBe(true)
    expect(
      hooksData.hooks.beforeSubmitPrompt.some((h: { command: string }) =>
        h.command.includes('vibetime-hook'),
      ),
    ).toBe(true)
  })

  it('creates backup before modification', () => {
    const hooksPath = `${testHome}/.cursor/hooks.json`
    mkdirSync(`${testHome}/.cursor`, { recursive: true })
    writeFileSync(hooksPath, JSON.stringify({ version: 1, hooks: {} }))

    installCursor()

    expect(existsSync(`${hooksPath}.backup`)).toBe(true)
  })
})

describe('installAgent — dispatch', () => {
  it('dispatches claude-code correctly', () => {
    installAgent('claude-code')
    expect(existsSync(`${testHome}/.claude/settings.json`)).toBe(true)
  })

  it('dispatches codex correctly', () => {
    installAgent('codex')
    expect(existsSync(`${testHome}/.codex/hooks.json`)).toBe(true)
  })

  it('dispatches cursor correctly', () => {
    installAgent('cursor')
    expect(existsSync(`${testHome}/.cursor/hooks.json`)).toBe(true)
  })

  it('throws on unknown agent', () => {
    expect(() => installAgent('unknown')).toThrow('Unknown agent')
  })

  it('writes commands that point to an existing vibetime-hook binary', () => {
    installAgent('claude-code')
    installAgent('codex')
    installAgent('cursor')

    const claudeSettings = JSON.parse(readFileSync(`${testHome}/.claude/settings.json`, 'utf-8'))
    const codexHooks = JSON.parse(readFileSync(`${testHome}/.codex/hooks.json`, 'utf-8'))
    const cursorHooks = JSON.parse(readFileSync(`${testHome}/.cursor/hooks.json`, 'utf-8'))

    const commands = [
      claudeSettings.hooks.UserPromptSubmit[0].hooks[0].command,
      codexHooks.hooks.UserPromptSubmit[0].hooks[0].command,
      cursorHooks.hooks.beforeSubmitPrompt[0].command,
    ]

    for (const command of commands) {
      const binaryPath = command.replace(/\s+--source.*$/, '')
      expect(binaryPath).toContain('vibetime-hook')
      expect(existsSync(binaryPath)).toBe(true)
    }
  })
})

describe('uninstall — removes only vibetime hooks', () => {
  it('removes Claude Code vibetime hooks and preserves unrelated hooks', () => {
    const settingsPath = `${testHome}/.claude/settings.json`
    mkdirSync(`${testHome}/.claude`, { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '*',
              hooks: [
                { type: 'command', command: 'existing-hook' },
                { type: 'command', command: 'vibetime-hook --source claude-code' },
              ],
            },
          ],
        },
      }),
    )

    uninstallClaudeCode()

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const group = settings.hooks.UserPromptSubmit.find(
      (g: { matcher?: string }) => g.matcher === '*',
    )
    expect(group.hooks.some((h: { command: string }) => h.command === 'existing-hook')).toBe(true)
    expect(group.hooks.some((h: { command: string }) => h.command.includes('vibetime-hook'))).toBe(
      false,
    )
    expect(existsSync(`${settingsPath}.backup`)).toBe(true)
  })

  it('removes Codex vibetime hooks and restores managed codex_hooks false flag', () => {
    const configPath = `${testHome}/.codex/config.toml`
    mkdirSync(`${testHome}/.codex`, { recursive: true })
    writeFileSync(configPath, '[features]\ncodex_hooks = false\nother_flag = false\n')

    installCodex()
    uninstallCodex()

    const hooksPath = `${testHome}/.codex/hooks.json`
    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    const hasVibetime = Object.values(hooksData.hooks as Record<string, unknown[]>).some((groups) =>
      groups.some((group) =>
        ((group as { hooks?: Array<{ command: string }> }).hooks ?? []).some((hook) =>
          hook.command.includes('vibetime-hook'),
        ),
      ),
    )

    expect(hasVibetime).toBe(false)
    expect(readFileSync(configPath, 'utf-8')).toBe(
      '[features]\ncodex_hooks = false\nother_flag = false\n',
    )
    expect(existsSync(`${hooksPath}.backup`)).toBe(true)
  })

  it('removes Cursor vibetime hooks and preserves unrelated hooks', () => {
    const hooksPath = `${testHome}/.cursor/hooks.json`
    mkdirSync(`${testHome}/.cursor`, { recursive: true })
    writeFileSync(
      hooksPath,
      JSON.stringify({
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            { command: 'existing-hook' },
            { command: 'vibetime-hook --source cursor' },
          ],
        },
      }),
    )

    uninstallCursor()

    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(
      hooksData.hooks.beforeSubmitPrompt.some(
        (h: { command: string }) => h.command === 'existing-hook',
      ),
    ).toBe(true)
    expect(
      hooksData.hooks.beforeSubmitPrompt.some((h: { command: string }) =>
        h.command.includes('vibetime-hook'),
      ),
    ).toBe(false)
    expect(existsSync(`${hooksPath}.backup`)).toBe(true)
  })

  it('dispatches uninstallAgent by agent id', () => {
    installAgent('claude-code')
    uninstallAgent('claude-code')

    const settingsPath = `${testHome}/.claude/settings.json`
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks).toBeUndefined()
  })
})

describe('install — adversarial inputs', () => {
  it('handles corrupted settings.json gracefully', () => {
    const settingsPath = `${testHome}/.claude/settings.json`
    mkdirSync(`${testHome}/.claude`, { recursive: true })
    writeFileSync(settingsPath, 'not valid json{{{')

    installClaudeCode()

    // Should backup corrupted file and create new one
    expect(existsSync(`${settingsPath}.backup`)).toBe(true)
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks).toBeDefined()
  })

  it('handles empty home directory gracefully', () => {
    // HOME points to non-existent path initially
    installClaudeCode()

    const settingsPath = `${testHome}/.claude/settings.json`
    expect(existsSync(settingsPath)).toBe(true)
  })
})
