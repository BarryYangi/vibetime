# Phase 06 Validation Plan

**Status:** In Progress
**Date:** 2026-05-07

## Automated

- `rtk pnpm run ci`
- `rtk pnpm --filter @vibetime/desktop build`
- `rtk pnpm --filter @vibetime/desktop dist:mac`
- packaged artifact shape check:
  - `.app` exists
  - `.dmg` exists
  - `Contents/Resources/bin/vibetime-hook` exists
  - bundled hook is executable
- signing:
  - `codesign --verify --deep --strict --verbose=2 <app>`
  - `codesign -dv <app>`
- packaged CLI smoke:
  - `<app>/Contents/MacOS/VibeTime version`

## Manual / UAT

- Automated evidence captured 2026-05-07:
  - `rtk pnpm --filter @vibetime/hook test` passed: 142 tests.
  - `rtk pnpm --filter @vibetime/desktop build` passed.
  - `rtk pnpm --filter @vibetime/desktop pack:mac` passed.
  - `.app` contains `Contents/Resources/bin/vibetime` and `Contents/Resources/bin/vibetime-hook`.
  - `codesign --verify --deep --strict --verbose=2` passed.
  - `codesign -dv` reports `Identifier=com.barryyangi.vibetime`, `Signature=adhoc`, and `TeamIdentifier=not set`.
  - Packaged CLI smoke passed: `VibeTime.app/Contents/MacOS/VibeTime version`.
- Resolved defect:
  - Electron main process must not import `@vibetime/hook/cli` in packaged mode because hook CLI imports `bun:sqlite`; Electron's Node ESM loader rejects `bun:`. The app now forwards CLI subcommands to the bundled Bun-compiled `vibetime` binary.
  - macOS persisted a hidden status-item state for the previous bundle id `ee.yct.vibetime`. Native AppKit status smoke showed the system menu bar was healthy; Electron tray smoke displayed again when launched with a fresh bundle id. VibeTime now uses `com.barryyangi.vibetime` consistently for dev patching, runtime identity, and packaged app id.

## Manual / UAT Remaining

- Launch packaged app from `.app`.
- Confirm tray appears and native tray menu opens.
- Confirm Today, Live, History, and Settings render.
- Confirm close hides app and tray remains alive.
- Confirm Cmd+Q quits.
- Toggle Open at Login from packaged app.
- Use temp HOME or backup/restore to test agent install/uninstall idempotency.
- Run at least one real Claude Code, Codex, and Cursor capture when available.
- Verify first-launch documentation is clear enough for a fresh install.

## Completion Rule

`06-VERIFICATION.md` may only be marked complete after automated checks pass and UAT has no unresolved blocker.
