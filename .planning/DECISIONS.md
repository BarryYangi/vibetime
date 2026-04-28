# DECISIONS — vibetime V0

> PRD §16 process gate. This file captures every implementation decision delegated by `vibetime-prd.md` §16 to GSD. Decisions in `status: proposed` are awaiting user approval. Until the user replies `approved` (or overrides specific rows), no `core` library code, hook code, or desktop code may be written. PRD §5 LOCKED decisions are replicated below as `status: locked` for traceability — they are NOT up for debate.

**Authored:** 2026-04-28
**Status:** approved (PRD §16 gate cleared 2026-04-28 by Barry — all 11 Phase-1 proposed rows accepted as-is; A1-A8 assumptions confirmed)
**Approver:** Barry <barry@yct.ee>

## 1. Phase 1 active decisions (approved)

| ID | Decision | Choice | Rationale (1 sentence) | Decided in Phase | Status |
|----|----------|--------|------------------------|------------------|--------|
| D-MONO | Monorepo tool | pnpm workspaces 10.33.2 | Most mature isolated-store manager; only one battle-tested across React/Next/Electron/Bun-binary mixed stacks (RESEARCH.md §A). | 1 | approved |
| D-TS | TypeScript strategy | tsconfig.base + project references + per-package `tsconfig.json`; `core` adds `"types": []` | Project references give incremental builds and boundary enforcement; `types: []` mechanically forces `core` runtime-agnosticism (RESEARCH.md §B). | 1 | approved |
| D-TS-STRICTNESS | TS strict-mode flags | strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + verbatimModuleSyntax | Catches the exact "never throws" / empty-array bug class the adapter contract forbids (RESEARCH.md §B + A8). | 1 | approved |
| D-LINT | Lint + format | Biome 2.4.13 (single tool, JSON config) | Replaces ESLint+Prettier; ~50× faster; monorepo-native since v2 (RESEARCH.md §C). | 1 | approved |
| D-TEST | Test runner for `core` (and Phase 2 adapters) | Vitest pinned to 3.2.4 (Node environment) — deviation from RESEARCH §D's 4.1.5 due to Node 22.7 `require(esm)` incompatibility; revisit on Node ≥ 22.12 | Node-runnable proves `core` portability across Bun and Electron-main; vitest 4 + vite 8 require Node 22.12+ default `require(esm)` so v3.2.4 is the working pin today (RESEARCH.md §D + A2 + Plan 01-01 deviation #1). | 1 | approved |
| D-DEPCHECK | Zero-dep enforcement for `core` | Three layers: TS `types: []` + dependency-cruiser 17.3.10 (rule scoped to `^packages/core/src/` — `vitest.config.ts` is dev tooling, not runtime) + a 5-line script asserting `packages/core/package.json#dependencies === {}` | A single mechanism is fragile; three cheap layers cover all three failure modes (build-time / lint-time / commit-time); scoping the rule to `src/` preserves the runtime contract without false-flagging dev configs (RESEARCH.md §E + Plan 01-01 deviation #2). | 1 | approved |
| D-LAYOUT | Per-package directory layout | `packages/{core,hook,desktop}/src/...` with per-package `tsconfig.json` + `vitest.config.ts`; `core/src/{index,events,schema,project,project.test,schema.test}.ts` | Standard pnpm workspace layout; minimal nesting; each package is independently buildable (RESEARCH.md §"Recommended Project Structure"). | 1 | approved |
| D-GITPARSE | Git URL parsing in `core` | Hand-rolled regex (≤30 LOC) covering SSH / HTTPS / `ssh://` / `git://`, with credential-stripping; reference: GitHub Desktop `remote-parsing.ts` | Importing `git-url-parse` violates the zero-runtime-dep rule; the parsing logic is mechanically simple and the fixture matrix proves correctness (RESEARCH.md §F). | 1 | approved |
| D-GITLAB-SUBGROUP | GitLab subgroup project name | `group/sub/repo` (most informative — preserve full path) | A5: balance between informativeness and predictability; the alternative `sub/repo` loses provenance information (RESEARCH.md §F risk note). | 1 | approved |
| D-CI | CI in Phase 1 | Recommended SKIP — local `pnpm run ci` only (note: `pnpm ci` is reserved by pnpm for npm-ci-style installs, hence `pnpm run ci`); defer GitHub Actions to a follow-up | A7: keeps Phase 1 scaffolding minimal; cheap to add `.github/workflows/ci.yml` later if velocity demands; nothing in PRD requires it (RESEARCH.md A7 + Plan 01-01 deviation #4). | 1 | approved |
| D-PRECOMMIT | Pre-commit hooks (lefthook / simple-git-hooks) | Recommended SKIP for Phase 1; revisit if `pnpm run ci` velocity becomes painful | Open Question 3: nothing in PRD requires it; minimal scaffolding wins (RESEARCH.md Open Questions §3). | 1 | approved |

## 2. Decisions deferred to later phases

| ID | Decision | Choice | Rationale (1 sentence) | Decided in Phase | Status |
|----|----------|--------|------------------------|------------------|--------|
| D-IPC | Electron IPC method signatures and types | TBD by Phase 4 | Wait until Today/Live/History view requirements drive the surface; deciding now risks over-design (RESEARCH.md §G). | 4 | deferred |
| D-ANIM | Live view animation library | TBD by Phase 5 | Pick after a Live view design prototype proves the 60fps / ≥30fps acceptance bar; candidates include framer-motion / GSAP / hand-rolled requestAnimationFrame (RESEARCH.md §G). | 5 | deferred |
| D-PKG | Packaging tool (electron-builder vs electron-forge) | TBD by Phase 6 | Choose after a Phase 5 packaging dry-run reveals which one handles `vibetime-hook` bundling + ad-hoc signing more cleanly (RESEARCH.md §G). | 6 | deferred |
| D-SIGN | Ad-hoc signing scripting | TBD by Phase 6 | Locked: ad-hoc only (NOT Apple notarization, per user decision). Scripting choice — `codesign` shell script vs electron-builder built-in vs a Node script — deferred until packaging tool is chosen (RESEARCH.md §G). | 6 | deferred |
| D-TEST-HOOK | Test runner for `hook` package | TBD by Phase 3 | `bun test` is the natural choice for `bun:sqlite`-touching code, but cross-runtime portability questions need a Phase 3 decision (RESEARCH.md A2). | 3 | deferred |

## 3. Locked decisions (replicated for traceability — NOT up for debate)

| ID | Decision | Choice | Status | Source |
|----|----------|--------|--------|--------|
| DEC-001 | Application shell | Electron | locked | PRD §5 |
| DEC-002 | Frontend stack | React 18 + TS + Tailwind v4 + coss ui + ECharts v6 + Jotai | locked | PRD §5 |
| DEC-003 | Hook runtime | Bun-compiled standalone CLI binary | locked | PRD §5 |
| DEC-004 | Distribution model | Two binaries: `vibetime-hook` + `vibetime.app` | locked | PRD §5 |
| DEC-005 | Storage | SQLite via `bun:sqlite` (hook) + `better-sqlite3` (Electron main); WAL + standard PRAGMAs | locked | PRD §5 |
| DEC-006 | Repository structure | Monorepo `core` / `hook` / `desktop`; `core` zero-runtime-dep | locked | PRD §5 |
| DEC-007 | Renderer data access | IPC-only; renderer never opens SQLite directly | locked | PRD §5 |
| DEC-008 | Time budget | ~5 weeks; flag any plan exceeding 6 weeks | locked | PRD §5 |
| DEC-009 | Schema | `events` + `open_turns` per PRD §6 verbatim, `schema_version=1`, no migrations | locked | PRD §6 |
| DEC-010 | Project resolution | First-match: alias → git remote → cwd basename → `_unknown` | locked | PRD §6 |
| DEC-011 | Adapter mappings | Per-agent event-name + field-name table; `(payload, event) => NormalizedEvent \| null` | locked | PRD §8 |
| DEC-012 | Crash recovery | Orphan sweep on session_start; 6h stale sweep at every desktop launch / CLI invocation | locked | PRD §9 |
| DEC-013 | Menubar metric | Today's cumulative agent time across all projects | locked | PRD §10.1 |
| DEC-014 | Window lifecycle | Close ≠ quit; Cmd+Q or menubar context menu only | locked | PRD §10.4 |
| DEC-015 | Design system | Tokyo Night palette, Inter, JetBrains Mono, ECharts custom theme | locked | PRD §10.5 |
| LIC | License | MIT | locked | User decision |
| SIGN | Code-signing | Ad-hoc self-signed (replaces PRD §14 notarization); first-launch right-click → Open documented | locked | User decision |
| AUTO | Auto-launch on login | Default OFF; opt-in prompt on first launch | locked | User decision |

## 4. Assumptions surfaced for explicit user approval

- A1: Biome (single tool) is acceptable now; an ESLint complement may land in Phase 4 if React rule coverage demands. **Approve?**
- A2: Vitest (pinned to 3.2.4 today; bump to 4.x when Node ≥ 22.12) for `core`; `bun test` decision deferred to Phase 3. **Approve?**
- A3: dependency-cruiser preferred over Biome's `noRestrictedImports`. **Approve?**
- A4: Hand-rolled regex covers ≥99% of real git URLs the user encounters; fixture matrix is the contract. **Approve?**
- A5: GitLab subgroups produce `group/sub/repo` (full path), not `sub/repo`. **Approve?**
- A6: `path.basename` replaced by `cwd.split('/').filter(Boolean).pop()`; POSIX-only is acceptable since V0 is macOS-only. **Approve?**
- A7: No CI in Phase 1 (local `pnpm run ci` only). **Approve?**
- A8: `verbatimModuleSyntax: true` is acceptable (forces `import type` everywhere). **Approve?**

## Gate mechanics

PRD §16 forbids any non-scaffolding code being written before this file is approved. Phase 1 Plan 01 has shipped the scaffolding. The next plan (`01-03-PLAN.md`) ships the `core` library code (NormalizedEvent, AdapterFn, DDL constants, resolveProject + tests). Plan 03 must NOT execute until the user has reviewed this document and either:

1. Replied **`approved`** (accepts every `proposed` row as-is), OR
2. Replied with **specific overrides** (e.g., "approved EXCEPT D-CI — add the workflow now") which Phase 1 will amend before Plan 03 executes.

Until one of those replies arrives, the workflow STOPS.

## User review checklist

- [ ] Every `proposed` row above has a clear Choice and one-sentence Rationale
- [ ] Every `deferred` row names a specific later phase
- [ ] No PRD §16 item is missing
- [ ] Open assumptions A1..A8 are surfaced
- [ ] No code has been written outside `package.json` / `tsconfig.json` / `biome.json` / `.dependency-cruiser.cjs` / `LICENSE` / `README.md` / `pnpm-workspace.yaml` / `vitest.config.ts` / `.npmrc` / `packages/*/src/index.ts` placeholders

Reply `approved` to proceed, or list overrides.
