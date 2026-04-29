import { basename } from 'node:path'

/**
 * Entry point: argv[1] basename routing.
 * - vibetime-hook → HOOK mode (stdin → adapter → SQLite)
 * - vibetime → CLI mode (parse subcommands)
 * - vibetime (no args) → CLI mode special (launch Electron app)
 */
async function main(): Promise<void> {
  const self = basename(process.argv[1] ?? '')

  if (self === 'vibetime-hook') {
    // HOOK mode: stdin → adapter → SQLite
    await import('./hook.js')
  } else {
    // CLI mode: parse subcommands
    await import('./cli.js')
  }
}

main()
