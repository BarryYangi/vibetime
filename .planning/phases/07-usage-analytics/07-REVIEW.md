---
phase: 07-usage-analytics
reviewed: 2026-05-15T11:53:03Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - packages/core/src/index.ts
  - packages/core/src/schema.ts
  - packages/core/src/usage/__fixtures__/claude-assistant-usage.jsonl
  - packages/core/src/usage/__fixtures__/claude-privacy-canary.jsonl
  - packages/core/src/usage/__fixtures__/codex-duplicate-session.jsonl
  - packages/core/src/usage/__fixtures__/codex-token-count.jsonl
  - packages/core/src/usage/__fixtures__/hook-events.ts
  - packages/core/src/usage/__fixtures__/pricing-cache.json
  - packages/core/src/usage/aggregate.test.ts
  - packages/core/src/usage/aggregate.ts
  - packages/core/src/usage/claude-scanner.test.ts
  - packages/core/src/usage/claude-scanner.ts
  - packages/core/src/usage/codex-scanner.test.ts
  - packages/core/src/usage/codex-scanner.ts
  - packages/core/src/usage/contracts.test.ts
  - packages/core/src/usage/pricing.test.ts
  - packages/core/src/usage/pricing.ts
  - packages/core/src/usage/privacy.test.ts
  - packages/core/src/usage/reconcile.test.ts
  - packages/core/src/usage/reconcile.ts
  - packages/core/src/usage/types.ts
  - packages/desktop/src/main/db.ts
  - packages/desktop/src/main/index.ts
  - packages/desktop/src/main/ipc-handlers.test.ts
  - packages/desktop/src/main/ipc-handlers.ts
  - packages/desktop/src/main/usage-service.test.ts
  - packages/desktop/src/main/usage-service.ts
  - packages/desktop/src/preload/index.ts
  - packages/desktop/src/renderer/src/App.tsx
  - packages/desktop/src/renderer/src/components/Sidebar.tsx
  - packages/desktop/src/renderer/src/locales/en.json
  - packages/desktop/src/renderer/src/locales/zh.json
  - packages/desktop/src/renderer/src/store.ts
  - packages/desktop/src/renderer/src/usage-store.test.ts
  - packages/desktop/src/renderer/src/views/Settings.tsx
  - packages/desktop/src/renderer/src/views/Usage.tsx
  - packages/desktop/src/shared/ipc-types.test.ts
  - packages/desktop/src/shared/ipc-types.ts
  - packages/hook/src/config.test.ts
  - packages/hook/src/config.ts
findings:
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-05-15T11:53:03Z
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

Reviewed the usage analytics core scanners, pricing, reconciliation, desktop scan/write path, IPC boundary, renderer usage UI, configuration changes, and related tests. The implementation has correctness defects in the usage ingestion path: transient read failures can permanently mark a transcript as scanned, already-persisted records are not re-reconciled when hook events arrive later, and reasoning token prices are modeled but not charged.

## Critical Issues

### CR-01: BLOCKER - Failed transcript reads are still marked scanned, causing permanent data loss

**File:** `packages/desktop/src/main/usage-service.ts:500`

**Issue:** `scanSourceFiles` catches a `readFileSync` failure and skips adding the file to scanner candidates, but the returned `states` array is built from every requested file at lines 527-535. A rotated, locked, or temporarily unreadable transcript therefore gets a `usage_scan_state` row with the current `mtime_ms` and `size_bytes` even though no records were parsed. The next refresh sees the unchanged mtime/size at lines 485-490 and skips the file forever, silently dropping all usage rows from that transcript.

**Fix:**
```ts
const scannedFiles: SourceFile[] = []

for (const file of files) {
  let content: string
  try {
    content = readFileSync(file.path, 'utf8')
  } catch {
    continue
  }

  scannedFiles.push(file)
  // existing candidate push...
}

return {
  records,
  states: scannedFiles.map((file) => ({
    agent: file.agent,
    sourceFileKey: file.sourceFileKey,
    sourceFileBasename: file.sourceFileBasename,
    mtimeMs: file.mtimeMs,
    sizeBytes: file.sizeBytes,
    lastScannedAt: scannedAt,
    lastRowKey: lastRowByFile.get(file.sourceFileKey) ?? null,
  })),
}
```

Add a test that stubs one discovered file to throw on first read, verifies no scan state is written for it, then verifies a later successful refresh ingests it.

### CR-02: BLOCKER - Existing unmatched usage rows are never re-attributed after hook events arrive

**File:** `packages/desktop/src/main/usage-service.ts:703`

**Issue:** `runUsageRefresh` only scans `changedSourceFiles`, reconciles only the newly parsed `records`, and then upserts those rows. If a token record is scanned before the corresponding `turn_end` or open-turn hook row exists, it is stored as `project: null` / `unmatched`. When the hook event arrives later, the transcript file may be unchanged, so `records` is empty and the persisted usage row is never passed through `reconcileUsageWithHookEvents` again. Usage remains permanently unassigned even though the hook data needed for attribution is now present.

**Fix:**
```ts
const hookEvents = readHookUsageEvents(db)
const reconciledNew = reconcileUsageWithHookEvents(records, hookEvents)
const existing = readUsageRows(db, { periodDays: 365, now: new Date(scannedAt * 1000) })
  .filter((record) => record.attributionMethod === 'unmatched' || record.project === null)
const reconciledExisting = reconcileUsageWithHookEvents(existing, hookEvents)

const recordsInserted = db.transaction(() => {
  const changedRows = upsertUsageRecords(db, [...reconciledNew, ...reconciledExisting])
  upsertUsageScanState(db, states)
  return changedRows
})()
```

Prefer a bounded helper query for unmatched rows instead of reusing the UI period if older data matters. Add a regression test where the first refresh runs before inserting the hook event, the second refresh has no changed files but does update the existing row to `turn_id`/project attribution.

### CR-03: BLOCKER - Reasoning output tokens have prices but are omitted from cost estimates

**File:** `packages/core/src/usage/pricing.ts:156`

**Issue:** `UsagePricingEntry` includes `reasoningOutputUsdPerMillion`, the schema persists `reasoning_output_usd_per_million`, and the Codex fixture models `total_tokens` as `input + output + reasoning`. However `estimateUsageCostUsd` only charges input, cached input, cache creation, and output at lines 156-159. Any model with separate reasoning tokens is underpriced; for the existing `gpt-5` fixture, reasoning tokens are displayed in token totals but contribute $0 to estimated cost.

**Fix:**
```ts
add(tokens.inputTokens, price.inputUsdPerMillion)
add(tokens.cachedInputTokens, price.cachedInputUsdPerMillion)
add(tokens.cacheCreationInputTokens, price.cacheCreationInputUsdPerMillion)
add(tokens.outputTokens, price.outputUsdPerMillion)
add(tokens.reasoningOutputTokens, price.reasoningOutputUsdPerMillion)
```

If a provider reports reasoning as already included in `outputTokens`, normalize that in the scanner by not double-counting it in `totalTokens`; do not keep a separate pricing field and then ignore it globally.

## Warnings

### WR-01: WARNING - Pricing test locks in the reasoning-token undercharge

**File:** `packages/core/src/usage/pricing.test.ts:101`

**Issue:** The test named "does not double count reasoning output tokens" sets `reasoningOutputUsdPerMillion: 15` and `reasoningOutputTokens: 50_000`, but expects `7.275`, which is exactly the cost before applying the reasoning rate. This test will pass while the production cost estimate is wrong and will fail a correct implementation that charges the separate reasoning field.

**Fix:** Change the expectation to include reasoning cost for the current token model:

```ts
expect(estimateUsageCostUsd(tokens(), price)).toBe(8.025)
```

Also add a second test for providers where scanner normalization intentionally folds reasoning into output, if that representation is supported.

---

_Reviewed: 2026-05-15T11:53:03Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
