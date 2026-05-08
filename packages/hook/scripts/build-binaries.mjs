import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const isWindows = process.platform === 'win32'

function run(args) {
  execFileSync('bun', args, { stdio: 'inherit' })
}

function compile(outfile, extraArgs = []) {
  run([
    'build',
    '--compile',
    '--minify',
    '--bytecode',
    ...extraArgs,
    'src/index.ts',
    '--outfile',
    outfile,
  ])
}

compile(isWindows ? 'vibetime-hook.exe' : 'vibetime-hook')
compile(isWindows ? 'vibetime.exe' : 'vibetime')

const winOutDir = join('build', 'win-x64')
mkdirSync(winOutDir, { recursive: true })
compile(join(winOutDir, 'vibetime-hook.exe'), ['--target=bun-windows-x64'])
compile(join(winOutDir, 'vibetime.exe'), ['--target=bun-windows-x64'])
