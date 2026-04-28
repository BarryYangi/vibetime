---
phase: 02-agent-adapters-core
plan: 01
subsystem: core/adapters
tags: [adapters, claude-code, codex, cursor, tdd, adpt-01, adpt-02, adpt-03, adpt-04]
requires:
  - "@vibetime/core events.ts (NormalizedEvent / AdapterFn / EventType — Phase 1)"
  - "@vibetime/core project.ts (resolveProject — Phase 1; consumed by Phase 3 hook layer)"
provides:
  - "adaptClaudeCode: AdapterFn — Claude Code hook payload normalizer (UserPromptSubmit / Stop / SessionStart / SessionEnd)"
  - "adaptCodex:      AdapterFn — Codex CLI hook payload normalizer (UserPromptSubmit / Stop / SessionStart; SessionEnd banned)"
  - "adaptCursor:     AdapterFn — Cursor hook payload normalizer (beforeSubmitPrompt / stop / sessionStart / sessionEnd)"
  - "@vibetime/core public API exports the three adapter functions"
affects:
  - "Phase 3 hook binary will import adapters via @vibetime/core barrel; will post-process event.project via resolveProject before SQLite insert (RESEARCH §D Option 3)"
tech-stack:
  added: []
  patterns:
    - "Belt-and-braces try/catch — explicit type guards inside an outer try { ... } catch { return null }, mirroring project.ts (Phase 1)"
    - "Per-vendor EVENT_TYPES lookup tables — each adapter owns its own; no cross-coupling"
    - "Per-vendor type guards (hasRequired / hasRequiredTurn / hasRequiredSession)"
    - "exactOptionalPropertyTypes spread-omit pattern for optional fields (turn_id / meta)"
    - "Seeded mulberry32 PRNG for reproducible fuzz/property testing — zero deps"
key-files:
  created:
    - "packages/core/src/adapters/claude-code.ts"
    - "packages/core/src/adapters/claude-code.test.ts"
    - "packages/core/src/adapters/codex.ts"
    - "packages/core/src/adapters/codex.test.ts"
    - "packages/core/src/adapters/cursor.ts"
    - "packages/core/src/adapters/cursor.test.ts"
    - "packages/core/src/adapters/index.ts"
    - "packages/core/src/adapters/property.test.ts"
  modified:
    - "packages/core/src/index.ts (added one re-export line for the three adapters)"
decisions:
  - "Claude Code turn_id derivation uses unrounded fractional ts (`${session_id}-${ts}`) — collision-resistance verified via fake-timer 1ms-advance test (RESEARCH §G.7)"
  - "Codex SessionEnd is BANNED at adapter level — EVENT_TYPES omits the key; future-vendor drift cannot contaminate data (RESEARCH §G.5)"
  - "Cursor empty/missing/wrong-type workspace_roots produces project='' (NOT null); Phase 3 resolveProject promotes to _unknown (RESEARCH §G.4 + §D Option 3)"
  - "V0 meta whitelist: model + source on session_start (Claude/Codex), model on session_start (Cursor), reason on session_end (Claude/Cursor). Drops prompt / stop_reason / permission_mode / status / loop_count / duration_ms / etc. per RESEARCH §G.8"
  - "Adapter signature LOCKED at DEC-011 (rawPayload, eventName) — no third gitRemoteUrl param. Hook layer (Phase 3) post-processes event.project via resolveProject before SQLite insert (RESEARCH §D Option 3)"
  - "Property test uses seeded mulberry32 (seed=42) — reproducible across runs; verified by 3 consecutive invocations all green"
  - "Two-step `as unknown as` cast on turn_id branches in codex.ts / cursor.ts — TS2352 fix; the runtime hasRequiredTurn guard already proves the field is present (Rule 1 type fix discovered during typecheck)"
requirements-completed: [ADPT-01, ADPT-02, ADPT-03, ADPT-04]
metrics:
  duration_minutes: 7
  test_count_phase: 45
  test_count_total: 76
  files_created: 8
  files_modified: 1
  commits: 4
completed: 2026-04-28
---

# Phase 2 Plan 01: Agent Adapters in `core` Summary

JWT-style mapping table executed: three pure-function vendor adapters (`adaptClaudeCode` / `adaptCodex` / `adaptCursor`) ship in `@vibetime/core` with locked DEC-011 signature, never-throws contract, full PRD §8 coverage, and a seeded mulberry32 property test asserting null | NormalizedEvent across 3600 mutations per CI run. `pnpm run ci` exits 0 with `core` runtime dependencies still empty.

## What Shipped

### Three vendor adapters

Each adapter implements `(rawPayload: unknown, eventName: string) => NormalizedEvent | null`, follows the §C four-step defensive template, and wraps its body in an outer `try/catch` belt-and-braces (mirroring `project.ts:62-97` from Phase 1).

- **`adaptClaudeCode`** — maps `UserPromptSubmit` / `Stop` / `SessionStart` / `SessionEnd`. `turn_id` derived as `${session_id}-${ts}` with fractional `ts` for collision-resistance (verified via `vi.advanceTimersByTime(1)` test). V0 meta whitelist: `model + source` on session_start; `reason` on session_end.
- **`adaptCodex`** — maps `UserPromptSubmit` / `Stop` / `SessionStart` only. **`SessionEnd` deliberately omitted** from `EVENT_TYPES` — Codex doesn't emit it (verified absent from `codex-rs/hooks/schema/generated/`); Phase 3's hook lifecycle synthesizes session_end from process exit. `turn_id` is vendor-provided (`payload.turn_id`), not derived.
- **`adaptCursor`** — maps camelCase `beforeSubmitPrompt` / `stop` / `sessionStart` / `sessionEnd`. Field renames: `session_id ← conversation_id`, `turn_id ← generation_id`, `project ← workspace_roots[0]`. Empty/missing/wrong-type `workspace_roots` ⇒ `project=''` (Phase 3 promotes to `_unknown`). `model` extracted opportunistically per RESEARCH §A.3 doc-asymmetry.

### Test coverage

| File | Specs | Notes |
|------|------:|-------|
| `claude-code.test.ts` | 14 | 4 happy + 8 adversarial (incl. Proxy) + 2 turn_id derivation (fake timers) |
| `codex.test.ts`       | 13 | 3 happy + 2 SessionEnd-banned + 8 adversarial |
| `cursor.test.ts`      | 15 | 5 happy (incl. model-present/absent branches, sessionEnd reason) + 10 adversarial (incl. workspace_roots empty/missing/not-an-array) |
| `property.test.ts`    |  3 | mulberry32 seed=42; 200 mutations × 6 event names × 3 adapters |
| **Phase 2 total**     | **45** | |
| Phase 1 baseline      | 31 | events / schema / project tests |
| **Repo total**        | **76** | |

### Public API additions

`packages/core/src/index.ts` adds one re-export line:

```typescript
export { adaptClaudeCode, adaptCodex, adaptCursor } from './adapters/index.js'
```

All five Phase-1 exports preserved (events types / ResolveProjectInput / parseGitRemoteUrl + resolveProject / DDL constants).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `b966ced` | `feat(02-01): add Claude Code adapter with TDD (ADPT-01)` |
| 2 | `24ba7aa` | `feat(02-01): add Codex adapter with SessionEnd banned (ADPT-02)` |
| 3 | `c7803a6` | `feat(02-01): add Cursor adapter with workspace_roots edge cases (ADPT-03)` |
| 4 | `98c6d7c` | `feat(02-01): wire adapter barrel + seeded property test + public API export (ADPT-04); pnpm run ci green` |

## Verification Evidence

### File presence (all 8 new + 1 modified)

```
packages/core/src/adapters/claude-code.ts        (4.5k)
packages/core/src/adapters/claude-code.test.ts   (5.6k)
packages/core/src/adapters/codex.ts              (5.3k)
packages/core/src/adapters/codex.test.ts         (4.2k)
packages/core/src/adapters/cursor.ts             (5.4k)
packages/core/src/adapters/cursor.test.ts        (6.0k)
packages/core/src/adapters/index.ts              (290B)
packages/core/src/adapters/property.test.ts      (4.6k)
packages/core/src/index.ts                       (modified — one new line)
```

### Zero forbidden imports across adapters/

```
$ grep -rnE "from ['\"](node:|^node$|^fs$|^path$|^child_process$|@types/node)" packages/core/src/adapters/
# → no match (exit 1)
```

### Codex SessionEnd ban verified at source

```
$ grep -E "^\s*SessionEnd:\s*'session_end'" packages/core/src/adapters/codex.ts
# → no match (exit 1)
```

### Cursor workspace_roots known-limitation documented

```
$ grep -ic "workspace_roots" packages/core/src/adapters/cursor.ts
7
```

### Belt-and-braces try/catch present in all three adapters

```
claude-code.ts: try {  ×1, } catch ×1
codex.ts:       try {  ×1, } catch ×1
cursor.ts:      try {  ×1, } catch ×1
```

### `core` runtime deps still empty

```
$ node -e "const p=require('./packages/core/package.json'); console.log('deps:', JSON.stringify(p.dependencies||{}));"
deps: {}
```

### `pnpm run ci` exit 0

All five gates green:
- `pnpm typecheck` (tsc -b across all packages)
- `pnpm lint` (biome check .) — no errors, no warnings
- `pnpm test` — 76 passed (6 test files)
- `pnpm depcheck` — no dependency violations found (53 modules, 49 dependencies cruised)
- `pnpm verify:core-zero-deps` — passed

### Property test reproducibility (3 consecutive runs)

```
--- run 1 ---  Tests  3 passed (3)
--- run 2 ---  Tests  3 passed (3)
--- run 3 ---  Tests  3 passed (3)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan-source epoch arithmetic slip (claude-code turn_id derivation test)**

- **Found during:** Task 1 GREEN phase.
- **Issue:** Plan §Task-1 / behavior — Test 13 specifies `turn_id === 'sid-1761739200'` (plan template) with regex `/^sid-1777723200(\.0+)?$/` for system time `2026-04-28T12:00:00Z`. The actual epoch for that instant is `1777377600` (verified via `Date.parse('2026-04-28T12:00:00Z') / 1000`). Both literals were arithmetic slips in the planning notes — different month / different time-of-day used to compute different example values.
- **Fix:** Test asserts the actually-computed epoch `1777377600` with explanatory comment citing the verification command.
- **Files modified:** `packages/core/src/adapters/claude-code.test.ts` (line 154 region).
- **Commit:** `b966ced`.

**2. [Rule 1 — Bug] TypeScript TS2352 on turn_id branch in codex.ts and cursor.ts**

- **Found during:** Task 4 final CI gate (typecheck stage).
- **Issue:** `if (isTurn) { hasRequiredTurn(p) } else { hasRequiredSession(p) }` narrows the same `rawPayload` symbol via two distinct guards. After the if/else, downstream `(rawPayload as { turn_id: string }).turn_id` (codex) and `(rawPayload as { generation_id: string }).generation_id` (cursor) hit TS2352 because the narrowed session-shape doesn't sufficiently overlap with the asserted turn-shape.
- **Fix:** Two-step `as unknown as` cast on the turn-only branch — the runtime `hasRequiredTurn` guard above already proves the field is present; the TS noise is pure type-system bookkeeping. Comment explains the intent in source.
- **Files modified:** `packages/core/src/adapters/codex.ts`, `packages/core/src/adapters/cursor.ts`.
- **Commit:** `98c6d7c`.

### Auto-applied formatter fixes

**3. [Style] Biome `--write` auto-fixes (Task 4 CI lint stage)**

Biome's lint surfaced two safe-fix categories:
- import-sort on `packages/core/src/index.ts` (export grouping order).
- one-line function signature collapse on `cursor.ts`'s `hasRequiredTurn` helper (under 100-col width).

Both auto-applied via `pnpm exec biome check --write packages/core/src`. No logic change. Re-running `pnpm run ci` afterward exits 0. Reported per Phase-1-deviation pattern.

### Out-of-scope discoveries

None. All 76 tests in the repo are now green. No deferred items written.

## Self-Check: PASSED

- [x] FOUND: `packages/core/src/adapters/claude-code.ts`
- [x] FOUND: `packages/core/src/adapters/claude-code.test.ts`
- [x] FOUND: `packages/core/src/adapters/codex.ts`
- [x] FOUND: `packages/core/src/adapters/codex.test.ts`
- [x] FOUND: `packages/core/src/adapters/cursor.ts`
- [x] FOUND: `packages/core/src/adapters/cursor.test.ts`
- [x] FOUND: `packages/core/src/adapters/index.ts`
- [x] FOUND: `packages/core/src/adapters/property.test.ts`
- [x] FOUND: `packages/core/src/index.ts` (modified)
- [x] FOUND commit `b966ced`
- [x] FOUND commit `24ba7aa`
- [x] FOUND commit `c7803a6`
- [x] FOUND commit `98c6d7c`

## TDD Gate Compliance

- Task 1 (Claude Code): RED observed (`Cannot find module './claude-code.js'`) → GREEN observed (14/14 pass). Single `feat(02-01)` commit per the plan's combined-RED+GREEN action protocol.
- Task 2 (Codex): RED → GREEN (13/13 pass).
- Task 3 (Cursor): RED → GREEN (15/15 pass).
- Task 4 (barrel + property + public-API + CI gate): NOT TDD by plan design — aggregation/wiring with no new behavior to test-drive (per `<task type="auto" tdd="false">` in plan).

## Phase 2 Handoff

`@vibetime/core` adapter surface ready for Phase 3 hook-layer integration:

1. **Import path:** `import { adaptClaudeCode, adaptCodex, adaptCursor } from '@vibetime/core'`.
2. **Contract:** `(rawPayload: unknown, eventName: string) => NormalizedEvent | null`. Pure. Never throws.
3. **Project post-pass required:** every adapter sets `event.project = <raw cwd from payload>` (Cursor: `workspace_roots[0]` or `''`). Phase 3 hook MUST call `resolveProject({ cwd: event.project, aliases, gitRemoteUrl })` and overwrite `event.project` BEFORE `INSERT INTO events` (RESEARCH §D Option 3 / DEC-010).
4. **Codex session-end:** the adapter REJECTS `eventName === 'SessionEnd'`. Phase 3 hook lifecycle synthesizes session_end from process-exit fallback (PRD §8 Codex caveat) and writes directly without going through the adapter.
5. **`gitRemoteUrl` fetching:** Phase 3 hook is responsible for `git -C <cwd> config --get remote.origin.url` (catching errors, returning null). `core` purity preserved.

Phase 3 plans can begin once Phase 2 verifier signs off.
