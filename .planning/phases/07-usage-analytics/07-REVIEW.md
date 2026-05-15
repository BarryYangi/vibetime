---
phase: 07-usage-analytics
reviewed: 2026-05-15T12:36:51Z
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
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-05-15T12:36:51Z
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

按标准深度复审 Phase 07 同一批 40 个文件，包含最新修复提交 `06b4bef` 以及此前 Phase 07 review-fix 提交。重点复核了用量扫描、归因、定价、IPC 参数校验、后台刷新、渲染层缓存命中指标和相关测试。

行为层面未发现新的 Blocker。最新提交已把缓存命中详情从 `cachedInputTokens + cacheCreationInputTokens` 改为只显示 `cachedInputTokens`，与 `cacheHitRate()` 的分子一致；partial pricing 仍按 unknown-cost 路径处理。剩余问题是这次修复没有直接回归测试覆盖，后续改动可轻易把该指标重新改错而测试仍全绿。

验证执行：

- `rtk pnpm typecheck` 通过。
- `rtk pnpm lint` 通过。
- `rtk pnpm test` 通过：desktop/core Vitest 23 files / 170 tests，hook Bun 192 tests。

## Warnings

### WR-01: WARNING - 缓存命中详情修复缺少直接回归测试

**File:** `packages/desktop/src/renderer/src/views/Usage.tsx:761`

**Issue:** 最新修复已使缓存命中率详情只显示 `summary.tokenBreakdown.cachedInputTokens`，但现有测试只覆盖 scanner、pricing、aggregate、IPC/store 层；`rg` 未找到任何测试断言 `Usage.tsx` 中 cache hit stat 的渲染输出。若未来有人把详情重新改成包含 `cacheCreationInputTokens`，当前 `rtk pnpm test` 仍会通过，前次审查指出的 write-only cache workload 显示不一致问题会回归。

**Fix:** 增加一个渲染层回归测试，构造 `cacheCreationInputTokens > 0` 且 `cachedInputTokens === 0` 的 summary，断言缓存命中卡片显示 `0%` 且详情为 `0 cached tokens` / `0 缓存 Token`。可选实现是把 `cacheHitRate` 和缓存详情格式化逻辑抽到可测试 helper，或用 Testing Library 渲染 `Usage` 并 stub `window.api.invoke('getUsageSummary')`：

```tsx
expect(screen.getByText('0%')).toBeInTheDocument()
expect(screen.getByText(/0\s+cached tokens/i)).toBeInTheDocument()
expect(screen.queryByText(/cache creation/i)).not.toBeInTheDocument()
```

---

_Reviewed: 2026-05-15T12:36:51Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
