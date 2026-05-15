# Phase 07 Usage Data Capability Mapping

Purpose: lock honest Usage visualizations after scanner, pricing, reconciliation, and aggregation fields have been proven by tests. This artifact separates transcript-only insights from hook-linked insights and unsupported precision before renderer chart work begins.

## Proven Data Inputs

| Source | Proven Fields | Current Support |
|--------|---------------|-----------------|
| Transcript usage facts | agent, session id, optional turn id, timestamp, model, input tokens, cached input tokens, cache creation tokens, output tokens, reasoning output tokens, stable source identity | transcript-only |
| Pricing cache | model, provider, per-million input/cache/output rates, fetched time, raw version | transcript-only |
| Hook timeline | project, session id, turn id, turn time window, duration, agent | hook-linked |
| Reconciled usage facts | attribution method `turn_id`, `session_time_window`, `project_time_window`, `unmatched`; confidence; nullable project | hook-linked |
| Aggregates | dense daily rows, agent/model/project breakdowns, token breakdown, nullable estimated cost, unknown-cost tokens, audit rows, available filters | transcript-only plus hook-linked where project/time context exists |

## Mapping Table

| Product Question | Data Capability | Hook Linkage | User Value | Visualization | Supported In MVP |
|------------------|-----------------|--------------|------------|---------------|------------------|
| Project spend | Estimated cost and tokens per usage row, grouped by reconciled project when attribution succeeds | hook-linked: project comes from `turn_id`, then session time window, then project time window; unmatched rows stay out of project ranking and appear in audit | Shows which projects consume estimated cost without pretending every row has project context | Project spend ranking plus Metric tiles for total estimated cost and tokens | hook-linked |
| Model used per turn | Transcript model field plus optional native turn id/session id | hook-linked when `turn_id` or session window connects the usage row to a hook turn; transcript-only otherwise | Explains which model was active for attributable turns and which rows remain transcript-only | Audit table and model table; no separate chart until turn linkage is present per row | hook-linked |
| Model efficiency | Model, token totals, output tokens, estimated cost, and record count are proven; hook duration is available only after attribution | hook-linked for duration-based efficiency; transcript-only for output-per-token and cost-per-output summaries | Helps compare model productivity while avoiding false speed claims for unlinked rows | Model efficiency table | hook-linked |
| Cache hit rate | Cached input tokens and cache creation tokens are proven by both scanners; total input context is known from usage facts | transcript-only; hook data is not required | Shows whether repeated context is being reused and why estimated cost differs from raw token volume | Metric tiles and Token breakdown | transcript-only |
| Cost/time relationship | Estimated cost is available for priced rows; hook duration is available only for linked turns/windows | hook-linked but incomplete when rows are unmatched or cost is unknown | Useful for spotting expensive long turns, but only when both cost and duration are present | Cost/time relationship unavailable panel if linkage is insufficient; scatter later when enough linked rows exist | unsupported |
| Time spent per model | Model is transcript-only; time belongs to hook turn windows and requires reliable row-to-turn attribution | hook-linked and partial; session/project fallback may group multiple model rows into one time window | Could show whether time is concentrated in specific models, but current MVP cannot split a single hook duration across multiple model rows with billing precision | Audit table note; no chart in MVP | unsupported |
| daily cost trends | Usage timestamp, estimated cost nullable, unknown-cost tokens, and dense daily rows are proven | transcript-only for cost/token date; hook-linked only when adding project context | Shows estimated daily spend while preserving unknown-cost rows | Daily usage trend | transcript-only |
| weekly cost trends | Daily rows can be rolled into compact week summaries after aggregation | transcript-only for cost/token week totals; hook-linked only for project-specific week rows | Helps scan recent spend changes without adding a separate chart | Daily trend with compact weekly stat rows | transcript-only |
| monthly cost trends | Daily rows can be rolled into compact month summaries for longer periods | transcript-only for cost/token month totals; hook-linked only for project-specific month rows | Gives month-scale context inside 90/365 day periods without overbuilding the MVP | Daily trend with compact monthly stat rows | transcript-only |
| daily token trends | Usage timestamp and dense daily token totals are proven | transcript-only; project split requires hook-linked attribution | Shows token volume independent of pricing availability | Daily usage trend | transcript-only |
| weekly token trends | Daily token rows can be rolled up | transcript-only; project split requires hook-linked attribution | Shows whether usage is growing or shrinking week to week | Daily trend with compact weekly stat rows | transcript-only |
| monthly token trends | Daily token rows can be rolled up | transcript-only; project split requires hook-linked attribution | Shows period-scale token load | Daily trend with compact monthly stat rows | transcript-only |
| daily time trends | Hook timeline already supports daily time; Usage rows can reference it only after attribution | hook-linked; transcript-only rows have no duration | Lets Usage compare token/cost trends to existing time trends where linkage exists | Cost/time relationship unavailable panel if linkage is insufficient; audit row for unlinked usage | unsupported |
| weekly time trends | Hook timeline can roll up time; Usage cannot assign all transcript rows to weekly time without linkage | hook-linked and partial | Avoids implying token rows have duration when they do not | Audit table, no standalone Usage chart in MVP | unsupported |
| monthly time trends | Hook timeline can roll up time; Usage cannot assign all transcript rows to monthly time without linkage | hook-linked and partial | Keeps monthly Usage focused on proven token/cost facts | Audit table, no standalone Usage chart in MVP | unsupported |
| Aggregated token and cost analysis by project | Tokens and nullable cost grouped by reconciled project; unassigned rows preserved separately | hook-linked | Identifies project-level spend where attribution is supported | Project spend ranking and Audit table | hook-linked |
| Aggregated token and cost analysis by model | Model, tokens, nullable cost, unknown-cost tokens, and record count are proven | transcript-only | Shows which models drive tokens and estimated cost even without project linkage | Model efficiency table and Metric tiles | transcript-only |
| Aggregated token and cost analysis by agent | Usage agent whitelist is proven; totals include only the two supported usage agents | transcript-only | Shows agent-level token/cost split without mixing in unsupported usage sources | Metric tiles and Token breakdown | transcript-only |

## Final MVP Visualization Choices

These are the only chart and table choices unlocked for the renderer plan:

1. Metric tiles: estimated cost, total tokens, cache hit rate, and top model or agent/model mix.
2. Daily usage trend: dense daily cost/token view with compact weekly/monthly stat rows.
3. Token breakdown: input, cached input, cache creation, output, and reasoning output, with reasoning displayed but not double-counted for cost.
4. Project spend ranking: available for hook-linked rows only; unassigned rows stay in the audit surface.
5. Model efficiency table: model, tokens, output share, nullable estimated cost, unknown-cost tokens, and record count.
6. Cost/time relationship unavailable panel if linkage is insufficient for a trustworthy scatter plot.
7. Audit table: unknown model price, unassigned rows, attribution method, tokens, nullable cost, and confidence.

## Explicit Trust Rules

- Unknown model pricing produces nullable estimated cost and visible token totals, never `$0.00`.
- Unmatched rows remain visible in agent/model totals and in an `Unassigned usage` audit bucket.
- Hook-linked visuals may use project, turn, and duration only when reconciliation supplies that context.
- transcript-only visuals may use tokens, model, agent, timestamp, pricing status, and nullable cost without requiring hook linkage.
- unsupported questions render unavailable or audit context, not synthetic charts.
