# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** Accurately and silently record agent coding time per project on the developer's machine, then surface it in a visual surface good enough to live on a livestream — with zero network calls.
**Current focus:** Phase 1 — Foundations & Decisions Gate

## Current Position

Phase: 1 of 6 (Foundations & Decisions Gate)
Plan: 3 of 3 complete (01-01 + 01-02 + 01-03 all done; phase implementation work complete — awaits verifier)
Status: Phase 1 implementation complete. `@vibetime/core` ships locked NormalizedEvent / AdapterFn / DDL constants / resolveProject; pnpm run ci green; FND-01..06 + PROC-01 mechanically satisfied. Phase 2 (Agent Adapters) ready to begin.
Last activity: 2026-04-28 — Plan 01-03 complete: core library code shipped in TDD mode; 31 tests green; 7 files (5 created + 2 modified); commits c0c8a60 (events+schema) and 988c553 (project+barrel).

Progress: [██░░░░░░░░] ~19% (3/16 plans estimated; tracked at phase granularity below)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~6.5 min
- Total execution time: ~19 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundations & Decisions Gate | 3 | ~19 min | ~6.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (10 min, feat scaffold) → 01-02 (~3 min draft + user gate review, docs) → 01-03 (~6.5 min, feat core library — TDD with 31 tests)
- Trend: on-track; Phase 1 closed in ~19 min vs 5w budget projection — significant headroom for Phase 2+

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- License: MIT (locked by user; About panel + repo LICENSE)
- Code-signing: ad-hoc self-signed for V0 (replaces notarization; first-launch right-click → Open documented in README)
- Auto-launch on login: default OFF, first-launch opt-in prompt
- PRD §16 process gate: DECISIONS.md must be authored AND user-approved before any non-scaffolding code is written (owned by Phase 1)
- Vitest pinned to ^3.2.4 (Plan 01-01 deviation): vitest 4 + Node 22.7 incompatible via require(esm); v4 will be revisited when local Node ≥ 22.12
- Test script wraps NODE_OPTIONS=--experimental-require-module to bridge Node 22.7 → 22.12 default behavior; no-op on 22.12+
- depcruise core-must-be-pure rule scoped to ^packages/core/src/ (runtime sources only; vitest.config.ts is dev tooling, not runtime)
- README invocation hint: `pnpm run ci` (pnpm reserves `pnpm ci` for npm-ci semantics)
- DDL strings shipped byte-exact PRD §6 with NO existence-guard clause (FND-03 invariant); idempotency deferred to Phase 3 store init layer
- GitLab subgroup policy: full path `group/sub/repo` (D-GITLAB-SUBGROUP / A5 confirmed)
- POSIX cwd-split (no node:path import; V0 macOS-only per A6)
- belt-and-braces try/catch on resolveProject — intentional defensive coding for the never-throws contract, documented inline
- dep-cruiser core-must-be-pure rule scoped to exclude *.test.ts (Plan 01-03 deviation #2 — same scope-narrowing pattern as Plan 01-01 deviation #2)

### Pending Todos

None yet.

### Blockers/Concerns

None yet. (Phase 1 must produce DECISIONS.md before Phase 1 implementation can advance past scaffolding — this is by design, not a blocker.)

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Distribution | Apple Developer notarization | Deferred to V0.1+ | 2026-04-28 |
| Distribution | Auto-update mechanism | Deferred to V0.1+ | 2026-04-28 |
| Platform | Linux / Windows binaries | Deferred to V0.1+ | 2026-04-28 |
| Metrics | Token / cost tracking | Deferred to V0.1+ | 2026-04-28 |
| Metrics | `agent_ratio` (Toggl integration) | Deferred to V0.1+ | 2026-04-28 |
| Surface | Web UI consuming `core` | Deferred to V0.1+ | 2026-04-28 |
| Surface | TUI | Deferred | 2026-04-28 |

## Session Continuity

Last session: 2026-04-28 (Plan 01-03 executed in sequential mode; commits c0c8a60 + 988c553)
Stopped at: Phase 1 implementation complete. `pnpm run ci` exits 0; FND-01..06 + PROC-01 mechanically satisfied; @vibetime/core public API stable.
Resume file: Phase 1 verifier (or directly Phase 2 — Agent Adapters in core)
