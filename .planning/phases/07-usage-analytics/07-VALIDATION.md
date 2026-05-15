---
phase: 07
slug: usage-analytics
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-15
---

# Phase 07 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 for `@vibetime/core` and `@vibetime/desktop`; Bun test for `@vibetime/hook` |
| **Config file** | `vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/desktop/vitest.config.ts`, `packages/hook/vitest.config.ts` |
| **Quick run command** | `rtk pnpm --filter @vibetime/core test -- src/usage` |
| **Full suite command** | `rtk pnpm run ci` |
| **Estimated runtime** | ~120 seconds for full suite; focused usage tests should stay under 20 seconds |

---

## Sampling Rate

- **After every scanner/pricing/aggregation task commit:** Run `rtk pnpm --filter @vibetime/core test -- src/usage`.
- **After every desktop main/store/UI task commit:** Run `rtk pnpm --filter @vibetime/desktop test -- src/main/usage src/renderer/src/usage-store.test.ts`.
- **After every hook-adjacent task commit:** Run `rtk pnpm --filter @vibetime/hook test` to prove the hook hot path still stays lightweight.
- **After every plan wave:** Run `rtk pnpm run ci`.
- **Before `$gsd-verify-work`:** Full suite must be green, `07-USAGE-MAPPING.md` must exist, privacy canary tests must pass, and manual Usage UI smoke must be recorded in the phase summary.
- **Max feedback latency:** 120 seconds for full suite; 20 seconds for focused usage checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-W0-01 | TBD | 0 | USAGE-03 | T-usage-privacy / T-scan-integrity | Codex fixtures parse token facts only; duplicate scans are idempotent | unit | `rtk pnpm --filter @vibetime/core test -- src/usage/codex-scanner.test.ts` | No - W0 | pending |
| 07-W0-02 | TBD | 0 | USAGE-04 | T-usage-privacy / T-scan-integrity | Claude fixtures parse assistant usage only; duplicate source keys collapse | unit | `rtk pnpm --filter @vibetime/core test -- src/usage/claude-scanner.test.ts` | No - W0 | pending |
| 07-W0-03 | TBD | 0 | USAGE-05 | T-pricing-integrity | Unknown pricing returns null cost; fetch failure keeps tokens visible | unit | `rtk pnpm --filter @vibetime/core test -- src/usage/pricing.test.ts` | No - W0 | pending |
| 07-W0-04 | TBD | 0 | TOK-01, USAGE-06 | T-attribution-integrity | Turn/project linkage records method and confidence; unmatched rows are preserved | unit/integration | `rtk pnpm --filter @vibetime/core test -- src/usage/reconcile.test.ts` | No - W0 | pending |
| 07-W0-05 | TBD | 0 | TOK-02, USAGE-01, USAGE-07 | T-aggregation-integrity | Aggregates include Claude/Codex only and preserve unassigned usage | unit | `rtk pnpm --filter @vibetime/core test -- src/usage/aggregate.test.ts` | No - W0 | pending |
| 07-W0-06 | TBD | 0 | USAGE-02 | T-usage-privacy | SQLite/meta dumps exclude prompt, response, tool args, raw transcript, and canary secrets | unit/integration | `rtk pnpm --filter @vibetime/core test -- src/usage/privacy.test.ts` | No - W0 | pending |
| 07-W0-07 | TBD | 0 | USAGE-05, USAGE-07 | T-ipc-validation / T-pricing-integrity | Main service validates IPC args, scan cadence, pricing refresh, and cache-first summaries | integration | `rtk pnpm --filter @vibetime/desktop test -- src/main/usage-service.test.ts` | No - W0 | pending |
| 07-W0-08 | TBD | 0 | USAGE-07 | T-renderer-boundary | Renderer store handles cached data, refresh success, refresh failure with cache, and no usable pricing | unit | `rtk pnpm --filter @vibetime/desktop test -- src/renderer/src/usage-store.test.ts` | No - W0 | pending |
| 07-W0-09 | TBD | 0 | USAGE-06 | T-chart-trust | Mapping artifact links data capability, hook linkage, user value, and visualization before final charts | artifact gate | `test -f .planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` | No - W0 | pending |

*Status: pending, green, red, flaky.*

---

## Wave 0 Requirements

- [ ] `packages/core/src/usage/codex-scanner.test.ts` - Codex token_count, duplicate, malformed, unknown model, missing timestamp fixtures.
- [ ] `packages/core/src/usage/claude-scanner.test.ts` - Claude assistant usage, cache creation/read, sidechain/subagent fields, duplicate source keys.
- [ ] `packages/core/src/usage/pricing.test.ts` - pricing cache success/failure, unknown models, stale cache, historical recompute.
- [ ] `packages/core/src/usage/reconcile.test.ts` - hook linkage by turn id, session/time window, project fallback, missing linkage.
- [ ] `packages/core/src/usage/aggregate.test.ts` - day/agent/model/project aggregates, Claude/Codex-only filters, unassigned usage.
- [ ] `packages/core/src/usage/privacy.test.ts` - canary fixtures and serialized SQLite/meta scans proving no content persistence.
- [ ] `packages/desktop/src/main/usage-service.test.ts` - background scan, refresh cadence, pricing refresh, typed IPC validation.
- [ ] `packages/desktop/src/renderer/src/usage-store.test.ts` - cache-first store, stale refresh protection, pricing error states.
- [ ] `.planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` - data capability to hook linkage to user value to visualization map.

---

## Fixtures

| Fixture | Location | Purpose |
|---------|----------|---------|
| Codex token_count JSONL | `packages/core/src/usage/__fixtures__/codex-token-count.jsonl` | Unit-test `token_count`, `last_token_usage`, cumulative total fallback, cached input, output, reasoning, turn context, malformed rows |
| Codex duplicate/backfill JSONL | `packages/core/src/usage/__fixtures__/codex-duplicate-session.jsonl` | Prove idempotent scan state across repeated and appended scans |
| Claude assistant usage JSONL | `packages/core/src/usage/__fixtures__/claude-assistant-usage.jsonl` | Unit-test `sessionId`, `requestId`, `message.id`, `message.model`, input/output/cache usage, sidechain/subagent fields |
| Claude privacy canary JSONL | `packages/core/src/usage/__fixtures__/claude-privacy-canary.jsonl` | Prove `SECRET_PROMPT_CANARY`, `SECRET_RESPONSE_CANARY`, and `SECRET_TOOL_ARG_CANARY` never persist |
| Pricing cache JSON | `packages/core/src/usage/__fixtures__/pricing-cache.json` | Deterministic pricing, unknown model, stale cache, cache metadata/version |
| Hook timeline rows | `packages/core/src/usage/__fixtures__/hook-events.ts` | Reconciler and aggregation tests for turn/project/time-window linkage |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Local transcript root discovery | USAGE-03, USAGE-04 | User machines may vary in `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, and archive paths | Point the app at sanitized temporary roots for Claude/Codex fixtures; confirm scanner status shows both agents and does not scan Cursor/Gemini |
| Usage page placement | USAGE-07 | Visual navigation order is easiest to confirm in the running app | Start desktop app and confirm Usage is a dedicated page below History, not nested under History |
| Pricing network failure with no usable cache | USAGE-05 | Network outage behavior is UX-sensitive | Stub or block pricing URL; confirm token totals remain visible and cost fields show `Unknown` / pricing unavailable, not `$0.00` |
| Settings refresh frequency persistence | USAGE-07 | Requires app lifecycle observation | Change refresh cadence in Settings, restart app, confirm saved label and next scan status reflect the selected cadence |

---

## Negative Cases Required

| Case | Expected Result |
|------|-----------------|
| Unknown model pricing | Tokens remain visible; estimated cost is `null`; UI shows cost unknown, never `$0.00` |
| Failed pricing fetch with cache | Cached cost remains available; UI shows `Using cached pricing`; refresh stays enabled |
| Failed pricing fetch without usable cache | Tokens remain visible; cost is unknown; page shows pricing unavailable/network failure |
| Duplicate transcript rows | Row count and aggregate totals remain unchanged after repeated scan |
| Missing timestamp | Parser emits skipped/error audit or unassigned row; no crash and no fake timestamp |
| Missing project linkage | Usage remains in agent/model totals and appears as unassigned; it is excluded from project ranking |
| Cursor/Gemini excluded | Scanner registry, summaries, filters, legends, and totals include Claude Code and Codex only |
| No usage CLI/export | Static scan finds no new `vibetime usage`, `usage export`, or `exportUsage` command surface |

---

## Privacy Sign-Off Criteria

- [ ] `privacy.test.ts` uses canary transcript fields and proves no canary strings persist in normalized rows, scan state, or pricing cache.
- [ ] Static scan of usage persistence code finds no stored prompt, response, tool argument, raw transcript line, transcript content, or full message content fields.
- [ ] SQLite dump against a test DB excludes `SECRET_PROMPT_CANARY`, `SECRET_RESPONSE_CANARY`, `SECRET_TOOL_ARG_CANARY`, `prompt`, `response`, `tool_args`, `arguments`, `content`, `rawTranscript`, and `transcript_line`.
- [ ] Hook binary and hook store remain free of transcript scanning, pricing fetches, aggregation, and ECharts/UI work.

Suggested static command:

```bash
rtk rg -n "prompt|response|tool_args|arguments|content|rawTranscript|transcript_line" packages/core/src/usage packages/desktop/src/main/usage* packages/desktop/src/shared
```

---

## Validation Sign-Off

- [x] All planned implementation areas have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks should proceed without a focused automated verify.
- [x] Wave 0 covers all missing validation references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 120s full suite / < 20s focused tests.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-05-15
