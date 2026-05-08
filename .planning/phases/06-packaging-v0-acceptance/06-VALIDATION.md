# Phase 06 Validation Plan

**Status:** Complete
**Date:** 2026-05-08

## Automated

- `rtk pnpm run ci`
- `rtk pnpm --filter @vibetime/desktop build`
- `rtk pnpm --filter @vibetime/desktop dist:mac`
- `rtk pnpm --filter @vibetime/desktop pack:win`
- GitHub Actions tag workflow `25540814544`
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

- Automated evidence captured 2026-05-07 and refreshed 2026-05-08:
  - `rtk pnpm --filter @vibetime/hook test` passed: 142 tests.
  - `rtk pnpm run ci` passed.
  - `rtk pnpm --filter @vibetime/desktop build` passed.
  - `rtk pnpm --filter @vibetime/desktop pack:mac` passed.
  - `rtk pnpm --filter @vibetime/desktop pack:win` passed.
  - `.app` contains `Contents/Resources/bin/vibetime` and `Contents/Resources/bin/vibetime-hook`.
  - `codesign --verify --deep --strict --verbose=2` passed.
  - `codesign -dv` reports `Identifier=com.barryyangi.vibetime`, `Signature=adhoc`, and `TeamIdentifier=not set`.
  - Packaged CLI smoke passed: `VibeTime.app/Contents/MacOS/VibeTime version`.
  - GitHub Actions tag run `25540814544` passed Quality, macOS arm64 packaging, Windows x64 packaging, and GitHub Release creation.
  - Release `v2026.5.8` uploaded macOS `.dmg`, Windows setup `.exe`, Windows portable `.exe`, and blockmaps.
  - Packaged install smoke in a temp HOME verified all three agents write `/Contents/Resources/bin/vibetime-hook`.
  - Packaged hook capture smoke in a temp HOME verified Claude Code, Codex, and Cursor payloads each persist one `turn_start` and one `turn_end`.
- Resolved defect:
  - Electron main process must not import `@vibetime/hook/cli` in packaged mode because hook CLI imports `bun:sqlite`; Electron's Node ESM loader rejects `bun:`. The app now forwards CLI subcommands to the bundled Bun-compiled `vibetime` binary.
  - macOS persisted a hidden status-item state for the previous bundle id `ee.yct.vibetime`. Native AppKit status smoke showed the system menu bar was healthy; Electron tray smoke displayed again when launched with a fresh bundle id. VibeTime now uses `com.barryyangi.vibetime` consistently for dev patching, runtime identity, and packaged app id.
  - macOS modern app icons need an Xcode `actool` generated `AppIcon.icon`/`Assets.car`; plain `.icns` left a visible system pedestal. The release now uses the modern icon pipeline.
  - Windows runner cannot execute Unix-style `../../node_modules/.bin/tsc`; core package scripts now use workspace PATH commands (`tsc`, `vitest`).

## Manual / UAT Result

- User opened the packaged app and confirmed the tray appears.
- User accepted the native tray menu behavior after Phase 5 iterations.
- User confirmed Open at Login can add VibeTime to login items from the packaged flow.
- Today, Live, History, Settings, close-to-tray, and Cmd+Q behavior were covered by Phase 5 UAT and had no packaged regression reported.
- First-launch documentation is in README.

## Completion Rule

Satisfied. `06-UAT.md` has no unresolved blocker and `06-VERIFICATION.md` is PASS.
