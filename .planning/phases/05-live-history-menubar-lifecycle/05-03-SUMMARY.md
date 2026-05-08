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
  - Native status menu with Today, running turns, Top project, Open, Settings, and Quit
  - Unified left-click and right-click Tray behavior
  - Close-to-menubar lifecycle with explicit quit path
affects: [phase-05-menubar, phase-05-lifecycle]

tech-stack:
  added: []
  patterns: [native-tray-menu, retained-main-window, db-change-listener]

key-files:
  created:
    - packages/desktop/src/main/tray.ts
  modified:
    - packages/desktop/src/main/index.ts
    - packages/desktop/src/main/db.ts
    - packages/desktop/src/main/ipc-handlers.ts
    - packages/desktop/src/shared/ipc-types.ts
    - packages/desktop/src/renderer/src/App.tsx

key-decisions:
  - "Tray refresh is wired through a DB change listener instead of importing tray from db.ts, avoiding circular module ownership."
  - "The custom /menubar dropdown was removed after UX review; native Tray Menu is the V0 behavior."
  - "Left-click and right-click now use the same native status menu, avoiding focus theft and status-item highlight mismatch."
  - "Active title refresh is event-driven with minute-boundary timers rather than fixed polling."
  - "DB push now refreshes the Tray title and broadcasts renderer invalidation to the main window."

requirements-completed: [MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06, LIFE-01, LIFE-02]

duration: 25min
completed: 2026-05-07
---

# Phase 05 Plan 03: Menubar and Close Lifecycle Summary

**Native menubar behavior is implemented with a persistent Tray, unified native status menu, and explicit quit semantics.**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-05-07T13:20:00+08:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Refactored the main process around retained `mainWindow`, `isQuitting`, `createMainWindow`, `showMainWindow`, `hideMainWindow`, and `quitApp`.
- Added close-to-menubar behavior: normal close hides the app; Cmd+Q and Tray Quit fully quit.
- Added persistent Electron Tray with title formatting from `formatMenubarTitle(queryMenubarState())`.
- Added native status menu with Today total, active turns, Top project rows, and exact action labels `Open`, `Settings`, and `Quit`.
- Unified left-click and right-click behavior on the native status menu.
- Replaced fixed active polling with DB-change refresh plus minute-boundary active title updates.
- Added route-aware `showMainWindow` behavior so Tray menu actions can open Today, Live, History, or Settings.
- Broadcast DB push events to renderer windows and refresh Tray title on DB change.

## Files Created/Modified

- `packages/desktop/src/main/tray.ts` - Tray lifecycle, title refresh, native status menu, and route actions.
- `packages/desktop/src/main/index.ts` - Retained main window lifecycle and Tray bootstrapping.
- `packages/desktop/src/main/db.ts` - DB change listener and multi-window push broadcast.
- `packages/desktop/src/main/ipc-handlers.ts` - `showMainWindow` IPC handler.
- `packages/desktop/src/shared/ipc-types.ts` - `showMainWindow` IPC contract.
- `packages/desktop/src/renderer/src/App.tsx` - Main route persistence and route shell.

## Post-Implementation UX Refinement

Manual review rejected the custom `/menubar` BrowserWindow dropdown. The final V0 Tray design uses Electron's native `Menu` for both left and right click because it provides correct status-item activation, avoids auto-focus on renderer controls, and keeps the resident app lower risk.

Final menu structure:

- `Today · <duration>` with clock icon, clickable to Today.
- Disabled grey `N running` / `No turn running` section label with no icon.
- Active turn rows with activity icon, clickable to Live.
- Disabled grey `Top project` / `No project today` section label with no icon.
- Project rows with folder icon, clickable to History.
- `Open`, `Settings`, `Quit` actions with native macOS template icons.

The removed `/menubar` route and renderer file are intentional cleanup, not an accidental regression.

User visually reviewed and accepted this final native menu direction on 2026-05-07.

## Deviations from Plan

The shipped behavior deliberately diverges from the original compact dropdown task. Native menu behavior is the selected V0 tradeoff because Electron custom popovers cannot provide native status-item highlight/focus semantics without platform-specific hacks.

## Verification

- `rtk pnpm --filter @vibetime/desktop test` - passed, 7 tests.
- `rtk pnpm --filter @vibetime/desktop build` - passed.

## Manual Follow-up

- Manual macOS Tray inspection remains pending: launch app, verify Tray item appears, left/right click open the native status menu, route actions work, close hides, Cmd+Q quits.

## Next Phase Readiness

Plan 05-04 can implement last-view persistence, login item sync, and auto-launch prompting on top of the retained window and preferences IPC.

---
*Phase: 05-live-history-menubar-lifecycle*
*Completed: 2026-05-07*
