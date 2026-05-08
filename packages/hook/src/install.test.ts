// Tests for install.ts — agent hook installation.
// CLI-01: idempotency. CLI-02: Codex features flag.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import {
  installAgent,
  installClaudeCode,
  installCodex,
  installCursor,
  resolveHookBinaryPath,
  uninstallAgent,
  uninstallClaudeCode,
  uninstallCodex,
  uninstallCursor,
} from './install.js'

let testHome: string
let originalHome: string
let originalHookBinary: string | undefined
let originalResourcesPath: string | undefined

const processWithResources = process as NodeJS.Process & { resourcesPath?: string }

function isVibetimeHookCommand(command: string): boolean {
  return /\bvibetime(?:\.(?:exe|cmd))?\b/i.test(command) && command.includes('--source')
}

beforeEach(() => {
  // Save original HOME and create isolated test directory
  originalHome = process.env.HOME ?? ''
  originalHookBinary = process.env.VIBETIME_HOOK_BINARY
  originalResourcesPath = processWithResources.resourcesPath
  testHome = `${originalHome}/.vibetime-test-install-${Date.now()}`
  process.env.HOME = testHome
  delete process.env.VIBETIME_HOOK_BINARY
  delete processWithResources.resourcesPath
})

afterEach(() => {
  // Restore original HOME and cleanup
  process.env.HOME = originalHome
  if (originalHookBinary === undefined) {
    delete process.env.VIBETIME_HOOK_BINARY
  } else {
    process.env.VIBETIME_HOOK_BINARY = originalHookBinary
  }
  if (originalResourcesPath === undefined) {
    delete processWithResources.resourcesPath
  } else {
    processWithResources.resourcesPath = originalResourcesPath
  }
  if (existsSync(testHome)) {
    rmSync(testHome, { recursive: true, force: true })
  }
})

describe('resolveHookBinaryPath', () => {
  it('prefers explicit environment override', () => {
    process.env.VIBETIME_HOOK_BINARY = '/tmp/custom-vibetime'
    expect(resolveHookBinaryPath()).toBe('/tmp/custom-vibetime')
  })

  it('prefers packaged Electron CLI binary when present', () => {
    const resourcesPath = `${testHome}/resources`
    const binaryPath = `${resourcesPath}/bin/${process.platform === 'win32' ? 'vibetime.exe' : 'vibetime'}`
    mkdirSync(`${resourcesPath}/bin`, { recursive: true })
    writeFileSync(binaryPath, '')

    processWithResources.resourcesPath = resourcesPath

    expect(resolveHookBinaryPath()).toBe(binaryPath)
  })
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
      expect(group.hooks.some((h: { command: string }) => isVibetimeHookCommand(h.command))).toBe(
        true,
      )
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
        isVibetimeHookCommand(h.command),
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
    expect(group.hooks.some((h: { command: string }) => isVibetimeHookCommand(h.command))).toBe(
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
  it('writes inline config.toml hooks for 3 events (no SessionEnd)', () => {
    installCodex()

    const content = readFileSync(`${testHome}/.codex/config.toml`, 'utf-8')

    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
      expect(content).toContain(`[[hooks.${event}]]`)
      expect(content).toContain(`[[hooks.${event}.hooks]]`)
    }
    expect(content).toContain(`command = "${testHome}/.vibetime/bin/vibetime --source codex"`)
    expect(content).not.toContain('[[hooks.SessionEnd]]')
    expect(existsSync(`${testHome}/.codex/hooks.json`)).toBe(false)
  })

  it('sets [features] hooks = true in config.toml', () => {
    installCodex()

    const configPath = `${testHome}/.codex/config.toml`
    expect(existsSync(configPath)).toBe(true)

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('hooks = true')
  })

  it('is idempotent — second run does not duplicate hooks', () => {
    installCodex()
    installCodex()

    const content = readFileSync(`${testHome}/.codex/config.toml`, 'utf-8')

    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
      expect(content.match(new RegExp(`\\[\\[hooks\\.${event}\\]\\]`, 'g'))?.length).toBe(1)
      expect(content.match(new RegExp(`\\[\\[hooks\\.${event}\\.hooks\\]\\]`, 'g'))?.length).toBe(1)
    }
    expect(content.match(/--source codex/g)?.length).toBe(3)
  })

  it('refreshes existing vibetime hook commands to the current binary path', () => {
    process.env.VIBETIME_HOOK_BINARY = '/old/bin/vibetime'
    installCodex()

    process.env.VIBETIME_HOOK_BINARY = '/new/bin/vibetime'
    installCodex()

    const content = readFileSync(`${testHome}/.codex/config.toml`, 'utf-8')

    expect(content.match(/--source codex/g)?.length).toBe(3)
    expect(content).toContain(`command = "${testHome}/.vibetime/bin/vibetime --source codex"`)
    expect(content).not.toContain('/old/bin/vibetime')
  })

  it('marks hooks changes when enabling a previous false flag', () => {
    const configPath = `${testHome}/.codex/config.toml`
    mkdirSync(`${testHome}/.codex`, { recursive: true })
    writeFileSync(configPath, '[features]\nhooks = false\nother_flag = false\n')

    installCodex()

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('hooks = true # vibetime-managed: previous=false')
    expect(content).toContain('other_flag = false')
  })

  it('creates backup before modification', () => {
    const configPath = `${testHome}/.codex/config.toml`
    mkdirSync(`${testHome}/.codex`, { recursive: true })
    writeFileSync(configPath, '[features]\nhooks = true\n')

    installCodex()

    expect(existsSync(`${configPath}.backup`)).toBe(true)
  })

  it('removes existing VibeTime hooks from hooks.json and preserves unrelated hooks', () => {
    const codexDir = `${testHome}/.codex`
    const hooksPath = `${codexDir}/hooks.json`
    mkdirSync(codexDir, { recursive: true })
    writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                { type: 'command', command: 'existing-hook', timeout: 30 },
                { type: 'command', command: 'vibetime --source codex', timeout: 10 },
              ],
            },
          ],
        },
      }),
    )

    installCodex()

    const hooksData = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(hooksData.hooks.UserPromptSubmit[0].hooks).toEqual([
      { type: 'command', command: 'existing-hook', timeout: 30 },
    ])
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
        hooksData.hooks[event].some((h: { command: string }) => isVibetimeHookCommand(h.command)),
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
        isVibetimeHookCommand(h.command),
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
        isVibetimeHookCommand(h.command),
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
    expect(existsSync(`${testHome}/.codex/config.toml`)).toBe(true)
    expect(readFileSync(`${testHome}/.codex/config.toml`, 'utf-8')).toContain(
      '[[hooks.UserPromptSubmit.hooks]]',
    )
  })

  it('dispatches cursor correctly', () => {
    installAgent('cursor')
    expect(existsSync(`${testHome}/.cursor/hooks.json`)).toBe(true)
  })

  it('throws on unknown agent', () => {
    expect(() => installAgent('unknown')).toThrow('Unknown agent')
  })

  it('writes commands that point to an existing hook-capable binary', () => {
    const fakeBinaryPath = `${testHome}/bin/vibetime`
    mkdirSync(`${testHome}/bin`, { recursive: true })
    writeFileSync(fakeBinaryPath, '')
    process.env.VIBETIME_HOOK_BINARY = fakeBinaryPath

    installAgent('claude-code')
    installAgent('codex')
    installAgent('cursor')

    const claudeSettings = JSON.parse(readFileSync(`${testHome}/.claude/settings.json`, 'utf-8'))
    const cursorHooks = JSON.parse(readFileSync(`${testHome}/.cursor/hooks.json`, 'utf-8'))
    const codexConfig = readFileSync(`${testHome}/.codex/config.toml`, 'utf-8')
    const codexCommand = codexConfig.match(/command = "([^"]+ --source codex)"/)?.[1]

    const commands = [
      claudeSettings.hooks.UserPromptSubmit[0].hooks[0].command,
      codexCommand,
      cursorHooks.hooks.beforeSubmitPrompt[0].command,
    ]

    for (const command of commands) {
      if (!command) throw new Error('Expected hook command')
      const binaryPath = command.replace(/\s+--source.*$/, '')
      expect(isVibetimeHookCommand(command)).toBe(true)
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
                { type: 'command', command: 'vibetime --source claude-code' },
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
    expect(group.hooks.some((h: { command: string }) => isVibetimeHookCommand(h.command))).toBe(
      false,
    )
    expect(existsSync(`${settingsPath}.backup`)).toBe(true)
  })

  it('removes Codex vibetime hooks and restores managed hooks false flag', () => {
    const configPath = `${testHome}/.codex/config.toml`
    mkdirSync(`${testHome}/.codex`, { recursive: true })
    writeFileSync(configPath, '[features]\nhooks = false\nother_flag = false\n')

    installCodex()
    uninstallCodex()

    expect(readFileSync(configPath, 'utf-8')).toBe(
      '[features]\nhooks = false\nother_flag = false\n',
    )
    expect(existsSync(`${configPath}.backup`)).toBe(true)
    expect(readFileSync(configPath, 'utf-8')).not.toContain('vibetime-managed-codex-hooks')
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
            { command: 'vibetime --source cursor' },
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
        isVibetimeHookCommand(h.command),
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
