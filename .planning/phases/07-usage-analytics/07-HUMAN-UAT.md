---
status: partial
phase: 07-usage-analytics
source: [07-VERIFICATION.md]
started: 2026-05-15T12:44:07Z
updated: 2026-05-15T12:59:00Z
---

# Phase 07 Human UAT

## Current Test

post-fix Codex real-transcript retest pending after Electron restart

## Tests

### 1. Usage Page Visual And Interaction Smoke

expected: Usage is immediately below History, uses the History-like dashboard layout, has no overlapping text/charts, and keeps stale cached data visible during refresh.
result: pass
evidence: Electron Usage page rendered on `/#/usage`; 30d/7d/365d periods, agent filter, refresh disabled/loading state, ECharts charts, metric cards, breakdown table, audit table, empty state, and Settings refresh-frequency select were inspected with Computer Use. No obvious layout overlap observed.

### 2. Real Local Transcript Scan

expected: Claude Code and Codex token rows appear with totals, model/project/agent breakdowns, no prompt/response/tool content persisted, and unmatched rows visible in audit.
result: issue-fixed-retake-needed
issue: Claude Code populated real local rows, but Codex showed empty despite Codex hook events and many local `token_count` JSONL rows. Root cause was current Codex JSONL shape storing usage in `payload.info.last_token_usage` with session/turn/model context in nearby `session_meta` and `turn_context` rows. Fixed in scanner and incremental scan recovery; requires app restart and refresh to validate in the running Electron main process.

### 3. Real Pricing Refresh

expected: Cached pricing renders first; online refresh updates estimates; offline with cache keeps cached estimates; missing prices show Unknown while tokens remain visible.
result: partial
evidence: Existing cached/priced Claude Code data rendered estimated cost. Offline/cache fallback was not manually toggled during this smoke pass.

## Summary

total: 3
passed: 1
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- Restart Electron and refresh Usage to confirm Codex rows are populated from the fixed parser and recovered `usage_scan_state`.
- Network-off pricing fallback still needs manual smoke if we want to close the remaining pricing UAT item.
