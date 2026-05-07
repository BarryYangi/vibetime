---
phase: 05-live-history-menubar-lifecycle
plan: 03
subsystem: native-menubar-lifecycle
tags: [electron, tray, menubar, lifecycle, ipc]

requires:
  - phase: 05-live-history-menubar-lifecycle
    plan: 01
    provides: menubar state and title formatting
  - phase: 05-live-history-menubar-lifecycle
    plan: 02
    provides: renderer routes
provides:
  - Persistent Electron Tray with duration title
  - Right-click Open / Settings / Quit context menu
  - Left-click compact menubar dropdown
  - Close-to-menubar lifecycle with explicit quit path
affects: [phase-05-menubar, phase-05-lifecycle]

tech-stack:
  added: []
  patterns: [retained-browser-window, tray-owned-dropdown, db-change-listener]

key-files:
  created:
    - packages/desktop/src/main/tray.ts
    - packages/desktop/src/renderer/src/views/Menubar.tsx
  modified:
    - packages/desktop/src/main/index.ts
    - packages/desktop/src/main/db.ts
    - packages/desktop/src/main/ipc-handlers.ts
    - packages/desktop/src/shared/ipc-types.ts
    - packages/desktop/src/renderer/src/App.tsx

key-decisions:
  - "Tray refresh is wired through a DB change listener instead of importing tray from db.ts, avoiding circular module ownership."
  - "The menubar dropdown uses a separate compact /menubar route, not the full Today shell."
  - "DB push now broadcasts to all BrowserWindow instances so the main window and dropdown both refresh."

requirements-completed: [MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06, LIFE-01, LIFE-02]

duration: 25min
completed: 2026-05-07
---

# Phase 05 Plan 03: Menubar and Close Lifecycle Summary

**Native menubar behavior is implemented with a persistent Tray, compact dropdown, and explicit quit semantics.**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-05-07T13:20:00+08:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Refactored the main process around retained `mainWindow`, `isQuitting`, `createMainWindow`, `showMainWindow`, `hideMainWindow`, and `quitApp`.
- Added close-to-menubar behavior: normal close hides the app; Cmd+Q and Tray Quit fully quit.
- Added persistent Electron Tray with title formatting from `formatMenubarTitle(queryMenubarState())`.
- Added right-click context menu with exact labels `Open`, `Settings`, and `Quit`.
- Added left-click compact dropdown as a frameless `BrowserWindow` loading `/menubar`.
- Added compact renderer view showing Today total, Top 3 projects, active turns, and `Open vibetime`.
- Added `showMainWindow` IPC for the dropdown button.
- Broadcast DB push events to every window and refresh Tray title on DB change.

## Files Created/Modified

- `packages/desktop/src/main/tray.ts` - Tray lifecycle, title refresh, right-click menu, and dropdown window.
- `packages/desktop/src/renderer/src/views/Menubar.tsx` - Compact dropdown renderer.
- `packages/desktop/src/main/index.ts` - Retained main window lifecycle and Tray bootstrapping.
- `packages/desktop/src/main/db.ts` - DB change listener and multi-window push broadcast.
- `packages/desktop/src/main/ipc-handlers.ts` - `showMainWindow` IPC handler.
- `packages/desktop/src/shared/ipc-types.ts` - `showMainWindow` IPC contract.
- `packages/desktop/src/renderer/src/App.tsx` - Compact `/menubar` route outside the normal sidebar shell.

## Deviations from Plan

None.

## Verification

- `rtk pnpm --filter @vibetime/desktop test` - passed, 7 tests.
- `rtk pnpm --filter @vibetime/desktop build` - passed.

## Manual Follow-up

- Manual macOS Tray inspection remains pending: launch app, verify Tray item appears, left-click opens dropdown, right-click shows Open / Settings / Quit, close hides, Cmd+Q quits.

## Next Phase Readiness

Plan 05-04 can implement last-view persistence, login item sync, and auto-launch prompting on top of the retained window and preferences IPC.

---
*Phase: 05-live-history-menubar-lifecycle*
*Completed: 2026-05-07*
