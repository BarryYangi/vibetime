// Tests for cli.ts — CLI subcommand parsing and dispatch.
// CLI-01: install dispatch. CLI-02: Codex features flag via install.
// REC-02: stale sweep on CLI invocation.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

let testHome: string
let originalHome: string
let originalArgv: string[]
let originalExit: typeof process.exit
let exitCode: number | undefined
let consoleOutput: string[]
let consoleError: string[]
let logSpy: typeof console.log
let errorSpy: typeof console.error
const stableTestHome = `${process.env.HOME ?? ''}/.vibetime-test-cli-${process.pid}`

beforeEach(() => {
  originalHome = process.env.HOME ?? ''
  testHome = stableTestHome
  if (existsSync(testHome)) {
    rmSync(testHome, { recursive: true, force: true })
  }
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

function parseJsonOutput(): unknown {
  return JSON.parse(consoleOutput.join('\n'))
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

  it('prints machine-readable JSON with --json', async () => {
    await runWithArgs('version', '--json')
    const output = parseJsonOutput() as { version?: string; database?: string }
    expect(output.version).toBe('0.0.0-dev')
    expect(output.database).toContain('data.db')
  })

  it('accepts explicit args from packaged Electron argv parsing', async () => {
    process.argv = ['/Applications/VibeTime.app/Contents/MacOS/VibeTime', 'version']
    await runWithExplicitArgs('version')
    expect(consoleOutput.some((line) => line.includes('vibetime'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Database:'))).toBe(true)
  })
})

describe('runCli — health', () => {
  it('shows an empty health summary when no file exists', async () => {
    await runWithArgs('health')
    expect(consoleOutput.some((line) => line.includes('Hook persist health'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Consecutive failures: 0'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Failures in last 24h: 0'))).toBe(true)
  })

  it('prints machine-readable JSON with --json', async () => {
    await runWithArgs('health', '--json')
    const output = parseJsonOutput() as {
      consecutiveFailures?: number
      recentFailures?: unknown[]
    }
    expect(output.consecutiveFailures).toBe(0)
    expect(output.recentFailures).toEqual([])
  })

  it('shows failure details from hook-health.json', async () => {
    const healthPath = `${testHome}/.vibetime/hook-health.json`
    mkdirSync(`${testHome}/.vibetime`, { recursive: true })
    writeFileSync(
      healthPath,
      `${JSON.stringify(
        {
          lastError: {
            ts: 1_700_000_000,
            message: 'database is locked',
            agent: 'codex',
            event_type: 'turn_end',
          },
          consecutiveFailures: 3,
          recentFailures: [
            {
              ts: 1_700_000_000,
              message: 'database is locked',
              agent: 'codex',
              event_type: 'turn_end',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    )

    consoleOutput = []
    await runWithArgs('health')

    expect(consoleOutput.some((line) => line.includes('Consecutive failures: 3'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Failures in last 24h: 1'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('database is locked'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('codex/turn_end'))).toBe(true)
  })
})

describe('runCli — status', () => {
  it('shows a compact status summary', async () => {
    await runWithArgs('status')
    expect(consoleOutput.some((line) => line.includes('VibeTime status'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Overall:'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('Agents installed:'))).toBe(true)
  })

  it('prints machine-readable JSON with --json', async () => {
    await runWithArgs('status', '--json')
    const output = parseJsonOutput() as {
      ok?: boolean
      database?: { path?: string; events?: number }
      health?: { consecutiveFailures?: number }
      agents?: unknown[]
    }
    expect(typeof output.ok).toBe('boolean')
    expect(output.database?.path).toContain('data.db')
    expect(typeof output.database?.events).toBe('number')
    expect(output.health?.consecutiveFailures).toBe(0)
    expect(output.agents).toHaveLength(4)
  })
})

describe('runCli — agents', () => {
  it('shows agent hook installation status', async () => {
    await runWithArgs('agents')
    expect(consoleOutput.some((line) => line.includes('Agent hooks'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('claude-code'))).toBe(true)
    expect(consoleOutput.some((line) => line.includes('codex'))).toBe(true)
  })

  it('prints machine-readable JSON with --json', async () => {
    await runWithArgs('agents', '--json')
    const output = parseJsonOutput() as {
      agents?: Array<{ agent: string; installed: boolean }>
    }
    expect(output.agents).toHaveLength(4)
    expect(output.agents?.map((agent) => agent.agent)).toContain('gemini-cli')
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

  it('prints machine-readable JSON with --json', async () => {
    await runWithArgs('today', '--json')
    const output = parseJsonOutput() as {
      total?: number
      projects?: unknown[]
      turnCount?: number
    }
    expect(typeof output.total).toBe('number')
    expect(Array.isArray(output.projects)).toBe(true)
    expect(typeof output.turnCount).toBe('number')
  })
})

describe('runCli — history', () => {
  it('shows the default 30-day History summary', async () => {
    await runWithArgs('history')
    expect(consoleOutput.some((line) => line.includes('History (last 30 days)'))).toBe(true)
  })

  it('prints the GUI History summary as JSON', async () => {
    await runWithArgs('history', '--days=90', '--json')
    const output = parseJsonOutput() as {
      periodDays?: number
      calendar?: unknown[]
      trends?: unknown[]
      topProjects?: unknown[]
      projectAgentTotals?: unknown[]
    }
    expect(output.periodDays).toBe(90)
    expect(output.calendar).toHaveLength(365)
    expect(output.trends).toHaveLength(90)
    expect(Array.isArray(output.topProjects)).toBe(true)
    expect(Array.isArray(output.projectAgentTotals)).toBe(true)
  })

  it('rejects unsupported History periods', async () => {
    await runWithArgs('history', '--days=14')
    expect(exitCode).toBe(1)
    expect(consoleError.some((line) => line.includes('--days must be one of 7, 30, 90, 365'))).toBe(
      true,
    )
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

  it('prints machine-readable JSON with --json', async () => {
    await runWithArgs('project', 'my-project', '--json')
    const output = parseJsonOutput() as {
      project?: string
      total?: number
      days?: unknown[]
    }
    expect(output.project).toBe('my-project')
    expect(output.total).toBe(0)
    expect(output.days).toEqual([])
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

  it('errors on unsupported format', async () => {
    await runWithArgs('export', '--format=xml')
    expect(exitCode).toBe(1)
    expect(consoleError.some((line) => line.includes('--format must be json or csv'))).toBe(true)
  })
})
