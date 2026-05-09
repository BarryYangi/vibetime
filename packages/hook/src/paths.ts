import { homedir } from 'node:os'
import { join } from 'node:path'

export function homeDir(): string {
  return process.platform === 'win32'
    ? (process.env.USERPROFILE ?? homedir())
    : (process.env.HOME ?? homedir())
}

export function homePath(...segments: string[]): string {
  return join(homeDir(), ...segments)
}

export function vibetimeDir(): string {
  return homePath('.vibetime')
}
