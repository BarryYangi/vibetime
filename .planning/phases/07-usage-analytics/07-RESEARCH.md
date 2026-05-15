# Phase 07: Usage Analytics - Research

**Researched:** 2026-05-15 [VERIFIED: system current date]
**Domain:** Local-first Claude Code and Codex usage analytics, pricing cache, hook-linked desktop visualization [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]
**Confidence:** HIGH for VibeTime integration and validation architecture; MEDIUM for vendor transcript stability because Claude/Codex log formats are external and may change [VERIFIED: codebase grep; CITED: https://ccusage.com/guide/codex/]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Phase 07 adds a dedicated Usage page for Claude Code and Codex usage analytics, placed below History in navigation. It scans local Claude/Codex transcript sources for token facts, estimates cost from a refreshable pricing cache, and combines those usage facts with VibeTime's existing hook timeline so the product can explain cost, tokens, model usage, cache behavior, and time trends by project, model, turn, day, week, and month. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]

This phase does not add Cursor/Gemini usage, usage CLI/export, cloud account dashboards, or authenticated provider APIs. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]

- Usage is a dedicated page/module placed below History in navigation, not a tab nested inside History. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Usage may reuse History's visual language, dashboard layout patterns, and period selector conventions. It should not be implemented as the same page or a subordinate History mode. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Usage scanning should stay current in the background after app launch, not only when the user opens the Usage page. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- The app should support a Settings control for usage refresh frequency. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Scanning must be incremental; study CodexBar and ccusage patterns for scan state, file mtime/size tracking, row keys, and backfill behavior before final table design. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Hook invocations remain lightweight. Background usage scanning must not run inside the hook hot path. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Use one pricing source in MVP: follow the pricing source used by ccusage. Do not build a multi-source pricing resolver in Phase 07. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Keep a local pricing cache. If the app can refresh pricing, update the cache and recompute displayed historical estimates. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- If pricing refresh fails but cache exists, continue using cache. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- If pricing refresh fails and no usable cache exists for a model, show a clear network/pricing failure state on the Usage page and keep token metrics visible. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- A small embedded fallback snapshot is acceptable as the initial cache/fallback if it simplifies first-run behavior. Cost must remain derived from token facts and pricing, not immutable source data. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- The required `data capability -> hook linkage -> user value -> visualization` mapping must explicitly analyze project spend, model per turn, model efficiency, cache hit rate, cost/time relationship, time spent per model, daily/weekly/monthly trends for cost/token/time, and aggregation by project/model/agent. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Final chart choices follow proven scanner fields; do not design a fake dashboard before available data is known. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]

### the agent's Discretion

- Pick exact usage table/index structure after studying CodexBar and ccusage implementation details. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Pick the default background refresh interval and settings labels, provided the setting exists and scanning is incremental. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Pick final ECharts chart types after producing the data capability / hook linkage / user value / visualization mapping. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Decide whether the first implementation computes estimated cost on read or materializes derived cost caches, as long as historical costs update after pricing refresh. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

- Cursor usage/cost support. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Gemini CLI usage/cost support. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Usage CLI/export. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Cloud/provider authenticated usage dashboards. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- Multi-source pricing resolver beyond the ccusage-aligned source. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOK-01 | Track per-turn token usage when agent payload or local transcript exposes it. [VERIFIED: .planning/REQUIREMENTS.md] | Scanner rows must link to VibeTime turn windows by native turn id first, then session/time window fallback. [VERIFIED: packages/core/src/history.ts; VERIFIED: packages/desktop/src/main/db.ts] |
| TOK-02 | Per-project / per-agent token aggregation in History/Usage-style analytics. [VERIFIED: .planning/REQUIREMENTS.md] | Usage summaries should mirror History's period and aggregation style while living on `/usage`. [VERIFIED: packages/core/src/history.ts; VERIFIED: packages/desktop/src/renderer/src/views/History.tsx] |
| USAGE-01 | Parse Claude Code and Codex local transcript usage only; Cursor and Gemini excluded from MVP totals. [VERIFIED: .planning/REQUIREMENTS.md] | Scanner registry and aggregations must whitelist `claude-code` and `codex`. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| USAGE-02 | Store usage token facts idempotently with source identity and no prompt/response/tool content. [VERIFIED: .planning/REQUIREMENTS.md] | Use `(agent, source_file_key, source_row_key)` uniqueness and privacy canary tests. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| USAGE-03 | Extract Codex `token_count`/model context records, cached input, output, reasoning, and token deltas. [VERIFIED: .planning/REQUIREMENTS.md] | Prefer `last_token_usage`; otherwise delta cumulative totals; do not double-charge reasoning tokens. [CITED: https://ccusage.com/guide/codex/] |
| USAGE-04 | Extract Claude assistant `message.usage` rows with cache creation/read, output, model, and duplicate protection. [VERIFIED: .planning/REQUIREMENTS.md] | Deduplicate by session/message/request identity and keep sidechain metadata without content. [VERIFIED: baseline 07-RESEARCH.md; CITED: https://ccusage.com/guide/cost-modes] |
| USAGE-05 | Estimate cost from token facts plus refreshable public pricing cache. [VERIFIED: .planning/REQUIREMENTS.md] | Render cache first, refresh pricing on open, recompute estimates, show unknown where price missing. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| USAGE-06 | Produce data capability -> hook linkage -> user value -> visualization mapping before final chart choices. [VERIFIED: .planning/REQUIREMENTS.md] | Planner must create this artifact before UI chart implementation tasks. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md] |
| USAGE-07 | Add dedicated Usage page below History, showing Claude/Codex totals, cost where known, and breakdowns. [VERIFIED: .planning/REQUIREMENTS.md] | Add `/usage`, sidebar item after History, typed IPC, coss/ECharts UI. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |
| USAGE-08 | Do not add usage CLI/export in MVP. [VERIFIED: .planning/REQUIREMENTS.md] | Validation must include a negative check that no `vibetime usage` command or usage export surface appears. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
</phase_requirements>

## Summary

Usage Analytics should be planned as a desktop/main-process background data pipeline plus a renderer dashboard, not as hook-path work. VibeTime already owns project/session/turn/time facts in SQLite `events` and `open_turns`; Phase 07 should add read-only local scanners for Claude Code and Codex transcripts, persist only token/model/timestamp/source identity facts, reconcile rows to existing hook turns, and expose cache-first summaries through typed IPC. [VERIFIED: packages/core/src/schema.ts; VERIFIED: packages/desktop/src/main/db.ts; VERIFIED: packages/hook/src/store.ts]

The main planning risk is not charting; it is proving data capability without violating privacy or creating false cost precision. Claude/Codex token rows are mature enough for MVP, but price is an estimate, pricing may be unavailable for unknown models, and some rows will be unassigned or lower-confidence. [CITED: https://ccusage.com/guide/cost-modes; CITED: https://ccusage.com/guide/codex/; VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**Primary recommendation:** Plan Phase 07 as five deliverables: usage schema + fixtures, Claude/Codex scanners, pricing cache + cost estimator, hook-link reconciler + mapping artifact, and dedicated Usage UI + Settings cadence; gate each with Vitest tests that prove idempotency, pricing fallback, Cursor/Gemini exclusion, and no-content persistence. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md; VERIFIED: vitest.config.ts]

## Project Constraints (from AGENTS.md)

No `AGENTS.md` file exists at repo root in this workspace, but the user provided equivalent per-project instructions in the prompt. [VERIFIED: `sed -n '1,200p' AGENTS.md` failed; VERIFIED: user prompt]

- Prefer `rtk` wrappers for shell commands where applicable, such as `rtk git status`, `rtk pnpm test`, and `rtk grep`. [VERIFIED: user prompt; VERIFIED: `rtk --version` -> 0.39.0]
- Use first-principles reasoning; if motivation or goal is unclear, stop and discuss; if the path is not shortest, say so and propose a better one. [VERIFIED: user prompt]
- Output should be concise Chinese when speaking to the user. [VERIFIED: user prompt]
- Project UI work should follow local coss rules and only use coss APIs verified against docs/particles when adding new primitives. [VERIFIED: .agents/skills/coss/SKILL.md; VERIFIED: .agents/skills/coss-particles/SKILL.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Claude transcript scanning | API / Backend (Electron main/core service) | Database / Storage | Renderer must not read files or SQLite; scanners need filesystem and local DB access. [VERIFIED: packages/desktop/src/shared/ipc-types.ts; VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Codex transcript scanning | API / Backend (Electron main/core service) | Database / Storage | Existing Codex transcript recovery is main/hook-side, and scanner should stay outside hook hot path. [VERIFIED: packages/desktop/src/main/codex-transcript.ts; VERIFIED: packages/hook/src/recovery.ts] |
| Usage fact storage | Database / Storage | API / Backend | Token facts, scan state, pricing cache, and derived estimates belong in local SQLite. [VERIFIED: packages/core/src/schema.ts; VERIFIED: packages/desktop/src/main/db.ts] |
| Pricing refresh/cache | API / Backend (Electron main) | Database / Storage | Existing network state pattern lives in main process and pushes state changes to renderer. [VERIFIED: packages/desktop/src/main/updater.ts] |
| Hook linkage/reconciliation | API / Backend (Electron main/core service) | Database / Storage | Reconciliation joins scanner facts to VibeTime `events`/`open_turns`; page reads should remain pure. [VERIFIED: packages/desktop/src/main/db.ts] |
| Usage UI/dashboard | Browser / Client (renderer) | API / Backend via IPC | Renderer renders cached IPC summaries with coss/ECharts and no direct SQLite/filesystem access. [VERIFIED: packages/desktop/src/renderer/src/App.tsx; VERIFIED: packages/desktop/src/shared/ipc-types.ts] |
| Settings refresh frequency | Browser / Client for control | API / Backend for timer config | Settings presents coss `Select`; main process owns background scan cadence. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md; VERIFIED: packages/hook/src/config.ts] |
| Privacy enforcement | Database / Storage | API / Backend | Persistence schema and parser outputs must exclude prompt/response/tool fields before data reaches SQLite. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.3 installed | Shared typed scanner, IPC, aggregation, and renderer contracts. [VERIFIED: pnpm list; VERIFIED: package.json] | Existing monorepo standard; no new language/runtime needed. [VERIFIED: package.json] |
| Vitest | 3.2.4 installed; latest npm was 4.1.6 during refresh | Unit/integration tests for parsers, pricing, aggregation, store, and renderer store. [VERIFIED: pnpm list; VERIFIED: npm registry; CITED: /vitest-dev/vitest/v3_2_4] | Existing core/desktop test framework; supports file/name filtering and mocking. [VERIFIED: vitest.config.ts; CITED: /vitest-dev/vitest/v3_2_4] |
| better-sqlite3 | 12.9.0 installed; latest npm was 12.10.0 during refresh | Main-process local SQLite reads/writes for usage tables and pricing cache. [VERIFIED: pnpm list; VERIFIED: npm registry] | Existing desktop DB dependency and query pattern. [VERIFIED: packages/desktop/src/main/db.ts] |
| Bun test / bun:sqlite | Bun 1.3.8 available | Hook package tests and hook storage remain available, but usage scanner should not execute in hook path. [VERIFIED: bun --version; VERIFIED: packages/hook/package.json] | Existing hook package test/runtime standard. [VERIFIED: packages/hook/src/store.ts] |
| React + Jotai + typed IPC | React 19.2.5 and Jotai 2.19.1 installed | Usage renderer state cache, refresh sequencing, and route UI. [VERIFIED: pnpm list; VERIFIED: packages/desktop/src/renderer/src/store.ts] | Existing renderer pattern already protects against stale async updates. [VERIFIED: packages/desktop/src/renderer/src/store.test.ts] |
| ECharts | 6.0.0 installed | Usage charts selected after mapping artifact. [VERIFIED: pnpm list; VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] | Existing History visualization convention. [VERIFIED: packages/desktop/src/renderer/src/views/History.tsx] |
| coss/Base UI components | @base-ui/react 1.4.1 installed | Usage controls, settings select, tables, switches, tabs. [VERIFIED: pnpm list; VERIFIED: .agents/skills/coss/SKILL.md] | UI-SPEC requires installed local coss components first. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |

### Supporting

| Library / Source | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| LiteLLM pricing dataset via ccusage-aligned source | external refreshable data | Pricing cache source for estimated cost. [CITED: https://ccusage.com/guide/cost-modes; CITED: https://ccusage.com/guide/codex/] | Refresh on Usage page open and background/manual refresh; use cached/fallback data if network fails. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md] |
| Claude Code local JSONL transcripts | external local files | Claude assistant `message.usage` scanner source. [CITED: https://ccusage.com/guide/cost-modes] | Read-only background scan; never persist message content. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Codex local session JSONL | external local files | Codex `token_count` and model context scanner source. [CITED: https://ccusage.com/guide/codex/] | Read-only background scan under `CODEX_HOME`/`~/.codex`. [CITED: https://ccusage.com/guide/codex/] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local transcript scanners | Provider cloud usage APIs | Out of scope because Phase 07 is local-first and excludes authenticated provider APIs. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| SQLite pricing cache | Live pricing request per render | Violates cache-first UX and makes page rendering dependent on network. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md] |
| Typed IPC summaries | Renderer SQLite/filesystem access | Contradicts project IPC rule and Electron boundary. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/desktop/src/shared/ipc-types.ts] |
| Usage CLI/export | `vibetime usage` command | Explicitly deferred from MVP. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |

**Installation:** No new package is required for the planned MVP unless implementation discovers a parser/test fixture need that cannot be met with standard Node APIs. [VERIFIED: package.json; VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**Version verification commands run:**

```bash
pnpm --filter @vibetime/desktop list --depth 0 --json
pnpm --filter @vibetime/core list --depth 0 --json
npm view vitest version
npm view better-sqlite3 version
npm view echarts version
npm view jotai version
```

## Architecture Patterns

### System Architecture Diagram

```text
Claude/Codex local JSONL files
  -> read-only background scanners
  -> normalized usage facts + scan state
  -> SQLite usage_records / usage_scan_state
  -> hook-link reconciler joins events/open_turns
  -> pricing cache refresh + cost estimator
  -> typed IPC Usage summary
  -> renderer Usage page with coss controls + ECharts
```

This pipeline keeps filesystem/network/SQLite work out of the renderer and hook hot path. [VERIFIED: packages/desktop/src/main/db.ts; VERIFIED: packages/hook/src/hook.ts; VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

### Recommended Project Structure

```text
packages/core/src/usage/
  types.ts              # normalized usage records, token fields, pricing types
  codex-scanner.ts      # pure JSONL parser + delta logic
  claude-scanner.ts     # pure JSONL parser + dedupe logic
  pricing.ts            # cache shape + cost estimator
  aggregate.ts          # period/project/model/agent summaries
  reconcile.ts          # usage row -> hook turn attribution
  privacy.test.ts       # content canary and allowed-key tests

packages/desktop/src/main/
  usage-service.ts      # scan loop, pricing refresh, DB writes, IPC query orchestration

packages/desktop/src/renderer/src/views/
  Usage.tsx             # dedicated route, no direct SQLite/filesystem
```

This structure preserves `core` as dependency-light logic and keeps Electron-specific DB/network orchestration in desktop main. [VERIFIED: package.json; VERIFIED: packages/core/package.json; VERIFIED: packages/desktop/src/main/db.ts]

### Pattern 1: Parser Returns Facts, Not Transcript Content

**What:** Provider parsers should emit normalized token facts plus source identity and drop all prompt/assistant/tool content before persistence. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**When to use:** All Claude and Codex scanner paths. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**Example:**

```typescript
// Source: packages/core/src/codex-transcript.ts pattern + Phase 07 privacy constraint
for (const line of jsonl.split('\n')) {
  if (!line.trim()) continue
  const record = JSON.parse(line) as unknown
  const usage = extractUsageOnly(record)
  if (!usage) continue
  rows.push({
    sourceRowKey: usage.sourceRowKey,
    model: usage.model ?? null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    // No prompt, response, content, tool arguments, or raw transcript line.
  })
}
```

### Pattern 2: Cache-First Then Refresh

**What:** Usage page reads cached DB/pricing summary first, then asks main process to refresh pricing and scanning, preserving stale visible data until success/failure resolves. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md; VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]

**When to use:** Usage initial render, manual `Refresh Usage`, and background scanner push updates. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]

**Example:**

```typescript
// Source: packages/desktop/src/renderer/src/store.ts refresh sequencing pattern
const seq = ++usageRefreshSeq
const result = await window.api.invoke('getUsageSummary', { periodDays })
if (seq !== usageRefreshSeq) return null
if (result.ok) store.set(usageSummaryAtom, result.data)
```

### Anti-Patterns to Avoid

- **Scanning in hooks:** Hook invocations must stay fast, silent, and no-op-safe; scanner I/O belongs in desktop background logic. [VERIFIED: packages/hook/src/store.ts; VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
- **Persisting raw transcript JSON:** Raw JSONL can contain prompts, assistant responses, tool arguments, paths, and summaries; persist only facts and sanitized source identity. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md; CITED: https://code.claude.com/docs/en/hooks]
- **Treating estimated cost as billing truth:** ccusage itself distinguishes calculated vs displayed costs and pricing-source behavior; VibeTime should label cost as estimated. [CITED: https://ccusage.com/guide/cost-modes]
- **Synthetic dashboard data:** UI-SPEC requires unsupported charts to render unavailable states, not invented data. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart engine | Custom SVG/canvas chart renderer | Existing ECharts | UI-SPEC and History already standardize on ECharts. [VERIFIED: packages/desktop/src/renderer/src/views/History.tsx] |
| UI primitives | New unvetted controls | Existing installed coss components | Project coss skill requires verified primitives and UI-SPEC restricts new registry blocks. [VERIFIED: .agents/skills/coss/SKILL.md; VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |
| Pricing database | Hand-maintained multi-source resolver | ccusage-aligned LiteLLM pricing cache | Locked decision says one pricing source; ccusage documents LiteLLM pricing use. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md; CITED: https://ccusage.com/guide/cost-modes] |
| SQLite access layer in renderer | Direct DB/file access | Existing typed IPC | IPC-01 forbids renderer SQLite access. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/desktop/src/shared/ipc-types.ts] |
| Transcript row dedupe | Ad hoc append-only inserts | Unique source identity + scan state | Duplicate transcript rows are explicit acceptance/negative cases. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |

**Key insight:** This phase should hand-roll only the domain-specific normalization/reconciliation logic; storage, IPC, tests, charting, and UI controls should follow existing VibeTime standards. [VERIFIED: codebase grep; VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

## Common Pitfalls

### Pitfall 1: Prompt/Response Content Leaks Into SQLite

**What goes wrong:** Parser convenience stores raw JSON, `message`, `content`, `tool_calls`, `last_assistant_message`, or transcript lines in `meta`. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md; CITED: https://code.claude.com/docs/en/hooks]

**Why it happens:** Claude hook/transcript fields can include `last_assistant_message`, transcript paths, subagent transcript paths, and rich conversation rows. [CITED: https://code.claude.com/docs/en/hooks]

**How to avoid:** Define an allowlist serializer for persisted usage fields and test fixture canaries with unique secret strings. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**Warning signs:** Any SQL column or JSON `meta` key named `content`, `prompt`, `response`, `message`, `tool`, `arguments`, `raw`, or `transcript_line`. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

### Pitfall 2: Double Counting Codex Totals

**What goes wrong:** Codex cumulative `total_token_usage` rows get stored as per-turn deltas, inflating totals. [CITED: https://ccusage.com/guide/codex/]

**Why it happens:** Some Codex rows report cumulative token totals, while `last_token_usage` already represents a delta. [CITED: https://ccusage.com/guide/codex/]

**How to avoid:** Prefer `last_token_usage`; otherwise subtract previous cumulative totals per session/model stream. [CITED: https://ccusage.com/guide/codex/]

**Warning signs:** Re-scanning or later rows cause monotonically growing daily totals for the same session. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

### Pitfall 3: Pricing Failure Hides Token Data

**What goes wrong:** UI treats missing prices as total query failure and hides useful token metrics. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**Why it happens:** Cost estimation gets coupled too tightly to aggregation. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**How to avoid:** Store token facts separately from nullable estimated cost and return `pricingStatus`/`unknownCostRows` in IPC. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**Warning signs:** Unknown model price produces `$0.00`, empty charts, or a whole-page error. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]

### Pitfall 4: Cursor/Gemini Sneak Into Totals

**What goes wrong:** Existing agent lists include all four agents, so naive grouping can include Cursor/Gemini in Usage filters or totals. [VERIFIED: packages/desktop/src/main/db.ts; VERIFIED: packages/desktop/src/main/ipc-handlers.ts]

**Why it happens:** Current app supports four time-tracking agents, but Phase 07 usage/cost scope is Claude/Codex only. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

**How to avoid:** Whitelist usage scanner agents, usage rows, filters, legends, summaries, and tests to `claude-code` and `codex`. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]

**Warning signs:** Usage UI strings, filter options, chart legends, or SQL totals mention Cursor/Gemini. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]

## Code Examples

### Idempotent Usage Storage

```sql
-- Source: Phase 07 SPEC + existing schema/index style
CREATE TABLE IF NOT EXISTS usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  agent TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_file_key TEXT NOT NULL,
  source_row_key TEXT NOT NULL,
  session_id TEXT,
  turn_id TEXT,
  project TEXT,
  usage_ts REAL NOT NULL,
  timezone TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,
  pricing_source TEXT,
  pricing_version TEXT,
  attribution_method TEXT NOT NULL,
  attribution_confidence TEXT NOT NULL,
  meta TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_unique_source
ON usage_records(agent, source_file_key, source_row_key);
```

### Pricing Unknown Is Nullable, Not Zero

```typescript
// Source: Phase 07 SPEC + OpenAI/Anthropic pricing docs
if (!price) {
  return { estimatedCostUsd: null, reason: 'unknown_model_price' as const }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude-only local cost reports | Claude plus Codex local transcript usage tools | Codex support documented by ccusage beta docs after Codex token events became available. [CITED: https://ccusage.com/guide/codex/] | VibeTime can support Claude/Codex MVP and defer Cursor/Gemini. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Cumulative Codex totals as final facts | Delta extraction from `last_token_usage` or previous totals | ccusage Codex docs describe cumulative token_count conversion. [CITED: https://ccusage.com/guide/codex/] | Tests must cover delta fallback to avoid double count. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Static cost numbers | Refreshable pricing cache with cached/offline fallback | ccusage documents LiteLLM pricing and offline/cache options. [CITED: https://ccusage.com/guide/cost-modes; CITED: https://ccusage.com/guide/codex/session] | Usage must render cached first, then refresh on open. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md] |

**Deprecated/outdated:** The old baseline research recommendation "online pricing refresh out of MVP" is superseded by locked CONTEXT/SPEC decisions requiring refresh on Usage open with cache-first rendering. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md; VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 for `core` and `desktop`; Bun test for `hook` package. [VERIFIED: package.json; VERIFIED: packages/hook/package.json] |
| Config file | `vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/desktop/vitest.config.ts`, `packages/hook/vitest.config.ts`. [VERIFIED: rg --files packages] |
| Quick run command | `rtk pnpm --filter @vibetime/core test -- src/usage` for parser/aggregator work; `rtk pnpm --filter @vibetime/desktop test -- src/main/usage src/renderer/src/store.test.ts` for main/store work. [VERIFIED: package.json; CITED: /vitest-dev/vitest/v3_2_4] |
| Full suite command | `rtk pnpm run ci`. [VERIFIED: package.json] |

Vitest supports running a specific file by passing the file path and supports mocking helpers such as `vi.mocked`; use those patterns for focused usage tests and pricing fetch mocks. [CITED: /vitest-dev/vitest/v3_2_4]

### Fixtures To Create

| Fixture | Location | Purpose | Must Include |
|---------|----------|---------|--------------|
| Codex token_count JSONL | `packages/core/src/usage/__fixtures__/codex-token-count.jsonl` | Unit-test Codex scanner. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | `last_token_usage`, cumulative `total_token_usage`, cached input, output, reasoning, `turn_context`, unknown model, malformed line, duplicate row. [CITED: https://ccusage.com/guide/codex/] |
| Codex duplicate/backfill JSONL | `packages/core/src/usage/__fixtures__/codex-duplicate-session.jsonl` | Idempotency and scan-state tests. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Same source row scanned twice; later file append; missing timestamp; missing turn context. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Claude assistant usage JSONL | `packages/core/src/usage/__fixtures__/claude-assistant-usage.jsonl` | Unit-test Claude scanner. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | `sessionId`, `requestId`, `message.id`, `message.model`, `message.usage.input_tokens`, output, cache creation/read, `isSidechain`, `agentId`. [VERIFIED: baseline 07-RESEARCH.md; CITED: https://ccusage.com/guide/cost-modes] |
| Claude privacy canary JSONL | `packages/core/src/usage/__fixtures__/claude-privacy-canary.jsonl` | Prove no prompt/response/tool text persists. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Unique strings such as `SECRET_PROMPT_CANARY`, `SECRET_RESPONSE_CANARY`, `SECRET_TOOL_ARG_CANARY` in non-usage fields. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Pricing cache JSON | `packages/core/src/usage/__fixtures__/pricing-cache.json` | Pricing estimator/cache tests. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Known Claude/OpenAI model prices, unknown model, cache metadata/version, stale cache timestamp. [CITED: https://ccusage.com/guide/cost-modes; CITED: https://developers.openai.com/api/docs/pricing] |
| Hook timeline rows | `packages/core/src/usage/__fixtures__/hook-events.ts` | Reconciler tests. [VERIFIED: packages/core/src/history.test.ts pattern] | Codex exact `turn_id`, Claude session/time-window rows, missing project, unassigned usage, mixed-model turn, Cursor/Gemini events excluded. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Renderer IPC summaries | inline factories in `packages/desktop/src/renderer/src/store.test.ts` or new `usage-store.test.ts` | UI store cache-first and push sequencing tests. [VERIFIED: packages/desktop/src/renderer/src/store.test.ts] | Cached summary, refresh success, refresh failure with cache, refresh failure without model price, stale refresh sequence. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |

### Unit / Integration / E2E / Manual Strategy

| Area | Unit | Integration | E2E / Manual | Acceptance Criteria |
|------|------|-------------|--------------|---------------------|
| Claude scanner | Parse only assistant usage rows; dedupe duplicate `sessionId + message.id + requestId`; extract cache creation/read/output/model. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Scan temp transcript root twice and assert one persisted row per source key. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Manual with copied sanitized local Claude JSONL optional; never use real raw content in repo. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Rows include token/model/timestamp/source identity and no prompt/response/tool content. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Codex scanner | Parse `token_count`, `last_token_usage`, cumulative delta fallback, cached input, output, reasoning, model context. [CITED: https://ccusage.com/guide/codex/] | Scan `sessions` + `archived_sessions` temp roots with unchanged and appended files. [CITED: https://ccusage.com/guide/codex/] | Manual with `CODEX_HOME` pointing to a temp fixture root. [VERIFIED: packages/desktop/src/main/codex-transcript.ts pattern] | Duplicate scans do not change totals; reasoning shown but not double-counted in cost. [CITED: https://ccusage.com/guide/codex/] |
| Pricing cache | Cost formula returns nullable cost for unknown model; cached input/read/write use provider-specific rates where known. [CITED: https://developers.openai.com/api/docs/pricing; CITED: https://platform.claude.com/docs/en/build-with-claude/prompt-caching] | Mock `fetch` success/failure; assert cache update, stale-cache fallback, and no-cache failure state. [VERIFIED: packages/desktop/src/main/updater.ts; CITED: /vitest-dev/vitest/v3_2_4] | Manual: disable network or stub invalid pricing URL; Usage still shows token totals. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Cache-first render; successful refresh recomputes historical estimates; failed refresh with no usable model price shows `Unknown`, not `$0.00`. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Aggregation | Build period/project/model/agent totals from normalized rows only for Claude/Codex. [VERIFIED: .planning/REQUIREMENTS.md] | Seed temp SQLite with usage rows and query summaries for 7/30/90/365 periods. [VERIFIED: packages/core/src/history.ts] | Manual: inspect Usage with fixture DB if executor adds a fixture runner. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] | Totals, breakdowns, audit counts, unknown price counts, and unassigned rows match fixtures. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Hook linkage | Match native turn id first; session/transcript/time window second; project/time fallback low confidence; unmatched preserved. [VERIFIED: baseline 07-RESEARCH.md; VERIFIED: packages/core/src/history.ts] | Seed `events` + usage rows and assert attribution method/confidence. [VERIFIED: packages/desktop/src/main/db.ts] | Manual: compare a recent known Codex turn with VibeTime History time window. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md] | Missing timestamp/project linkage does not drop row; row becomes unassigned or low-confidence audit item. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Usage UI | Store tests for cache-first, refresh sequencing, stale async protection, pricing states. [VERIFIED: packages/desktop/src/renderer/src/store.test.ts] | IPC contract test validates `getUsageSummary`, `refreshUsage`, and settings methods reject invalid args. [VERIFIED: packages/desktop/src/main/ipc-handlers.ts] | Manual Electron run: `/usage` below History, `Refresh Usage`, filters, empty/pricing failure states, no Cursor/Gemini legends. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] | Dedicated route renders token totals and known/unknown cost states; Cursor/Gemini absent. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Settings refresh frequency | Validate config values: 15m, 30m default, 1h, 4h; reject unsupported values. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] | Main-process timer test with fake timers asserts launch scan then cadence update. [VERIFIED: packages/desktop/src/main/db.ts timer pattern] | Manual: change setting, reopen app, confirm persisted label and next scan cadence in logs/status. [VERIFIED: packages/hook/src/config.ts] | Background scan starts after launch; hook invocation never scans/prices/aggregates. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md] |
| Privacy constraints | Canary tests assert serialized DB/meta JSON excludes forbidden strings and forbidden keys. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | Temp SQLite integration test dumps `usage_records` and `usage_scan_state` and searches for canaries. [VERIFIED: packages/hook/src/store.test.ts pattern] | Manual: `sqlite3 ~/.vibetime/data.db '.dump usage_records' | rg 'SECRET_|prompt|response|tool_args|content'` against test DB only. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] | No prompt, response, tool argument, raw content, or full transcript content is persisted. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |

### Negative Cases Required

| Case | Test |
|------|------|
| Unknown model pricing | Seed `model='unknown-future-model'`; assert tokens visible, `estimatedCostUsd === null`, UI says cost unknown. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Failed pricing fetch with cache | Mock fetch rejection with seeded cache; assert cached cost and `Using cached pricing`. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |
| Failed pricing fetch without usable cache | Mock fetch rejection and empty cache; assert token totals visible and pricing unavailable state. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Duplicate transcript rows | Re-scan identical fixtures and assert row count/totals unchanged by unique source key. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Missing timestamps | Parser returns skipped/error audit row or unassigned row; no crash and no fake timestamp. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Missing project linkage | Usage row remains visible as `Unassigned usage`; aggregation excludes it from project ranking but includes it in agent/model totals. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |
| Cursor/Gemini excluded | Seed Cursor/Gemini `events` and synthetic usage-like rows; scanner registry, summaries, filters, legends, and totals include only Claude/Codex. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| No usage CLI/export | `rg -n "usage" packages/hook/src packages/desktop/src/main packages -g '*.ts'` after implementation must not reveal new CLI/export command surface. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |

### Commands The Executor / Checker Should Run

```bash
# Focused parser + privacy checks
rtk pnpm --filter @vibetime/core test -- src/usage

# Focused desktop main/store checks
rtk pnpm --filter @vibetime/desktop test -- src/main/usage src/renderer/src/usage-store.test.ts

# Hook regression: proves no accidental hook hot-path breakage
rtk pnpm --filter @vibetime/hook test

# Whole repository gate
rtk pnpm run ci

# Static privacy scan after implementation
rtk rg -n "prompt|response|tool_args|arguments|content|rawTranscript|transcript_line" packages/core/src/usage packages/desktop/src/main/usage* packages/desktop/src/shared
```

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TOK-01 | Usage rows link to turns when possible. [VERIFIED: .planning/REQUIREMENTS.md] | unit/integration | `rtk pnpm --filter @vibetime/core test -- src/usage/reconcile.test.ts` | No - Wave 0 |
| TOK-02 | Project/agent token aggregation. [VERIFIED: .planning/REQUIREMENTS.md] | unit | `rtk pnpm --filter @vibetime/core test -- src/usage/aggregate.test.ts` | No - Wave 0 |
| USAGE-01 | Claude/Codex-only scope. [VERIFIED: .planning/REQUIREMENTS.md] | unit/integration/UI | `rtk pnpm --filter @vibetime/core test -- src/usage/aggregate.test.ts` | No - Wave 0 |
| USAGE-02 | Idempotent facts and no content persistence. [VERIFIED: .planning/REQUIREMENTS.md] | unit/integration | `rtk pnpm --filter @vibetime/core test -- src/usage/privacy.test.ts` | No - Wave 0 |
| USAGE-03 | Codex token extraction and deltas. [VERIFIED: .planning/REQUIREMENTS.md] | unit | `rtk pnpm --filter @vibetime/core test -- src/usage/codex-scanner.test.ts` | No - Wave 0 |
| USAGE-04 | Claude usage extraction and dedupe. [VERIFIED: .planning/REQUIREMENTS.md] | unit | `rtk pnpm --filter @vibetime/core test -- src/usage/claude-scanner.test.ts` | No - Wave 0 |
| USAGE-05 | Pricing cache, refresh, recompute, unknown price. [VERIFIED: .planning/REQUIREMENTS.md] | unit/integration | `rtk pnpm --filter @vibetime/core test -- src/usage/pricing.test.ts` and desktop usage-service test | No - Wave 0 |
| USAGE-06 | Mapping artifact exists before chart lock. [VERIFIED: .planning/REQUIREMENTS.md] | artifact/manual gate | `test -f .planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` | No - Wave 0 |
| USAGE-07 | Dedicated Usage page with totals/breakdowns. [VERIFIED: .planning/REQUIREMENTS.md] | renderer/manual | `rtk pnpm --filter @vibetime/desktop test -- src/renderer/src/usage-store.test.ts` | No - Wave 0 |
| USAGE-08 | No usage CLI/export. [VERIFIED: .planning/REQUIREMENTS.md] | static/manual | `rtk rg -n "vibetime usage|usage export|exportUsage" packages` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** Run the focused command for touched tier plus `rtk pnpm --filter @vibetime/core test -- src/usage` when scanner/pricing/aggregation changes. [VERIFIED: package.json]
- **Per wave merge:** Run `rtk pnpm run ci`. [VERIFIED: package.json]
- **Phase gate:** Full suite green, mapping artifact present, privacy canary tests green, and manual Usage UI smoke verified before `$gsd-verify-work`. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]

### Wave 0 Gaps

- [ ] `packages/core/src/usage/codex-scanner.test.ts` - covers USAGE-03. [VERIFIED: rg --files packages]
- [ ] `packages/core/src/usage/claude-scanner.test.ts` - covers USAGE-04. [VERIFIED: rg --files packages]
- [ ] `packages/core/src/usage/pricing.test.ts` - covers USAGE-05. [VERIFIED: rg --files packages]
- [ ] `packages/core/src/usage/reconcile.test.ts` - covers TOK-01/USAGE-06 inputs. [VERIFIED: rg --files packages]
- [ ] `packages/core/src/usage/aggregate.test.ts` - covers TOK-02/USAGE-01/USAGE-07. [VERIFIED: rg --files packages]
- [ ] `packages/core/src/usage/privacy.test.ts` - covers USAGE-02 privacy canaries. [VERIFIED: rg --files packages]
- [ ] `packages/desktop/src/main/usage-service.test.ts` - covers background scan, pricing refresh, Settings cadence, typed IPC service behavior. [VERIFIED: rg --files packages]
- [ ] `packages/desktop/src/renderer/src/usage-store.test.ts` - covers cache-first UI store and refresh failure state. [VERIFIED: rg --files packages]
- [ ] `.planning/phases/07-usage-analytics/07-USAGE-MAPPING.md` - required mapping artifact before final visualization choices. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | TypeScript, Vitest, Electron tooling | yes | v22.12.0 | None needed. [VERIFIED: node --version] |
| pnpm | Workspace scripts | yes | 9.9.0; packageManager declares pnpm 10.33.2 | Use Corepack or existing `pnpm` if scripts pass. [VERIFIED: pnpm --version; VERIFIED: package.json] |
| Bun | Hook tests/build | yes | 1.3.8 | None for hook tests. [VERIFIED: bun --version; VERIFIED: packages/hook/package.json] |
| rtk | Preferred command wrapper | yes | 0.39.0 | Use raw command if wrapper fails. [VERIFIED: rtk --version] |
| Network access | Pricing refresh tests and npm/docs verification | yes during research | npm/web reachable | Seed pricing cache fixture and mock `fetch` for deterministic tests. [VERIFIED: npm view commands; VERIFIED: packages/desktop/src/main/updater.ts] |

**Missing dependencies with no fallback:** None found. [VERIFIED: environment audit]

**Missing dependencies with fallback:** pnpm local binary is 9.9.0 while `packageManager` declares 10.33.2; planner should avoid assuming pnpm 10-only behavior or include Corepack activation if needed. [VERIFIED: pnpm --version; VERIFIED: package.json]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Phase excludes authenticated provider APIs and cloud dashboards. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| V3 Session Management | no | No web account/session management added. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| V4 Access Control | yes | Renderer cannot access SQLite/filesystem directly; use typed IPC only. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/desktop/src/shared/ipc-types.ts] |
| V5 Input Validation | yes | Validate IPC args, pricing payload shape, scanner row shape, and settings enum. [VERIFIED: packages/desktop/src/main/ipc-handlers.ts; VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |
| V6 Cryptography | no | No encryption/signing feature introduced; do not invent crypto. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| V8 Data Protection | yes | Persist token facts only; never persist prompt/response/tool content. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| V12 File and Resources | yes | Scanners read local transcript roots read-only and sanitize source paths. [VERIFIED: baseline 07-RESEARCH.md; VERIFIED: packages/desktop/src/main/db.ts] |
| V14 Configuration | yes | Settings refresh frequency must persist through existing config shape or a validated extension. [VERIFIED: packages/hook/src/config.ts; VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md] |

### Known Threat Patterns for Usage Analytics

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt/response/tool argument persistence | Information Disclosure | Allowlist persisted fields, canary tests, static `rg` privacy scan, no raw transcript column. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Full local path leakage | Information Disclosure | Store root-relative path or hash+basename; existing Codex recovery stores basename in desktop DB path. [VERIFIED: packages/desktop/src/main/db.ts] |
| Renderer DB/file access | Elevation of Privilege / Information Disclosure | Typed IPC only; no native modules in renderer. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: packages/desktop/src/shared/ipc-types.ts] |
| Pricing payload tampering | Tampering | Validate pricing JSON shape and keep cost nullable on malformed or unknown model data. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |
| Duplicate transcript rows | Tampering / Integrity | Unique source identity and idempotent scan state. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Research validity window is estimated as 7 days for external pricing/log-format assumptions and 30 days for codebase architecture/test commands. [ASSUMED] | Metadata | Planner may rely on pricing/log-format details longer than they remain current. |

All planning-critical implementation claims in this research were verified from project files, npm/Context7, or cited external docs; only the validity window estimate is assumed. [VERIFIED: source list below]

## Open Questions (RESOLVED)

1. **Exact usage table names and pricing cache columns**
   - What we know: `usage_records`, `usage_scan_state`, and a pricing cache are required concepts. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]
   - What's unclear: Whether cost should be materialized per row or computed on read with a cache snapshot. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
   - Recommendation: Plan an early storage task that chooses one design and updates tests before scanner/UI work. [VERIFIED: .planning/phases/07-usage-analytics/07-CONTEXT.md]
   - RESOLVED: Phase 07 stores raw token facts in `usage_records`, incremental scan facts in `usage_scan_state`, and validated public price rates in `usage_pricing_cache`. Estimated cost is computed on read from token facts plus the current pricing cache; no per-row immutable cost, `usage_summaries`, or derived summary table is materialized. This matches `07-01-PLAN.md` storage contracts and `07-04-PLAN.md` cache-first `queryUsageSummary` behavior. Historical estimates update naturally after pricing refresh because summaries recompute from the refreshed cache.

2. **Exact sidechain/subagent default UI**
   - What we know: UI-SPEC says sidechain/subagent usage is included by default and filterable only if scanner data exposes it. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]
   - What's unclear: Claude fixture coverage may reveal provider flags that need clearer naming. [VERIFIED: baseline 07-RESEARCH.md]
   - Recommendation: Preserve provider flags in sanitized `meta`, add toggle only when scanner proves stable fields. [VERIFIED: .planning/phases/07-usage-analytics/07-UI-SPEC.md]
   - RESOLVED: Phase 07 uses fixture-first validation. Claude fixtures must include sidechain/subagent examples, scanners preserve only sanitized `meta.isSidechain` and `meta.subagentType` when those stable fields are present, and Usage totals include them by default. The UI renders the coss Switch only when `summary.availableFilters.hasSidechain === true`; otherwise no sidechain/subagent control is shown in MVP. No prompt, response, stop payload, or tool argument content is persisted for these rows.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/07-usage-analytics/07-CONTEXT.md` - locked Phase 07 decisions. [VERIFIED]
- `.planning/phases/07-usage-analytics/07-SPEC.md` - requirements, constraints, acceptance criteria. [VERIFIED]
- `.planning/phases/07-usage-analytics/07-UI-SPEC.md` - approved Usage UI contract. [VERIFIED]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` - project requirements and phase scope. [VERIFIED]
- `packages/core/src/schema.ts`, `packages/core/src/history.ts`, `packages/core/src/codex-transcript.ts` - current core data and parser patterns. [VERIFIED]
- `packages/desktop/src/main/db.ts`, `ipc-handlers.ts`, `ipc-types.ts`, `store.ts`, `App.tsx`, `Sidebar.tsx`, `updater.ts` - current desktop IPC, DB, store, routing, network-state patterns. [VERIFIED]
- `packages/hook/src/store.ts`, `packages/hook/src/recovery.ts`, `packages/hook/src/config.ts` - hook hot-path and config patterns. [VERIFIED]
- Context7 `/vitest-dev/vitest/v3_2_4` - Vitest CLI filtering and mocking documentation. [CITED]

### Secondary (MEDIUM confidence)

- https://ccusage.com/guide/cost-modes - Claude Code cost modes and LiteLLM pricing source. [CITED]
- https://ccusage.com/guide/codex/ - Codex JSONL source, token delta, pricing formula, model context behavior. [CITED]
- https://ccusage.com/guide/codex/session - Codex session report, offline/cache pricing option. [CITED]
- https://code.claude.com/docs/en/hooks - Claude Code hook fields, transcript path, subagent/stop content-bearing fields. [CITED]
- https://developers.openai.com/api/docs/pricing - OpenAI input/cached input/output pricing shape and reasoning/output pricing context. [CITED]
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching - Claude prompt cache write/read multipliers. [CITED]

### Tertiary (LOW confidence)

- Baseline `07-RESEARCH.md` local observations about exact Claude JSONL row field names were preserved as MEDIUM/LOW implementation hints unless also locked by SPEC; executor should confirm against fixtures during Wave 0. [VERIFIED: baseline 07-RESEARCH.md]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against package files, pnpm installed versions, npm registry, and Context7 for Vitest. [VERIFIED: package.json; VERIFIED: pnpm list; VERIFIED: npm registry; CITED: /vitest-dev/vitest/v3_2_4]
- Architecture: HIGH - follows existing VibeTime main-process SQLite, typed IPC, renderer store, and hook hot-path boundaries. [VERIFIED: packages/desktop/src/main/db.ts; VERIFIED: packages/desktop/src/shared/ipc-types.ts; VERIFIED: packages/hook/src/store.ts]
- Scanner field details: MEDIUM - Codex is documented by ccusage; Claude exact row fields are based on baseline research and must be fixture-verified. [CITED: https://ccusage.com/guide/codex/; VERIFIED: baseline 07-RESEARCH.md]
- Pitfalls/privacy: HIGH - directly locked by SPEC and project local-first constraints. [VERIFIED: .planning/phases/07-usage-analytics/07-SPEC.md]
- Validation architecture: HIGH - maps every Phase 07 requirement to concrete tests, fixtures, commands, and negative cases. [VERIFIED: .planning/REQUIREMENTS.md; VERIFIED: package.json]

**Research date:** 2026-05-15 [VERIFIED: system current date]
**Valid until:** 2026-05-22 for external pricing/log-format assumptions; 2026-06-14 for codebase architecture and test commands if dependencies remain pinned. [ASSUMED]
