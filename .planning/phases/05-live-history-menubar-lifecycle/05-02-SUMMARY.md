---
phase: 05-live-history-menubar-lifecycle
plan: 02
subsystem: renderer-live-history
tags: [electron, react, motion, echarts, coss, navigation]

requires:
  - phase: 05-live-history-menubar-lifecycle
    plan: 01
    provides: Phase 5 data contracts and typed IPC
provides:
  - Live route for active coding-agent turns
  - History route for retrospective analytics
  - Sidebar navigation for Today, Live, History, and Settings
affects: [phase-05-live, phase-05-history]

tech-stack:
  added:
    - motion
  patterns: [motion-react-stage, echarts-calendar-heatmap, coss-table-sorting]

key-files:
  created:
    - packages/desktop/src/renderer/src/views/Live.tsx
    - packages/desktop/src/renderer/src/views/History.tsx
  modified:
    - packages/desktop/package.json
    - pnpm-lock.yaml
    - packages/desktop/src/renderer/src/App.tsx
    - packages/desktop/src/renderer/src/components/Sidebar.tsx

key-decisions:
  - "Live is a current-turn stage, separate from Today's ledger/workbench view."
  - "Renderer imports Motion through motion/react, not direct framer-motion imports."
  - "History uses main-process summaries and bounded Top 5 + Others trend series."

requirements-completed: [LIVE-01, LIVE-02, LIVE-03, LIVE-04, HIST-01, HIST-02, HIST-03, HIST-04, HIST-05]

duration: 20min
completed: 2026-05-07
---

# Phase 05 Plan 02: Live and History Renderer Summary

**Live stage and History analytics routes are now wired into the desktop renderer.**

## Performance

- **Duration:** 20 min
- **Completed:** 2026-05-07T13:15:00+08:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added `motion` and wired `/live` plus `/history` into the renderer router.
- Expanded sidebar navigation to Today, Live, History, and Settings.
- Implemented Live as an active-turn stage with per-second timers, Motion pulse/sweep animation, concurrent turn stacking, and a distinct idle state.
- Implemented History with period selector (`7d`, `30d`, `90d`, `365d`), ECharts calendar heatmap, stacked area trends, and sortable coss Table.

## Files Created/Modified

- `packages/desktop/src/renderer/src/views/Live.tsx` - Active turn stage with Motion animation and live timers.
- `packages/desktop/src/renderer/src/views/History.tsx` - History analytics dashboard with heatmap, trend chart, and sortable table.
- `packages/desktop/src/renderer/src/App.tsx` - Adds Live and History routes.
- `packages/desktop/src/renderer/src/components/Sidebar.tsx` - Adds Live and History nav items.
- `packages/desktop/package.json` - Adds direct `motion` dependency.
- `pnpm-lock.yaml` - Locks Motion dependency graph.

## Deviations from Plan

None.

## Verification

- `rtk pnpm --filter @vibetime/desktop test` - passed, 7 tests.
- `rtk pnpm --filter @vibetime/desktop build` - passed.

## Notes

- The lockfile includes `framer-motion` as a transitive dependency of `motion@12.38.0`; application code imports only from `motion/react`.
- Visual inspection remains best done in the Electron shell after Plan 05-03/05-04 because menu/lifecycle work will affect the same desktop surface.

## Next Phase Readiness

Plan 05-03 can now wire the menu bar against `queryMenubarState()` while keeping Live/History routes addressable from the app window.

---
*Phase: 05-live-history-menubar-lifecycle*
*Completed: 2026-05-07*
