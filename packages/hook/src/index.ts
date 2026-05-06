import { basename } from 'node:path'

/**
 * Entry point: argv[1] basename routing.
 * - vibetime-hook → HOOK mode (stdin → adapter → SQLite)
 * - vibetime → CLI mode (parse subcommands)
 * - vibetime (no args) → CLI mode special (launch Electron app)
 */
async function main(): Promise<void> {
  const argvNames = [process.argv[0], process.argv[1]].map((arg) => basename(arg ?? ''))
  const isHookMode = argvNames.includes('vibetime-hook') || process.argv.includes('--source')

  if (isHookMode) {
    // HOOK mode: stdin → adapter → SQLite
    const { runHook } = await import('./hook.js')
    await runHook()
  } else {
    // CLI mode: parse subcommands
    const { runCli } = await import('./cli.js')
    await runCli()
  }
}

main()
