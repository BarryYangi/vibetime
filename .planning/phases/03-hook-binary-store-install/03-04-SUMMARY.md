---
phase: 03-hook-binary-store-install
plan: 04
subsystem: cli
tags: [cli, install, hooks, settings-json, config-toml, idempotent]

# Dependency graph
requires:
  - phase: 03-hook-binary-store-install
    provides: "SQLite store (store.ts), filesystem init (fs.ts), log rotation (log.ts), constants"
provides:
  - "install.ts: idempotent hook installation for Claude Code, Codex, Cursor"
  - "cli.ts: CLI mode with subcommand parsing (install, today, project, export, version, help)"
  - "recovery.ts: sweepStale for CLI stale sweep (stub for plan 03-03)"
affects: [04-desktop, 05-packaging]

# Tech tracking
tech-stack:
  added: []
  patterns: ["idempotent file merge with backup", "hand-rolled argv parsing", "agent config three-layer structure"]

key-files:
  created:
    - packages/hook/src/install.ts
    - packages/hook/src/install.test.ts
    - packages/hook/src/cli.ts
    - packages/hook/src/cli.test.ts
    - packages/hook/src/recovery.ts
  modified: []

key-decisions:
  - "recovery.ts created as Rule 3 dependency (blocking) for cli.ts sweepStale import; plan 03-03 may overwrite with full implementation"
  - "today/project/export CLI commands are Phase 4 placeholders with minimal output"

patterns-established:
  - "Idempotent install: match by command string, skip if vibetime-hook exists, backup before write"
  - "CLI dispatch: hand-written switch on argv[0], no library dependency"

requirements-completed: [CLI-01, CLI-02]

# Metrics
duration: 7min
completed: 2026-04-29
---

# Phase 3 Plan 04: CLI & Install Summary

**Idempotent install commands for Claude Code / Codex / Cursor with hand-rolled CLI dispatch and 34 new tests**

## Performance

- **Duration:** ~7 min
- **Tasks:** 2
- **Files created:** 5
- **New tests:** 34 (20 install + 14 CLI)

## Accomplishments

- `installClaudeCode()`: configures `~/.claude/settings.json` with 4 events (UserPromptSubmit, Stop, SessionStart, SessionEnd) using `matcher: "*"` pattern
- `installCodex()`: configures `~/.codex/hooks.json` (3 events, no SessionEnd) + `~/.codex/config.toml` with `[features] codex_hooks = true`
- `installCursor()`: configures `~/.cursor/hooks.json` with 4 events (beforeSubmitPrompt, stop, sessionStart, sessionEnd)
- `installAgent()`: dispatcher supporting `claude-code | codex | cursor` with error on unknown agent
- `runCli()`: CLI mode with subcommands `install`, `today`, `project`, `export`, `version`, `help`
- All operations idempotent (CLI-01), backed up before modification, existing hooks preserved

## Task Commits

1. **Task 1: implement install command** - `28e3e87` (feat)
2. **Task 2: implement CLI mode** - `8fad11e` (feat)

## Files Created/Modified

- `packages/hook/src/install.ts` - Idempotent hook install for 3 agents (installClaudeCode, installCodex, installCursor, installAgent)
- `packages/hook/src/install.test.ts` - 20 tests covering idempotency, backup, preserve existing hooks, adversarial inputs
- `packages/hook/src/cli.ts` - CLI subcommand parser (hand-rolled, zero dependencies)
- `packages/hook/src/cli.test.ts` - 14 tests covering help, version, install dispatch, unknown command
- `packages/hook/src/recovery.ts` - sweepStale + recoverOrphans (Rule 3 dependency for cli.ts)

## Decisions Made

- **recovery.ts as Rule 3 dependency:** cli.ts imports `sweepStale` from recovery.ts which doesn't exist yet (plan 03-03 runs in parallel). Created minimal recovery.ts with `sweepStale` and `recoverOrphans` functions to unblock cli.ts. Plan 03-03 may overwrite with full implementation.
- **today/project/export as Phase 4 placeholders:** These commands call sweepStale + queryEvents but only output event counts. Full implementation deferred to Phase 4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created recovery.ts as dependency for cli.ts**
- **Found during:** Task 2 (CLI implementation)
- **Issue:** cli.ts imports `sweepStale` from `./recovery.js` but recovery.ts doesn't exist (plan 03-03 runs in parallel)
- **Fix:** Created recovery.ts with `sweepStale` and `recoverOrphans` functions following existing store.ts patterns
- **Files modified:** packages/hook/src/recovery.ts
- **Verification:** All 84 hook tests pass (84 pass, 0 fail)
- **Committed in:** 28e3e87 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal. recovery.ts is a dependency stub; plan 03-03 may provide full implementation.

## Issues Encountered

- **Bun module resolution for @vibetime/core:** `bun test` from root couldn't resolve workspace package. Fixed by running `pnpm install` and `npx tsc --project packages/core/tsconfig.json` to build core dist.
- **Test isolation with HOME env var:** install.test.ts didn't restore `process.env.HOME` in afterEach, causing cli.test.ts cursor test to fail when running both files together. Fixed by adding proper HOME save/restore in both test files.

## Known Stubs

None that affect plan goal. The `today`/`project`/`export` commands are intentionally placeholder implementations (Phase 4 scope).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CLI entry point ready: `vibetime install <agent>` works for all 3 agents
- All 84 hook package tests passing (34 new + 50 existing)
- Ready for Phase 4 (Today/Live/History views) and Phase 6 (packaging with binary compilation)

---
*Phase: 03-hook-binary-store-install*
*Completed: 2026-04-29*

## Self-Check: PASSED

- All 6 created files exist
- Commit 28e3e87 (Task 1) verified in git log
- Commit 8fad11e (Task 2) verified in git log
- 84/84 hook tests passing
