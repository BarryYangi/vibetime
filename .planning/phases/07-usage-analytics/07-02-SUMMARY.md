---
phase: 07-usage-analytics
plan: 02
subsystem: core-usage
tags: [usage-analytics, transcript-scanners, privacy, vitest, token-facts]

requires:
  - phase: 07-usage-analytics
    provides: usage contracts, SQLite usage DDL, Wave 0 fixtures, and privacy canary tests from 07-01
provides:
  - Pure Codex JSONL scanner for sanitized token_count usage facts
  - Pure Claude Code JSONL scanner for sanitized assistant message usage facts
  - Stable source row keys and duplicate protection for scanner outputs
  - Scanner tests for deltas, cache tokens, malformed rows, dedupe, and privacy canaries
affects: [07-usage-analytics, usage-scanners, desktop-usage-storage, usage-aggregation]

tech-stack:
  added: []
  patterns:
    - Pure string-based scanner modules return `UsageScanResult` without filesystem or database access
    - Scanner outputs are allowlisted `UsageRecordFact` token facts only
    - Duplicate/backfilled transcript rows collapse by stable source identity before persistence

key-files:
  created:
    - packages/core/src/usage/codex-scanner.ts
    - packages/core/src/usage/codex-scanner.test.ts
    - packages/core/src/usage/claude-scanner.ts
    - packages/core/src/usage/claude-scanner.test.ts
  modified:
    - packages/core/src/usage/types.ts
    - packages/core/src/index.ts

key-decisions:
  - "Codex scanner prefers `last_token_usage`; when only cumulative `total_token_usage` exists, it emits positive deltas from the previous cumulative row."
  - "Claude scanner deduplicates assistant streaming rows by `sessionId + requestId + message.id` when available."
  - "Scanner results intentionally leave `project` nullable and `attributionMethod: 'unmatched'`; hook linkage remains owned by later Phase 07 reconciliation work."

patterns-established:
  - "Usage scanners parse malformed JSONL defensively and skip non-usage rows."
  - "Scanner metadata is limited to `sourceKind`, plus Claude sidechain/subagent flags when typed."
  - "Scanner barrel exports live in `packages/core/src/index.ts` with `.js` specifiers."

requirements-completed: [TOK-01, USAGE-01, USAGE-02, USAGE-03, USAGE-04]

duration: 6min
completed: 2026-05-15
---

# Phase 07 Plan 02: Transcript Scanner Summary

**Claude Code and Codex JSONL scanners that normalize local transcript token rows into sanitized, idempotent usage facts**

## Performance

- **Duration:** 6min
- **Started:** 2026-05-15T10:10:03Z
- **Completed:** 2026-05-15T10:15:44Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Implemented `scanCodexUsageTranscript` and `scanCodexUsageTranscripts` for Codex `token_count` rows, including direct `last_token_usage`, cumulative `total_token_usage` deltas, cached input tokens, output tokens, reasoning tokens, malformed-row tolerance, and duplicate source key stability.
- Implemented `scanClaudeUsageTranscript` and `scanClaudeUsageTranscripts` for Claude Code assistant `message.usage` rows, including cache creation/read tokens, output tokens, model/timestamp/session source identity, sidechain/subagent metadata, missing optional fields, and streaming duplicate collapse.
- Added shared scanner contracts through `UsageTranscriptCandidate` and `UsageScanResult`, exported all scanner functions from `@vibetime/core`, and kept scanner output free of prompt/response/tool/transcript content.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Codex scanner behavior tests** - `9feb380` (`test`)
2. **Task 1 GREEN: Codex usage scanner** - `6a0b3d5` (`feat`)
3. **Task 2 RED: Claude scanner behavior tests** - `821b557` (`test`)
4. **Task 2 GREEN: Claude usage scanner** - `40ef532` (`feat`)
5. **Plan formatting fix** - `4551025` (`style`)

## Files Created/Modified

- `packages/core/src/usage/codex-scanner.ts` - Pure Codex usage scanner returning sanitized `UsageRecordFact` rows.
- `packages/core/src/usage/codex-scanner.test.ts` - Codex fixture tests for deltas, cache/output/reasoning tokens, malformed rows, and source key stability.
- `packages/core/src/usage/claude-scanner.ts` - Pure Claude Code assistant usage scanner with stable row-key dedupe and sanitized metadata.
- `packages/core/src/usage/claude-scanner.test.ts` - Claude fixture tests for assistant usage, cache tokens, duplicate rows, optional fields, and privacy canaries.
- `packages/core/src/usage/types.ts` - Added shared scanner candidate/result contracts.
- `packages/core/src/index.ts` - Exported scanner functions and scanner types from the core public API.

## Decisions Made

- Kept scanners pure and string-based, so later desktop background scanning can supply file contents without adding filesystem or SQLite dependencies to core.
- Kept project attribution unset in scanner output; transcript facts are normalized first, then later plans reconcile them to hook events using turn/session/time context.
- Used `unknown` model fallback only when no model context exists; no provider-specific pricing or model registry logic was added in this plan.

## TDD Gate Compliance

- RED commit present for Task 1: `9feb380`
- GREEN commit present for Task 1: `6a0b3d5`
- RED commit present for Task 2: `821b557`
- GREEN commit present for Task 2: `40ef532`

## Verification

- `rtk pnpm --filter @vibetime/core test -- src/usage/codex-scanner.test.ts` - PASS
- `rtk pnpm --filter @vibetime/core test -- src/usage/claude-scanner.test.ts` - PASS
- `rtk pnpm --filter @vibetime/core test -- src/usage/codex-scanner.test.ts src/usage/claude-scanner.test.ts` - PASS, 10 tests
- `rtk pnpm --filter @vibetime/core test -- src/usage/privacy.test.ts` - PASS, 3 tests
- `rtk rg -n "Cursor|Gemini|cursor|gemini" packages/core/src/usage/*scanner* packages/core/src/usage/__fixtures__` - PASS, no scanner/fixture support added
- `rtk rg -n "prompt|response|tool_args|arguments|content|rawTranscript|transcript_line" packages/core/src/usage/codex-scanner.ts` - PASS, only `candidate.content` appears as the string-based scanner input property
- `rtk rg -n "SECRET_PROMPT_CANARY|SECRET_RESPONSE_CANARY|SECRET_TOOL_ARG_CANARY" packages/core/src/usage/claude-scanner.ts` - PASS, no matches
- `rtk pnpm run ci` - PASS: typecheck, lint, Vitest core/desktop, hook Bun tests, dependency-cruiser, and core zero-deps all green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Biome formatting after scanner implementation**
- **Found during:** Plan-level verification
- **Issue:** Root lint failed because new core scanner exports and scanner implementations were not formatted/sorted per Biome.
- **Fix:** Ran targeted Biome write on `packages/core/src/index.ts`, `packages/core/src/usage/claude-scanner.ts`, and `packages/core/src/usage/codex-scanner.ts`.
- **Files modified:** `packages/core/src/index.ts`, `packages/core/src/usage/claude-scanner.ts`, `packages/core/src/usage/codex-scanner.ts`
- **Verification:** `rtk pnpm lint`, focused scanner tests, privacy test, and `rtk pnpm run ci`
- **Committed in:** `4551025`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** No scope change. The fix made the scanner implementation satisfy repository formatting and CI gates.

## Issues Encountered

- TDD RED phases failed as intended because scanner modules did not exist yet.
- Root lint initially failed on Biome formatting after implementation and was fixed in `4551025`.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `07-03`: pricing, usage aggregation, hook attribution, and `07-USAGE-MAPPING.md` can now consume proven `UsageRecordFact` scanner outputs for Claude Code and Codex only.

## Self-Check: PASSED

- Key created/modified files found: `codex-scanner.ts`, `codex-scanner.test.ts`, `claude-scanner.ts`, `claude-scanner.test.ts`, `types.ts`, and `index.ts`.
- Task/deviation commits found: `9feb380`, `6a0b3d5`, `821b557`, `40ef532`, and `4551025`.
- Stub scan passed for scanner files, scanner tests, usage types, and core exports.
- Plan-level verification and full CI passed.

---
*Phase: 07-usage-analytics*
*Completed: 2026-05-15*
