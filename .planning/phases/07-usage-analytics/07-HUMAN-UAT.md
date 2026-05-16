---
status: retest_pending
phase: 07-usage-analytics
source: [07-VERIFICATION.md]
started: 2026-05-15T12:44:07Z
updated: 2026-05-16T13:08:15Z
---

# Phase 07 Human UAT

## Current Test

fresh Usage scan retest pending after clearing usage tables

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

## 2026-05-16 Hardening Addendum

- Token and pricing parsing were rechecked against the current local behavior and kept aligned with the CodexBar/ccusage-informed strategy already selected for Phase 07.
- Usage scan performance was hardened to match CodexBar's append-only model: unchanged files are skipped, append-only files resume from persisted `parsed_bytes`, Codex state persists in `scan_context`, scanning runs off the main process in a worker, worker reads JSONL in 1MB newline-safe chunks, and DB writes remain chunked.
- Final automated checks after hardening:
  - `rtk pnpm typecheck` — PASS
  - `rtk pnpm lint` — PASS
  - `rtk pnpm --filter @vibetime/desktop build` — PASS
  - `rtk pnpm vitest run --project @vibetime/core` — PASS, 159 tests
  - Focused non-DB desktop Usage scan/timer tests — PASS, 6 tests
- Full desktop `usage-service.test.ts` remains blocked in this shell by local `better-sqlite3` ABI mismatch (`NODE_MODULE_VERSION 145` vs required `127`), while non-DB Usage tests pass and the desktop build succeeds.

## 2026-05-16 Responsiveness Addendum

- Manual `refreshUsage` was changed from a blocking foreground request into a background job kickoff. IPC now returns after starting the refresh job instead of waiting for transcript scan, project attribution, DB writes, pricing refresh, and summary re-query to finish.
- Usage no longer immediately re-queries summary after a manual refresh starts. It keeps showing stale cached data and waits for the existing push notification after the background job writes data.
- First automatic background Usage refresh is delayed from 8s to 60s so opening the app or navigating to Usage is less likely to collide with a cold full scan.
- Scan/DB batching was retuned so large refreshes do not rely on one huge scan result clone, project-attribution pass, or SQLite write spike.
- Refresh ingestion processes changed transcript files in batches unless Codex fork/global context requires a whole-agent pass.
- Project resolution cache is now shared across refresh batches so batching does not re-run git/project resolution for the same cwd.
- Usage DB writes now emit `usage-changed` instead of generic `db-changed`; renderer-side Usage summary refreshes are debounced/coalesced so `usage-changed`, DB watcher pushes, and rapid successive writes do not trigger repeated synchronous summary queries and ECharts updates.
- Generic `db-changed` pushes no longer refresh Usage summaries; Usage only refreshes from the dedicated `usage-changed` signal.
- Usage summary SQL now applies agent/project/model filters before rows are materialized in JS, reducing query and aggregation work for filtered views.
- Usage records now include composite `model, ts` and `project, ts` indices so filtered Usage views do not rely on broad single-column scans.
- Background Usage refresh now emits explicit `usage-refresh-started` and `usage-refresh-finished` events. The Usage refresh button stays loading for the real background sync duration instead of stopping when IPC only starts the job.
- Usage refresh state is queryable from the main process, so opening the Usage page during an automatic background sync still shows the refresh button loading. Usage summaries continue to update while loading so first sync can progressively disclose partial data without looking complete.
- Each worker receives only the scan-state rows for its own batch. Project attribution cache keys collapse generated workspace children to their stable parent project, and git root detection now uses one `rev-parse --show-toplevel` probe instead of walking parent directories with repeated git config calls.
- Verification after responsiveness change:
  - `rtk pnpm typecheck` — PASS
  - `rtk pnpm lint` — PASS
  - `rtk pnpm vitest run --project @vibetime/desktop packages/desktop/src/main/ipc-handlers.test.ts packages/desktop/src/main/usage-service.test.ts -t "starts usage refresh|usage background|parses only appended|does not mark unreadable|scopes Codex|limits refresh"` — PASS, 7 tests
  - `rtk pnpm vitest run --project @vibetime/core packages/core/src/usage/claude-scanner.test.ts packages/core/src/usage/codex-scanner.test.ts packages/core/src/usage/aggregate.test.ts packages/core/src/usage/reconcile.test.ts` — PASS, 31 tests
  - `rtk pnpm --filter @vibetime/desktop build` — PASS

## 2026-05-16 Web Performance Addendum

- Rechecked performance strategy against Electron, Node worker_threads, SQLite/better-sqlite3, and current CodexBar cost scanner sources.
- Applied the remaining low-intrusion improvements found in that pass:
  - Usage source discovery now uses async directory/stat traversal on the default app path, so recursive JSONL discovery no longer blocks the Electron main thread with `readdirSync/statSync`.
  - Codex fork/global-context prefix checks now use async file reads during normal app refresh, avoiding synchronous 256KB prefix reads across changed Codex files on the main thread.
  - Hook reconciliation no longer reads all Claude/Codex hook events on every refresh. It uses a lightweight count/latest timestamp fingerprint, then reads hook events only around the current usage records being reconciled.
  - Worker scan and DB write batches were retuned toward smoother responsiveness: smaller SQLite write transactions, smaller scan batches, more frequent project-resolution yields, and a small worker-side cooperative pause to reduce cold-scan CPU spikes.
- Verification after this pass:
  - `rtk pnpm typecheck` — PASS
  - `rtk pnpm lint` — PASS
  - `rtk pnpm vitest run --project @vibetime/desktop packages/desktop/src/main/usage-service.test.ts` — PASS, 22 tests
  - `rtk pnpm vitest run --project @vibetime/core packages/core/src/usage/reconcile.test.ts packages/core/src/usage/codex-scanner.test.ts packages/core/src/usage/claude-scanner.test.ts` — PASS, 25 tests
  - `rtk pnpm --filter @vibetime/desktop build` — PASS

## 2026-05-16 Utility Process Ingestion Addendum

- Usage ingestion was moved out of the Electron main process for the default app refresh path.
- Main now owns only scheduling, refresh state, loading events, and renderer notifications. The utility process owns transcript discovery, scan workers, project attribution, hook reconciliation, pricing refresh, and SQLite writes.
- DB initialization was split into a neutral `desktop-db` module so the worker can open the app SQLite database without importing `BrowserWindow` or other UI-only Electron APIs.
- The utility process forwards `usage-changed` progress events back to main, and main still emits `usage-refresh-started` / `usage-refresh-finished` for UI loading state.
- Verification after utility-process split:
  - `rtk pnpm typecheck` — PASS
  - `rtk pnpm lint` — PASS
  - `rtk pnpm --filter @vibetime/desktop build` — PASS
  - `rtk pnpm vitest run --project @vibetime/desktop packages/desktop/src/main/usage-service.test.ts packages/desktop/src/main/ipc-handlers.test.ts` — PASS, 29 tests
  - `rtk pnpm vitest run --project @vibetime/core packages/core/src/usage/reconcile.test.ts packages/core/src/usage/codex-scanner.test.ts packages/core/src/usage/claude-scanner.test.ts packages/core/src/usage/aggregate.test.ts` — PASS, 31 tests

## Gaps

- Restart Electron and run a fresh Usage scan after clearing usage tables to confirm first-scan responsiveness is acceptable and subsequent refreshes are smooth.
- Network-off pricing fallback still needs manual smoke if we want to close the remaining pricing UAT item.
