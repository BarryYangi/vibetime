import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const MANAGED_SHIM_MARKER = 'vibetime-managed-shim'
const MANAGED_LINK_MARKER = 'vibetime-managed-cli-link'

function homeDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) throw new Error('Cannot resolve home directory')
  return home
}

function pathEnv(): string {
  return process.env.PATH ?? ''
}

function pathEntries(): string[] {
  return pathEnv()
    .split(process.platform === 'win32' ? ';' : ':')
    .filter(Boolean)
    .map((entry) => normalize(entry))
}

function cliFileName(): string {
  return process.platform === 'win32' ? 'vibetime.cmd' : 'vibetime'
}

export function getManagedCliPath(): string {
  return join(homeDir(), '.vibetime', 'bin', cliFileName())
}

export function getUserCliBinDir(): string {
  return join(homeDir(), '.local', 'bin')
}

export function getUserCliLinkPath(): string {
  return join(getUserCliBinDir(), cliFileName())
}

export function isUserCliBinDirInPath(): boolean {
  return pathEntries().includes(normalize(getUserCliBinDir()))
}

function createPosixShim(): string {
  return `#!/bin/sh
# ${MANAGED_SHIM_MARKER}
set -eu

if [ -n "\${VIBETIME_TARGET_BINARY:-}" ] && [ -x "\${VIBETIME_TARGET_BINARY}" ]; then
  exec "\${VIBETIME_TARGET_BINARY}" "$@"
fi

H='/Contents/Resources/bin/vibetime'
for P in "/Applications/VibeTime.app" "/Applications/vibetime.app" "$HOME/Applications/VibeTime.app" "$HOME/Applications/vibetime.app"; do
  B="$P$H"
  [ -x "$B" ] && exec "$B" "$@"
done

C="$HOME/.vibetime/cache/app-path"
if [ -f "$C" ]; then
  read -r P < "$C" || P=''
  B="$P$H"
  [ -x "$B" ] && exec "$B" "$@"
fi

if [ -x /usr/bin/mdfind ]; then
  P="$(/usr/bin/mdfind 'kMDItemCFBundleIdentifier == "com.barryyangi.vibetime"' 2>/dev/null | /usr/bin/head -1)"
  B="$P$H"
  [ -x "$B" ] && { mkdir -p "$(dirname "$C")"; echo "$P" > "$C"; exec "$B" "$@"; }
fi

echo "VibeTime CLI was not found. Open VibeTime and reinstall hooks or CLI." >&2
exit 127
`
}

function createWindowsShim(): string {
  return `@echo off
rem ${MANAGED_SHIM_MARKER}
setlocal

if not "%VIBETIME_TARGET_BINARY%"=="" if exist "%VIBETIME_TARGET_BINARY%" (
  "%VIBETIME_TARGET_BINARY%" %*
  exit /b %ERRORLEVEL%
)

set "CACHE=%USERPROFILE%\\.vibetime\\cache\\app-path"
if exist "%CACHE%" (
  set /p APP_DIR=<"%CACHE%"
  if exist "%APP_DIR%\\resources\\bin\\vibetime.exe" (
    "%APP_DIR%\\resources\\bin\\vibetime.exe" %*
    exit /b %ERRORLEVEL%
  )
)

for %%P in ("%LOCALAPPDATA%\\Programs\\VibeTime" "%ProgramFiles%\\VibeTime" "%ProgramFiles(x86)%\\VibeTime") do (
  if exist "%%~P\\resources\\bin\\vibetime.exe" (
    if not exist "%USERPROFILE%\\.vibetime\\cache" mkdir "%USERPROFILE%\\.vibetime\\cache"
    >"%CACHE%" echo %%~P
    "%%~P\\resources\\bin\\vibetime.exe" %*
    exit /b %ERRORLEVEL%
  )
)

echo VibeTime CLI was not found. Open VibeTime and reinstall hooks or CLI. 1>&2
exit /b 127
`
}

export function ensureManagedCliShim(): string {
  const shimPath = getManagedCliPath()
  mkdirSync(dirname(shimPath), { recursive: true })

  const content = process.platform === 'win32' ? createWindowsShim() : createPosixShim()

  if (!existsSync(shimPath) || readFileSync(shimPath, 'utf-8') !== content) {
    writeFileSync(shimPath, content, 'utf-8')
    if (process.platform !== 'win32') chmodSync(shimPath, 0o755)
  }

  return shimPath
}

function hasManagedLinkFile(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return readlinkSync(path) === getManagedCliPath()
    if (stat.isFile()) return readFileSync(path, 'utf-8').includes(MANAGED_LINK_MARKER)
  } catch {
    return false
  }
  return false
}

function linkExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function createWindowsCliLink(targetPath: string): string {
  return `@echo off
rem ${MANAGED_LINK_MARKER}
"${targetPath}" %*
`
}

export interface CliInstallStatus {
  installed: boolean
  linkPath: string
  targetPath: string
  binDir: string
  binDirInPath: boolean
  conflict: boolean
}

export function getCliInstallStatus(): CliInstallStatus {
  const linkPath = getUserCliLinkPath()
  const targetPath = getManagedCliPath()
  const exists = linkExists(linkPath)
  const hasManagedLink = exists && hasManagedLinkFile(linkPath)
  const installed = hasManagedLink && existsSync(targetPath)

  return {
    installed,
    linkPath,
    targetPath,
    binDir: getUserCliBinDir(),
    binDirInPath: isUserCliBinDirInPath(),
    conflict: exists && !hasManagedLink,
  }
}

export function installUserCli(): CliInstallStatus {
  const targetPath = ensureManagedCliShim()
  const linkPath = getUserCliLinkPath()

  mkdirSync(dirname(linkPath), { recursive: true })

  const status = getCliInstallStatus()
  if (status.conflict) {
    throw new Error(`${linkPath} already exists and is not managed by VibeTime`)
  }

  if (linkExists(linkPath)) rmSync(linkPath, { force: true })

  if (process.platform === 'win32') {
    writeFileSync(linkPath, createWindowsCliLink(targetPath), 'utf-8')
  } else {
    symlinkSync(targetPath, linkPath)
  }

  return getCliInstallStatus()
}

export function uninstallUserCli(): CliInstallStatus {
  const linkPath = getUserCliLinkPath()
  const status = getCliInstallStatus()

  if (status.conflict) {
    throw new Error(`${linkPath} exists and is not managed by VibeTime`)
  }

  if (linkExists(linkPath)) rmSync(linkPath, { force: true })

  return getCliInstallStatus()
}
