# Phase 07: Usage Analytics — Specification

**Created:** 2026-05-15
**Ambiguity score:** 0.09 (gate: <= 0.20)
**Requirements:** 8 locked

## Goal

A dedicated Usage page shows Claude Code and Codex token usage and estimated cost from local transcripts, linked back to VibeTime's existing hook timeline for project/session/turn context.

## Background

VibeTime v1.0 records local agent time via hooks and stores lifecycle events in `events` plus open turn state in `open_turns`. It has no token/cost schema, no local transcript scanner, no pricing cache, and no Usage surface. Token/cost tracking was explicitly deferred to v0.1+ in the prior milestone. Phase 07 promotes that deferred work into an active phase, scoped to Claude Code and Codex only.

Research in `07-RESEARCH.md` found that Claude Code and Codex have mature local usage sources:

- Claude Code usage can be extracted from local project JSONL transcripts under `CLAUDE_CONFIG_DIR`, `~/.config/claude/projects`, and `~/.claude/projects`.
- Codex usage can be extracted from `$CODEX_HOME/sessions`, `$CODEX_HOME/archived_sessions`, or default `~/.codex` equivalents.
- Existing hook data already supplies the authoritative VibeTime timeline: agent, project, session, turn, timestamp, duration, model meta where available.

The product risk is not whether Usage is valuable; it is avoiding false precision and fake charts before the stable local data shape is known. Therefore this phase must first prove the Claude/Codex data capability, then map available data plus hook context into useful product analytics.

## Requirements

1. **Claude/Codex-only usage scope**: The phase parses and presents token/cost usage only for Claude Code and Codex.
   - Current: VibeTime records time for Claude Code, Codex, Cursor, and Gemini CLI, but records no token/cost data for any agent.
   - Target: Usage scanning, cost estimation, and Usage page analytics operate only on Claude Code and Codex data.
   - Acceptance: Cursor and Gemini CLI are not included in usage/cost scanner registration, cost aggregation, or Usage page totals.

2. **Local usage scanner records token facts**: The system ingests Claude Code and Codex local transcript usage rows into a durable local representation without persisting prompt, response, tool argument, or transcript content.
   - Current: `packages/core/src/schema.ts` defines only `events` and `open_turns`; there is no usage table or scan state.
   - Target: Usage facts are stored idempotently with source row identity, agent, session, optional turn, project when known, timestamp, model, token breakdown, and scan state.
   - Acceptance: Re-running a scan over the same Claude/Codex files does not duplicate usage rows, and stored records contain token/model/timestamp metadata but no prompt/content/tool argument text.

3. **Codex usage extraction**: Codex scanner extracts token deltas and model context from native Codex logs.
   - Current: VibeTime only uses Codex transcript fallback to close completed turns; it does not parse token usage.
   - Target: Scanner reads Codex session/archive JSONL files, recognizes token usage rows, uses `last_token_usage` when present or total-token deltas when required, and associates rows with model context.
   - Acceptance: Fixture tests cover Codex `token_count` rows with `last_token_usage`, `total_token_usage` delta fallback, cached input tokens, output tokens, reasoning tokens, and model context.

4. **Claude Code usage extraction**: Claude scanner extracts assistant usage rows from local Claude project transcripts with duplicate protection.
   - Current: Claude hook events track session/turn timing but do not record tokens or cost.
   - Target: Scanner reads configured/default Claude project transcript roots, extracts assistant `message.usage` token fields and model, and deduplicates streaming/chunk rows by stable message/request identity.
   - Acceptance: Fixture tests cover Claude assistant usage rows, cache creation/read tokens, output tokens, model extraction, duplicate rows, and missing optional fields.

5. **Estimated cost via refreshable pricing cache**: Cost is derived from token facts and a refreshable public pricing cache, not stored as immutable ground truth.
   - Current: No pricing data or cost calculation exists.
   - Target: Opening the Usage page attempts to fetch/update public pricing metadata, renders immediately from cache when available, recomputes historical estimated costs after a successful refresh, and shows cost unknown when neither fresh pricing nor cache can price a model.
   - Acceptance: With a seeded pricing cache, Usage renders cost without network; when a mocked pricing refresh succeeds, historical costs update; when refresh fails and no cached price exists for a model, token totals still render and cost is shown as unknown.

6. **Hook-linked product analysis**: The phase records how raw usage data combines with existing hook data before finalizing visualizations.
   - Current: Hook data already captures project/session/turn/time windows, but no formal product analysis ties those fields to usage analytics.
   - Target: The implementation produces a documented `data capability -> hook linkage -> user value -> visualization` mapping after Claude/Codex scanner fields are known.
   - Acceptance: Phase artifacts include a written mapping that identifies which Usage insights come from transcript-only data, which require hook events, and which remain unsupported.

7. **Dedicated Usage page**: A Usage page presents Claude/Codex usage and estimated cost without locking chart types before data capability is proven.
   - Current: History contains time-based visual analytics, but no token/cost usage view.
   - Target: The desktop app contains a dedicated Usage page whose visualizations are chosen from the data capability mapping, with a minimum surface for total tokens, estimated cost, agent/model/project breakdown, pricing cache state, and unavailable-cost states. It may reuse History's dashboard layout and time-window conventions, but it is not nested inside History.
   - Acceptance: In the desktop app, selecting Usage shows Claude/Codex token and estimated cost analytics for the selected period, updates after pricing refresh, and does not display Cursor/Gemini usage.

8. **No usage CLI/export in MVP**: This phase does not add `vibetime usage` CLI, CSV export, JSON export, or per-row usage export.
   - Current: VibeTime has time-oriented CLI/export commands from earlier phases.
   - Target: Usage MVP remains desktop-first; export is documented as future work.
   - Acceptance: No new usage CLI/export command is introduced by Phase 07 plans; future export remains listed outside MVP.

## Boundaries

**In scope:**

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

**Out of scope:**

- Cursor token/cost support — no stable local usage source is locked for MVP.
- Gemini CLI token/cost support — promising, but deferred until Claude/Codex are solid.
- Usage CLI/export — explicitly deferred after discussion.
- Cloud account dashboards or authenticated provider APIs — this phase uses local transcripts plus public pricing metadata only.
- Uploading local usage/session/project data to a remote service — not needed for public pricing refresh.
- Treating estimated cost as billing truth — cost is a derived estimate from local token facts and current cached pricing.
- Finalizing chart types before data capability is known — visual choices follow the required mapping artifact.

## Constraints

- Hook execution must stay lightweight: no transcript scanning, pricing fetch, cost calculation, or chart aggregation inside hook invocations.
- Prompt text, response text, tool arguments, and transcript content must not be persisted in VibeTime's usage tables.
- Usage storage must be idempotent when scanning the same source files repeatedly.
- Cost must be recomputable from token facts and pricing snapshot.
- The Usage page may initiate public pricing refresh on open; it must render from cached pricing first when cache exists.
- If pricing cannot be fetched and no cached model price exists, token totals still render and cost displays as unknown.
- Renderer continues to use typed IPC/main-process data access; no direct SQLite access from renderer.
- UI must follow existing History/coss/ECharts conventions.

## Acceptance Criteria

- [ ] Usage scanning supports Claude Code and Codex only.
- [ ] Usage scanner stores token/model/timestamp/source identity without prompt, response, tool argument, or transcript content.
- [ ] Re-scanning unchanged Claude/Codex source files does not duplicate usage rows.
- [ ] Codex parser tests cover token deltas, cached input, output, reasoning, and model context.
- [ ] Claude parser tests cover assistant usage, cache creation/read, output tokens, model, and duplicate rows.
- [ ] Opening Usage renders from cached pricing before any network refresh completes.
- [ ] Successful pricing refresh updates cache and recomputes historical estimated cost.
- [ ] Pricing refresh failure falls back to cache; missing cache/model price shows cost unknown while preserving token totals.
- [ ] Phase artifacts include the data capability / hook linkage / user value / visualization mapping.
- [ ] Usage shows token totals, estimated cost where price is known, and agent/model/project breakdown for Claude/Codex.
- [ ] Cursor and Gemini usage/cost do not appear in Usage page totals.
- [ ] No `vibetime usage` CLI or usage export is added in this phase.

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes |
|---------------------|-------|-------|--------|-------|
| Goal Clarity        | 0.94  | 0.75  | met    | Claude/Codex Usage page with local transcript tokens and estimated cost. |
| Boundary Clarity    | 0.93  | 0.70  | met    | Cursor/Gemini and export explicitly excluded. |
| Constraint Clarity  | 0.88  | 0.65  | met    | Hook stays light; pricing cache refreshes on Usage page open. |
| Acceptance Criteria | 0.88  | 0.70  | met    | Parser, pricing, UI, and out-of-scope checks are pass/fail. |
| **Ambiguity**       | 0.09  | <=0.20| met    | Gate passed. |

Status: met = dimension meets minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | Which agents should usage/cost support first? | Claude Code and Codex only; Cursor/Gemini deferred. |
| 1 | Researcher | Where should the product surface live? | Initially discussed as History -> Usage; discuss-phase updated this to a dedicated Usage page that reuses History conventions. |
| 2 | Simplifier | Should the UI lock a fixed chart list now? | No. First prove data capability, then map data to product value and visualizations. |
| 2 | Simplifier | Should CLI/export be part of MVP? | No usage CLI/export in MVP; record as future work. |
| 3 | Boundary Keeper | Should attribution confidence be a visible product concept? | No. For Claude/Codex, if token facts are parsed, they enter the main usage/cost metrics. |
| 3 | Boundary Keeper | How should pricing refresh behave? | Usage page opens with cache, attempts public pricing refresh, then updates historical estimates optimistically. |
| 4 | Failure Analyst | How should hook data linkage be handled? | Record a required data capability / hook linkage / user value / visualization mapping after scanner fields are proven. |

---

*Phase: 07-usage-analytics*
*Spec created: 2026-05-15*
*Next step: $gsd-discuss-phase 07 — implementation decisions (how to build what's specified above)*
