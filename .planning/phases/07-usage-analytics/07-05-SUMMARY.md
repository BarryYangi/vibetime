---
phase: 07-usage-analytics
plan: 05
subsystem: desktop-usage-ipc
tags: [usage-analytics, electron-ipc, app-preferences, config, background-refresh, vitest]

requires:
  - phase: 07-usage-analytics
    provides: desktop usage service, cache-first summaries, pricing refresh, and background scan primitives from 07-04
provides:
  - Typed renderer-safe Usage IPC contracts and preload allowlist entries
  - Main-process Usage summary and refresh IPC handlers with strict argument validation
  - Persisted `app.usage_refresh_frequency` config with validated `30m` default
  - AppPreferences mapping for `usageRefreshFrequency`
  - Desktop lifecycle wiring for Usage background refresh start, reschedule, and shutdown stop
affects: [07-usage-analytics, usage-ui, settings, desktop-main, hook-config]

tech-stack:
  added: []
  patterns:
    - Renderer Usage access stays behind typed Electron IPC.
    - User-editable cadence config is enum-validated and falls back to `30m` on invalid TOML.
    - Background Usage refresh is desktop-lifecycle owned and rescheduled through Settings saves.

key-files:
  created:
    - packages/desktop/src/shared/ipc-types.test.ts
    - packages/desktop/src/main/ipc-handlers.test.ts
  modified:
    - packages/desktop/src/shared/ipc-types.ts
    - packages/desktop/src/preload/index.ts
    - packages/desktop/src/main/ipc-handlers.ts
    - packages/desktop/src/main/index.ts
    - packages/desktop/src/main/usage-service.ts
    - packages/desktop/src/main/usage-service.test.ts
    - packages/hook/src/config.ts
    - packages/hook/src/config.test.ts

key-decisions:
  - "Usage IPC summary filters are limited to period, agent, project, model, and includeSidechain."
  - "Unsupported `app.usage_refresh_frequency` values in manually edited TOML fall back to `30m`; IPC preference writes reject invalid values."
  - "Background Usage refresh starts from Electron desktop lifecycle and is never wired into hook invocation paths."
  - "IPC `refreshUsage` uses `args: undefined` instead of the planned `void` shape because repository lint forbids confusing void field types."

patterns-established:
  - "Usage IPC handlers return `IpcResult` and validate renderer input before service delegation."
  - "Settings preference updates call `startUsageBackgroundRefresh()` only after successful persistence and value changes."
  - "Background refresh uses delayed immediate scan plus interval scheduling, with `stopUsageBackgroundRefresh()` clearing pending timeout and interval."

requirements-completed: [USAGE-05, USAGE-07, USAGE-08]

duration: 14min
completed: 2026-05-15
---

# Phase 07 Plan 05: Typed Usage IPC and Refresh Cadence Summary

**Typed Usage IPC, validated preference persistence, and desktop lifecycle background refresh cadence for Claude/Codex usage analytics**

## Performance

- **Duration:** 14min
- **Started:** 2026-05-15T10:41:30Z
- **Completed:** 2026-05-15T10:55:36Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added renderer-safe Usage IPC contracts, filters, refresh result types, `usage-changed` push events, and preload allowlist entries.
- Registered `getUsageSummary` and `refreshUsage` handlers with validation for period, agent, project/model length, and sidechain flags.
- Added persisted `app.usage_refresh_frequency` with default `30m`, valid values `15m | 30m | 1h | 4h`, invalid TOML fallback, and Settings preference mapping.
- Wired desktop startup to start background Usage refresh from config and shutdown to stop timers; successful preference saves reschedule immediately.
- Confirmed no `vibetime usage`, usage export, or hook hot-path scanner/pricing calls were introduced.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Usage IPC contract tests** - `ebc8f07` (`test`)
2. **Task 1 GREEN: Usage IPC contracts and preload allowlist** - `f3e0a9f` (`feat`)
3. **Task 2 RED: Usage IPC handler tests** - `db9a097` (`test`)
4. **Task 2 GREEN: Validated Usage IPC handlers** - `94e397d` (`feat`)
5. **Task 3 RED: Refresh cadence preference tests** - `37bd019` (`test`)
6. **Task 3 GREEN: Persisted cadence and lifecycle wiring** - `a8c7ba7` (`feat`)
7. **Plan verification type fix** - `6f30abc` (`fix`)

## Files Created/Modified

- `packages/desktop/src/shared/ipc-types.ts` - Usage IPC filters, summary/refresh types, AppPreferences cadence field, and `usage-changed` push event.
- `packages/desktop/src/shared/ipc-types.test.ts` - Contract tests for Usage IPC constants, safe args, push event, and preload allowlist.
- `packages/desktop/src/preload/index.ts` - Allows `getUsageSummary` and `refreshUsage` through the contextBridge channel set.
- `packages/desktop/src/main/ipc-handlers.ts` - Validates Usage IPC arguments, delegates summary/refresh work, maps preferences, and reschedules cadence.
- `packages/desktop/src/main/ipc-handlers.test.ts` - Handler tests for invalid args, service delegation, push events, and preference persistence/rescheduling.
- `packages/desktop/src/main/usage-service.ts` - Background refresh cadence state, delayed immediate scan, timer rescheduling, stop cleanup, and stricter scanner env typing.
- `packages/desktop/src/main/usage-service.test.ts` - Timer rescheduling coverage.
- `packages/desktop/src/main/index.ts` - Starts Usage background refresh after app ready and stops it during quit.
- `packages/hook/src/config.ts` - Persists validated `app.usage_refresh_frequency` with default `30m`.
- `packages/hook/src/config.test.ts` - Default, custom, invalid fallback, and TOML serialization tests for cadence config.

## Decisions Made

- Kept renderer summary args narrow: no scanner roots, pricing internals, raw records, or export surface are exposed over IPC.
- Treated invalid manual TOML cadence as recoverable read-time config drift and invalid IPC preference writes as rejected user input.
- Kept `refreshUsage` as an argumentless IPC channel but represented its shared type as `undefined` to satisfy repository lint.

## TDD Gate Compliance

- RED commit present for Task 1: `ebc8f07`
- GREEN commit present for Task 1: `f3e0a9f`
- RED commit present for Task 2: `db9a097`
- GREEN commit present for Task 2: `94e397d`
- RED commit present for Task 3: `37bd019`
- GREEN commit present for Task 3: `a8c7ba7`

## Verification

- `rtk pnpm --filter @vibetime/desktop typecheck` - PASS
- `rtk pnpm --filter @vibetime/desktop test -- src/main/usage-service.test.ts` - PASS, 8 tests
- `rtk pnpm --filter @vibetime/hook test -- src/config.test.ts` - PASS, 192 hook tests
- `! rtk rg -n "vibetime usage|usage export|exportUsage" packages` - PASS, no matches
- Task acceptance rg checks for IPC handlers, AppPreferences chain, config values, lifecycle wiring, timer rescheduling, and hook hot-path exclusion - PASS
- `rtk pnpm run ci` - PASS: typecheck, lint, core/desktop Vitest, hook Bun tests, dependency-cruiser, and core zero-deps all green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint] Replaced `refreshUsage` shared arg type with `undefined`**
- **Found during:** Task 3 verification
- **Issue:** The plan specified `refreshUsage: { args: void; ... }`, but Biome forbids confusing `void` outside returns/type parameters.
- **Fix:** Kept the IPC channel argumentless while typing args as `undefined`, matching existing argumentless IPC methods.
- **Files modified:** `packages/desktop/src/shared/ipc-types.ts`
- **Verification:** `rtk pnpm lint`, desktop typecheck, and root CI
- **Committed in:** `a8c7ba7`

**2. [Rule 1 - Bug] Fixed strict TypeScript issues exposed by root CI**
- **Found during:** Plan-level verification
- **Issue:** Root `tsc -b` rejected required env override typing and ambiguous `readdirSync` `Dirent` inference in Usage service.
- **Fix:** Made scanner env overrides partial and explicitly typed JSONL directory entries as string-name `Dirent`s.
- **Files modified:** `packages/desktop/src/main/usage-service.ts`
- **Verification:** `rtk pnpm run ci`
- **Committed in:** `6f30abc`

---

**Total deviations:** 2 auto-fixed (Rule 1 x2)
**Impact on plan:** No product scope change. Both fixes were required to satisfy repository quality gates while preserving typed IPC, config validation, and background cadence behavior.

## Issues Encountered

- TDD RED phases failed as intended before implementation.
- Focused desktop typecheck did not surface the root `tsc -b` issue; full CI caught it before summary creation, and the fix was committed.

## Known Stubs

None. Stub scan matches only legitimate timer null states, empty accumulators, default parameters, and test helper defaults; no UI placeholder or unwired mock data was introduced.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: renderer-usage-ipc | `packages/desktop/src/main/ipc-handlers.ts` | Adds renderer-to-main Usage summary and refresh IPC surface; mitigated by strict argument validation and narrow shared types. |
| threat_flag: config-timer-cadence | `packages/hook/src/config.ts`, `packages/desktop/src/main/usage-service.ts` | Adds user-editable background scan cadence; mitigated by enum validation and `30m` fallback. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `07-06`: renderer Usage route and Settings UI can call typed `getUsageSummary`, `refreshUsage`, and `updateAppPreferences({ usageRefreshFrequency })`. Background refresh now starts after desktop launch, reschedules immediately after Settings saves, and remains absent from hook hot-path files.

## Self-Check: PASSED

- Created summary file path: `.planning/phases/07-usage-analytics/07-05-SUMMARY.md`
- Key files exist: `ipc-types.ts`, `preload/index.ts`, `ipc-handlers.ts`, `usage-service.ts`, `usage-service.test.ts`, `main/index.ts`, `config.ts`, and `config.test.ts`.
- Task/deviation commits found: `ebc8f07`, `f3e0a9f`, `db9a097`, `94e397d`, `37bd019`, `a8c7ba7`, and `6f30abc`.
- Full root CI passed after the final type fix.

---
*Phase: 07-usage-analytics*
*Completed: 2026-05-15*
