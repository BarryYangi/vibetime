# Phase 07: usage-analytics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 07-usage-analytics
**Areas discussed:** Usage entry, scanning refresh, pricing source/cache, hook-linked analysis

---

## Usage Entry

| Option | Description | Selected |
|--------|-------------|----------|
| History nested tab | Add Usage as a tab under the existing History page | |
| Dedicated Usage page | Usage is a separate page, reusing History layout/time-window ideas where useful | ✓ |
| New top-level standalone app mode | Build Usage as a distinct major app mode without sharing History conventions | |

**User's choice:** Usage and History are two different pages. UI layout and time-window controls can be borrowed from History.
**Notes:** This supersedes the earlier SPEC wording that said "History -> Usage tab". SPEC, ROADMAP, REQUIREMENTS, and STATE were amended to remove the nested-tab framing.

---

## Scanning Refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Scan only on Usage open | Refresh usage only when user opens the page | |
| Background incremental sync | Keep usage updated in the background after app launch | ✓ |
| Manual refresh only | User explicitly clicks refresh | |

**User's choice:** Opening the app should keep a background usage sync running. Settings should expose refresh frequency. Implementation should reference CodexBar and similar mature projects for incremental sync/table design.
**Notes:** Exact default frequency and scan-state schema are delegated to research/planning.

---

## Pricing Source And Cache

| Option | Description | Selected |
|--------|-------------|----------|
| ccusage-aligned source | Use the pricing source ccusage uses | ✓ |
| Multi-source resolver | Try multiple public sources and reconcile differences | |
| Embedded-only pricing | Ship static pricing and never refresh | |

**User's choice:** Use the ccusage-aligned pricing source. Keep a cache/fallback. If refresh fails and pricing cannot be resolved, the page can show a direct network/pricing failure.
**Notes:** Cost remains derived from token facts and pricing cache. No need to overcomplicate privacy framing beyond not uploading local data.

---

## Hook-Linked Analysis

| Option | Description | Selected |
|--------|-------------|----------|
| Spend totals only | Show token/cost totals and stop there | |
| Hook-linked analytics | Combine usage rows with existing hook project/session/turn/time data | ✓ |
| Debug/audit emphasis | Focus mostly on raw scanner diagnostics | |

**User's choice:** The product analysis should cover project spend, per-turn model, model efficiency, cache hit rate, cost/time relationship, model runtime, daily/weekly/monthly cost-token-time trends, and aggregate analysis.
**Notes:** The required mapping artifact must wait until scanner fields are proven, then decide which visualizations have real value.

---

## the agent's Discretion

- Choose exact usage table/index structure after studying CodexBar and ccusage.
- Choose default refresh interval and scan-state strategy.
- Choose final ECharts chart types after the data capability / hook linkage / user value / visualization mapping.
- Decide whether cost is computed on read or partially materialized, as long as historical cost can update when pricing changes.

## Deferred Ideas

- Cursor usage/cost support.
- Gemini CLI usage/cost support.
- Usage CLI/export.
- Authenticated cloud/provider dashboards.
- Multi-source pricing resolver.
