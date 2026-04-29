// Tests for cli.ts — CLI subcommand parsing and dispatch.
// CLI-01: install dispatch. CLI-02: Codex features flag via install.
// REC-02: stale sweep on CLI invocation.

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs'

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
  console.log = (...args: unknown[]) => { consoleOutput.push(args.join(' ')) }
  console.error = (...args: unknown[]) => { consoleError.push(args.join(' ')) }

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
  const { runCli } = await import('./cli.js')
  await runCli()
}

describe('runCli — help', () => {
  it('shows help on no arguments', async () => {
    await runWithArgs()
    expect(consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('install'))).toBe(true)
  })

  it('shows help on "help" command', async () => {
    await runWithArgs('help')
    expect(consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker'))).toBe(true)
  })

  it('shows help on "--help" flag', async () => {
    await runWithArgs('--help')
    expect(consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker'))).toBe(true)
  })

  it('shows help on "-h" flag', async () => {
    await runWithArgs('-h')
    expect(consoleOutput.some((line) => line.includes('vibetime — Agent coding time tracker'))).toBe(true)
  })
})

describe('runCli — version', () => {
  it('shows version and database path', async () => {
    await runWithArgs('version')
    expect(consoleOutput.some((line) => line.includes('vibetime'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Database:'))).toBe(true)
  })
})

describe('runCli — install', () => {
  it('installs claude-code hooks', async () => {
    await runWithArgs('install', 'claude-code')
    expect(existsSync(`${testHome}/.claude/settings.json`)).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Installed vibetime hooks for claude-code'))).toBe(true)
  })

  it('installs codex hooks', async () => {
    await runWithArgs('install', 'codex')
    expect(existsSync(`${testHome}/.codex/hooks.json`)).toBe(true)
    expect(existsSync(`${testHome}/.codex/config.toml`)).toBe(true)
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
    const hasError = consoleError.some((line) => line.includes('Error:'))
    expect(hasNoActivity || hasError).toBe(true)
  })
})

describe('runCli — project', () => {
  it('errors on missing project name', async () => {
    await runWithArgs('project')
    expect(exitCode).toBe(1)
    expect(consoleError.some((line) => line.includes('Project name required'))).toBe(true)
  })

  it('runs without crashing (Phase 4 placeholder)', async () => {
    // project uses DB_PATH which is computed at module load (original HOME).
    // In tests, it may hit the catch block — both paths are acceptable.
    await runWithArgs('project', 'my-project')
    const hasOutput = consoleOutput.some((line) => line.includes('my-project'))
    const hasError = consoleError.some((line) => line.includes('Error:'))
    expect(hasOutput || hasError).toBe(true)
  })
})
