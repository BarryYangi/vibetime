import { execFileSync } from 'node:child_process'
import { existsSync, utimesSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const APP_NAME = 'VibeTime'
const BUNDLE_ID = 'ee.yct.vibetime'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const require = createRequire(import.meta.url)
const electronPackagePath = require.resolve('electron/package.json')
const electronPackageDir = dirname(electronPackagePath)
const electronAppPath = join(electronPackageDir, 'dist', 'Electron.app')
const plistPath = join(electronAppPath, 'Contents', 'Info.plist')

if (!existsSync(plistPath)) {
  throw new Error(`Electron Info.plist not found: ${plistPath}`)
}

const replacements = {
  CFBundleDisplayName: APP_NAME,
  CFBundleName: APP_NAME,
  CFBundleIdentifier: BUNDLE_ID,
}

for (const [key, value] of Object.entries(replacements)) {
  execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plistPath])
}

const now = new Date()
utimesSync(plistPath, now, now)
utimesSync(electronAppPath, now, now)
