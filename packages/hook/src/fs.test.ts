import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureVibetimeDir } from './fs.js'

let tempHome: string
let origHome: string | undefined

beforeEach(() => {
  origHome = process.env.HOME
  tempHome = mkdtempSync(join(tmpdir(), 'vibetime-fs-test-'))
  process.env.HOME = tempHome
})

afterEach(() => {
  if (origHome !== undefined) {
    process.env.HOME = origHome
  }
  rmSync(tempHome, { recursive: true, force: true })
})

describe('ensureVibetimeDir — happy paths', () => {
  it('creates ~/.vibetime/ directory', () => {
    const dir = ensureVibetimeDir()
    expect(dir).toBe(`${tempHome}/.vibetime`)
    const stat = statSync(dir)
    expect(stat.isDirectory()).toBe(true)
  })

  it('sets directory mode to 0700', () => {
    ensureVibetimeDir()
    const stat = statSync(`${tempHome}/.vibetime`)
    // Check permission bits: 0o700 = rwx------
    const mode = (stat.mode & 0o777).toString(8)
    expect(mode).toBe('700')
  })

  it('is idempotent (calling twice does not throw)', () => {
    ensureVibetimeDir()
    expect(() => ensureVibetimeDir()).not.toThrow()
  })

  it('returns the directory path', () => {
    const dir = ensureVibetimeDir()
    expect(typeof dir).toBe('string')
    expect(dir.endsWith('.vibetime')).toBe(true)
  })
})
