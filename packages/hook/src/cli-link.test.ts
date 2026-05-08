import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import {
  ensureManagedCliShim,
  getCliInstallStatus,
  getManagedCliPath,
  getUserCliLinkPath,
  installUserCli,
  uninstallUserCli,
} from './cli-link.js'

let originalHome: string
let testHome: string

beforeEach(() => {
  originalHome = process.env.HOME ?? ''
  testHome = `${originalHome}/.vibetime-test-cli-link-${Date.now()}`
  process.env.HOME = testHome
})

afterEach(() => {
  process.env.HOME = originalHome
  if (existsSync(testHome)) rmSync(testHome, { recursive: true, force: true })
})

describe('managed CLI shim', () => {
  it('creates a stable shim under ~/.vibetime/bin', () => {
    const shimPath = ensureManagedCliShim()

    expect(shimPath).toBe(`${testHome}/.vibetime/bin/vibetime`)
    expect(existsSync(shimPath)).toBe(true)
    const content = readFileSync(shimPath, 'utf-8')
    expect(content).toContain('vibetime-managed-shim')
    expect(content).toContain('kMDItemCFBundleIdentifier == "com.barryyangi.vibetime"')
    expect(content).toContain('.vibetime/cache/app-path')
    expect(content).not.toContain('.vibetime/bin/.app-cache')
    expect(content).not.toContain(testHome)
  })
})

describe('user CLI link', () => {
  it('installs and uninstalls the user PATH link without removing the stable shim', () => {
    const installed = installUserCli()
    const linkPath = getUserCliLinkPath()

    expect(installed.installed).toBe(true)
    expect(installed.targetPath).toBe(getManagedCliPath())
    expect(existsSync(linkPath)).toBe(true)
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)

    const uninstalled = uninstallUserCli()

    expect(uninstalled.installed).toBe(false)
    expect(existsSync(linkPath)).toBe(false)
    expect(existsSync(getManagedCliPath())).toBe(true)
  })

  it('does not overwrite an unmanaged command', () => {
    const linkPath = getUserCliLinkPath()
    mkdirSync(`${testHome}/.local/bin`, { recursive: true })
    writeFileSync(linkPath, '#!/bin/sh\n')

    const status = getCliInstallStatus()

    expect(status.installed).toBe(false)
    expect(status.conflict).toBe(true)
    expect(() => installUserCli()).toThrow('not managed by VibeTime')
  })
})
