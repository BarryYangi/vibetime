// CLI mode: parse subcommands and dispatch to handlers.
// Hand-rolled argv parsing — no CLI library (CONTEXT.md gray area 1).
// Subcommands: install, today, project, export, version, help.

import chalk from 'chalk'
import { installAgent } from './install.js'
import { openDatabase, closeDatabase, queryEvents } from './store.js'
import { sweepStale } from './recovery.js'
import { VERSION, DB_PATH } from './constants.js'
import { appendLog } from './log.js'

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`vibetime — Agent coding time tracker

Usage:
  vibetime <command> [options]

Commands:
  install <agent>   Configure hooks for an agent (claude-code | codex | cursor)
  today             Show today's agent time breakdown
  project <name>    Show project details (default: --days=7)
  export            Export events as JSON or CSV
  version           Show version and database path
  help              Show this help message

Examples:
  vibetime install claude-code
  vibetime install codex
  vibetime install cursor
  vibetime today
  vibetime project my-project --days=30
  vibetime export --format=json --out=events.json
  vibetime version`)
}

/**
 * Run the CLI in CLI mode.
 * Parses subcommands and dispatches to appropriate handlers.
 */
export async function runCli(): Promise<void> {
  const args = process.argv.slice(2) // Remove 'node' and script path
  const command = args[0]

  try {
    switch (command) {
      case 'install': {
        const agent = args[1]
        if (!agent) {
          console.error('Error: Agent name required. Usage: vibetime install <agent>')
          console.error('Supported agents: claude-code, codex, cursor')
          process.exit(1)
        }
        installAgent(agent)
        console.log(`Installed vibetime hooks for ${agent}`)
        break
      }

      case 'today': {
        const db = openDatabase()
        sweepStale(db) // REC-02: sweep stale turns on CLI invocation

        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const from = Math.floor(startOfDay.getTime() / 1000)
        const to = Math.floor(now.getTime() / 1000)

        const events = queryEvents(db, { from, to })
        closeDatabase(db)

        if (events.length === 0) {
          console.log(chalk.dim('No activity today.'))
          break
        }

        // Aggregate by project
        const projectMap = new Map<string, { total: number; agents: Map<string, number>; turns: number }>()
        for (const ev of events) {
          let entry = projectMap.get(ev.project)
          if (!entry) {
            entry = { total: 0, agents: new Map(), turns: 0 }
            projectMap.set(ev.project, entry)
          }
          if (ev.duration_sec) entry.total += ev.duration_sec
          if (ev.event_type === 'turn_start') entry.turns++
          const agentTotal = entry.agents.get(ev.agent) ?? 0
          entry.agents.set(ev.agent, agentTotal + (ev.duration_sec ?? 0))
        }

        // Sort by total desc
        const sorted = [...projectMap.entries()].sort((a, b) => b[1].total - a[1].total)
        const grandTotal = sorted.reduce((sum, [, v]) => sum + v.total, 0)

        // Format helpers
        function fmtDuration(sec: number): string {
          if (sec < 60) return `${Math.round(sec)}s`
          if (sec < 3600) return `${Math.round(sec / 60)}m`
          const h = Math.floor(sec / 3600)
          const m = Math.round((sec % 3600) / 60)
          return `${h}h ${m}m`
        }

        // Print header
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        console.log(chalk.bold(`Today — ${dateStr}`))
        console.log(chalk.dim('─'.repeat(40)))

        // Print grand total
        console.log(chalk.bold.cyan(`  Total: ${fmtDuration(grandTotal)}`))
        console.log()

        // Print per-project breakdown
        const maxNameLen = Math.max(...sorted.map(([name]) => name.length), 8)
        for (const [name, data] of sorted) {
          const pct = grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0
          const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5))
          console.log(`  ${chalk.bold(name.padEnd(maxNameLen))}  ${chalk.cyan(fmtDuration(data.total).padStart(8))}  ${chalk.dim(bar)} ${chalk.dim(`${pct}%`)}`)

          // Agent breakdown
          for (const [agent, agentTotal] of data.agents) {
            if (agentTotal > 0) {
              console.log(`  ${' '.repeat(maxNameLen)}  ${chalk.dim(agent)}: ${chalk.dim(fmtDuration(agentTotal))}`)
            }
          }
        }

        // Print footer
        const turnCount = events.filter(e => e.event_type === 'turn_start').length
        const activeProjects = projectMap.size
        console.log()
        console.log(chalk.dim(`  ${turnCount} turns across ${activeProjects} project${activeProjects !== 1 ? 's' : ''}`))
        break
      }

      case 'project': {
        const projectName = args[1]
        if (!projectName) {
          console.error('Error: Project name required. Usage: vibetime project <name> [--days=N]')
          process.exit(1)
        }

        const daysArg = args.find((a) => a.startsWith('--days='))
        const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 7

        const db = openDatabase()
        sweepStale(db) // REC-02: sweep stale turns on CLI invocation

        const to = Math.floor(Date.now() / 1000)
        const from = to - days * 24 * 60 * 60

        const events = queryEvents(db, { from, to, project: projectName })
        closeDatabase(db)

        // TODO: Phase 4 will implement proper Project view
        console.log(`Project ${projectName} (last ${days} days): ${events.length} events`)
        break
      }

      case 'export': {
        const formatArg = args.find((a) => a.startsWith('--format='))
        const format = formatArg ? formatArg.split('=')[1] : 'json'

        const outArg = args.find((a) => a.startsWith('--out='))
        const outPath = outArg ? outArg.split('=')[1] : null

        const fromArg = args.find((a) => a.startsWith('--from='))
        const toArg = args.find((a) => a.startsWith('--to='))

        const db = openDatabase()
        sweepStale(db) // REC-02: sweep stale turns on CLI invocation

        const options: { from?: number; to?: number } = {}
        if (fromArg) {
          options.from = Math.floor(new Date(fromArg.split('=')[1]).getTime() / 1000)
        }
        if (toArg) {
          options.to = Math.floor(new Date(toArg.split('=')[1]).getTime() / 1000)
        }

        const events = queryEvents(db, options)
        closeDatabase(db)

        // TODO: Phase 4 will implement proper Export
        if (format === 'csv') {
          console.log('CSV export not yet implemented')
        } else {
          const json = JSON.stringify(events, null, 2)
          if (outPath) {
            const { writeFileSync } = await import('node:fs')
            writeFileSync(outPath, json)
            console.log(`Exported ${events.length} events to ${outPath}`)
          } else {
            console.log(json)
          }
        }
        break
      }

      case 'version': {
        console.log(chalk.bold(`vibetime ${VERSION}`))
        console.log(chalk.dim(`Database: ${DB_PATH}`))
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
