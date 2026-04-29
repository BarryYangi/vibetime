import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appendLog } from './log.js'

let tempHome: string
let origHome: string | undefined

beforeEach(() => {
  origHome = process.env.HOME
  tempHome = mkdtempSync(join(tmpdir(), 'vibetime-log-test-'))
  process.env.HOME = tempHome
})

afterEach(() => {
  if (origHome !== undefined) {
    process.env.HOME = origHome
  }
  rmSync(tempHome, { recursive: true, force: true })
})

describe('appendLog — happy paths', () => {
  it('creates hook.log and appends a message', () => {
    appendLog('test message')
    const content = readFileSync(`${tempHome}/.vibetime/hook.log`, 'utf-8')
    expect(content).toContain('test message')
  })

  it('includes ISO timestamp in log line', () => {
    appendLog('timestamp check')
    const content = readFileSync(`${tempHome}/.vibetime/hook.log`, 'utf-8')
    // ISO 8601 pattern
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('appends multiple messages', () => {
    appendLog('first')
    appendLog('second')
    const content = readFileSync(`${tempHome}/.vibetime/hook.log`, 'utf-8')
    expect(content).toContain('first')
    expect(content).toContain('second')
    const lines = content.trim().split('\n')
    expect(lines.length).toBe(2)
  })
})

describe('appendLog — rotation', () => {
  it('rotates log file when size exceeds MAX_LOG_SIZE', () => {
    const logDir = `${tempHome}/.vibetime`
    mkdirSync(logDir, { recursive: true })
    const logPath = `${logDir}/hook.log`
    // Write a file larger than 10MB
    const bigData = 'x'.repeat(11 * 1024 * 1024)
    writeFileSync(logPath, bigData, 'utf-8')

    appendLog('after rotation')

    // Old file should be renamed to .1
    expect(existsSync(`${logPath}.1`)).toBe(true)
    // New file should contain only the new message
    const newContent = readFileSync(logPath, 'utf-8')
    expect(newContent).toContain('after rotation')
    expect(newContent.length).toBeLessThan(1000)
  })

  it('does not rotate when file is under limit', () => {
    appendLog('small log')
    appendLog('still small')
    const logPath = `${tempHome}/.vibetime/hook.log`
    expect(existsSync(`${logPath}.1`)).toBe(false)
  })
})

describe('appendLog — adversarial inputs', () => {
  it('never throws (hook must never surface errors)', () => {
    expect(() => appendLog('')).not.toThrow()
    expect(() => appendLog('normal message')).not.toThrow()
  })

  it('handles empty message', () => {
    appendLog('')
    const content = readFileSync(`${tempHome}/.vibetime/hook.log`, 'utf-8')
    expect(content.length).toBeGreaterThan(0) // at least the timestamp
  })
})
