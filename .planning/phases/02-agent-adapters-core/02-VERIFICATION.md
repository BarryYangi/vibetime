---
phase: 02-agent-adapters-core
verified: 2026-04-28T18:55:00Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
---

# Phase 2: Agent Adapters in `core` — Verification Report

**Phase Goal (ROADMAP.md):** "Three pure-function adapters that map vendor hook payloads to NormalizedEvent (or null), provably never throw, and are fully tested against fixtures."

**Verified:** 2026-04-28T18:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from 02-01-PLAN.md must_haves.truths)

| #   | Truth                                                                                                                                | Status     | Evidence                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | adaptClaudeCode happy paths for UserPromptSubmit / Stop / SessionStart / SessionEnd return correct NormalizedEvent + agent='claude-code' | ✓ VERIFIED | `claude-code.test.ts` lines 7-81: 4 happy-path specs, all assert event_type per DEC-011 mapping; vitest 14/14 green       |
| 2   | adaptClaudeCode UserPromptSubmit produces turn_id matching `${session_id}-${ts}` (PRD §8 derivation)                                | ✓ VERIFIED | `claude-code.test.ts:144-165`: fake-timer test asserts `/^sid-1777377600(\.0+)?$/` + collision-resistance via 1ms advance |
| 3   | adaptCodex happy paths for UserPromptSubmit / Stop / SessionStart return NormalizedEvent + agent='codex'                            | ✓ VERIFIED | `codex.test.ts` lines 6-65: 3 happy-path specs; vitest 13/13 green                                                        |
| 4   | adaptCodex with eventName='SessionEnd' returns null (banned)                                                                         | ✓ VERIFIED | `codex.ts:24-28` EVENT_TYPES omits SessionEnd; `codex.test.ts:67-80`: PascalCase + camelCase variants both → null         |
| 5   | adaptCursor happy paths for camelCase events with conversation_id/generation_id/workspace_roots[0] mapping                          | ✓ VERIFIED | `cursor.test.ts:7-100`: 5 happy-path specs covering all 4 event names + model present/absent branches                     |
| 6   | adaptCursor with workspace_roots:[] returns event with project=''                                                                   | ✓ VERIFIED | `cursor.ts:90`: `Array.isArray(ws) && typeof ws[0] === 'string' ? ws[0] : ''`; `cursor.test.ts:139-175`: 3 edge specs    |
| 7   | All three adapters return null on null/undefined/string/number/wrong-typed payloads — never throw                                   | ✓ VERIFIED | Adversarial blocks in all 3 test files (≥6, ≥8, ≥10 specs); each adapter wraps body in outer try/catch                  |
| 8   | All three adapters return null on unknown event names                                                                               | ✓ VERIFIED | Tests for `''`, `PostToolBatch`, `PostToolUse`, `UnknownCursorEvent` in respective files; EVENT_TYPES lookup gates entry |
| 9   | All three adapters return null when given a Proxy that throws on every getter (belt-and-braces)                                     | ✓ VERIFIED | `Proxy({ get() { throw } })` adversarial in `claude-code.test.ts:118`, `codex.test.ts:118`, `cursor.test.ts:183`         |
| 10  | Property test runs ≥200 mutations per adapter (mulberry32 seeded); every result is null \| NormalizedEvent; never throws            | ✓ VERIFIED | `property.test.ts:117/131/145`: `for (let i = 0; i < 200; i++)` × 6 event names × 3 adapters = 3600 mutations green       |
| 11  | Public @vibetime/core API exports adaptClaudeCode, adaptCodex, adaptCursor                                                          | ✓ VERIFIED | `packages/core/src/index.ts:3`: `export { adaptClaudeCode, adaptCodex, adaptCursor } from './adapters/index.js'`         |
| 12  | `pnpm run ci` exits 0 (typecheck + biome + vitest + depcheck + verify:core-zero-deps)                                               | ✓ VERIFIED | Live run 2026-04-28T18:55: exit 0; 76 specs across 6 test files green; depcruise 53 modules / 49 deps clean              |
| 13  | No new runtime dependency added to packages/core/package.json (dependencies remains {})                                             | ✓ VERIFIED | `node -e "...p.dependencies"` → `deps: {}`; verify:core-zero-deps script exits 0                                          |
| 14  | No node:* / fs / path / child_process / third-party import in any new adapters/*.ts                                                 | ✓ VERIFIED | Grep `from ['"](node:|^node$|^fs$|^path$|^child_process$|@types/node)` against `packages/core/src/adapters/` → 0 hits     |

**Score:** 14/14 truths verified

### ROADMAP Success Criteria Cross-Check

| #   | ROADMAP SC                                                                                              | Status     | Mapped Truth(s) |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | --------------- |
| 1   | Claude adapter: 4 canonical events + DEC-011 mapping + turn_id `${session_id}-${ts}` unit-tested       | ✓ VERIFIED | T1, T2          |
| 2   | Codex adapter: 3 events + documented absent-SessionEnd (process-exit fallback in Phase 3)              | ✓ VERIFIED | T3, T4          |
| 3   | Cursor adapter: conversation_id/generation_id/workspace_roots[0] + workspace_roots[1..] limitation doc | ✓ VERIFIED | T5, T6 + `cursor.ts:46-47` source comment "workspace_roots[1..] ignored" |
| 4   | Adversarial-input test suite (missing fields, wrong types, unknown event names) — null, never throws   | ✓ VERIFIED | T7, T8, T9, T10 |
| 5   | Adapter unit tests use fixtures derived from PRD Appendix; run in CI                                   | ✓ VERIFIED | T1-T6 fixtures (notably `cursor.test.ts:9-17, 32-41` PRD Appendix verbatim); CI runs vitest |

### Required Artifacts (3-Level + Wiring)

| Artifact                                              | Exists | Substantive | Wired | Status     |
| ----------------------------------------------------- | ------ | ----------- | ----- | ---------- |
| `packages/core/src/adapters/claude-code.ts`           | ✓      | ✓ (107 LOC, full DEC-011 logic) | ✓ (re-exported by adapters/index.ts) | ✓ VERIFIED |
| `packages/core/src/adapters/claude-code.test.ts`      | ✓      | ✓ (14 specs)                    | ✓ (vitest discovers via *.test.ts)   | ✓ VERIFIED |
| `packages/core/src/adapters/codex.ts`                 | ✓      | ✓ (125 LOC, SessionEnd banned)  | ✓ (re-exported)                       | ✓ VERIFIED |
| `packages/core/src/adapters/codex.test.ts`            | ✓      | ✓ (13 specs)                    | ✓                                     | ✓ VERIFIED |
| `packages/core/src/adapters/cursor.ts`                | ✓      | ✓ (131 LOC, workspace_roots edge cases) | ✓                              | ✓ VERIFIED |
| `packages/core/src/adapters/cursor.test.ts`           | ✓      | ✓ (15 specs)                    | ✓                                     | ✓ VERIFIED |
| `packages/core/src/adapters/index.ts`                 | ✓      | ✓ (3 named re-exports)          | ✓ (consumed by `core/src/index.ts:3`)| ✓ VERIFIED |
| `packages/core/src/adapters/property.test.ts`         | ✓      | ✓ (mulberry32 + 3 specs × 200 mutations × 6 names) | ✓ (vitest discovers) | ✓ VERIFIED |
| `packages/core/src/index.ts` (modified barrel)        | ✓      | ✓ (line 3 added; pre-existing exports preserved) | ✓ (entry point consumed by future `hook` / `desktop`) | ✓ VERIFIED |

### Key Link Verification

| From                          | To                                  | Via                              | Status | Detail                                                                       |
| ----------------------------- | ----------------------------------- | -------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `adapters/claude-code.ts`     | `events.ts`                         | `import type AdapterFn / NormalizedEvent / EventType` | WIRED | Line 8: `import type { AdapterFn, EventType, NormalizedEvent } from '../events.js'` |
| `adapters/codex.ts`           | `events.ts`                         | `import type ...`                | WIRED  | Line 20 same shape                                                           |
| `adapters/cursor.ts`          | `events.ts`                         | `import type ...`                | WIRED  | Line 7 same shape                                                            |
| `adapters/index.ts`           | `claude-code.ts` / `codex.ts` / `cursor.ts` | named re-exports          | WIRED  | Lines 4-6: `export { adaptClaudeCode } from './claude-code.js'` (×3)         |
| `core/src/index.ts`           | `adapters/index.ts`                 | barrel re-export                 | WIRED  | Line 3: `export { adaptClaudeCode, adaptCodex, adaptCursor } from './adapters/index.js'` |

### Data-Flow Trace (Level 4)

N/A — Phase 2 ships pure utility functions (vendor → NormalizedEvent transformers). No dynamic-data rendering surface; data flow is exercised by the property test (3600 mutated payloads → null|NormalizedEvent) which is itself the level-4 stand-in.

### Behavioral Spot-Checks

| Behavior                                              | Command                                          | Result                                                | Status |
| ----------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ------ |
| Module exports adaptClaudeCode/adaptCodex/adaptCursor | grep export in `core/src/index.ts`              | One re-export line present                            | ✓ PASS |
| Property test runs ≥200 mutations × 3 adapters       | `pnpm run ci` (vitest stage)                    | `property.test.ts (3 tests)` 242ms green              | ✓ PASS |
| `pnpm run ci` exits 0                                 | `pnpm run ci`                                    | EXIT_CODE=0; 76 specs green; depcruise clean          | ✓ PASS |
| Zero forbidden imports in adapters/                   | grep `node:|fs|path|child_process|@types/node`  | 0 hits                                                | ✓ PASS |
| Codex SessionEnd absent from EVENT_TYPES              | grep `^\s*SessionEnd:\s*'session_end'` codex.ts | 0 hits (banned at source)                             | ✓ PASS |
| @vibetime/core has zero runtime deps                  | `node -e "...p.dependencies"`                    | `deps: {}`                                            | ✓ PASS |
| All 4 Phase-2 commits exist                           | `git log --oneline`                              | b966ced, 24ba7aa, c7803a6, 98c6d7c all present        | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                             | Status      | Evidence                                                                                  |
| ----------- | ----------- | --------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| ADPT-01     | 02-01       | Claude Code adapter: UserPromptSubmit/Stop/SessionStart/SessionEnd → NormalizedEvent\|null; pure; never throws | ✓ SATISFIED | T1, T2, T7, T9 + `claude-code.ts` source + 14 specs green                                 |
| ADPT-02     | 02-01       | Codex adapter: UserPromptSubmit/Stop/SessionStart (process-exit fallback for session-end); pure; never throws | ✓ SATISFIED | T3, T4, T7, T9 + `codex.ts` SessionEnd banned + 13 specs green; SessionEnd handling documented in source header & RESEARCH §G.5 |
| ADPT-03     | 02-01       | Cursor adapter: beforeSubmitPrompt/stop/sessionStart/sessionEnd; workspace_roots[0]/conversation_id/generation_id; pure; never throws | ✓ SATISFIED | T5, T6, T7, T9 + `cursor.ts` source + 15 specs green; workspace_roots[1..] limitation documented at `cursor.ts:46-47` |
| ADPT-04     | 02-01       | All three adapters covered by unit tests using fixtures based on PRD Appendix payload examples | ✓ SATISFIED | PRD-Appendix-verbatim fixtures in `cursor.test.ts:9-17, 32-41`; mechanically-derived fixtures elsewhere; property test (mulberry32 seed=42) adds ≥200-mutation coverage; 45 Phase-2 specs all green in CI |

REQUIREMENTS.md Traceability table (lines 177-180) marks all four ADPT-* as "Done (Plan 02-01)" — matches the verified state.

No orphaned requirements: REQUIREMENTS.md maps exactly ADPT-01..04 to Phase 2 and the plan claims all four — 1:1 coverage.

### Anti-Patterns Found

| File                                              | Line   | Pattern                                                       | Severity | Impact                                                                                                |
| ------------------------------------------------- | ------ | ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `packages/core/src/adapters/claude-code.test.ts`  | 144:27 | biome `lint/suspicious/noTemplateCurlyInString` warning       | ℹ️ Info  | Test description string contains literal `${session_id}-${ts}` documentation. CI exits 0 — biome treats warnings as non-fatal. Does not block goal. SUMMARY's "no errors, no warnings" claim is technically inaccurate but the gate (CI exit 0) is intact. |
| `packages/core/src/project.ts`                    | 33-42  | 4× biome `lint/complexity/useOptionalChain` warnings          | ℹ️ Info  | Phase-1 file (out of Phase-2 scope). Not a Phase-2 gap.                                              |

No stub patterns (TODO/FIXME/placeholder/empty handlers/hardcoded empty data) found in any of the 8 new Phase-2 files. The `(rawPayload as { ... }).field` casts are intentional defensive guards documented in source. The two-step `as unknown as` casts on turn-id branches are the documented TS2352 fix in SUMMARY's deviations section.

### Human Verification Required

None. Phase 2 is pure-function library code with full deterministic test coverage; all goal-relevant behaviors are programmatically verifiable.

## Goal Achievement Summary

Phase 2 目标全部达成，14 项 must-haves 与 5 项 ROADMAP 成功标准均已通过验证：

- 三个 vendor 适配器 (`adaptClaudeCode` / `adaptCodex` / `adaptCursor`) 均按 DEC-011 锁定签名实现，源码各 ~110-130 LOC，外层 `try/catch` belt-and-braces 模式与 Phase 1 `project.ts:62-97` 一致。
- never-throws 不变量经多重证据验证：每个 adapter 的对抗测试套件均含 Proxy-throw-on-getter 用例；seeded mulberry32 property test 跨 200 突变 × 6 事件名 × 3 adapter = 3600 案例全部断言 `null | NormalizedEvent` 且不抛出。
- DEC-011 规约严守：`(rawPayload, eventName) => NormalizedEvent | null`，零第三参数；`event.project = <raw cwd>` 由 Phase 3 钩子层经 `resolveProject` 后处理。
- Codex `SessionEnd` 在源码层 (EVENT_TYPES) 被刻意 ban，含案例不变性测试 (PascalCase + camelCase 变体均返回 null)。
- Cursor `workspace_roots[1..]` 已知限制在 `cursor.ts:46-47` 源码注释中明确文档化。
- `pnpm run ci` 实测 exit 0；`@vibetime/core` runtime deps 仍为 `{}`；adapters/* 目录无 `node:*` / `fs` / `path` / `child_process` / `@types/node` 任一禁止 import。

唯一可记录的偏差：SUMMARY 自检脚本声称 biome "no errors, no warnings"，实际 ci 输出报 5 条警告 (4 条来自 Phase-1 `project.ts`，1 条来自 Phase-2 `claude-code.test.ts:144` 的 `noTemplateCurlyInString`，均为 informational，CI 退出码 0 不受影响)。属信息级噪声，不阻塞目标，无需 gap 关闭计划。

Phase 3 (`hook` 二进制 + 数据库写入) 可基于本阶段交付的 `@vibetime/core` 适配器表面继续推进。

---

_Verified: 2026-04-28T18:55:00Z_
_Verifier: Claude (gsd-verifier)_
