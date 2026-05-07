---
phase: 05-live-history-menubar-lifecycle
plan: 01
subsystem: data-ipc-config
tags: [electron, ipc, sqlite, history, menubar, config, vitest, bun-test]

requires:
  - phase: 04-desktop-shell-today-cli
    provides: Electron shell, typed IPC, Today live state, Settings config editor
provides:
  - Phase 5 IPC contracts for History, menubar state, and app preferences
  - History aggregation for 365-day calendar, Top 5 + Others trends, and Top Projects
  - Menubar state and title formatting
  - App preference config persistence for open-at-login, prompt state, and last view
affects: [phase-05-live, phase-05-history, phase-05-menubar, phase-05-settings]

tech-stack:
  added: []
  patterns: [typed-ipc-per-method, main-process-sqlite-aggregation, config-section-preservation]

key-files:
  created:
    - packages/core/src/time.ts
    - packages/core/src/time.test.ts
    - packages/desktop/src/main/db.test.ts
  modified:
    - packages/core/src/index.ts
    - packages/desktop/src/shared/ipc-types.ts
    - packages/desktop/src/main/db.ts
    - packages/desktop/src/main/ipc-handlers.ts
    - packages/desktop/src/renderer/src/store.ts
    - packages/desktop/src/renderer/src/store.test.ts
    - packages/hook/src/config.ts
    - packages/hook/src/config.test.ts

key-decisions:
  - "History aggregation is main-process owned and exposed through typed IPC, not renderer-side SQLite."
  - "Config now preserves an explicit [app] section for open_at_login, auto_launch_prompted, and last_view."
  - "Desktop DB aggregation tests exercise pure aggregation helpers to avoid native better-sqlite3 ABI coupling in Vitest."

patterns-established:
  - "Dense date-series aggregation: fill missing days before returning chart data."
  - "Top-N chart grouping: Top 5 projects plus Others for bounded chart series."
  - "Preference mapping: TOML snake_case in config, camelCase IPC shape in renderer."

requirements-completed: [HIST-01, HIST-02, HIST-03, HIST-04, HIST-05, MENU-02, MENU-04, MENU-05, SET-04]

duration: 35min
completed: 2026-05-07
---

# Phase 05 Plan 01: Data, IPC, and Config Summary

**History and menubar data contracts with dense calendar aggregation, Top 5 + Others trends, typed IPC, and app preference persistence**

## Performance

- **Duration:** 35 min
- **Started:** 2026-05-07T13:00:00+08:00
- **Completed:** 2026-05-07T13:35:00+08:00
- **Tasks:** 4
- **Files modified:** 11

## Accomplishments

- Added Phase 5 typed IPC for History summaries, menubar state, and app preferences.
- Implemented History aggregation for 365-day heatmaps, period trends, Top 5 + Others grouping, and Top Projects rows.
- Added menubar state and title formatting for `●`, `● 47m`, and `● 5h 23m`.
- Extended config persistence with `[app]` while preserving `[projects]` and `[display]`.
- Added automated coverage for config persistence, History aggregation, menubar title formatting, and renderer push refresh behavior.

## Task Commits

Each task is committed as part of this plan completion commit:

1. **Task 1: Extend config with app preferences** - included in plan commit
2. **Task 2: Add Phase 5 IPC types and renderer atoms** - included in plan commit
3. **Task 3: Implement History and menubar aggregate queries** - included in plan commit
4. **Task 4: Register IPC handlers** - included in plan commit

**Plan metadata:** included in prior planning commit `51a0213`

## Files Created/Modified

- `packages/core/src/time.ts` - Shared duration clipping and local-day allocation helpers.
- `packages/core/src/time.test.ts` - Unit tests for duration clipping and cross-midnight allocation.
- `packages/core/src/index.ts` - Exports shared time helpers.
- `packages/hook/src/config.ts` - Adds `[app]` config defaults, parsing, and serialization.
- `packages/hook/src/config.test.ts` - Tests app preference read/write preservation.
- `packages/desktop/src/shared/ipc-types.ts` - Adds History, menubar, and app preference IPC contracts.
- `packages/desktop/src/main/db.ts` - Adds History aggregates, menubar state, and menubar title formatting.
- `packages/desktop/src/main/db.test.ts` - Tests dense 365-day calendar, Others grouping, and title thresholds.
- `packages/desktop/src/main/ipc-handlers.ts` - Registers Phase 5 IPC handlers.
- `packages/desktop/src/renderer/src/store.ts` - Adds History, menubar, and app preference atoms/refresh helpers.
- `packages/desktop/src/renderer/src/store.test.ts` - Updates push tests for menubar refresh.

## Decisions Made

- Kept app preference TOML keys snake_case (`open_at_login`, `auto_launch_prompted`, `last_view`) while exposing camelCase renderer IPC (`openAtLogin`, `autoLaunchPrompted`, `lastView`).
- Extracted shared time allocation helpers into `@vibetime/core` so CLI, Today, and History can use consistent duration clipping semantics.
- Tested DB aggregation through pure event helpers in Vitest because local `better-sqlite3` native bindings can be built for Electron's Node ABI and fail under the system Node ABI.

## Deviations from Plan

### Auto-fixed Issues

**1. Native better-sqlite3 ABI mismatch in desktop unit tests**
- **Found during:** Task 3 verification
- **Issue:** Directly instantiating `better-sqlite3` in Vitest failed because the native module had been rebuilt for Electron's Node ABI.
- **Fix:** Split `buildHistorySummaryFromEvents()` as a pure helper and tested aggregation without constructing a native SQLite connection.
- **Files modified:** `packages/desktop/src/main/db.ts`, `packages/desktop/src/main/db.test.ts`
- **Verification:** `rtk pnpm --filter @vibetime/desktop test` passes.
- **Committed in:** plan commit

---

**Total deviations:** 1 auto-fixed (test architecture)
**Impact on plan:** Positive. Runtime SQLite path remains intact; tests are faster and less environment-fragile.

## Issues Encountered

- `better-sqlite3` native module ABI mismatch under Vitest after Electron rebuild. Resolved with pure aggregation tests.

## User Setup Required

None - no external service configuration required.

## Verification

- `rtk pnpm --filter @vibetime/hook test` — passed, 139 tests.
- `rtk pnpm --filter @vibetime/desktop test` — passed, 7 tests.
- `rtk pnpm --filter @vibetime/desktop build` — passed.

## Next Phase Readiness

Plan 05-02 can build Live and History routes against the new typed IPC/data contracts.
Plan 05-03 can use `queryMenubarState()` and `formatMenubarTitle()` for Tray behavior.
Plan 05-04 can build login item sync on top of app preferences.

---
*Phase: 05-live-history-menubar-lifecycle*
*Completed: 2026-05-07*
