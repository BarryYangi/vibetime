# Phase 07: usage-analytics - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 07 adds a dedicated Usage page for Claude Code and Codex usage analytics. It scans local Claude/Codex transcript sources for token facts, estimates cost from a refreshable pricing cache, and combines those usage facts with VibeTime's existing hook timeline so the product can explain cost, tokens, model usage, cache behavior, and time trends by project, model, turn, day, week, and month.

This phase does not add Cursor/Gemini usage, usage CLI/export, cloud account dashboards, or authenticated provider APIs.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `07-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `07-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Claude Code local transcript usage scanning.
- Codex local transcript usage scanning.
- Durable local usage storage and incremental/idempotent scan state.
- Estimated cost calculation from token facts plus refreshable public pricing metadata.
- Pricing cache used optimistically on Usage page open.
- Recomputing historical estimated costs when pricing cache updates.
- Linking usage rows to existing hook timeline where useful for project/session/turn analytics.
- A documented `data capability -> hook linkage -> user value -> visualization` mapping before final UI chart selection.
- Dedicated Usage page with Claude/Codex token and estimated cost analytics.
- Tests for parser, dedupe, cost fallback, and no-content persistence.

**Out of scope (from SPEC.md):**
- Cursor token/cost support — no stable local usage source is locked for MVP.
- Gemini CLI token/cost support — promising, but deferred until Claude/Codex are solid.
- Usage CLI/export — explicitly deferred after discussion.
- Cloud account dashboards or authenticated provider APIs — this phase uses local transcripts plus public pricing metadata only.
- Uploading local usage/session/project data to a remote service — not needed for public pricing refresh.
- Treating estimated cost as billing truth — cost is a derived estimate from local token facts and current cached pricing.
- Finalizing chart types before data capability is known — visual choices follow the required mapping artifact.

</spec_lock>

<decisions>
## Implementation Decisions

### Product Surface
- **D-01:** Usage is a dedicated page, not a tab nested under History.
- **D-02:** Usage may reuse History's visual language, dashboard layout patterns, and period selector conventions. It should not be implemented as the same page or a subordinate History mode.
- **D-03:** Usage needs its own navigation entry and route. The existing History page remains focused on time retrospectives.

### Background Scanning
- **D-04:** Usage scanning should stay current in the background after app launch, not only when the user opens the Usage page.
- **D-05:** The app should support a Settings control for usage refresh frequency.
- **D-06:** Scanning must be incremental. The planner/researcher should study CodexBar and ccusage patterns for scan state, file mtime/size tracking, row keys, and backfill behavior before choosing the final table design.
- **D-07:** Exact default refresh interval, backfill window, and scan-state schema are left to the agent after research. The chosen plan must keep first-run UX acceptable and avoid expensive repeated full scans.
- **D-08:** Hook invocations remain lightweight. Background usage scanning must not run inside the hook hot path.

### Pricing Source And Cache
- **D-09:** Use one pricing source in MVP: follow the pricing source used by ccusage. Do not build a multi-source pricing resolver in Phase 07.
- **D-10:** Keep a local pricing cache. If the app can refresh pricing, update the cache and recompute displayed historical estimates.
- **D-11:** If pricing refresh fails but cache exists, continue using cache.
- **D-12:** If pricing refresh fails and no usable cache exists for a model, show a clear network/pricing failure state on the Usage page and keep token metrics visible.
- **D-13:** A small embedded fallback snapshot is acceptable as the initial cache/fallback if it simplifies first-run behavior. Cost must remain derived from token facts and pricing, not treated as immutable source data.

### Hook-Linked Analysis
- **D-14:** The required `data capability -> hook linkage -> user value -> visualization` mapping must explicitly analyze these product questions:
  - Project spend.
  - Model used per turn.
  - Model efficiency.
  - Cache hit rate.
  - Cost/time relationship.
  - Time spent per model.
  - Daily, weekly, and monthly trends for cost, tokens, and time.
  - Aggregated token and cost analysis by project/model/agent.
- **D-15:** Hook data is valuable because it supplies project/session/turn/time context that raw usage transcripts alone may not fully provide. The mapping must separate transcript-only insights from insights that require hook linkage.
- **D-16:** The final chart list should be chosen only after scanner fields are proven. Do not design a fake dashboard before the available data is known.

### the agent's Discretion
- Pick exact usage table/index structure after studying CodexBar and ccusage implementation details.
- Pick the default background refresh interval and settings labels, provided the setting exists and scanning is incremental.
- Pick final ECharts chart types after producing the data capability / hook linkage / user value / visualization mapping.
- Decide whether the first implementation computes estimated cost on read or materializes derived cost caches, as long as historical costs update after pricing refresh.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked Phase Scope
- `.planning/phases/07-usage-analytics/07-SPEC.md` — locked requirements, boundaries, constraints, and acceptance criteria.
- `.planning/phases/07-usage-analytics/07-RESEARCH.md` — source findings for Claude/Codex local logs, pricing references, scanner/reconciler architecture, and prior external research on ccusage/CodexBar.
- `.planning/ROADMAP.md` — Phase 07 goal and success criteria.
- `.planning/REQUIREMENTS.md` — `USAGE-01` through `USAGE-08`.
- `.planning/STATE.md` — current Phase 07 decisions and deferred items.
- `.planning/PROJECT.md` — locked stack, renderer IPC rule, hook NFRs, local-first posture, and existing design constraints.

### Prior Phase Context
- `.planning/phases/05-live-history-menubar-lifecycle/05-CONTEXT.md` — History dashboard decisions, coss/ECharts conventions, and separation between surface jobs.
- `.planning/phases/06-packaging-v0-acceptance/06-CONTEXT.md` — packaged app constraints and production-path verification expectations.

### Core And Hook Data Layer
- `packages/core/src/schema.ts` — current DDL constants and schema invariants.
- `packages/core/src/history.ts` — existing time-history aggregation style and period conventions.
- `packages/core/src/codex-transcript.ts` — existing Codex transcript parsing pattern.
- `packages/core/src/adapters/codex.ts` — current Codex hook model/session/turn metadata.
- `packages/core/src/adapters/claude-code.ts` — current Claude hook model/session metadata and derived turn behavior.
- `packages/hook/src/store.ts` — hook-side DB initialization and event persistence.
- `packages/hook/src/recovery.ts` — hook-side Codex transcript recovery and current transcript path handling.

### Desktop Integration
- `packages/desktop/src/main/db.ts` — main-process SQLite access, History queries, reconciliation loop, and current read-path constraints.
- `packages/desktop/src/main/ipc-handlers.ts` — typed IPC handler registration pattern and validation style.
- `packages/desktop/src/shared/ipc-types.ts` — IPC contract definitions to extend for Usage.
- `packages/desktop/src/preload/index.ts` — renderer IPC allowlist.
- `packages/desktop/src/renderer/src/store.ts` — Jotai cache/refresh patterns and push handling.
- `packages/desktop/src/renderer/src/App.tsx` — route registration and last-view persistence.
- `packages/desktop/src/renderer/src/components/Sidebar.tsx` — navigation surface for dedicated Usage route.
- `packages/desktop/src/renderer/src/views/History.tsx` — dashboard layout and ECharts/coss patterns to reuse, not merge into.
- `packages/desktop/src/renderer/src/locales/en.json` — English UI strings.
- `packages/desktop/src/renderer/src/locales/zh.json` — Chinese UI strings.
- `packages/desktop/src/main/updater.ts` — existing fetch/cached-state style for public network calls.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `History.tsx`: existing period selector, `DashboardPanel`, ECharts option patterns, insight bars, sortable tables, and restrained dashboard styling can inform Usage.
- `history.ts`: existing 7/30/90/365 period model and aggregation style can be reused or mirrored for Usage summaries.
- `db.ts`: central main-process SQLite access point where usage schema initialization, usage queries, and background scan coordination can attach.
- `ipc-types.ts` + `ipc-handlers.ts` + `preload/index.ts`: established typed IPC flow for exposing Usage summaries to the renderer.
- `store.ts`: existing Jotai cache and refresh sequencing can be extended for usage summary/cache/pricing state.
- `updater.ts`: existing fetch pattern for a public GitHub API call is a local reference for main-process network behavior and state updates.
- `codex-transcript.ts`: existing JSONL parsing and resilience pattern can guide Codex usage parsing.

### Established Patterns
- Renderer never opens SQLite; Usage renderer must call typed IPC.
- Background writes/read updates notify renderer through existing push infrastructure where appropriate.
- Hook code must remain silent, fast, and no-op-safe; Usage scanning belongs to desktop/background logic, not hook invocation.
- Existing History read paths are intentionally pure and do not do file I/O; Phase 07 may introduce background scanning, but page render should use DB/cache state rather than blocking on transcript scans.
- Existing UI uses coss neutral light/dark styling, ECharts, Jotai, and localized strings.

### Integration Points
- Add dedicated `/usage` route and sidebar item.
- Add shared Usage IPC types and handler(s).
- Add usage scanner/storage code in a place shared by desktop background refresh and tests without polluting hook hot path.
- Add settings surface for usage refresh frequency.
- Add pricing cache refresh initiated by Usage/background usage service, with failure surfaced to the Usage page.
- Add data capability / hook linkage / user value / visualization artifact to the Phase 07 directory before final UI chart work.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly corrected the earlier "History -> Usage tab" idea: Usage and History are different pages. They can share layout and time window conventions, but the product surfaces are separate.
- Background scanning should be inspired by CodexBar's incremental approach and ccusage's parsing/pricing behavior.
- Pricing should follow ccusage's source rather than choosing among multiple sources in MVP.
- Usage analysis should combine transcript tokens with hook-captured project/session/turn/time data to support richer product interpretation than raw spend totals alone.

</specifics>

<deferred>
## Deferred Ideas

- Cursor usage/cost support.
- Gemini CLI usage/cost support.
- Usage CLI/export.
- Cloud/provider authenticated usage dashboards.
- Multi-source pricing resolver beyond the ccusage-aligned source.

</deferred>

---

*Phase: 07-usage-analytics*
*Context gathered: 2026-05-15*
