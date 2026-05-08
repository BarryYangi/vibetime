# Phase 06 UAT

**Status:** Manual UAT Pending
**Date:** 2026-05-07

## Automated Evidence

| Check | Status | Evidence |
|-------|--------|----------|
| Root CI | PASS | `rtk pnpm run ci` |
| Desktop build | PASS | `rtk pnpm --filter @vibetime/desktop build` |
| macOS DMG build | PASS | `rtk pnpm --filter @vibetime/desktop dist:mac` |
| `.app` exists | PASS | `packages/desktop/release/mac-arm64/VibeTime.app` |
| `.dmg` exists | PASS | `packages/desktop/release/VibeTime-0.0.0-arm64.dmg` |
| Bundled hook binary | PASS | `Contents/Resources/bin/vibetime-hook` |
| Bundled CLI binary | PASS | `Contents/Resources/bin/vibetime` |
| Ad-hoc signing | PASS | `codesign -dv` reports `Signature=adhoc` and `TeamIdentifier=not set` |
| Packaged CLI | PASS | `VibeTime.app/Contents/MacOS/VibeTime version` prints version and DB path |
| App icon | PASS | `CFBundleIconFile => icon.icns`; `Contents/Resources/icon.icns` exists |

## Manual Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Launch packaged app from `.app` | PASS | User opened packaged app during Phase 6 UAT |
| Tray appears | PASS | User confirmed tray appears with bundle id `com.barryyangi.vibetime` |
| Native tray menu opens | PENDING | User reports packaged app is mostly fine; exact checklist pass not individually recorded |
| Today renders | PENDING | User reports packaged app is mostly fine; exact checklist pass not individually recorded |
| Live renders | PENDING | User reports packaged app is mostly fine; exact checklist pass not individually recorded |
| History renders | PENDING | User reports packaged app is mostly fine; exact checklist pass not individually recorded |
| Settings renders | PENDING | User reports packaged app is mostly fine; exact checklist pass not individually recorded |
| Close hides app and tray remains | PENDING | User reports packaged app is mostly fine; exact checklist pass not individually recorded |
| Cmd+Q quits | PENDING | User reports packaged app is mostly fine; exact checklist pass not individually recorded |
| Open at Login switch works from packaged app | DEFERRED | User chose to verify after final package/install flow |
| Agent install writes bundled hook path | PENDING | Use temp HOME or backup/restore real configs |
| Real Claude Code capture | PENDING | Requires live agent session |
| Real Codex capture | PENDING | Requires live agent session |
| Real Cursor capture | PENDING | Requires live agent session |

## Current Verdict

Automated packaging acceptance passes. Phase 6 is not complete until manual packaged-app UAT is recorded.
