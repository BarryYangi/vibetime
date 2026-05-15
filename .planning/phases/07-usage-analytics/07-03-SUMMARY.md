---
phase: 07-usage-analytics
plan: 03
subsystem: core-usage
tags: [usage-analytics, pricing, attribution, aggregation, mapping, vitest]

requires:
  - phase: 07-usage-analytics
    provides: scanner fixtures and Claude/Codex usage facts from 07-01 and 07-02
provides:
  - Nullable estimated-cost calculation from token facts and LiteLLM pricing entries
  - Ordered hook reconciliation for turn, session/time, project/time, and unmatched usage rows
  - Usage summary builder with dense daily rows, agent/model/project breakdowns, audit rows, and filters
  - Required data capability to visualization mapping before renderer chart work
affects: [core-usage, usage-ui-contract, pricing-cache, hook-attribution]

tech-stack:
  added: []
  patterns:
    - Cost remains a read-time derivation from token facts and pricing entries
    - Unmatched and unknown-price rows stay visible through audit rows
    - Usage aggregation whitelists Claude Code and Codex only

key-files:
  created:
    - packages/core/src/usage/pricing.ts
    - packages/core/src/usage/pricing.test.ts
    - packages/core/src/usage/reconcile.ts
    - packages/core/src/usage/reconcile.test.ts
    - packages/core/src/usage/aggregate.ts
    - packages/core/src/usage/aggregate.test.ts
    - .planning/phases/07-usage-analytics/07-USAGE-MAPPING.md
  modified:
    - packages/core/src/usage/types.ts
    - packages/core/src/index.ts

key-decisions:
  - "Unknown model pricing returns `null` estimated cost and contributes to `unknownCostTokens`; it is never represented as zero-dollar cost."
  - "Usage attribution order is `turn_id` -> `session_time_window` -> `project_time_window` -> `unmatched`."
  - "Project spend charts are allowed only for hook-linked rows; unassigned usage remains visible in the audit surface."
  - "MVP Usage visuals are limited to the approved mapping: metric tiles, daily trend, token breakdown, project ranking, model efficiency table, unavailable cost/time panel, and audit table."

requirements-completed: [TOK-01, TOK-02, USAGE-01, USAGE-05, USAGE-06, USAGE-07]

duration: 9min
completed: 2026-05-15
---

# Phase 07 Plan 03: Pricing, Attribution, Aggregation, and Mapping Summary

**Nullable pricing estimates, hook-linked usage attribution, tested Usage summaries, and the required visualization mapping artifact**

## Performance

- **Duration:** 9min
- **Started:** 2026-05-15T10:18:43Z
- **Completed:** 2026-05-15T10:27:18Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Implemented `normalizeLiteLlmPricingPayload`, `lookupUsagePrice`, `estimateUsageCostUsd`, and `pricingStatusFromCache`, with tests for seeded cache data, LiteLLM refresh payloads, stale cache status, malformed payloads, and unknown model cost.
- Implemented `reconcileUsageWithHookEvents`, preserving usage rows while applying the required attribution order: `turn_id`, `session_time_window`, `project_time_window`, then `unmatched`.
- Implemented `buildUsageSummary`, including dense daily rows, totals, token breakdown, nullable cost, unknown-cost tokens, Claude/Codex-only filtering, project/model/agent breakdowns, available filters, and audit rows for unknown price and unassigned usage.
- Created `.planning/phases/07-usage-analytics/07-USAGE-MAPPING.md`, covering all D-14 product questions and separating `transcript-only`, `hook-linked`, and `unsupported` insights before renderer charts begin.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Pricing behavior tests** - `4f30590` (`test`)
2. **Task 1 GREEN: Pricing implementation** - `fd88c55` (`feat`)
3. **Task 2 RED: Attribution and aggregation tests** - `f125d88` (`test`)
4. **Task 2 GREEN: Reconciliation and Usage summary** - `62d0a67` (`feat`)
5. **Task 3: Usage data-to-visualization mapping** - `5cf1c7b` (`docs`)
6. **Task 2 type fix** - `1ec8853` (`fix`)
7. **Plan formatting fix** - `94fc8c6` (`style`)

## Files Created/Modified

- `packages/core/src/usage/pricing.ts` - Pricing payload normalization, lookup, nullable cost estimation, and cache freshness status.
- `packages/core/src/usage/pricing.test.ts` - Pricing TDD coverage for success and failure paths.
- `packages/core/src/usage/reconcile.ts` - Usage-to-hook attribution helper.
- `packages/core/src/usage/reconcile.test.ts` - Tests for all attribution methods and unmatched preservation.
- `packages/core/src/usage/aggregate.ts` - Usage summary builder for future IPC/UI consumption.
- `packages/core/src/usage/aggregate.test.ts` - Tests for allowed-agent filtering, dense daily rows, audit rows, unknown prices, and sorted breakdowns.
- `packages/core/src/usage/types.ts` - Expanded Usage summary, daily, audit, totals, and filter contracts.
- `packages/core/src/index.ts` - Public exports for pricing, reconciliation, aggregation, and new Usage summary types.
- `.planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` - Required D-14/D-15/D-16 mapping artifact.

## Decisions Made

- Pricing normalization accepts both the seeded cache shape and LiteLLM object-map refresh shape, but malformed rows without usable rates are ignored.
- Reasoning output tokens are reported in token breakdowns but not charged a second time when `outputTokens` already includes output-side usage.
- Aggregates keep `estimatedCostUsd: null` when a group has no priceable rows and track the affected tokens in `unknownCostTokens`.
- Unassigned usage is excluded from project ranking but remains visible through audit rows and agent/model totals.

## TDD Gate Compliance

- RED commit present for Task 1: `4f30590`
- GREEN commit present for Task 1: `fd88c55`
- RED commit present for Task 2: `f125d88`
- GREEN commit present for Task 2: `62d0a67`

## Verification

- `rtk pnpm --filter @vibetime/core test -- src/usage/pricing.test.ts` - PASS, 6 tests
- `rtk pnpm --filter @vibetime/core test -- src/usage/reconcile.test.ts src/usage/aggregate.test.ts` - PASS, 8 tests
- `rtk pnpm --filter @vibetime/core test -- src/usage` - PASS, 30 tests
- `rtk pnpm --filter @vibetime/core test -- src/usage/pricing.test.ts src/usage/reconcile.test.ts src/usage/aggregate.test.ts` - PASS, 14 tests
- `test -f .planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` - PASS
- `rtk rg -n "vibetime usage|usage export|exportUsage" packages` - PASS, no matches
- `rtk pnpm run ci` - PASS: typecheck, lint, Vitest core/desktop, hook Bun tests, dependency-cruiser, and core zero-deps all green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Normalized attributed `sessionId` for exact optional types**
- **Found during:** Plan-level CI after Task 3
- **Issue:** TypeScript rejected `sessionId` because attribution could explicitly write `undefined` into an exact optional property.
- **Fix:** Normalized missing attributed session context to `null`.
- **Files modified:** `packages/core/src/usage/reconcile.ts`
- **Verification:** `rtk pnpm --filter @vibetime/core test -- src/usage/reconcile.test.ts src/usage/aggregate.test.ts`, `rtk pnpm typecheck`, and full CI
- **Committed in:** `1ec8853`

**2. [Rule 1 - Bug] Fixed Biome formatting after full CI**
- **Found during:** Plan-level CI after Task 3
- **Issue:** Biome required usage exports to be sorted and aggregate tests to be wrapped.
- **Fix:** Ran targeted Biome write on `packages/core/src/index.ts` and `packages/core/src/usage/aggregate.test.ts`.
- **Files modified:** `packages/core/src/index.ts`, `packages/core/src/usage/aggregate.test.ts`
- **Verification:** `rtk pnpm lint`, focused usage tests, and full CI
- **Committed in:** `94fc8c6`

---

**Total deviations:** 2 auto-fixed (Rule 1)
**Impact on plan:** No scope change. Fixes made the implementation satisfy strict TypeScript and repository formatting gates.

## Issues Encountered

- TDD RED phases failed as intended because pricing, reconciliation, and aggregation modules did not exist yet.
- Full CI initially found the exact optional type issue and Biome formatting drift; both were fixed and committed.

## Known Stubs

None. Stub scan only found legitimate nullable-cost and empty-accumulator code paths, not UI placeholders or unwired mock data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `07-04`: desktop main/storage work can consume the exported pricing, reconciliation, and aggregation functions, plus the mapping artifact that constrains later renderer chart choices.

## Self-Check: PASSED

- Key created/modified files found on disk.
- Task and deviation commits found: `4f30590`, `fd88c55`, `f125d88`, `62d0a67`, `5cf1c7b`, `1ec8853`, and `94fc8c6`.
- Mapping artifact exists before renderer Usage chart implementation.
- No usage CLI/export surface was added.
- Full CI passed.

---
*Phase: 07-usage-analytics*
*Completed: 2026-05-15*
