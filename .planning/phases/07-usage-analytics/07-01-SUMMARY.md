---
phase: 07-usage-analytics
plan: 01
subsystem: core-usage
tags: [usage-analytics, sqlite, privacy, vitest, token-facts]

requires:
  - phase: 06-packaging-v0-acceptance
    provides: packaged app baseline and current core/desktop/hook contracts
provides:
  - Claude Code and Codex-only usage type contracts
  - SQLite DDL for usage records, scan state, pricing cache, and usage indices
  - Wave 0 fixtures for Codex, Claude Code, pricing, privacy canaries, and hook linkage
  - Privacy tests proving usage persistence excludes transcript-bearing fields and canary strings
affects: [07-usage-analytics, desktop-usage-storage, usage-scanners, usage-ui]

tech-stack:
  added: []
  patterns:
    - Core usage contracts stay dependency-free and exported through `@vibetime/core`
    - Usage summaries are derived on read from token facts and pricing cache
    - Persistable usage metadata is allowlist-sanitized

key-files:
  created:
    - packages/core/src/usage/types.ts
    - packages/core/src/usage/contracts.test.ts
    - packages/core/src/usage/privacy.test.ts
    - packages/core/src/usage/__fixtures__/codex-token-count.jsonl
    - packages/core/src/usage/__fixtures__/codex-duplicate-session.jsonl
    - packages/core/src/usage/__fixtures__/claude-assistant-usage.jsonl
    - packages/core/src/usage/__fixtures__/claude-privacy-canary.jsonl
    - packages/core/src/usage/__fixtures__/pricing-cache.json
    - packages/core/src/usage/__fixtures__/hook-events.ts
  modified:
    - packages/core/src/schema.ts
    - packages/core/src/index.ts

key-decisions:
  - "Usage scope is explicitly limited to `claude-code` and `codex` via `USAGE_AGENTS`."
  - "Pricing cache stores validated public rate columns and `raw_version`, not opaque raw pricing JSON."
  - "Forbidden persistence key literals live in privacy tests, not public usage contracts, so schema/types static scans remain clean."
  - "Estimated usage summaries are computed on read; no Phase 07 summary table is materialized."

patterns-established:
  - "Usage DDL follows the existing core schema-constant export pattern."
  - "TDD RED/GREEN commits gate usage contracts and privacy helpers."
  - "Usage metadata is allowlist-based through `sanitizeUsageMeta`."

requirements-completed: [USAGE-01, USAGE-02, USAGE-03, USAGE-04, USAGE-05, USAGE-06, USAGE-07, TOK-01, TOK-02]

duration: 7min
completed: 2026-05-15
---

# Phase 07 Plan 01: Usage Validation Foundation Summary

**Claude/Codex usage fixtures, dependency-free usage contracts, SQLite usage DDL, and privacy canary tests for token-fact persistence**

## Performance

- **Duration:** 7min
- **Started:** 2026-05-15T09:59:00Z
- **Completed:** 2026-05-15T10:05:43Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Created deterministic Wave 0 fixtures for Codex token counts, duplicate/backfill rows, Claude assistant usage, Claude privacy canaries, pricing cache rates, and hook linkage cases.
- Added public usage contracts for Claude Code and Codex token facts, scan state, pricing entries, attribution methods, refresh frequencies, summaries, and refresh results.
- Added SQLite DDL constants for `usage_records`, `usage_scan_state`, `usage_pricing_cache`, and usage indices, with idempotency enforced by `UNIQUE(agent, source_file_key, source_row_key)` and scan-state primary keys.
- Added privacy tests proving usage DDL and representative persistable objects exclude transcript-bearing fields and `SECRET_*_CANARY` strings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Phase 07 validation fixtures** - `9d40cfa` (`feat`)
2. **Task 2 RED: Usage contract tests** - `bc3dd61` (`test`)
3. **Task 2 GREEN: Usage contracts and DDL** - `80d8795` (`feat`)
4. **Task 3 RED: Usage privacy tests** - `bee5c54` (`test`)
5. **Task 3 GREEN: Usage privacy helpers** - `3a31e55` (`feat`)
6. **Task 3 formatting fix** - `83ddeb2` (`style`)

## Files Created/Modified

- `packages/core/src/usage/types.ts` - Usage agents, token/pricing/scan/summary contracts, runtime guards, and allowlist metadata sanitizer.
- `packages/core/src/schema.ts` - Usage records, scan-state, pricing-cache DDL, and usage indices.
- `packages/core/src/index.ts` - Public `@vibetime/core` usage exports.
- `packages/core/src/usage/contracts.test.ts` - TDD contract tests for usage scope, refresh frequencies, and DDL privacy shape.
- `packages/core/src/usage/privacy.test.ts` - Privacy canary and forbidden-key contract tests.
- `packages/core/src/usage/__fixtures__/` - Codex, Claude Code, pricing, privacy, and hook-linkage fixtures.

## Decisions Made

- Kept `USAGE_AGENTS` to exactly `['claude-code', 'codex']`; no Cursor/Gemini usage fixture, contract, scanner, CLI, or export scope was added.
- Stored only source identity, token facts, attribution metadata, sanitized `meta`, and public pricing rates in usage contracts.
- Kept forbidden-key literals in `privacy.test.ts` rather than `types.ts` so the public persistence contracts stay free of transcript-bearing field names.
- Left cost as a read-time derivation from token facts plus pricing cache; no immutable estimated-cost rows or summary table were added.

## TDD Gate Compliance

- RED commit present for Task 2: `bc3dd61`
- GREEN commit present for Task 2: `80d8795`
- RED commit present for Task 3: `bee5c54`
- GREEN commit present for Task 3: `3a31e55`

## Verification

- `rtk pnpm --filter @vibetime/core test -- src/usage/privacy.test.ts` - PASS
- `rtk pnpm --filter @vibetime/core typecheck` - PASS
- `rtk rg -n "Cursor|Gemini|cursor|gemini" packages/core/src/usage/__fixtures__` - PASS, no matches
- `rtk rg -n "prompt|response|tool_args|arguments|content|rawTranscript|transcript_line" packages/core/src/schema.ts packages/core/src/usage/types.ts` - PASS, no matches
- `rtk rg -n "vibetime usage|usage export|exportUsage" packages` - PASS, no matches
- `rtk pnpm run ci` - PASS: typecheck, lint, Vitest core/desktop, hook Bun tests, dependency-cruiser, and core zero-deps all green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Biome formatting after root CI**
- **Found during:** Plan-level verification
- **Issue:** Root CI failed because the new usage exports and privacy test imports were not sorted/formatted per Biome.
- **Fix:** Sorted exports/imports and wrapped the fixture read helper.
- **Files modified:** `packages/core/src/index.ts`, `packages/core/src/usage/privacy.test.ts`
- **Verification:** `rtk pnpm lint`, `rtk pnpm --filter @vibetime/core test -- src/usage`, and `rtk pnpm run ci`
- **Committed in:** `83ddeb2`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** No scope change. The fix made the committed implementation satisfy repository lint and CI gates.

## Issues Encountered

- TDD RED phases failed as intended before implementation.
- Root CI initially failed on Biome formatting and was fixed in `83ddeb2`.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local-usage-persistence | `packages/core/src/schema.ts` | Adds local SQLite usage fact, scan-state, and pricing-cache tables at the privacy boundary planned in `T-usage-privacy`, `T-scan-integrity`, and `T-pricing-integrity`. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `07-02`: scanner work can consume the fixtures, `UsageRecordFact` contracts, idempotent DDL, and privacy sanitizer. The foundation intentionally adds no usage CLI/export and no Cursor/Gemini usage scope.

## Self-Check: PASSED

- All created/modified key files exist.
- Task commits found: `9d40cfa`, `bc3dd61`, `80d8795`, `bee5c54`, `3a31e55`, `83ddeb2`.
- Stub scan passed for created/modified usage files.

---
*Phase: 07-usage-analytics*
*Completed: 2026-05-15*
