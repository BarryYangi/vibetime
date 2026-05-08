import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig, type VibetimeConfig, writeConfig } from './config.js'

let tempHome: string
let origHome: string | undefined

beforeEach(() => {
  origHome = process.env.HOME
  tempHome = mkdtempSync(join(tmpdir(), 'vibetime-config-test-'))
  process.env.HOME = tempHome
})

afterEach(() => {
  if (origHome !== undefined) {
    process.env.HOME = origHome
  }
  rmSync(tempHome, { recursive: true, force: true })
})

describe('readConfig — happy paths', () => {
  it('creates config.toml with defaults when it does not exist', () => {
    const config = readConfig()
    expect(config.projects).toEqual({})
    expect(typeof config.display.timezone).toBe('string')
    expect(config.display.timezone.length).toBeGreaterThan(0)
  })

  it('returns default timezone from Intl', () => {
    const config = readConfig()
    const expected = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(config.display.timezone).toBe(expected)
  })

  it('reads back written config', () => {
    const cfg: VibetimeConfig = {
      projects: { myproject: '/path/to/myproject' },
      display: { timezone: 'Asia/Tokyo' },
      app: { open_at_login: true, auto_launch_prompted: true, last_view: '/history' },
    }
    writeConfig(cfg)
    const result = readConfig()
    expect(result.projects.myproject).toBe('/path/to/myproject')
    expect(result.display.timezone).toBe('Asia/Tokyo')
    expect(result.app.open_at_login).toBe(true)
    expect(result.app.auto_launch_prompted).toBe(true)
    expect(result.app.last_view).toBe('/history')
  })

  it('is idempotent (multiple reads return same result)', () => {
    const c1 = readConfig()
    const c2 = readConfig()
    expect(c1).toEqual(c2)
  })
})

describe('readConfig — adversarial inputs', () => {
  it('returns defaults on malformed TOML', () => {
    writeConfig({
      projects: {},
      display: { timezone: 'UTC' },
      app: { open_at_login: false, auto_launch_prompted: false, last_view: '/' },
    })
    // Overwrite with garbage
    writeFileSync(`${tempHome}/.vibetime/config.toml`, '[[[[invalid', 'utf-8')
    const config = readConfig()
    expect(config.projects).toEqual({})
    expect(typeof config.display.timezone).toBe('string')
  })

  it('never throws on any input', () => {
    expect(() => readConfig()).not.toThrow()
  })
})

describe('writeConfig — happy paths', () => {
  it('creates config.toml file', () => {
    writeConfig({
      projects: {},
      display: { timezone: 'UTC' },
      app: { open_at_login: false, auto_launch_prompted: false, last_view: '/' },
    })
    expect(existsSync(`${tempHome}/.vibetime/config.toml`)).toBe(true)
  })

  it('writes valid TOML structure', () => {
    const cfg: VibetimeConfig = {
      projects: { foo: '/bar' },
      display: { timezone: 'America/New_York' },
      app: { open_at_login: true, auto_launch_prompted: false, last_view: '/live' },
    }
    writeConfig(cfg)
    const raw = readFileSync(`${tempHome}/.vibetime/config.toml`, 'utf-8')
    expect(raw).toContain('[projects]')
    expect(raw).toContain('[display]')
    expect(raw).toContain('[app]')
    expect(raw).toContain('foo = "/bar"')
    expect(raw).toContain('timezone = "America/New_York"')
    expect(raw).toContain('open_at_login = true')
    expect(raw).toContain('auto_launch_prompted = false')
    expect(raw).toContain('last_view = "/live"')
  })
})
