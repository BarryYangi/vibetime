---
phase: 03-hook-binary-store-install
plan: 03
subsystem: hook
tags: [bun, sqlite, crash-recovery, hook-stdin, agent-detection]

# Dependency graph
requires:
  - phase: 03-hook-binary-store-install/01
    provides: "Hook scaffold (constants, config, log, fs, store)"
  - phase: 03-hook-binary-store-install/02
    provides: "SQLite store layer (openDatabase, persistEvent, queryOpenTurns)"
  - phase: 02-agent-adapters
    provides: "Core adapters (adaptClaudeCode, adaptCodex, adaptCursor) and resolveProject"
provides:
  - "recovery.ts: recoverOrphans + sweepStale for crash recovery"
  - "hook.ts: runHook main entry (stdin → adapter → SQLite pipeline)"
  - "detectAgent: --source arg + event name matching"
  - "getGitRemoteUrl: Bun.spawnSync with array args"
affects: [03-04, 04-desktop, 05-packaging]

# Tech tracking
tech-stack:
  added: []
  patterns: ["synthetic turn_end with meta.abandoned/reason", "detectAgent first-match chain", "process.exit(0) finally block"]

key-files:
  created:
    - packages/hook/src/recovery.ts
    - packages/hook/src/recovery.test.ts
    - packages/hook/src/hook.ts
    - packages/hook/src/hook.test.ts
  modified: []

key-decisions:
  - "Recovery synthetic events reset duration_sec=NULL after persistEvent to preserve unknown-duration semantics"
  - "detectAgent exported for unit testing (internal function made public)"

patterns-established:
  - "Recovery pattern: synthetic turn_end + explicit deleteOpenTurn + duration_sec NULL reset"
  - "Hook pattern: try/catch/finally with process.exit(0) in finally"

requirements-completed: [REC-01, REC-02, HOOK-01, HOOK-02, HOOK-04]

# Metrics
duration: ~8min
completed: 2026-04-29
---

# Phase 3 Plan 03: Hook Main Logic & Recovery Summary

**Hook stdin-to-SQLite pipeline with agent detection and crash recovery (orphan + stale sweep)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-29T00:00:00Z
- **Completed:** 2026-04-29T00:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Crash recovery module: recoverOrphans (REC-01) and sweepStale (REC-02) with synthetic turn_end events
- Hook main logic: stdin → detectAgent → adapter → resolveProject → SQLite pipeline
- Agent detection via --source argument (priority) and event name matching (fallback)
- 41 tests passing (13 recovery + 28 hook)

## Task Commits

Each task was committed atomically:

1. **Task 1: 实现崩溃恢复模块** - `0c4fc9b` (feat)
2. **Task 2: 实现 Hook 模式主逻辑** - `258d223` (feat)

## Files Created/Modified

- `packages/hook/src/recovery.ts` - recoverOrphans + sweepStale: synthetic turn_end with meta.abandoned/reason, duration_sec=NULL
- `packages/hook/src/recovery.test.ts` - 13 tests covering REC-01 and REC-02
- `packages/hook/src/hook.ts` - runHook entry point: stdin → adapter → resolveProject → SQLite, always exit 0
- `packages/hook/src/hook.test.ts` - 28 tests covering detectAgent unit behavior

## Decisions Made

- Recovery synthetic events reset duration_sec=NULL after persistEvent (persistEvent auto-computes duration from open_turns, but for abandoned/stale turns the duration is truly unknown)
- detectAgent exported for direct unit testing (plan kept it internal, but testing through runHook would require complex stdin mocking)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reset duration_sec after persistEvent for synthetic events**
- **Found during:** Task 1 (recovery.ts tests)
- **Issue:** persistEvent in store.ts auto-computes duration_sec for turn_end events from open_turns. Synthetic recovery events should have duration_sec=NULL since the real end time is unknown.
- **Fix:** Added `UPDATE events SET duration_sec = NULL` after persistEvent in both recoverOrphans and sweepStale
- **Files modified:** packages/hook/src/recovery.ts
- **Verification:** 13 recovery tests pass including duration_sec=null assertions
- **Committed in:** 0c4fc9b

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — synthetic events must have NULL duration. No scope creep.

## Issues Encountered

- Worktree needed `pnpm install` + `npx tsc -p packages/core/tsconfig.json` before bun test could resolve @vibetime/core

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Hook main logic complete, ready for 03-04 (CLI & install commands)
- recovery.ts and hook.ts provide the foundation for CLI subcommands (today, project, export)

---
*Phase: 03-hook-binary-store-install*
*Completed: 2026-04-29*
