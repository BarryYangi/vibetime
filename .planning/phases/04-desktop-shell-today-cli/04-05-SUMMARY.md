---
phase: 04-desktop-shell-today-cli
plan: 05
subsystem: ui
tags: [react, jotai, tailwind, ipc, css-bars]

requires:
  - phase: 04-desktop-shell-today-cli
    provides: "IPC types (TodaySummary), useIpcQuery hook, Jotai store with todaySummaryAtom"
provides:
  - "Complete Today view with date header, grand total, per-project CSS bar breakdown, agent breakdown, footer stats"
  - "Auto-refresh via db-changed push events (zero polling)"
affects: [04-desktop-shell-today-cli]

tech-stack:
  added: []
  patterns: [CSS bar visualization, useIpcQuery consumption pattern, compact duration formatting]

key-files:
  created: []
  modified:
    - packages/desktop/src/renderer/src/views/Today.tsx

key-decisions:
  - "CSS bars over ECharts for Today view (lighter, sufficient for horizontal bars; ECharts reserved for Phase 5 History)"
  - "Current styling uses coss default neutral semantics rather than a custom app-specific token family"

patterns-established:
  - "formatDuration helper: seconds -> s/m/h display with font-mono"
  - "ProjectBar component: proportional CSS bar + agent breakdown rows"
  - "useIpcQuery consumption: import hook + atom, render loading/empty/data states"

requirements-completed: [TODAY-01, TODAY-02, TODAY-03, TODAY-04]

duration: 3min
completed: 2026-04-29
---

# Phase 4 Plan 05: Today View Summary

**Today view with CSS bar visualization, per-project agent breakdown, and event-driven auto-refresh via Jotai atoms**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-29T08:15:00Z
- **Completed:** 2026-04-29T08:18:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Complete Today view replacing placeholder with full data display
- CSS bar visualization (lighter than ECharts, sufficient for horizontal bars)
- Per-project agent breakdown with duration formatting
- Footer showing turn count and active project count
- Auto-refresh via useIpcQuery push subscription (zero polling)

## Task Commits

1. **Task 1: Implement complete Today view** - `0e1cbe1` (feat)

## Files Created/Modified
- `packages/desktop/src/renderer/src/views/Today.tsx` - Full Today view: date header, grand total, per-project CSS bars, agent breakdown, footer stats, loading/empty states

## Decisions Made
- CSS bars over ECharts: Today view only needs simple horizontal bars. ECharts remains reserved for Phase 5 History view's complex charts (heatmap, trends).
- formatDuration helper: Shows seconds (<1m), minutes (<1h), or hours+minutes for readability.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Today view complete and ready for visual verification
- Auto-refresh mechanism proven (useIpcQuery + todaySummaryAtom + db-changed push)
- Phase 5 can extend with Live and History views using same patterns

## Self-Check: PASSED

- [x] Today.tsx exists at expected path
- [x] Commit 0e1cbe1 verified in git log
- [x] TypeScript compilation passes

## Post-Plan Maintenance (2026-05-07)

The original Plan 05 shipped the first complete Today view. Subsequent real-world usage drove several important refinements that now define the current behavior:

- Visual baseline moved off the old Tokyo Night custom token family and onto the quieter coss default neutral semantics used elsewhere in the desktop UI.
- The total headline now uses animated number transitions, while open turns continue to tick locally every second from `open_turns.started_at`.
- Duration formatting is compact (`8m28s`, `1h19m23s`) instead of spaced tokens.
- Today refresh is still zero-polling, but the primary invalidation path is now hook-side Unix socket notification into Electron main, with filesystem watching only as fallback.
- Codex-specific reconciliation was added underneath Today reads so turns with transcript `task_complete` but missing `Stop` do not keep the screen "live" forever.

These changes did not replace the original Phase 4 goal; they hardened it under real usage.

---
*Phase: 04-desktop-shell-today-cli*
*Completed: 2026-04-29*
