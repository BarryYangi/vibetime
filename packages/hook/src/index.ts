/**
 * Entry point routing.
 * - vibetime --source <agent> → HOOK mode (stdin → adapter → SQLite)
 * - vibetime <command> → CLI mode (parse subcommands)
 * - vibetime (no args) → CLI mode special (launch Electron app)
 */
async function main(): Promise<void> {
  const isHookMode = process.argv.includes('--source')

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
