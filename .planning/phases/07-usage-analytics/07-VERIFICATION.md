---
phase: 07-usage-analytics
verified: 2026-05-15T12:44:07Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Usage page visual and interaction smoke"
    expected: "Usage appears immediately below History, loads without layout overlap, shows metric tiles, ECharts charts, filters, audit table, empty/error states, and localized copy cleanly."
    why_human: "Visual layout, chart rendering quality, and Electron interaction polish require app-level inspection."
  - test: "Real local transcript scan"
    expected: "A real Claude Code and Codex transcript scan populates token rows, excludes prompt/response/tool content, and shows Claude/Codex totals and model/project/agent breakdowns."
    why_human: "Local vendor transcript availability and format drift cannot be fully proven from fixtures."
  - test: "Real pricing refresh"
    expected: "Opening Usage renders cached values first, refreshes LiteLLM pricing when network is available, recomputes estimates, and shows unknown cost when pricing is unavailable."
    why_human: "External network behavior and live pricing source availability require environment verification."
---

# Phase 7: Usage Analytics Verification Report

**Phase Goal:** A dedicated Usage page, placed below History in navigation, shows Claude Code and Codex token usage and estimated cost from local transcripts, linked back to VibeTime's existing hook timeline for project/session/turn context.
**Verified:** 2026-05-15T12:44:07Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Claude Code and Codex local transcript scanners ingest token/model/timestamp/source identity idempotently without prompt/response/tool/transcript content persistence. | VERIFIED | `scanClaudeUsageTranscripts`, `scanCodexUsageTranscripts`, `UNIQUE(agent, source_file_key, source_row_key)`, privacy tests and no-content static scan. |
| 2 | Usage schema has idempotent records, scan state, pricing cache, and no raw content columns. | VERIFIED | `DDL_USAGE_RECORDS`, `DDL_USAGE_SCAN_STATE`, `DDL_USAGE_PRICING_CACHE`; `privacy.test.ts` and `contracts.test.ts`. |
| 3 | Codex scanner extracts `token_count` usage with cached input, output, reasoning, model, timestamp, turn/session, and cumulative delta handling. | VERIFIED | `codex-scanner.ts`; `codex-scanner.test.ts` covers last usage, cumulative deltas, cache, reasoning, malformed rows, duplicate keys. |
| 4 | Claude scanner extracts assistant `message.usage` with cache creation/read tokens, output tokens, model, sidechain metadata, and duplicate protection. | VERIFIED | `claude-scanner.ts`; `claude-scanner.test.ts` covers assistant usage, cache read/create, optional fields, dedupe, privacy canary. |
| 5 | Estimated cost comes from token facts plus refreshable LiteLLM pricing cache; unknown prices remain visible as unknown, not `$0.00`. | VERIFIED | `pricing.ts`, `refreshPricingCache`, `queryUsageSummary`; pricing tests cover unknown/partial pricing and cache freshness. |
| 6 | Usage rows link back to hook timeline by turn id, session/time window, project/time window, and preserve unmatched rows. | VERIFIED | `reconcileUsageWithHookEvents`; `usage-service.ts` reads `events` and `open_turns`, persists attribution fields, and reattributes existing unmatched rows. |
| 7 | Aggregates include Claude Code and Codex only and produce daily, agent, model, project, token, unknown-cost, and unassigned audit summaries. | VERIFIED | `buildUsageSummary`; aggregate tests filter Cursor/Gemini and verify project/model/agent/audit rows. |
| 8 | Required data-capability-to-visualization mapping exists before final chart choices. | VERIFIED | `07-USAGE-MAPPING.md` covers project spend, model per turn, efficiency, cache hit rate, cost/time, time per model, daily/weekly/monthly trends, and project/model/agent aggregation. |
| 9 | Main process performs incremental background scanning and pricing refresh outside the hook hot path, with default `30m` cadence. | VERIFIED | `usage-service.ts` discovers Claude/Codex roots, uses `usage_scan_state`, starts timers from `main/index.ts`, and hook config default is `30m`. |
| 10 | Renderer accesses Usage only through typed IPC, and IPC validates period/filter/settings args. | VERIFIED | `ipc-types.ts`, `preload/index.ts`, `ipc-handlers.ts`; IPC tests reject invalid usage args and preferences. |
| 11 | Dedicated `/usage` route and sidebar item appear immediately after History and before Settings. | VERIFIED | `App.tsx` includes `/usage` and last-view persistence; `Sidebar.tsx` order is Today, Live, History, Usage, Settings. |
| 12 | Usage UI renders totals, nullable cost, filters, pricing/cache states, ECharts daily/token charts, breakdown table, and audit rows. | VERIFIED | `Usage.tsx` uses ECharts, cache-first store calls, metric tiles, filters, breakdown table, audit panel, and unknown-cost formatting. |
| 13 | No `vibetime usage` CLI, usage export, Cursor/Gemini usage scanners, or Usage legends/filters were added. | VERIFIED | `rg "vibetime usage|usage export|exportUsage" packages` found no matches; scanner registry and Usage filters contain only `claude-code` and `codex`. |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/core/src/usage/types.ts` | Usage contracts | VERIFIED | Agents, refresh frequencies, token facts, pricing, attribution, summaries, and sanitization exist. |
| `packages/core/src/schema.ts` | Usage DDL | VERIFIED | Usage records, scan state, pricing cache, and indices exist. Directory artifact verifier falsely flagged `__fixtures__/`; manual check confirms six fixture files exist. |
| `packages/core/src/usage/codex-scanner.ts` | Codex scanner | VERIFIED | Pure JSONL scanner returns sanitized `UsageRecordFact[]`. |
| `packages/core/src/usage/claude-scanner.ts` | Claude scanner | VERIFIED | Pure JSONL scanner returns sanitized `UsageRecordFact[]`. |
| `packages/core/src/usage/pricing.ts` | Pricing normalization and cost estimate | VERIFIED | LiteLLM normalization, lookup, cost estimate, and cache status implemented. |
| `packages/core/src/usage/reconcile.ts` | Hook attribution | VERIFIED | Turn/session/project fallback and unmatched behavior implemented. |
| `packages/core/src/usage/aggregate.ts` | Summary builder | VERIFIED | Daily, agent, model, project, token, audit, and filter summaries implemented. |
| `packages/desktop/src/main/usage-service.ts` | Main usage service | VERIFIED | Discovery, scan-state, storage, attribution, pricing refresh, summaries, and background timers implemented. |
| `packages/desktop/src/main/db.ts` | Desktop schema initialization | VERIFIED | Executes usage DDL with `IF NOT EXISTS`. |
| `packages/desktop/src/shared/ipc-types.ts` | Typed Usage IPC | VERIFIED | `getUsageSummary`, `refreshUsage`, filters, and preferences defined. |
| `packages/desktop/src/preload/index.ts` | Renderer allowlist | VERIFIED | Usage IPC channels are allowlisted. |
| `packages/desktop/src/main/ipc-handlers.ts` | IPC handlers | VERIFIED | Usage handlers validate args, call service, and reschedule frequency on preference save. |
| `packages/hook/src/config.ts` | Persisted refresh frequency | VERIFIED | `app.usage_refresh_frequency` defaults to `30m` and validates `15m/30m/1h/4h`. |
| `packages/desktop/src/renderer/src/views/Usage.tsx` | Dedicated Usage dashboard | VERIFIED | Route UI, cache-first refresh, charts, filters, tables, audit, empty/error states. |
| `packages/desktop/src/renderer/src/store.ts` | Usage renderer cache | VERIFIED | Summary cache, refresh action, active query, and push refresh implemented. |
| `packages/desktop/src/renderer/src/App.tsx` | Route wiring | VERIFIED | `/usage` route and last-view persistence. |
| `packages/desktop/src/renderer/src/components/Sidebar.tsx` | Nav wiring | VERIFIED | Usage item after History. |
| `packages/desktop/src/renderer/src/views/Settings.tsx` | Settings control | VERIFIED | Usage refresh frequency select with exact allowed values. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Core schema | Desktop DB | DDL constants imported and executed | WIRED | `db.ts` imports and initializes all `DDL_USAGE_*` constants. |
| Core scanners | Usage types | `UsageRecordFact[]` contracts | WIRED | Scanner modules return Claude/Codex facts only. |
| Scanners/pricing/reconcile/aggregate | Desktop usage service | Main-process orchestration | WIRED | `usage-service.ts` imports all core usage modules. |
| Usage service | Hook timeline DB | `events`/`open_turns` reads and attribution persistence | WIRED | `readHookUsageEvents`, `reconcileUsageWithHookEvents`, `upsertUsageRecords`. |
| Usage service | IPC handlers/preload | Typed `getUsageSummary` and `refreshUsage` | WIRED | IPC handlers validate and delegate; preload allowlists channels. |
| App startup/settings | Background refresh | `startUsageBackgroundRefresh` | WIRED | App starts from config; Settings save reschedules immediately. |
| Renderer Usage | Store/IPC | `refreshUsageSummary` and `runUsageRefresh` | WIRED | Usage page reads cached summary, triggers refresh, then re-reads on success. |
| Mapping artifact | Renderer charts | Approved inventory | WIRED | UI implements metric tiles, daily trend, token breakdown, breakdown table, and audit table from mapping. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `Usage.tsx` | `summary` | `usageSummariesAtom` via `refreshUsageSummary(args)` | Yes | VERIFIED |
| `store.ts` | `UsageSummary` cache | `window.api.invoke('getUsageSummary', args)` | Yes | VERIFIED |
| `ipc-handlers.ts` | IPC result | `queryUsageSummary(args)` | Yes | VERIFIED |
| `usage-service.ts` | `records` | `usage_records` rows plus `usage_pricing_cache` | Yes | VERIFIED |
| `usage-service.ts` | scanned records | Claude/Codex JSONL files under configured roots | Yes, when local transcripts exist | VERIFIED with fixtures; human real-transcript smoke needed |
| `usage-service.ts` | pricing entries | LiteLLM public pricing URL and local cache | Yes, when network/cache available | VERIFIED with tests; human live network smoke needed |
| `reconcile.ts` | attribution | `events` and `open_turns` timeline rows | Yes | VERIFIED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Core usage scanners/pricing/reconcile/aggregate work | `rtk pnpm --filter @vibetime/core test -- src/usage` | 7 files, 34 tests passed | PASS |
| Desktop service, IPC, store work | `rtk pnpm --filter @vibetime/desktop test -- src/main/usage-service.test.ts src/renderer/src/usage-store.test.ts src/main/ipc-handlers.test.ts` | 3 files, 22 tests passed | PASS |
| Hook config supports refresh frequency | `rtk pnpm --filter @vibetime/hook test -- src/config.test.ts` | Hook suite passed; config tests included refresh frequencies | PASS |
| Desktop TypeScript compiles | `rtk pnpm --filter @vibetime/desktop typecheck` | No TypeScript errors | PASS |
| Full repository CI passes | `rtk pnpm run ci` | typecheck, lint, core/desktop Vitest, hook Bun tests, dependency rules, core-zero-deps passed | PASS |
| No usage CLI/export surface | `rtk rg -n "vibetime usage|usage export|exportUsage" packages` | No matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| TOK-01 | 07-02, 07-03, 07-04 | Track per-turn token usage when agent payload exposes it | SATISFIED | Scanner facts include session/turn fields; reconciler links to hook turns. |
| TOK-02 | 07-03, 07-04, 07-06 | Per-project / per-agent token aggregation | SATISFIED | Usage summary has `byProject`, `byAgent`, filters, and UI tables per Phase 07 scope. |
| USAGE-01 | all plans | Parse Claude Code and Codex only; exclude Cursor/Gemini | SATISFIED | `USAGE_AGENTS`, scanner registry, aggregate filtering, Usage filters. |
| USAGE-02 | 07-01, 07-04 | Store token facts idempotently with source identity and no content | SATISFIED | Unique source identity, sanitized meta, no content columns, privacy tests. |
| USAGE-03 | 07-02 | Extract Codex usage with cached/output/reasoning/delta | SATISFIED | `codex-scanner.ts` and tests. |
| USAGE-04 | 07-02 | Extract Claude assistant `message.usage` with cache and dedupe | SATISFIED | `claude-scanner.ts` and tests. |
| USAGE-05 | 07-03, 07-04, 07-05, 07-06 | Estimate cost from token facts plus refreshable public pricing cache | SATISFIED | `pricing.ts`, LiteLLM refresh, pricing cache, cache-first Usage flow. |
| USAGE-06 | 07-03, 07-06 | Produce mapping before final chart choices | SATISFIED | `07-USAGE-MAPPING.md` exists and UI charts match approved inventory. |
| USAGE-07 | 07-03, 07-05, 07-06 | Dedicated Usage page with totals, cost, breakdowns | SATISFIED | `/usage` route, sidebar position, ECharts dashboard, tables, filters. |
| USAGE-08 | 07-05, 07-06 | Do not add usage CLI/export in MVP | SATISFIED | No CLI/export matches; existing CLI command set excludes usage. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| None | - | - | - | Static scan found no blocking TODO/stub/placeholder patterns in Phase 07 implementation files. |

### Human Verification Required

### 1. Usage Page Visual And Interaction Smoke

**Test:** Launch the Electron app, open Usage, change period/agent/project/model filters, trigger Refresh Usage, and inspect empty/error/audit states if possible.
**Expected:** Usage is immediately below History, uses the History-like dashboard layout, has no overlapping text/charts, and keeps stale cached data visible during refresh.
**Why human:** Visual layout, chart rendering quality, and Electron interaction polish are not fully provable by static tests.

### 2. Real Local Transcript Scan

**Test:** On a machine with recent Claude Code and Codex transcripts, open Usage and trigger refresh.
**Expected:** Claude Code and Codex token rows appear with totals, model/project/agent breakdowns, no prompt/response/tool content persisted, and unmatched rows visible in audit.
**Why human:** Fixture tests prove parser behavior, but local vendor transcript formats and availability can vary.

### 3. Real Pricing Refresh

**Test:** Open Usage with network available, then repeat with network disabled and an existing cache.
**Expected:** Cached pricing renders first; online refresh updates estimates; offline with cache keeps cached estimates; missing prices show Unknown while tokens remain visible.
**Why human:** Live public pricing source and network behavior are external to deterministic tests.

### Gaps Summary

No automated blocker gaps found. The phase goal is implemented in code and covered by focused tests plus full CI. Status is `human_needed` only because visual/user-flow and live external/local-environment behavior require human confirmation.

---

_Verified: 2026-05-15T12:44:07Z_
_Verifier: the agent (gsd-verifier)_
