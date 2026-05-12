// CLI mode: parse subcommands and dispatch to handlers.
// Hand-rolled argv parsing — no CLI library (CONTEXT.md gray area 1).
// Subcommands: status, agents, install, uninstall, today, history, project, export, health, version, help.

import { existsSync, readFileSync } from 'node:fs'
import {
  allocateDurationByLocalDay,
  buildHistorySummaryFromEvents,
  durationWithinWindow,
  getAgentColorHex,
  HISTORY_TURN_START_BUFFER_SEC,
  type HistoryPeriodDays,
  type HistorySummary,
  historyLowerBound,
  isHistoryPeriodDays,
  type NormalizedEvent,
} from '@vibetime/core'
import chalk from 'chalk'
import { DB_PATH, VERSION } from './constants.js'
import { readHookHealth } from './health.js'
import { getCliInstallStatus, installAgent, uninstallAgent } from './install.js'
import { appendLog } from './log.js'
import { homePath } from './paths.js'
import { reconcileCodexCompletedTurns, sweepStale } from './recovery.js'
import { closeDatabase, openDatabase, queryEvents, queryOpenTurns } from './store.js'

const AGENTS = ['claude-code', 'codex', 'cursor', 'gemini-cli'] as const
type AgentName = (typeof AGENTS)[number]
const DEFAULT_HISTORY_DAYS = 30

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function optionValue(args: string[], name: string): string | null {
  const prefix = `${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtDate(ts: number | null): string {
  return ts ? new Date(ts * 1000).toLocaleDateString('en-CA') : 'n/a'
}

function fmtHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

function fitLabel(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width)
  if (width <= 3) return value.slice(0, width)
  return `${value.slice(0, width - 3)}...`
}

function colorAgentBarSegment(agent: string, index: number, value: string): string {
  return chalk.hex(getAgentColorHex(agent, index))(value)
}

function renderAgentBar(
  agents: Array<{ agent: string; total: number }>,
  projectTotal: number,
  width: number,
  filledUnits: number,
): string {
  if (filledUnits <= 0 || projectTotal <= 0) return chalk.dim('░'.repeat(width))

  const activeAgents = agents.filter((agent) => agent.total > 0)
  let usedUnits = 0
  let usedTotal = 0
  const segments = activeAgents.map((agent, index) => {
    usedTotal += agent.total
    const nextUnits =
      index === activeAgents.length - 1
        ? filledUnits
        : Math.round((usedTotal / projectTotal) * filledUnits)
    const units = Math.max(0, nextUnits - usedUnits)
    usedUnits = nextUnits
    return colorAgentBarSegment(agent.agent, index, '█'.repeat(units))
  })

  return `${segments.join('')}${chalk.dim('░'.repeat(width - filledUnits))}`
}

function statusLabel(ok: boolean): string {
  return ok ? chalk.green('ok') : chalk.yellow('needs attention')
}

function hasVibetimeCommand(command: unknown): command is string {
  return (
    typeof command === 'string' &&
    /\bvibetime(?:\.(?:exe|cmd))?\b/i.test(command) &&
    command.includes('--source')
  )
}

function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function agentInstalled(agent: AgentName): boolean {
  try {
    switch (agent) {
      case 'claude-code': {
        const data = readJsonFile(homePath('.claude', 'settings.json'))
        if (!data) return false
        return Object.values((data.hooks ?? {}) as Record<string, unknown[]>).some((groups) =>
          groups.some((group) =>
            ((group as { hooks?: Array<{ command?: unknown }> }).hooks ?? []).some((hook) =>
              hasVibetimeCommand(hook.command),
            ),
          ),
        )
      }
      case 'codex': {
        const path = homePath('.codex', 'config.toml')
        if (!existsSync(path)) return false
        const content = readFileSync(path, 'utf-8')
        return (
          /^\s*hooks\s*=\s*true\b/m.test(content) &&
          content.includes('[[hooks.UserPromptSubmit') &&
          hasVibetimeCommand(content)
        )
      }
      case 'cursor': {
        const data = readJsonFile(homePath('.cursor', 'hooks.json'))
        if (!data) return false
        return Object.values((data.hooks ?? {}) as Record<string, unknown[]>).some((hooks) =>
          hooks.some((hook) => hasVibetimeCommand((hook as { command?: unknown }).command)),
        )
      }
      case 'gemini-cli': {
        const data = readJsonFile(homePath('.gemini', 'settings.json'))
        if (!data) return false
        return Object.values((data.hooks ?? {}) as Record<string, unknown[]>).some((groups) =>
          groups.some((group) =>
            ((group as { hooks?: Array<{ command?: unknown }> }).hooks ?? []).some((hook) =>
              hasVibetimeCommand(hook.command),
            ),
          ),
        )
      }
    }
  } catch {
    return false
  }
}

function queryAgentInstallStatuses(): Array<{ agent: AgentName; installed: boolean }> {
  return AGENTS.map((agent) => ({ agent, installed: agentInstalled(agent) }))
}

function turnStartsById(events: NormalizedEvent[]): Map<string, number> {
  const turnStarts = new Map<string, number>()
  for (const ev of events) {
    if (ev.event_type === 'turn_start' && ev.turn_id) {
      const existingStart = turnStarts.get(ev.turn_id)
      if (existingStart === undefined || ev.ts < existingStart) {
        turnStarts.set(ev.turn_id, ev.ts)
      }
    }
  }
  return turnStarts
}

function summarizeWindow(events: NormalizedEvent[], from: number, to: number) {
  const turnStarts = turnStartsById(events)
  const projectMap = new Map<string, { total: number; agents: Map<string, number> }>()
  const completedTurns = new Set<string>()

  for (const ev of events) {
    if (ev.event_type !== 'turn_end') continue
    if (isUnknownDurationEnd(ev)) continue

    const duration = durationWithinWindow({
      endTs: ev.ts,
      durationSec: ev.duration_sec,
      startTs: ev.turn_id ? turnStarts.get(ev.turn_id) : undefined,
      windowStart: from,
      windowEnd: to,
    })
    if (duration === null || duration <= 0) continue

    let entry = projectMap.get(ev.project)
    if (!entry) {
      entry = { total: 0, agents: new Map() }
      projectMap.set(ev.project, entry)
    }
    entry.total += duration
    if (ev.turn_id) completedTurns.add(ev.turn_id)
    entry.agents.set(ev.agent, (entry.agents.get(ev.agent) ?? 0) + duration)
  }

  const projects = [...projectMap.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([name, data]) => ({
      name,
      total: data.total,
      agents: [...data.agents.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([agent, total]) => ({ agent, total })),
    }))

  return {
    total: projects.reduce((sum, project) => sum + project.total, 0),
    turnCount: completedTurns.size,
    projectCount: projects.length,
    projects,
  }
}

function openReadDb() {
  const db = openDatabase()
  reconcileCodexCompletedTurns(db)
  sweepStale(db)
  return db
}

function startOfLocalDay(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

function sumTrendDay(day: HistorySummary['trends'][number]): number {
  return Object.values(day.projects).reduce((sum, total) => sum + total, 0)
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const pos = (values.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const current = values[base] ?? 0
  const next = values[base + 1]
  return next === undefined ? current : current + rest * (next - current)
}

function parseHistoryPeriod(args: string[]): HistoryPeriodDays | null {
  const daysArg = optionValue(args, '--days')
  const days = daysArg ? Number(daysArg) : DEFAULT_HISTORY_DAYS
  if (!Number.isInteger(days) || !isHistoryPeriodDays(days)) {
    console.error(chalk.red('Error: --days must be one of 7, 30, 90, 365'))
    process.exit(1)
    return null
  }
  return days
}

function formatPeriodCompare(compare: HistorySummary['periodCompare']): string {
  if (compare.previousTotal <= 0 || compare.deltaRatio === null) return 'no prior period'
  const pct = Math.round(compare.deltaRatio * 100)
  return `${pct >= 0 ? '+' : ''}${pct}% vs previous`
}

function buildAgentMix(
  summary: HistorySummary,
): Array<{ agent: string; total: number; turns: number }> {
  const totals = new Map<string, { total: number; turns: number }>()
  for (const project of summary.projectAgentTotals) {
    for (const agent of project.agents) {
      const entry = totals.get(agent.agent) ?? { total: 0, turns: 0 }
      entry.total += agent.total
      entry.turns += agent.turns
      totals.set(agent.agent, entry)
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([agent, data]) => ({ agent, total: data.total, turns: data.turns }))
}

function printHistorySummary(summary: HistorySummary): void {
  const periodTotal = summary.periodCompare.currentTotal
  console.log(chalk.bold(`History (last ${summary.periodDays} days)`))
  console.log(chalk.dim('─'.repeat(40)))

  if (periodTotal <= 0) {
    console.log(chalk.dim(`No activity in the last ${summary.periodDays} days.`))
    return
  }

  const activeDays = summary.trends.filter((day) => sumTrendDay(day) > 0).length
  const bestDay = summary.trends.reduce(
    (best, day) => {
      const total = sumTrendDay(day)
      return total > best.total ? { date: day.date, total } : best
    },
    { date: 'n/a', total: 0 },
  )
  const turnDurations = summary.turnDurations
    .map((turn) => turn.duration)
    .filter((duration) => duration > 0)
    .sort((a, b) => a - b)
  const medianTurn = quantile(turnDurations, 0.5)
  const focusBlocks = turnDurations.filter((duration) => duration >= 25 * 60).length
  const peak = summary.hourlyMatrix.reduce(
    (best, cell) => (cell.total > best.total ? cell : best),
    { weekday: 0, hour: 0, total: 0 },
  )
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  console.log(
    `  Total: ${chalk.cyan(fmtDuration(periodTotal))}  ${chalk.dim(formatPeriodCompare(summary.periodCompare))}`,
  )
  console.log(`  Active days: ${activeDays}/${summary.periodDays}`)
  console.log(`  Best day: ${bestDay.date}  ${fmtDuration(bestDay.total)}`)
  console.log()
  console.log(chalk.bold('Rhythm'))
  console.log(`  Median turn: ${fmtDuration(medianTurn)}`)
  console.log(`  Focus blocks: ${focusBlocks}`)
  console.log(`  Peak rhythm: ${weekdays[peak.weekday]} ${fmtHour(peak.hour)}`)

  console.log()
  console.log(chalk.bold('Top projects'))
  const topProjects = summary.topProjects.slice(0, 5)
  const projectNameWidth = Math.min(
    28,
    Math.max(12, ...topProjects.map((project) => project.project.length)),
  )
  for (const project of topProjects) {
    console.log(
      `  ${fitLabel(project.project, projectNameWidth)} ${chalk.cyan(fmtDuration(project.total).padStart(8))}  ${String(project.turns).padStart(3)} turns  last ${fmtDate(project.lastActive)}`,
    )
  }

  const agentMix = buildAgentMix(summary)
  if (agentMix.length > 0) {
    console.log()
    console.log(chalk.bold('Agent mix'))
    const agentNameWidth = Math.min(
      18,
      Math.max(12, ...agentMix.map((agent) => agent.agent.length)),
    )
    for (const agent of agentMix) {
      console.log(
        `  ${fitLabel(agent.agent, agentNameWidth)} ${chalk.cyan(fmtDuration(agent.total).padStart(8))}  ${String(agent.turns).padStart(3)} turns`,
      )
    }
  }
}

function parseEventMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta) return null
  if (typeof meta !== 'string') {
    return typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : null
  }

  try {
    const parsed = JSON.parse(meta)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isUnknownDurationEnd(ev: { meta?: unknown }): boolean {
  const meta = parseEventMeta(ev.meta)
  return meta?.abandoned === true || meta?.reason === 'stale_sweep'
}

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`vibetime — Agent coding time tracker

Usage:
  vibetime <command> [options]

Commands:
  status            Show database, hook, CLI, and agent status
  agents            Show agent hook installation status
  install <agent>   Configure hooks for an agent (claude-code | codex | cursor | gemini-cli)
  uninstall <agent> Remove vibetime hooks for an agent (claude-code | codex | cursor | gemini-cli)
  today             Show today's agent time breakdown
  history           Show History summary (default: --days=30)
  project <name>    Show project details (default: --days=7)
  export            Export events as JSON or CSV (--format=csv, --out=path)
  health            Show hook persist health (recent write failures)
  version           Show version and database path
  help              Show this help message

Examples:
  vibetime status
  vibetime status --json
  vibetime agents
  vibetime install claude-code
  vibetime uninstall claude-code
  vibetime install codex
  vibetime install cursor
  vibetime install gemini-cli
  vibetime today
  vibetime today --json
  vibetime history
  vibetime history --days=90
  vibetime history --json
  vibetime project my-project --days=30
  vibetime export --format=json --out=events.json
  vibetime health
  vibetime version`)
}

/**
 * Run the CLI in CLI mode.
 * Parses subcommands and dispatches to appropriate handlers.
 */
export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const command = args[0]
  const json = hasFlag(args, '--json')

  try {
    switch (command) {
      case 'status': {
        const dbExistsBeforeOpen = existsSync(DB_PATH)
        let events: NormalizedEvent[] = []
        let openTurns: ReturnType<typeof queryOpenTurns> = []
        if (dbExistsBeforeOpen) {
          const db = openReadDb()
          events = queryEvents(db)
          openTurns = queryOpenTurns(db)
          closeDatabase(db)
        }

        const cli = getCliInstallStatus()
        const health = readHookHealth()
        const agents = queryAgentInstallStatuses()
        const lastEvent = events.at(-1) ?? null
        const installedAgents = agents.filter((agent) => agent.installed).length
        const ok = health.consecutiveFailures === 0 && !cli.conflict

        const status = {
          ok,
          database: {
            path: DB_PATH,
            exists: dbExistsBeforeOpen,
            events: events.length,
            openTurns: openTurns.length,
            lastEvent: lastEvent
              ? {
                  ts: lastEvent.ts,
                  agent: lastEvent.agent,
                  event_type: lastEvent.event_type,
                  project: lastEvent.project,
                }
              : null,
          },
          health: {
            consecutiveFailures: health.consecutiveFailures,
            recentFailures: health.recentFailures.length,
            lastError: health.lastError,
          },
          cli,
          agents,
        }

        if (json) {
          printJson(status)
          break
        }

        console.log(chalk.bold('VibeTime status'))
        console.log(chalk.dim('─'.repeat(40)))
        console.log(`  Overall: ${statusLabel(ok)}`)
        console.log(
          `  Database: ${dbExistsBeforeOpen ? chalk.green('found') : chalk.dim('not created yet')} (${DB_PATH})`,
        )
        console.log(`  Events: ${events.length}`)
        console.log(`  Open turns: ${openTurns.length}`)
        if (lastEvent) {
          console.log(
            chalk.dim(
              `  Last event: ${lastEvent.agent}/${lastEvent.event_type} · ${lastEvent.project} · ${new Date(lastEvent.ts * 1000).toLocaleString('en-US')}`,
            ),
          )
        }
        console.log()
        console.log(`  Hook health: ${statusLabel(health.consecutiveFailures === 0)}`)
        console.log(`  Recent failures: ${health.recentFailures.length}`)
        if (health.lastError) {
          console.log(chalk.dim(`  Last error: ${health.lastError.message}`))
        }
        console.log()
        console.log(
          `  CLI link: ${cli.installed ? chalk.green('installed') : chalk.yellow('not installed')}`,
        )
        if (!cli.binDirInPath) console.log(chalk.dim(`  PATH hint: add ${cli.binDir}`))
        console.log(`  Agents installed: ${installedAgents}/${agents.length}`)
        for (const agent of agents) {
          console.log(
            `    ${agent.installed ? chalk.green('yes') : chalk.dim('no ')}  ${agent.agent}`,
          )
        }
        break
      }

      case 'agents': {
        const agents = queryAgentInstallStatuses()
        if (json) {
          printJson({ agents })
          break
        }

        console.log(chalk.bold('Agent hooks'))
        console.log(chalk.dim('─'.repeat(40)))
        for (const agent of agents) {
          console.log(
            `  ${agent.installed ? chalk.green('installed') : chalk.dim('missing  ')}  ${agent.agent}`,
          )
        }
        break
      }

      case 'install': {
        const agent = args[1]
        if (!agent) {
          console.error('Error: Agent name required. Usage: vibetime install <agent>')
          console.error('Supported agents: claude-code, codex, cursor, gemini-cli')
          process.exit(1)
          return
        }
        installAgent(agent)
        if (json) printJson({ ok: true, agent, action: 'install' })
        else console.log(`Installed vibetime hooks for ${agent}`)
        break
      }

      case 'uninstall': {
        const agent = args[1]
        if (!agent) {
          console.error('Error: Agent name required. Usage: vibetime uninstall <agent>')
          console.error('Supported agents: claude-code, codex, cursor, gemini-cli')
          process.exit(1)
          return
        }
        uninstallAgent(agent)
        if (json) printJson({ ok: true, agent, action: 'uninstall' })
        else console.log(`Uninstalled vibetime hooks for ${agent}`)
        break
      }

      case 'today': {
        const db = openReadDb()

        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const from = Math.floor(startOfDay.getTime() / 1000)
        const to = Math.floor(now.getTime() / 1000)

        const events = queryEvents(db, { from, to })
        closeDatabase(db)
        const summary = summarizeWindow(events, from, to)

        if (json) {
          printJson({
            date: now.toLocaleDateString('en-CA'),
            from,
            to,
            ...summary,
          })
          break
        }

        if (summary.projects.length === 0 || summary.total <= 0) {
          console.log(chalk.dim('No activity today.'))
          break
        }

        // Print header
        const dateStr = now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        console.log(chalk.bold(`Today — ${dateStr}`))
        console.log(chalk.dim('─'.repeat(40)))

        // Print grand total
        console.log(chalk.bold.cyan(`  Total: ${fmtDuration(summary.total)}`))
        console.log()

        // Print per-project breakdown
        const maxNameLen = Math.max(...summary.projects.map((project) => project.name.length), 8)
        const barWidth = 20
        const agentIndent = 2 + maxNameLen + 2 + 8 + 2
        for (const project of summary.projects) {
          const pct = summary.total > 0 ? Math.round((project.total / summary.total) * 100) : 0
          const barUnits = Math.round(pct / 5)
          const bar = renderAgentBar(project.agents, project.total, barWidth, barUnits)
          console.log(
            `  ${chalk.bold(project.name.padEnd(maxNameLen))}  ${chalk.cyan(fmtDuration(project.total).padStart(8))}  ${bar} ${chalk.dim(`${pct}%`)}`,
          )

          // Agent breakdown
          for (const agent of project.agents) {
            if (agent.total > 0) {
              console.log(
                `${' '.repeat(agentIndent)}${chalk.dim(agent.agent)}: ${chalk.dim(fmtDuration(agent.total))}`,
              )
            }
          }
        }

        // Print footer
        console.log()
        console.log(
          chalk.dim(
            `  ${summary.turnCount} turns across ${summary.projectCount} project${summary.projectCount !== 1 ? 's' : ''}`,
          ),
        )
        break
      }

      case 'history': {
        const periodDays = parseHistoryPeriod(args)
        if (periodDays === null) return

        const now = new Date()
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        const rangeEnd = startOfLocalDay(tomorrow)
        const lowerBound = historyLowerBound(rangeEnd, periodDays)
        const db = openReadDb()
        const events = queryEvents(db, {
          from: lowerBound - HISTORY_TURN_START_BUFFER_SEC,
          to: rangeEnd,
        })
        closeDatabase(db)

        const summary = buildHistorySummaryFromEvents(events, { periodDays, now })
        if (json) {
          printJson(summary)
          break
        }

        printHistorySummary(summary)
        break
      }

      case 'project': {
        const projectName = args[1]
        if (!projectName) {
          console.error(
            chalk.red('Error: Project name required. Usage: vibetime project <name> [--days=N]'),
          )
          process.exit(1)
          return
        }

        const daysArg = optionValue(args, '--days')
        const days = daysArg ? parseInt(daysArg, 10) : 7
        if (!Number.isFinite(days) || days <= 0) {
          console.error(chalk.red('Error: --days must be a positive number'))
          process.exit(1)
          return
        }

        const db = openReadDb()
        const to = Math.floor(Date.now() / 1000)
        const from = to - days * 24 * 60 * 60

        const events = queryEvents(db, { from, to, project: projectName })
        closeDatabase(db)

        const turnStarts = turnStartsById(events)

        // Aggregate completed agent time by local day.
        const dayMap = new Map<string, { total: number; agents: Map<string, number> }>()
        for (const ev of events) {
          if (ev.event_type !== 'turn_end') continue
          if (isUnknownDurationEnd(ev)) continue

          const allocations = allocateDurationByLocalDay({
            endTs: ev.ts,
            durationSec: ev.duration_sec,
            startTs: ev.turn_id ? turnStarts.get(ev.turn_id) : undefined,
            rangeStart: from,
            rangeEnd: to,
          })

          for (const allocation of allocations) {
            if (allocation.duration <= 0) continue

            let entry = dayMap.get(allocation.day)
            if (!entry) {
              entry = { total: 0, agents: new Map() }
              dayMap.set(allocation.day, entry)
            }
            entry.total += allocation.duration
            const agentTotal = entry.agents.get(ev.agent) ?? 0
            entry.agents.set(ev.agent, agentTotal + allocation.duration)
          }
        }

        const sorted = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))
        const totalAll = sorted.reduce((sum, [, v]) => sum + v.total, 0)
        const daysOut = sorted.map(([day, data]) => ({
          day,
          total: data.total,
          agents: [...data.agents.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([agent, total]) => ({ agent, total })),
        }))

        if (json) {
          printJson({
            project: projectName,
            periodDays: days,
            from,
            to,
            total: totalAll,
            activeDays: daysOut.length,
            days: daysOut,
          })
          break
        }

        if (sorted.length === 0 || totalAll <= 0) {
          console.log(
            chalk.dim(`No activity for project "${projectName}" in the last ${days} days.`),
          )
          break
        }

        console.log(chalk.bold(`Project: ${projectName} (last ${days} days)`))
        console.log(chalk.dim('─'.repeat(50)))
        console.log(chalk.bold.cyan(`  Total: ${fmtDuration(totalAll)}`))
        console.log()

        for (const day of daysOut) {
          console.log(`${chalk.bold(`  ${day.day}`)}  ${chalk.cyan(fmtDuration(day.total))}`)
          for (const agent of day.agents) {
            if (agent.total > 0) {
              console.log(`    ${chalk.dim(agent.agent)}: ${chalk.dim(fmtDuration(agent.total))}`)
            }
          }
        }
        break
      }

      case 'export': {
        const format = optionValue(args, '--format') ?? 'json'
        if (format !== 'json' && format !== 'csv') {
          console.error(chalk.red('Error: --format must be json or csv'))
          process.exit(1)
          return
        }

        const db = openReadDb()

        const options: { from?: number; to?: number; project?: string; agent?: string } = {}
        const fromArg = optionValue(args, '--from')
        const toArg = optionValue(args, '--to')
        if (fromArg) {
          options.from = Math.floor(new Date(fromArg).getTime() / 1000)
        }
        if (toArg) {
          options.to = Math.floor(new Date(toArg).getTime() / 1000)
        }
        const projectArg = optionValue(args, '--project')
        const agentArg = optionValue(args, '--agent')
        if (projectArg) options.project = projectArg
        if (agentArg) options.agent = agentArg

        const events = queryEvents(db, options)
        closeDatabase(db)

        let output: string

        if (format === 'csv') {
          // CSV with headers
          const headers = [
            'schema_version',
            'agent',
            'event_type',
            'project',
            'session_id',
            'turn_id',
            'ts',
            'timezone',
            'duration_sec',
            'meta',
          ]
          const escapeCsv = (val: unknown): string => {
            const str = val === null || val === undefined ? '' : String(val)
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          }
          const rows = events.map((ev) =>
            [
              1,
              ev.agent,
              ev.event_type,
              ev.project,
              ev.session_id,
              ev.turn_id ?? '',
              ev.ts,
              ev.timezone,
              ev.duration_sec ?? '',
              ev.meta ? JSON.stringify(ev.meta) : '',
            ]
              .map(escapeCsv)
              .join(','),
          )
          output = [headers.join(','), ...rows].join('\n')
        } else {
          output = JSON.stringify(events, null, 2)
        }

        const outPath = optionValue(args, '--out')
        if (outPath) {
          const { writeFileSync } = await import('node:fs')
          writeFileSync(outPath, output, 'utf-8')
          console.log(chalk.dim(`Exported ${events.length} events to ${outPath}`))
        } else {
          console.log(output)
        }
        break
      }

      case 'version': {
        if (json) {
          printJson({ version: VERSION, database: DB_PATH })
          break
        }
        console.log(chalk.bold(`vibetime ${VERSION}`))
        console.log(chalk.dim(`Database: ${DB_PATH}`))
        break
      }

      case 'health': {
        const health = readHookHealth()
        if (json) {
          printJson(health)
          break
        }
        console.log(chalk.bold('Hook persist health'))
        console.log(chalk.dim('─'.repeat(40)))
        console.log(`  Consecutive failures: ${health.consecutiveFailures}`)
        console.log(`  Failures in last 24h: ${health.recentFailures.length}`)
        if (health.lastError) {
          const when = new Date(health.lastError.ts * 1000).toLocaleString('en-US')
          console.log(`  Last error: ${health.lastError.message}`)
          console.log(
            chalk.dim(`  Agent/Event: ${health.lastError.agent}/${health.lastError.event_type}`),
          )
          console.log(chalk.dim(`  Time: ${when}`))
        } else {
          console.log(chalk.dim('  Last error: none'))
        }
        break
      }

      case 'help':
      case '--help':
      case '-h':
      case undefined: {
        printHelp()
        break
      }

      default: {
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
      }
    }
  } catch (err) {
    appendLog(`CLI error: ${err}`)
    console.error(`Error: ${err}`)
    process.exit(1)
  }
}
