// CLI mode: parse subcommands and dispatch to handlers.
// Hand-rolled argv parsing — no CLI library (CONTEXT.md gray area 1).
// Subcommands: install, today, project, export, version, help.

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

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const from = Math.floor(today.getTime() / 1000)
        const to = Math.floor(Date.now() / 1000)

        const events = queryEvents(db, { from, to })
        closeDatabase(db)

        // TODO: Phase 4 will implement proper Today view
        console.log(`Today's events: ${events.length}`)
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
        console.log(`vibetime ${VERSION}`)
        console.log(`Database: ${DB_PATH}`)
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
