---
phase: 04-desktop-shell-today-cli
plan: 01
subsystem: desktop
tags: [electron, electron-vite, ipc, preload, better-sqlite3, react]

# Dependency graph
requires:
  - phase: 03-hook-binary-store-install
    provides: hook CLI (runCli), SQLite store, install logic, DDL constants
  - phase: 01-foundations
    provides: core package with DDL_EVENTS, DDL_OPEN_TURNS, DDL_INDICES
provides:
  - Electron three-layer scaffold (main/preload/renderer)
  - Shared IPC type contracts (IpcMethods, IpcResult, etc.)
  - Preload bridge with typed API (invoke + onPush)
  - Main process with CLI detection and BrowserWindow security
  - better-sqlite3 wrapper with WAL PRAGMAs and notifyRenderer()
  - Stub IPC handlers for 6 channels
  - Hook package ./cli subpath export
affects: [04-02, 04-03, 04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: [electron, electron-vite, better-sqlite3, react, react-dom, react-router-dom, jotai, echarts, tailwindcss, @vitejs/plugin-react]
  patterns: [typed-ipc-with-result-wrapper, preload-bridge-sandbox, application-level-event-emission, cli-mode-detection]

key-files:
  created:
    - packages/desktop/electron.vite.config.ts
    - packages/desktop/tsconfig.node.json
    - packages/desktop/tsconfig.web.json
    - packages/desktop/src/shared/ipc-types.ts
    - packages/desktop/src/preload/index.ts
    - packages/desktop/src/main/index.ts
    - packages/desktop/src/main/db.ts
    - packages/desktop/src/main/ipc-handlers.ts
    - packages/desktop/src/main/hook-cli.d.ts
    - packages/desktop/src/renderer/index.html
  modified:
    - packages/desktop/package.json
    - packages/desktop/tsconfig.json
    - packages/hook/package.json

key-decisions:
  - "Node.js upgraded from 22.7.0 to 22.12.0 for electron-vite 5.0.0 compatibility"
  - "Type declaration file (hook-cli.d.ts) added for @vibetime/hook/cli module since hook package uses Bun-specific modules"
  - "Application-level event emission (writeAndNotify) instead of updateHook (not available in better-sqlite3)"

patterns-established:
  - "Typed IPC with Result wrapper: all IPC methods return { ok: true, data } | { ok: false, error }"
  - "Preload bridge sandbox: contextIsolation + sandbox + nodeIntegration:false, only invoke + onPush exposed"
  - "CLI mode detection: process.argv.length > 2 routes to hook/runCli, otherwise launches Electron GUI"
  - "Application-level event emission: main process wraps DB writes with writeAndNotify() to push changes to renderer"

requirements-completed: [IPC-01, CLI-07]

# Metrics
duration: 12min
completed: 2026-04-29
---

# Phase 4 Plan 01: Electron Scaffold Summary

**Electron three-layer scaffold with typed IPC, preload bridge, CLI detection, and better-sqlite3 wrapper**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-29T15:45:00+08:00
- **Completed:** 2026-04-29T15:57:00+08:00
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Electron-vite three-layer build configuration (main/preload/renderer)
- Shared IPC type contracts with 6 typed methods and Result wrapper
- Preload bridge exposing typed API via contextBridge (invoke + onPush)
- Main process with CLI detection and strict BrowserWindow security settings
- better-sqlite3 wrapper with WAL PRAGMAs and notifyRenderer() for event-driven updates
- Stub IPC handlers for all 6 channels (getTodaySummary, getOpenTurns, getAgentStatus, getConfig, updateConfig, installAgent)
- Hook package exports ./cli subpath for desktop import

## Task Commits

Each task was committed atomically:

1. **Task 1: electron-vite config + shared IPC types + renderer HTML** - `8cc33c1` (feat)
2. **Task 2: Preload bridge + main process entry + CLI detection + hook exports** - `b8e131a` (feat)

## Files Created/Modified
- `packages/desktop/electron.vite.config.ts` - electron-vite three-layer build config
- `packages/desktop/tsconfig.node.json` - TypeScript config for main/preload (ESNext, bundler resolution)
- `packages/desktop/tsconfig.web.json` - TypeScript config for renderer (ESNext, react-jsx)
- `packages/desktop/src/shared/ipc-types.ts` - Shared IPC method types + Result wrapper
- `packages/desktop/src/preload/index.ts` - contextBridge API (invoke + onPush)
- `packages/desktop/src/main/index.ts` - Electron main entry with CLI detection
- `packages/desktop/src/main/db.ts` - better-sqlite3 wrapper with WAL PRAGMAs and notifyRenderer()
- `packages/desktop/src/main/ipc-handlers.ts` - Stub IPC handlers for 6 channels
- `packages/desktop/src/main/hook-cli.d.ts` - Type declaration for @vibetime/hook/cli
- `packages/desktop/src/renderer/index.html` - Renderer HTML with React entry point
- `packages/desktop/package.json` - Updated with Electron, React, better-sqlite3, etc.
- `packages/desktop/tsconfig.json` - Updated to reference tsconfig.node.json and tsconfig.web.json
- `packages/hook/package.json` - Added exports field with ./cli subpath

## Decisions Made
- Node.js upgraded from 22.7.0 to 22.12.0 (electron-vite 5.0.0 requires >= 22.12)
- Type declaration file added for @vibetime/hook/cli (hook uses Bun-specific modules, can't generate types via tsc)
- Application-level event emission (writeAndNotify) instead of updateHook (better-sqlite3 doesn't expose updateHook)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added type declaration for @vibetime/hook/cli module**
- **Found during:** Task 2 (Preload bridge + main process entry)
- **Issue:** TypeScript couldn't resolve `@vibetime/hook/cli` because hook package uses Bun-specific modules (bun:sqlite, bun:test) and can't generate proper type declarations via tsc
- **Fix:** Created `packages/desktop/src/main/hook-cli.d.ts` with type declaration for the `runCli` function
- **Files modified:** packages/desktop/src/main/hook-cli.d.ts
- **Verification:** TypeScript compilation passes for tsconfig.node.json
- **Committed in:** b8e131a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Node.js 22.7.0 incompatible with electron-vite 5.0.0 (requires >= 22.12) - upgraded to 22.12.0
- pnpm not available on new Node.js version - installed via npm
- Electron binary download failed on first attempt - used ELECTRON_MIRROR environment variable

## User Setup Required
None - no external service configuration required.

## Known Stubs
- `packages/desktop/src/main/ipc-handlers.ts` - All 6 IPC handlers return `{ ok: false, error: 'Not implemented yet' }` (Plan 03 fills in real logic)

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-04-01 mitigated | packages/desktop/src/main/index.ts | BrowserWindow uses contextIsolation: true + sandbox: true + nodeIntegration: false |
| T-04-02 mitigated | packages/desktop/src/preload/index.ts | Preload only exposes named channels via contextBridge |
| T-04-03 mitigated | packages/desktop/src/preload/index.ts | No raw ipcRenderer exported to renderer |

## Next Phase Readiness
- Electron scaffold complete, ready for Plan 02 (renderer entry + Tailwind + Tokyo Night tokens)
- IPC handlers are stubs - Plan 03 implements real data queries
- CLI detection works - desktop main process delegates to hook/runCli for CLI subcommands

---
*Phase: 04-desktop-shell-today-cli*
*Completed: 2026-04-29*

## Self-Check: PASSED

All files verified to exist:
- packages/desktop/electron.vite.config.ts
- packages/desktop/src/shared/ipc-types.ts
- packages/desktop/src/preload/index.ts
- packages/desktop/src/main/index.ts
- packages/desktop/src/main/db.ts
- packages/desktop/src/main/ipc-handlers.ts
- packages/desktop/src/renderer/index.html

All commits verified:
- 8cc33c1: feat(04-01): electron-vite scaffold + shared IPC types + renderer HTML
- b8e131a: feat(04-01): preload bridge + main process entry + CLI detection
