---
phase: 01-foundations-decisions-gate
plan: 03
subsystem: core-library
tags: [core, types, ddl, project-resolution, tdd, fnd-02, fnd-03, fnd-04]

requires:
  - phase: 01-foundations-decisions-gate plan 01
    provides: pnpm workspace, TS project refs, Biome, Vitest 3.2.4, dep-cruiser, `core` skeleton with types:[] and dependencies:{}
  - phase: 01-foundations-decisions-gate plan 02
    provides: PRD §16 gate cleared (DECISIONS.md approved 2026-04-28 commit c32a821)
provides:
  - "@vibetime/core public API: NormalizedEvent / Agent / EventType / AdapterFn (DEC-011 / PRD §8)"
  - "DDL_EVENTS / DDL_OPEN_TURNS / DDL_INDICES / SCHEMA_VERSION — byte-exact PRD §6 (no IF NOT EXISTS)"
  - "parseGitRemoteUrl + resolveProject (DEC-010 first-match-wins) — pure logic, zero imports, never throws"
  - "Vitest fixture matrix proving FND-04 (13 parseGitRemoteUrl rows + 11 resolveProject specs + never-throws property)"
  - "DDL equality test proving FND-03 (prefix exactness + per-column substring + IF-NOT-EXISTS exclusion)"
affects:
  - phase 02 (Agent Adapters in core) — adapters can now import NormalizedEvent / AdapterFn / Agent / EventType
  - phase 03 (Hook Binary, Store & Install) — DDL constants ready for store init; resolveProject ready for hook caller integration
  - phases 04..06 — entire downstream stack imports from @vibetime/core public API

tech-stack:
  added: []
  patterns:
    - "TDD execution: failing test (RED) → minimal implementation (GREEN) per task; both Plan-03 tasks ran the cycle"
    - "Zero-import core/src purity: events.ts, schema.ts, project.ts have no `import` statements; only `import type` in tests"
    - "Defensive `belt-and-braces` try/catch on resolveProject — documented intentional last-line-of-defense for DEC-010 never-throws contract"
    - "Hand-rolled regex set for git URL parsing (SSH / HTTPS+credstrip / ssh:// / git://) — reference: GitHub Desktop remote-parsing.ts"
    - "POSIX-only cwd basename via `cwd.split('/').filter(s => s.length > 0).pop()` — V0 macOS-only per CON-non-goal-no-cross-platform"

key-files:
  created:
    - packages/core/src/events.ts
    - packages/core/src/schema.ts
    - packages/core/src/schema.test.ts
    - packages/core/src/project.ts
    - packages/core/src/project.test.ts
  modified:
    - packages/core/src/index.ts (barrel: now re-exports the full public API instead of `export {}`)
    - .dependency-cruiser.cjs (Rule 1 false-positive fix: scope `core-must-be-pure` to exclude *.test.ts files)

key-decisions:
  - "DDL strings byte-exact PRD §6 (no IF NOT EXISTS added). Idempotency belongs to Phase 3 store init, not the Phase 1 string contract."
  - "GitLab subgroup policy: full path 'group/sub/repo' (D-GITLAB-SUBGROUP / A5 confirmed by user)"
  - "POSIX cwd-split (no node:path import; V0 macOS-only per A6)"
  - "belt-and-braces try/catch retained on resolveProject with explicit comment — intentional defensive coding for the never-throws contract, not redundancy"
  - "dep-cruiser core-must-be-pure rule path scope tightened from `^packages/core/src/` to `^packages/core/src/` excluding `*.test.ts` — same scope-narrowing pattern as Plan 01-01 deviation #2 (test files import vitest devDep, runtime contract preserved)"

requirements-completed:
  - FND-02
  - FND-03
  - FND-04

duration: 6m 23s
completed: 2026-04-28
---

# Phase 01 Plan 03: Core Library Code Summary

**`@vibetime/core` ships the locked NormalizedEvent + AdapterFn types, byte-exact PRD §6 DDL constants (no IF-NOT-EXISTS clause), and the bulletproof first-match resolveProject + parseGitRemoteUrl helpers — `pnpm run ci` green; FND-02 / FND-03 / FND-04 mechanically satisfied; Phase 1 implementation work complete.**

## Performance

- **Duration:** ~6 min 23 sec (383 s)
- **Started:** 2026-04-28T09:25:26Z
- **Completed:** 2026-04-28T09:31:49Z
- **Tasks:** 2 / 2 complete
- **Files added:** 5 created + 2 modified = 7 (`events.ts`, `schema.ts`, `schema.test.ts`, `project.ts`, `project.test.ts` created; `index.ts` + `.dependency-cruiser.cjs` modified)

## Accomplishments

- Locked DEC-011 `NormalizedEvent` interface + `AdapterFn` signature shipped in `packages/core/src/events.ts` (zero imports; pure type declarations).
- PRD §6 SQL DDL constants shipped byte-exact in `packages/core/src/schema.ts` (no `IF NOT EXISTS` clause anywhere — FND-03 byte-exactness invariant mechanically holds; idempotency deferred to Phase 3 store init).
- DEC-010 first-match-wins `resolveProject` + companion `parseGitRemoteUrl` shipped in `packages/core/src/project.ts` (pure logic, zero imports, never throws).
- Vitest fixture matrix proving FND-04: 13 `parseGitRemoteUrl` rows (SSH ±.git, HTTPS ±.git ±credentials, GitLab subgroup → `group/sub/repo`, `ssh://`, `git://`, Bitbucket, malformed, empty, null, undefined) plus 11 `resolveProject` specs (4 first-match rules + the never-throws property test) — 24 tests, all green.
- Schema-equality test proving FND-03: 7 specs covering DDL prefix exactness, per-column substring presence, the 4 indices, `SCHEMA_VERSION` literal type `1`, and the type-shape contract for `NormalizedEvent` / `Agent` / `EventType` / `AdapterFn` — all green.
- `@vibetime/core` barrel re-exports the full public API: 4 types + 4 schema values + `parseGitRemoteUrl` + `resolveProject` + `ResolveProjectInput`.
- `pnpm run ci` exits 0 (typecheck + lint + test + depcheck + verify:core-zero-deps all green) on the new core source. Phase 1 gate cleared.

## Task Commits

Each task was committed atomically on `main` (sequential mode):

1. **Task 1: events.ts + schema.ts + schema.test.ts (TDD)** — `c0c8a60`
2. **Task 2: project.ts + project.test.ts + index.ts barrel (TDD)** — `988c553`

## Files Created/Modified

### Task 1 (`c0c8a60`)
- `packages/core/src/events.ts` (31 lines) — `Agent` / `EventType` / `NormalizedEvent` / `AdapterFn` per DEC-011
- `packages/core/src/schema.ts` (44 lines) — `SCHEMA_VERSION` (literal `1`) + `DDL_EVENTS` + `DDL_OPEN_TURNS` + `DDL_INDICES` (4 strings); DDL byte-exact PRD §6
- `packages/core/src/schema.test.ts` (86 lines) — 7 specs proving FND-03
- `.dependency-cruiser.cjs` (modified) — `core-must-be-pure` rule scope narrowed to exclude `*.test.ts` files (Rule 1 false-positive fix)

### Task 2 (`988c553`)
- `packages/core/src/project.ts` (97 lines) — `parseGitRemoteUrl` + `resolveProject` + `ResolveProjectInput`; zero imports
- `packages/core/src/project.test.ts` (105 lines) — 13 parseGitRemoteUrl + 11 resolveProject specs (24 tests)
- `packages/core/src/index.ts` (5 lines) — barrel re-exporting the locked public API (replaces the `export {}` placeholder from Plan 01)

## Verification Evidence

### grep-able acceptance criteria — all pass

```text
events.ts EXISTS
schema.ts EXISTS
schema.test.ts EXISTS
project.ts EXISTS
project.test.ts EXISTS
grep "interface NormalizedEvent" packages/core/src/events.ts → match
grep "export type AdapterFn"     packages/core/src/events.ts → match
grep "DDL_EVENTS"                packages/core/src/schema.ts → match
grep "SCHEMA_VERSION = 1 as const" packages/core/src/schema.ts → match
! grep "IF NOT EXISTS"           packages/core/src/schema.ts → no match (FND-03 byte-exactness OK)
grep "CREATE TABLE events ("     packages/core/src/schema.ts → match (line 15)
grep "CREATE TABLE open_turns (" packages/core/src/schema.ts → match (line 29)
grep "export function resolveProject"   packages/core/src/project.ts → match
grep "export function parseGitRemoteUrl" packages/core/src/project.ts → match
grep "belt-and-braces"           packages/core/src/project.ts → match (line 62)
grep "ResolveProjectInput"       packages/core/src/index.ts → match
grep "DDL_EVENTS"                packages/core/src/index.ts → match
! grep -rE "from 'node:|require\('node:|from 'fs'|from 'path'|from 'child_process'" packages/core/src/ → no match (zero node-builtin imports)
node -e "const p=require('./packages/core/package.json');process.exit(Object.keys(p.dependencies||{}).length)" → exit 0 (deps={})
```

### `pnpm run ci` — exit 0

Final pipeline output (last green run):
- `pnpm typecheck` (tsc -b): no errors
- `pnpm lint` (biome check .): 0 errors, 4 informational warnings (`useOptionalChain` unsafe-fix suggestions — non-blocking; safe-fixes already applied)
- `pnpm test` (vitest run): **2 test files, 31 tests passed** (`schema.test.ts` 7 specs + `project.test.ts` 24 specs)
- `pnpm depcheck` (depcruise): `no dependency violations found (29 modules, 17 dependencies cruised)`
- `pnpm verify:core-zero-deps`: `core` `dependencies: {}` confirmed

### `packages/core/package.json#dependencies === {}`

```bash
$ node -e "const p=require('./packages/core/package.json');console.log(JSON.stringify(p.dependencies))"
{}
```

The empty-deps invariant survived Plan 01-03's source additions — no runtime dependency crept in.

### Source-line counts

```text
      31 packages/core/src/events.ts
      44 packages/core/src/schema.ts
      97 packages/core/src/project.ts
       5 packages/core/src/index.ts
     177 total
```

All four source files comfortably under the 120 LOC sanity ceiling. Tests: `schema.test.ts` 86 lines, `project.test.ts` 105 lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug in plan boilerplate] `IF NOT EXISTS` literal in schema.ts header comment violated FND-03 grep guard**
- **Found during:** Task 1 verification (`grep -c "IF NOT EXISTS" packages/core/src/schema.ts` returned 1, breaking the `! grep -q` invariant).
- **Issue:** The plan's recommended source comment for `schema.ts` literally contained the words "`IF NOT EXISTS` is added" inside the FND-03 explanation. While semantically the comment said "no IF NOT EXISTS is added", the literal substring `IF NOT EXISTS` appearing anywhere in the file fails the byte-exactness grep guard.
- **Fix:** Rewrote the comment paraphrastically: "No existence-guard clause is added between CREATE TABLE and the table name — …". Same intent, no banned substring. The DDL string contents themselves (lines 15, 29) are untouched.
- **Files modified:** `packages/core/src/schema.ts` (comment lines 3-8 only)
- **Verification:** `grep -c "IF NOT EXISTS" packages/core/src/schema.ts` → 0 (exit 1); 7 schema tests still pass.
- **Committed in:** Task 1 commit `c0c8a60`.

**2. [Rule 1 — False positive on dev tooling] dep-cruiser `core-must-be-pure` flagged `vitest` import in `schema.test.ts`**
- **Found during:** Task 1 first `pnpm depcheck`.
- **Issue:** The rule's `from.path: ^packages/core/src/` matched `schema.test.ts`, which legitimately imports `vitest` (a devDependency, not runtime). Same class as Plan 01-01 deviation #2.
- **Fix:** Tightened `from.path` further to exclude `*.test.ts` files via `pathNot: '\\.test\\.ts$'`. The runtime contract (no node builtins / no third-party / no DB / no UI in `core/src/**.ts` excluding tests) is preserved — every forbidden-imports path remains intact, only the *scope* of files the rule applies to was narrowed. Plan's `<deviation_policy>` explicitly suggested this exact remediation as the recommended fix.
- **Files modified:** `.dependency-cruiser.cjs` (`from` block now `{ path: '^packages/core/src/', pathNot: '\\.test\\.ts$' }`)
- **Verification:** `pnpm depcheck` → `no dependency violations found (29 modules, 17 dependencies cruised)`.
- **Committed in:** Task 1 commit `c0c8a60`.

**3. [Rule 1 — TS strict-mode incompat] `exactOptionalPropertyTypes: true` rejected explicit `gitRemoteUrl: undefined` in test fixture**
- **Found during:** Task 2 first `pnpm typecheck`. TS2375: `Type '{ ...; gitRemoteUrl: undefined; }' is not assignable to type 'ResolveProjectInput' with 'exactOptionalPropertyTypes: true'`.
- **Issue:** The plan's recommended property-test inputs included `{ cwd: '/foo', aliases: {}, gitRemoteUrl: undefined }`. Under D-TS-STRICTNESS (`exactOptionalPropertyTypes`), an explicit `undefined` is not assignable to an optional `string | null` property — the field must be omitted entirely to express "not provided".
- **Fix:** Replaced `{ cwd: '/foo', aliases: {}, gitRemoteUrl: undefined }` with `{ cwd: '/foo', aliases: {} }`. Identical runtime semantics ("`gitRemoteUrl` not provided" → resolveProject defaults aliases-fail-then-basename path), satisfies strict TS.
- **Files modified:** `packages/core/src/project.test.ts` line 103.
- **Verification:** Typecheck clean; the `never throws on garbage input` block above already covers `{ cwd: null, gitRemoteUrl: undefined }` via `@ts-expect-error` for the runtime garbage case.
- **Committed in:** Task 2 commit `988c553`.

**4. [Rule 1 — Stylistic conformance] Biome import-sort + `Object.hasOwn` autofixes**
- **Found during:** Task 1 + Task 2 first `pnpm lint` runs.
- **Issue:** Biome 2.4 `assist/source/organizeImports` requires alphabetical import ordering and `lint/suspicious/noPrototypeBuiltins` prefers `Object.hasOwn(obj, key)` over `Object.prototype.hasOwnProperty.call(obj, key)`. Both are safe stylistic fixes.
- **Fix:** Ran `pnpm exec biome check --write` on touched files. No semantic changes — `Object.hasOwn` is the modern equivalent and was added by Node 16.9 / standard ES2022 (within `target: ES2022` per tsconfig.base).
- **Files modified:** `packages/core/src/schema.test.ts`, `packages/core/src/project.ts`, `packages/core/src/index.ts` (import-order)
- **Verification:** `pnpm lint` → 0 errors, 4 unsafe-fix warnings (non-blocking; useOptionalChain suggestions retained as-is for clarity).
- **Committed in:** Task 1 commit `c0c8a60` (schema.test.ts) + Task 2 commit `988c553` (project.ts, index.ts).

---

**Total deviations:** 4 auto-fixed (4 × Rule 1). All four address tooling-friction or boilerplate-bug realities surfaced by the plan's own grep guards and TS strict-mode flags. None weaken the FND-01 zero-dep contract, the FND-03 byte-exactness rule, or the FND-04 fixture matrix. The TS `types:[]`, depcruise forbidden-imports list, `verify:core-zero-deps` script, and the `never throws` contract all remain mechanically intact and proven.

**Impact on plan:** The plan's recommended boilerplate (schema.ts header comment, project.test.ts garbage-input case) carried two latent issues that the plan's own verification gates caught immediately. No architectural drift; both fixes are paraphrastic / structural.

**No deviations from the regex set or signature recommended in RESEARCH.md §F.** The 4 regex patterns and the `resolveProject` signature shipped exactly as specified.

## Issues Encountered

- **RTK proxy hook (recurring):** Direct `pnpm lint` / `pnpm test` invocations in shells where the local RTK CLI hook is active are still rewritten toward `eslint`, producing spurious `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "eslint" not found`. Worked around by `rtk proxy pnpm <cmd>`. This is the same local dev-tooling quirk reported in Plan 01-01 SUMMARY — purely a developer-environment artifact, not a project bug. A fresh shell or CI environment (where the RTK hook is absent) sees `pnpm run ci` exit 0 cleanly.
- **`grep` rewrite:** The `Bash` tool's RTK rewrite turns `grep -c 'CREATE TABLE events ('` into a ripgrep invocation that parses the literal `(` as an unclosed regex group. This affected verification ergonomics only, not the actual code: the grep guards in plan `<verify>` use plain `grep`, which works correctly under a CI shell.

## Known Stubs

None in this plan. All Plan 01-01 stubs (`packages/core/src/index.ts` placeholder) are now resolved by the `index.ts` barrel update. The `packages/hook/src/index.ts` and `packages/desktop/src/index.ts` placeholders remain (intentional — Phase 3 / Phase 4 owns them).

## Threat Flags

None. This plan only adds pure logic types, DDL string constants, and a pure-function project resolver — no new network endpoint, no auth path, no filesystem access, no schema-changing surface. The DDL strings are exact copies of CON-schema-events-table / CON-schema-open-turns-table from the locked threat surface; they carry no new trust-boundary risk.

## TDD Gate Compliance

Plan type is `execute` and both tasks have `tdd="true"`. Per `<tdd_execution>`:

- **Task 1 RED:** `schema.test.ts` written first; `pnpm -F @vibetime/core test schema.test.ts` failed with import-resolution errors (`Cannot find module './schema.js'`) — confirmed RED.
- **Task 1 GREEN:** `events.ts` + `schema.ts` written; same command → 7 tests passed.
- **Task 2 RED:** `project.test.ts` written first; `pnpm -F @vibetime/core test project.test.ts` failed with import-resolution errors (`Cannot find module './project.js'`) — confirmed RED.
- **Task 2 GREEN:** `project.ts` written; `pnpm -F @vibetime/core test` → 24 project + 7 schema = 31 tests passed.

Both tasks committed under `feat(...)` (the GREEN gate is satisfied — there is no RED-only test commit because the plan instructed "execute task" atomically per the action block, and the test files commit alongside their implementations in the same task commit; both tasks' commit messages document the failing-then-passing observation in their description).

## Phase 1 Handoff

**Phase 1 implementation work is complete; Phase 2 (Agent Adapters) can begin against the @vibetime/core public API.**

The full @vibetime/core public surface is now stable:
- Types: `Agent`, `EventType`, `NormalizedEvent`, `AdapterFn`, `ResolveProjectInput`
- Values: `SCHEMA_VERSION`, `DDL_EVENTS`, `DDL_OPEN_TURNS`, `DDL_INDICES`
- Functions: `parseGitRemoteUrl`, `resolveProject`

Phase 2 adapters (Claude Code / Codex / Cursor) will import these and produce `NormalizedEvent | null` per DEC-011's `(payload, eventName) => NormalizedEvent | null` contract.

## Self-Check: PASSED

- All 7 claimed file paths verified on disk (5 created + 2 modified).
- Both task commits present in `git log --oneline`: `c0c8a60` (Task 1) + `988c553` (Task 2).
- All 14 grep-verifiable acceptance criteria match (verified above).
- `pnpm run ci` final exit code: 0 (captured via `/tmp/ci_out.log`).

---
*Phase: 01-foundations-decisions-gate*
*Plan: 03*
*Completed: 2026-04-28*
