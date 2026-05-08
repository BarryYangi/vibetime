import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const isWindows = process.platform === 'win32'
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = packageJson.version ?? '0.0.0-dev'

function run(args) {
  execFileSync('bun', args, { stdio: 'inherit' })
}

function compile(outfile, extraArgs = []) {
  run([
    'build',
    '--compile',
    '--minify',
    '--bytecode',
    '--define',
    `BUILD_VERSION='${version}'`,
    ...extraArgs,
    'src/index.ts',
    '--outfile',
    outfile,
  ])
}

rmSync('vibetime-hook', { force: true })
rmSync('vibetime-hook.exe', { force: true })
rmSync(join('build', 'win-x64', 'vibetime-hook.exe'), { force: true })

compile(isWindows ? 'vibetime.exe' : 'vibetime')

const winOutDir = join('build', 'win-x64')
mkdirSync(winOutDir, { recursive: true })
compile(join(winOutDir, 'vibetime.exe'), ['--target=bun-windows-x64'])
