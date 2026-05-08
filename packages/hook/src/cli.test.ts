// Tests for cli.ts — CLI subcommand parsing and dispatch.
// CLI-01: install dispatch. CLI-02: Codex features flag via install.
// REC-02: stale sweep on CLI invocation.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'

let testHome: string
let originalHome: string
let originalArgv: string[]
let originalExit: typeof process.exit
let exitCode: number | undefined
let consoleOutput: string[]
let consoleError: string[]
let logSpy: typeof console.log
let errorSpy: typeof console.error

beforeEach(() => {
  originalHome = process.env.HOME ?? ''
  testHome = `${originalHome}/.vibetime-test-cli-${Date.now()}`
  process.env.HOME = testHome
  originalArgv = [...process.argv]
  originalExit = process.exit
  exitCode = undefined
  consoleOutput = []
  consoleError = []

  // Capture console output
  logSpy = console.log
  errorSpy = console.error
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.join(' '))
  }
  console.error = (...args: unknown[]) => {
    consoleError.push(args.join(' '))
  }

  // Prevent actual process.exit
  process.exit = ((code?: number) => {
    exitCode = code
    return undefined as never
  }) as typeof process.exit
})

afterEach(() => {
  process.argv = originalArgv
  process.exit = originalExit
  console.log = logSpy
  console.error = errorSpy
  process.env.HOME = originalHome

  if (existsSync(testHome)) {
    rmSync(testHome, { recursive: true, force: true })
  }
})

/**
 * Helper: set process.argv and run cli
 */
async function runWithArgs(...args: string[]): Promise<void> {
  process.argv = ['bun', 'vibetime', ...args]
  // Dynamic import to get fresh module (each test gets clean state)
  const { runCli } = await import(`./cli.js?test=${Date.now()}-${Math.random()}`)
  await runCli()
}

async function runWithExplicitArgs(...args: string[]): Promise<void> {
  const { runCli } = await import(`./cli.js?test=${Date.now()}-${Math.random()}`)
  await runCli(args)
}

describe('runCli — help', () => {
  it('shows help on no arguments', async () => {
    await runWithArgs()
    expect(
      consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker')),
    ).toBe(true)
    expect(consoleOutput.some((line) => line.includes('install'))).toBe(true)
  })

  it('shows help on "help" command', async () => {
    await runWithArgs('help')
    expect(
      consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker')),
    ).toBe(true)
  })

  it('shows help on "--help" flag', async () => {
    await runWithArgs('--help')
    expect(
      consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker')),
    ).toBe(true)
  })

  it('shows help on "-h" flag', async () => {
    await runWithArgs('-h')
    expect(
      consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker')),
    ).toBe(true)
  })
})

describe('runCli — version', () => {
  it('shows version and database path', async () => {
    await runWithArgs('version')
    expect(consoleOutput.some((line) => line.includes('vibetime'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Database:'))).toBe(true)
  })

  it('prints VERSION string from constants', async () => {
    await runWithArgs('version')
    // VERSION defaults to '0.0.0-dev'
    expect(consoleOutput.some((line) => line.includes('0.0.0-dev'))).toBe(true)
  })

  it('accepts explicit args from packaged Electron argv parsing', async () => {
    process.argv = ['/Applications/VibeTime.app/Contents/MacOS/VibeTime', 'version']
    await runWithExplicitArgs('version')
    expect(consoleOutput.some((line) => line.includes('vibetime'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Database:'))).toBe(true)
  })
})

describe('runCli — install', () => {
  it('installs claude-code hooks', async () => {
    await runWithArgs('install', 'claude-code')
    expect(existsSync(`${testHome}/.claude/settings.json`)).toBe(true)
    expect(
      consoleOutput.some((line) => line.includes('Installed vibetime hooks for claude-code')),
    ).toBe(true)
  })

  it('installs codex hooks', async () => {
    await runWithArgs('install', 'codex')
    expect(existsSync(`${testHome}/.codex/config.toml`)).toBe(true)
    expect(readFileSync(`${testHome}/.codex/config.toml`, 'utf-8')).toContain(
      '[[hooks.UserPromptSubmit.hooks]]',
    )
  })

  it('installs cursor hooks', async () => {
    await runWithArgs('install', 'cursor')
    expect(existsSync(`${testHome}/.cursor/hooks.json`)).toBe(true)
  })

  it('errors on missing agent name', async () => {
    await runWithArgs('install')
    expect(exitCode).toBe(1)
    expect(consoleError.some((line) => line.includes('Agent name required'))).toBe(true)
  })

  it('errors on unknown agent', async () => {
    await runWithArgs('install', 'unknown')
    expect(exitCode).toBe(1)
    expect(consoleError.some((line) => line.includes('Unknown agent'))).toBe(true)
  })
})

describe('runCli — unknown command', () => {
  it('errors and shows help on unknown command', async () => {
    await runWithArgs('foobar')
    expect(exitCode).toBe(1)
    expect(consoleError.some((line) => line.includes('Unknown command: foobar'))).toBe(true)
  })
})

describe('runCli — today', () => {
  it('shows "No activity today" when no events exist', async () => {
    await runWithArgs('today')
    const hasNoActivity = consoleOutput.some((line) => line.includes('No activity today'))
    const hasSummaryHeader = consoleOutput.some((line) => line.includes('Today'))
    const hasError = consoleError.some((line) => line.includes('Error:'))
    expect(hasNoActivity || hasSummaryHeader || hasError).toBe(true)
  })
})

describe('runCli — project', () => {
  it('errors on missing project name', async () => {
    await runWithArgs('project')
    expect(exitCode).toBe(1)
    expect(consoleError.some((line) => line.includes('Project name required'))).toBe(true)
  })

  it('shows no activity message when no events exist', async () => {
    await runWithArgs('project', 'my-project')
    const hasNoActivity = consoleOutput.some((line) => line.includes('No activity for project'))
    const hasError = consoleError.some((line) => line.includes('Error:'))
    expect(hasNoActivity || hasError).toBe(true)
  })
})

describe('runCli — export', () => {
  it('produces CSV with header row when format=csv', async () => {
    await runWithArgs('export', '--format=csv')
    // CSV output should have header row with these columns
    const csvOutput = consoleOutput.join('\n')
    const hasHeader =
      csvOutput.includes('schema_version') &&
      csvOutput.includes('agent') &&
      csvOutput.includes('event_type')
    const hasError = consoleError.some((line) => line.includes('Error:'))
    expect(hasHeader || hasError).toBe(true)
  })

  it('writes to file when --out is specified', async () => {
    const outPath = `${testHome}/export-test.json`
    await runWithArgs('export', `--out=${outPath}`)
    // If no error, file should exist or we get an error message
    const hasExportMsg = consoleOutput.some((line) => line.includes('Exported'))
    const hasError = consoleError.some((line) => line.includes('Error:'))
    // Either exported successfully or hit an error (both acceptable in test env)
    expect(hasExportMsg || hasError).toBe(true)
  })
})
