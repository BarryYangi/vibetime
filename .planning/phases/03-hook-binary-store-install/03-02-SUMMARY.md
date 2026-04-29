---
phase: 03-hook-binary-store-install
plan: 02
subsystem: database
tags: [sqlite, bun:sqlite, wal, pragma, prepared-statements]

# Dependency graph
requires:
  - phase: 01-foundations-and-decisions
    provides: schema DDL constants (DDL_EVENTS, DDL_OPEN_TURNS, DDL_INDICES), NormalizedEvent type
  - phase: 02-agent-adapters
    provides: adapter functions, resolveProject
provides:
  - SQLite store layer (openDatabase, persistEvent, closeDatabase, queryEvents, queryOpenTurns, deleteOpenTurn)
  - WAL mode + PRAGMA setup for concurrent writes
  - open_turns crash recovery tracking
affects: [03-hook-binary, 03-cli, 04-desktop]

# Tech tracking
tech-stack:
  added: [bun:sqlite]
  patterns: [prepared-statement-binding, pragma-setup, ddl-if-not-exists-wrapping, try-catch-never-throws]

key-files:
  created:
    - packages/hook/src/store.ts
    - packages/hook/src/constants.ts
    - packages/hook/src/fs.ts
    - packages/hook/src/log.ts
    - packages/hook/src/store.test.ts
  modified:
    - packages/core/src/events.ts
    - packages/hook/package.json

key-decisions:
  - "PRAGMA busy_timeout returns column name 'timeout' not 'busy_timeout' in bun:sqlite"
  - "NormalizedEvent.duration_sec added to interface — DDL and store code both require it"
  - "hook package test script changed to 'bun test' per CONTEXT.md D-TEST-HOOK"

patterns-established:
  - "Store layer wraps core DDL with IF NOT EXISTS (FND-03 invariant)"
  - "All SQLite writes use prepared statements with $param binding (T-03-04)"
  - "All store operations in try/catch, never throw, log to hook.log"

requirements-completed: [STORE-01, STORE-02, STORE-03]

# Metrics
duration: 5min
completed: 2026-04-29
---

# Phase 3 Plan 02: SQLite Store Layer Summary

**bun:sqlite store with WAL mode, prepared statements, and open_turns crash recovery tracking**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-29T00:00:00Z
- **Completed:** 2026-04-29T00:05:00Z
- **Tasks:** 1
- **Files modified:** 7

## Accomplishments
- SQLite store module with full CRUD: openDatabase, persistEvent, closeDatabase, queryEvents, queryOpenTurns, deleteOpenTurn
- WAL mode + synchronous=NORMAL + busy_timeout=5000 + foreign_keys=ON PRAGMA setup (STORE-01)
- DDL wrapped with IF NOT EXISTS for idempotent table creation (STORE-02, FND-03)
- Prepared statements with parameter binding for all writes (T-03-04)
- open_turns management for crash recovery: turn_start inserts, turn_end computes duration and deletes
- 25 bun:test tests covering all PRAGMAs, schema, CRUD, and concurrent writes (STORE-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: 实现 SQLite 存储层** - `471ba6d` (feat)

**Plan metadata:** (pending orchestrator commit)

## Files Created/Modified
- `packages/hook/src/store.ts` - SQLite store: openDatabase, persistEvent, closeDatabase, queryEvents, queryOpenTurns, deleteOpenTurn
- `packages/hook/src/store.test.ts` - 25 tests covering STORE-01, STORE-02, STORE-03
- `packages/hook/src/constants.ts` - VERSION, DB_PATH, LOG_PATH, CONFIG_PATH, MAX_LOG_SIZE, STALE_TURN_MAX_AGE
- `packages/hook/src/fs.ts` - ensureVibetimeDir() with mode 0700
- `packages/hook/src/log.ts` - appendLog() with 10MB rotation
- `packages/core/src/events.ts` - Added duration_sec?: number to NormalizedEvent interface
- `packages/hook/package.json` - Test script changed from vitest to bun test

## Decisions Made
- PRAGMA busy_timeout returns column `timeout` (not `busy_timeout`) in bun:sqlite — test adjusted accordingly
- NormalizedEvent.duration_sec added to core interface — required by DDL schema and store persistEvent code
- hook package test script set to `bun test` per CONTEXT.md D-TEST-HOOK decision (bun:sqlite incompatible with vitest on Node)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added duration_sec to NormalizedEvent interface**
- **Found during:** Task 1 (store.ts implementation)
- **Issue:** NormalizedEvent interface lacked `duration_sec` field, but DDL schema and persistEvent code both use it
- **Fix:** Added `duration_sec?: number` to NormalizedEvent in packages/core/src/events.ts
- **Files modified:** packages/core/src/events.ts
- **Verification:** TypeScript typecheck passes, store tests pass
- **Committed in:** 471ba6d

**2. [Rule 3 - Blocking] Created supporting modules required by store.ts**
- **Found during:** Task 1 (store.ts implementation)
- **Issue:** store.ts imports from ./constants.js, ./fs.js, ./log.js which didn't exist
- **Fix:** Created constants.ts, fs.ts, log.ts with required exports
- **Files modified:** packages/hook/src/constants.ts, packages/hook/src/fs.ts, packages/hook/src/log.ts
- **Verification:** store.ts compiles and tests pass
- **Committed in:** 471ba6d

**3. [Rule 3 - Blocking] Built core package for bun module resolution**
- **Found during:** Task 1 (test execution)
- **Issue:** bun:sqlite test runner couldn't resolve @vibetime/core — dist/ directory didn't exist
- **Fix:** Ran `tsc -b` in packages/core to generate dist/
- **Files modified:** packages/core/dist/ (gitignored, not committed)
- **Verification:** bun test resolves @vibetime/core successfully
- **Committed in:** N/A (build artifact, gitignored)

**4. [Rule 3 - Blocking] Updated hook test script to bun test**
- **Found during:** Task 1 (test execution)
- **Issue:** package.json had "vitest run" but hook uses bun:test imports (CONTEXT.md D-TEST-HOOK)
- **Fix:** Changed test script from "vitest run" to "bun test"
- **Files modified:** packages/hook/package.json
- **Verification:** `bun test` runs successfully
- **Committed in:** 471ba6d

**5. [Rule 1 - Bug] Fixed PRAGMA busy_timeout test column name**
- **Found during:** Task 1 (test execution)
- **Issue:** Test expected column `busy_timeout` but bun:sqlite returns column `timeout`
- **Fix:** Changed test assertion to use `result.timeout`
- **Files modified:** packages/hook/src/store.test.ts
- **Verification:** All 25 tests pass
- **Committed in:** 471ba6d

---

**Total deviations:** 5 auto-fixed (4 blocking, 1 bug)
**Impact on plan:** All deviations necessary for correctness and test infrastructure. No scope creep.

## Issues Encountered
- bun:sqlite module resolution requires core package to be built (dist/ must exist) — resolved by running tsc -b
- PRAGMA busy_timeout column name differs from other PRAGMAs in bun:sqlite — documented in test

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- store.ts ready for hook.ts to use (persistEvent, openDatabase, closeDatabase)
- constants.ts, fs.ts, log.ts ready for other hook modules
- All STORE requirements (STORE-01, STORE-02, STORE-03) satisfied

---
*Phase: 03-hook-binary-store-install*
*Completed: 2026-04-29*

## Self-Check: PASSED
- All created files verified present (store.ts, store.test.ts, constants.ts, fs.ts, log.ts)
- Commit 471ba6d verified in git log
- 25/25 bun:test tests passing
