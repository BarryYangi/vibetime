import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import {
  CONFIG_PATH,
  DB_PATH,
  LOG_PATH,
  MAX_LOG_SIZE,
  STALE_TURN_MAX_AGE,
  VERSION,
} from './constants.js'

describe('constants — exports', () => {
  it('VERSION is a string', () => {
    expect(typeof VERSION).toBe('string')
    expect(VERSION.length).toBeGreaterThan(0)
  })

  it('DB_PATH points to ~/.vibetime/data.db', () => {
    expect(DB_PATH).toContain(join('.vibetime', 'data.db'))
  })

  it('LOG_PATH points to ~/.vibetime/hook.log', () => {
    expect(LOG_PATH).toContain(join('.vibetime', 'hook.log'))
  })

  it('CONFIG_PATH points to ~/.vibetime/config.toml', () => {
    expect(CONFIG_PATH).toContain(join('.vibetime', 'config.toml'))
  })

  it('MAX_LOG_SIZE is 10MB', () => {
    expect(MAX_LOG_SIZE).toBe(10 * 1024 * 1024)
  })

  it('STALE_TURN_MAX_AGE is 6 hours in seconds', () => {
    expect(STALE_TURN_MAX_AGE).toBe(6 * 60 * 60)
  })
})
