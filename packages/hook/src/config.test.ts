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
    expect(config.app.usage_refresh_frequency).toBe('30m')
    expect(readFileSync(`${tempHome}/.vibetime/config.toml`, 'utf-8')).toContain(
      'usage_refresh_frequency = "30m"',
    )
  })

  it('returns default timezone from Intl', () => {
    const config = readConfig()
    const expected = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(config.display.timezone).toBe(expected)
  })

  it('reads back written config', () => {
    const cfg: VibetimeConfig = {
      projects: { '/path/to/myproject': 'My Project' },
      display: { timezone: 'Asia/Tokyo' },
      app: {
        language: 'zh',
        open_at_login: true,
        theme: 'dark',
        last_view: '/history',
        usage_refresh_frequency: '1h',
      },
    }
    writeConfig(cfg)
    const result = readConfig()
    expect(result.projects['/path/to/myproject']).toBe('My Project')
    expect(result.display.timezone).toBe('Asia/Tokyo')
    expect(result.app.open_at_login).toBe(true)
    expect(result.app.theme).toBe('dark')
    expect(result.app.language).toBe('zh')
    expect(result.app.last_view).toBe('/history')
    expect(result.app.usage_refresh_frequency).toBe('1h')
  })

  it('round-trips quoted project paths and display names', () => {
    const cfg: VibetimeConfig = {
      projects: { '/Users/barry/My "App"': 'Barry\\App' },
      display: { timezone: 'UTC' },
      app: {
        language: 'en',
        open_at_login: false,
        theme: 'system',
        last_view: '/',
        usage_refresh_frequency: '30m',
      },
    }
    writeConfig(cfg)
    expect(readConfig().projects['/Users/barry/My "App"']).toBe('Barry\\App')
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
      app: {
        language: 'en',
        open_at_login: false,
        theme: 'system',
        last_view: '/',
        usage_refresh_frequency: '30m',
      },
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

  it('falls back to 30m for unsupported usage refresh frequency values', () => {
    readConfig()
    writeFileSync(
      `${tempHome}/.vibetime/config.toml`,
      [
        '[projects]',
        '',
        '[display]',
        'timezone = "UTC"',
        '',
        '[app]',
        'language = "en"',
        'open_at_login = false',
        'theme = "system"',
        'last_view = "/"',
        'usage_refresh_frequency = "5m"',
      ].join('\n'),
      'utf-8',
    )

    expect(readConfig().app.usage_refresh_frequency).toBe('30m')
  })
})

describe('readConfig — usage refresh frequency', () => {
  for (const frequency of ['15m', '1h', '4h'] as const) {
    it(`preserves custom ${frequency} usage refresh frequency`, () => {
      readConfig()
      writeFileSync(
        `${tempHome}/.vibetime/config.toml`,
        [
          '[projects]',
          '',
          '[display]',
          'timezone = "UTC"',
          '',
          '[app]',
          'language = "en"',
          'open_at_login = false',
          'theme = "system"',
          'last_view = "/"',
          `usage_refresh_frequency = "${frequency}"`,
        ].join('\n'),
        'utf-8',
      )

      expect(readConfig().app.usage_refresh_frequency).toBe(frequency)
    })
  }
})

describe('writeConfig — happy paths', () => {
  it('creates config.toml file', () => {
    writeConfig({
      projects: {},
      display: { timezone: 'UTC' },
      app: {
        language: 'en',
        open_at_login: false,
        theme: 'system',
        last_view: '/',
        usage_refresh_frequency: '30m',
      },
    })
    expect(existsSync(`${tempHome}/.vibetime/config.toml`)).toBe(true)
  })

  it('writes valid TOML structure', () => {
    const cfg: VibetimeConfig = {
      projects: { '/bar/foo': 'Foo' },
      display: { timezone: 'America/New_York' },
      app: {
        language: 'zh',
        open_at_login: true,
        theme: 'dark',
        last_view: '/live',
        usage_refresh_frequency: '4h',
      },
    }
    writeConfig(cfg)
    const raw = readFileSync(`${tempHome}/.vibetime/config.toml`, 'utf-8')
    expect(raw).toContain('[projects]')
    expect(raw).toContain('[display]')
    expect(raw).toContain('[app]')
    expect(raw).toContain('"/bar/foo" = "Foo"')
    expect(raw).toContain('timezone = "America/New_York"')
    expect(raw).toContain('language = "zh"')
    expect(raw).toContain('open_at_login = true')
    expect(raw).toContain('theme = "dark"')
    expect(raw).toContain('last_view = "/live"')
    expect(raw).toContain('usage_refresh_frequency = "4h"')
  })
})
