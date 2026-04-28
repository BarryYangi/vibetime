---
phase: 01-foundations-decisions-gate
plan: 01
subsystem: infra
tags: [pnpm, typescript, biome, vitest, dependency-cruiser, monorepo, project-references]

requires:
  - phase: bootstrap
    provides: PRD ingest, .planning/ scaffold, ROADMAP/REQUIREMENTS/PROJECT/STATE/intel/CONSTRAINTS/decisions
provides:
  - pnpm 9.x workspace with three packages (@vibetime/core / @vibetime/hook / @vibetime/desktop)
  - TypeScript 6 project-references topology (tsconfig.json + tsconfig.base.json)
  - Biome 2.4.13 lint/format config
  - Vitest 3.2.4 test runner (root projects mode + per-package configs, all with passWithNoTests:true)
  - dependency-cruiser 17.3.10 with core-must-be-pure rule scoped to packages/core/src/
  - MIT LICENSE (Copyright 2026 Barry)
  - Three-layer zero-dep enforcement for core (TS types:[] + dep-cruise + verify:core-zero-deps script)
  - Six root scripts (typecheck/lint/format/test/depcheck/verify:core-zero-deps) + ci aggregator
affects:
  - phase 01 plan 02 (DECISIONS.md gate)
  - phase 01 plan 03 (core library code — receives the canvas this plan paints)
  - phase 02..06 (every later phase compiles/tests against this scaffold)

tech-stack:
  added:
    - pnpm@10.33.2 (declared) / 9.9.0 (system; lockfile v9 forward-compatible)
    - typescript@6.0.3
    - "@biomejs/biome@2.4.13"
    - vitest@3.2.4 (deviation from RESEARCH §D's 4.1.5 — see Deviations)
    - dependency-cruiser@17.3.10
    - "@types/node@22.19.17"
  patterns:
    - "TypeScript project references: root tsconfig.json (files:[]+references:[…]) drives `tsc -b`; tsconfig.base.json is a pure preset (no references field)"
    - "core purity contract: empty `dependencies: {}` + `types: []` + dep-cruise `core-must-be-pure` rule"
    - "vitest projects mode: root vitest.config.ts lists package paths; each package owns its own vitest.config.ts with passWithNoTests:true"
    - "Biome 2.4 trailing-comma + asNeeded-semicolon defaults are accepted; pnpm format enforces them"

key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - tsconfig.json
    - tsconfig.base.json
    - biome.json
    - vitest.config.ts
    - .dependency-cruiser.cjs
    - .npmrc
    - LICENSE
    - README.md
    - packages/core/package.json
    - packages/core/tsconfig.json
    - packages/core/vitest.config.ts
    - packages/core/src/index.ts
    - packages/hook/package.json
    - packages/hook/tsconfig.json
    - packages/hook/vitest.config.ts
    - packages/hook/src/index.ts
    - packages/desktop/package.json
    - packages/desktop/tsconfig.json
    - packages/desktop/vitest.config.ts
    - packages/desktop/src/index.ts
  modified:
    - .gitignore (extended with node_modules/, dist/, *.tsbuildinfo, coverage/)

key-decisions:
  - "Vitest pinned to ^3.2.4 (not 4.1.5): vitest 4 + vite 8 trigger require(esm) on local Node 22.7; Node 22.12+ would be needed for v4. Vitest 3.2.4 still requires --experimental-require-module on 22.7 because vite 7 also uses require(esm), so root test script wraps NODE_OPTIONS=--experimental-require-module — this flag is a no-op on Node 22.12+."
  - "depcruise core-must-be-pure rule scoped to ^packages/core/src/ rather than ^packages/core/. dev tooling (vitest.config.ts, future build scripts) is not runtime code; the rule's intent — protect the runtime code that ships in the binary — is preserved without weakening any forbidden-import path."
  - "Root `ci` script kept (matches plan); README documents `pnpm run ci` because pnpm reserves the bare `pnpm ci` for npm-ci-style installs (ERR_PNPM_CI_NOT_IMPLEMENTED)."
  - "Biome auto-formatted trailing commas across 5 files on first run; biome.json `$schema` URL bumped from 2.4.0 → 2.4.13 to silence the version-mismatch info."

patterns-established:
  - "Root tsconfig.json with files:[]+references:[…] is the build entry; tsconfig.base.json is a pure compiler-options preset that per-package configs `extend`. References live ONLY in the root + per-package configs, NEVER in the base."
  - "Every per-package vitest.config.ts hardcodes passWithNoTests:true so `pnpm test` is deterministically green on placeholder sources; the root vitest.config.ts also sets passWithNoTests:true at the top level (vitest 3 projects-mode requirement)."
  - "core's package.json must contain `dependencies: {}` (literal empty object); the verify:core-zero-deps script asserts Object.keys(p.dependencies).length === 0."

requirements-completed:
  - FND-01
  - FND-02
  - FND-03
  - FND-05
  - FND-06

duration: ~10min
completed: 2026-04-28
---

# Phase 01 Plan 01: Repo Bootstrap Summary

**Three-package pnpm monorepo (`@vibetime/{core,hook,desktop}`) with TS project references, Biome, Vitest 3, dependency-cruiser, and MIT LICENSE — `pnpm run ci` exits 0 on placeholder sources.**

## Performance

- **Duration:** ~10 min (619 s)
- **Started:** 2026-04-28T09:00:31Z
- **Completed:** 2026-04-28T09:10:50Z
- **Tasks:** 2 / 2 complete
- **Files modified:** 24 (23 created + 1 modified — `.gitignore`)

## Accomplishments

- Stood up the locked DEC-006 three-package monorepo with `core` purity enforced at three layers (TS `types:[]`, dependency-cruiser `core-must-be-pure`, `verify:core-zero-deps` script).
- TypeScript project-references topology proven via `tsc -b`: root `tsconfig.json` (`files:[]`+references) drives the build; `tsconfig.base.json` is a pure preset.
- `pnpm run ci` (typecheck → lint → test → depcheck → verify:core-zero-deps) green on a clean checkout against placeholder `export {}` sources.
- MIT LICENSE present with `Copyright (c) 2026 Barry <barry@yct.ee>`.
- `pnpm-lock.yaml` committed — install is reproducible.

## Task Commits

Each task was committed atomically on `main` (sequential mode, no worktree):

1. **Task 1: Repo root scaffold** — `c218e13` (feat)
2. **Task 2: Per-package skeletons + install + ci green** — `ec18b7e` (feat)

## Files Created/Modified

### Root scaffold (Task 1, c218e13)
- `package.json` — workspace root, scripts (typecheck/lint/format/test/depcheck/verify:core-zero-deps/ci), devDependencies
- `pnpm-workspace.yaml` — `packages/*`
- `tsconfig.json` — `files:[]` + `references` to all three packages (the `tsc -b` entry point)
- `tsconfig.base.json` — strict TS preset (NodeNext, noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax, composite, etc.); deliberately no `references` field
- `biome.json` — Biome 2.4.13 config (recommended + noExplicitAny:error + useImportType:error; single-quote, asNeeded semicolons, lineWidth 100)
- `vitest.config.ts` (root) — projects-mode listing the three packages, `passWithNoTests:true` at root level
- `.dependency-cruiser.cjs` — `core-must-be-pure` rule (scoped to `^packages/core/src/`) + `no-circular`
- `.gitignore` — extended with `node_modules/`, `dist/`, `*.tsbuildinfo`, `coverage/`
- `.npmrc` — `auto-install-peers=true`, `node-linker=isolated`
- `LICENSE` — SPDX MIT, copyright 2026 Barry
- `README.md` — workspace + script orientation

### Per-package skeletons (Task 2, ec18b7e)
- `packages/core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}` — empty `dependencies:{}`, `types:[]`, `passWithNoTests:true`, placeholder `export {}`
- `packages/hook/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}` — `@vibetime/core` via `workspace:*`, `@types/node` dev dep, `passWithNoTests:true`, placeholder `export {}`
- `packages/desktop/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}` — same shape as `hook`
- `pnpm-lock.yaml` — committed

## Decisions Made

1. **Vitest version: 3.2.4 (not 4.1.5).** vitest 4 + vite 8 require Node 22.12+ default `require(esm)`; vitest 3.2.4 + vite 7 still need `--experimental-require-module` on Node 22.7. Pinned via `^3.2.4` in root + every package; `vitest@4` will be revisited when user bumps Node.
2. **NODE_OPTIONS in test script.** Root `test` script wraps `NODE_OPTIONS=--experimental-require-module vitest run` — bridges Node 22.7 → 22.12. The flag is a no-op on Node 22.12+; macOS-only V0 means cross-platform shell-syntax is acceptable.
3. **dep-cruise rule scope.** `core-must-be-pure` `from.path` tightened to `^packages/core/src/` (not the whole package). vitest.config.ts lives at `packages/core/vitest.config.ts` and imports `vitest/config` — that's dev tooling, not runtime. The runtime contract (no node builtins / no third-party / no DB / no UI in `core/src/`) is unchanged.
4. **`pnpm ci` collision.** pnpm reserves the bare `ci` subcommand. Plan's `ci` npm script is invoked via `pnpm run ci`. README annotated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Tooling Bug] Vitest 4 + Node 22.7 incompatibility (rolldown native binding + require(esm))**
- **Found during:** Task 2, on first `pnpm test`
- **Issue:** Two cascading problems with vitest 4.1.5:
  (a) pnpm install initially skipped `@rolldown/binding-darwin-arm64` optional dep (`pnpm install --force` recovered it); 
  (b) even after fix, `require()` of `std-env` (ESM) failed on Node 22.7 because `require(esm)` defaulted off pre-22.12. Same symptom appeared with vitest 3.2.4 / vite 7.
- **Fix:** Pinned `vitest` to `^3.2.4` (root + all three packages). Wrapped root `test` script with `NODE_OPTIONS=--experimental-require-module` to bridge 22.7. RESEARCH.md §D / plan deviation policy explicitly allow vitest 3.x fallback.
- **Files modified:** `package.json`, `packages/{core,hook,desktop}/package.json`, root `vitest.config.ts` (added `passWithNoTests:true` at root)
- **Verification:** `rtk proxy pnpm run ci` exits 0; `pnpm test` exits 0 with "No test files found, exiting with code 0"
- **Committed in:** `ec18b7e` (Task 2 commit)

**2. [Rule 1 — False Positive on Dev Tooling] dep-cruise flagged `vitest/config` import in `core/vitest.config.ts`**
- **Found during:** Task 2 first `pnpm depcheck`
- **Issue:** `core-must-be-pure` rule's `from.path: ^packages/core/` matched `packages/core/vitest.config.ts`, which legitimately imports `vitest/config` (a devDependency). Reported as a `core-must-be-pure` violation.
- **Fix:** Tightened `from.path` to `^packages/core/src/` so the rule protects runtime sources only. The `to.path` forbidden-imports list is unchanged — runtime contract is preserved. Plan's deviation policy explicitly forbids weakening forbidden-imports; this fix narrows the scope, it does not loosen the rule.
- **Files modified:** `.dependency-cruiser.cjs`
- **Verification:** `pnpm depcheck` exits 0 (`no dependency violations found, 13 modules, 3 dependencies cruised`); `core-must-be-pure` would still fire if anything in `core/src/**` imports a forbidden path.
- **Committed in:** `ec18b7e` (Task 2 commit)

**3. [Rule 1 — Stylistic Conformance] Biome auto-formatting: trailing commas + schema version**
- **Found during:** Task 2 first `pnpm lint` (`pnpm exec biome check .`)
- **Issue:** Biome 2.4 default formatter wants trailing commas on multi-line literals; original files were written without them. Also, biome.json `$schema` pointed to 2.4.0 → mismatch info with installed 2.4.13.
- **Fix:** Ran `pnpm exec biome format --write .` (5 files reformatted). Bumped `$schema` URL to `2.4.13`. No semantic change; `passWithNoTests: true` literal preserved verbatim in every per-package vitest config.
- **Files modified:** `.dependency-cruiser.cjs`, `vitest.config.ts`, `packages/{core,hook,desktop}/vitest.config.ts`, `biome.json`
- **Verification:** `pnpm lint` exits 0 with "Found 0 errors, 0 info."
- **Committed in:** `ec18b7e` (Task 2 commit)

**4. [Rule 3 — Documentation Alignment] `pnpm ci` shadowed by pnpm built-in**
- **Found during:** Task 2 final verification (`rtk proxy pnpm ci`)
- **Issue:** pnpm 9 / 10 reserves `pnpm ci` (analogous to `npm ci`); it returns `ERR_PNPM_CI_NOT_IMPLEMENTED` and never delegates to the npm-script named `ci`. The plan's verbatim acceptance criterion (`pnpm ci` exits 0) is unreachable as-typed.
- **Fix:** Kept the `ci` npm-script name (matches plan); README updated to instruct `pnpm run ci`. Acceptance criterion satisfied via `pnpm run ci` (which is semantically identical to the plan's intent).
- **Files modified:** `README.md`
- **Verification:** `rtk proxy pnpm run ci` exits 0; full pipeline output captured.
- **Committed in:** `ec18b7e` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 × Rule 1, 1 × Rule 3). All four address tooling-friction realities — none weaken the FND-01 zero-dep contract or the §16 gate. The TS `types:[]`, depcruise forbidden-imports list, and `verify:core-zero-deps` script remain intact and proven mechanically.

**Impact on plan:** Two locked-in tooling decisions slightly drift from RESEARCH.md (vitest 4.1.5 → 3.2.4; ci script invocation `pnpm ci` → `pnpm run ci`). Both are acceptable per the plan's stated deviation policy and reflect Node 22.7 / pnpm reserved-subcommand realities; neither closes any door for later phases.

## Issues Encountered

- **RTK proxy hook:** Direct `pnpm lint` / `pnpm test` invocations were intercepted by the local RTK CLI hook, which mistakenly rewrote `biome check` / vitest commands toward `eslint` and produced spurious `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "eslint" not found` output. Worked around by running validation through `rtk proxy pnpm <cmd>`. This is purely a local dev-tooling quirk, not a project bug — `pnpm run ci` invoked by a fresh shell (or in CI) will not encounter it.

## Known Stubs

All three `packages/*/src/index.ts` files contain `export {}` placeholders. **This is by design** — the plan explicitly defers `core` library code (NormalizedEvent / DDL / resolveProject) to Plan 03 after the §16 DECISIONS.md gate clears (Plan 02). No future plan should treat these stubs as drift; the plan that resolves them is `01-03-PLAN.md`.

| File | Reason | Resolved by |
|------|--------|-------------|
| `packages/core/src/index.ts` | Plan 03 ships NormalizedEvent / AdapterFn / DDL constants / resolveProject | `.planning/phases/01-foundations-decisions-gate/01-03-PLAN.md` |
| `packages/hook/src/index.ts` | Phase 3 ships the Bun-compiled hook binary | Phase 3 plans (TBD) |
| `packages/desktop/src/index.ts` | Phase 4 ships the Electron shell | Phase 4 plans (TBD) |

## User Setup Required

None — all tooling is installed via `pnpm install`. Future-state recommendation: bump local Node from 22.7.0 → ≥22.12 to drop the `--experimental-require-module` bridge from `pnpm test`. Optional, not blocking.

## Tooling Versions Installed (resolved from pnpm-lock.yaml)

| Tool | Specifier | Installed | Notes |
|------|-----------|-----------|-------|
| typescript | `^6.0.3` | 6.0.3 | Matches RESEARCH §B exactly. |
| @biomejs/biome | `^2.4.13` | 2.4.13 | Matches RESEARCH §C exactly. |
| vitest | `^3.2.4` | 3.2.4 | **Deviation from RESEARCH §D's 4.1.5** — see Deviation #1. |
| dependency-cruiser | `^17.3.10` | 17.3.10 | Matches RESEARCH §E exactly. |
| @types/node | `^22` | 22.19.17 | Latest 22.x at install time; not in core. |
| pnpm (declared) | `pnpm@10.33.2` | (system: 9.9.0) | corepack would fetch 10.33.2; system ran 9.9.0 with lockfile v9 (forward-compatible). |
| Node | `>=22` | 22.7.0 | Test script bridges to 22.12+ semantics via `--experimental-require-module`. |

## Next Steps & Reminder

**The §16 DECISIONS.md gate (PROC-01) is OPEN. Plan 01-02 MUST run before Plan 01-03 (core library code).** Plan 02 is `autonomous: false` — execution will halt awaiting explicit user `approved` reply on the DECISIONS.md document. Do NOT skip the gate. Plan 03 (NormalizedEvent / AdapterFn / DDL / resolveProject + tests) is gated on Plan 02 user approval.

## TDD Gate Compliance

Plan type is `execute` (not `tdd`). Per execute-plan.md, no RED/GREEN/REFACTOR gate applies. Plan 03 (`type: tdd`) will own that cycle for the `core` library code.

## Self-Check: PASSED

- All 23 claimed files exist (FOUND on every path).
- Both task commits found in git log: `c218e13` (Task 1), `ec18b7e` (Task 2).

---
*Phase: 01-foundations-decisions-gate*
*Plan: 01*
*Completed: 2026-04-28*
