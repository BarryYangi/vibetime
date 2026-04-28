# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** Accurately and silently record agent coding time per project on the developer's machine, then surface it in a visual surface good enough to live on a livestream — with zero network calls.
**Current focus:** Phase 2 — Agent Adapters in `core`

## Current Position

Phase: 2 of 6 (Agent Adapters in `core`)
Plan: 1 of 1 complete (02-01 done; phase implementation work complete — awaits verifier)
Status: Phase 2 implementation complete. `@vibetime/core` ships three pure-function vendor adapters (`adaptClaudeCode` / `adaptCodex` / `adaptCursor`) with locked DEC-011 signature, never-throws contract, and seeded mulberry32 property test (3600 mutations / CI run). `pnpm run ci` green; ADPT-01..04 mechanically satisfied. Phase 3 (Hook Binary, Store & Install) ready to begin.
Last activity: 2026-04-28 — Plan 02-01 complete: three adapters + barrel + seeded property test shipped in TDD mode; 76 tests green (Phase 1 baseline 31 + Phase 2 new 45); 8 files created + 1 modified; commits b966ced (Claude Code), 24ba7aa (Codex), c7803a6 (Cursor), 98c6d7c (barrel + property + public API + CI gate).

Progress: [███░░░░░░░] ~25% (4/16 plans estimated; tracked at phase granularity below)

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: ~6.5 min
- Total execution time: ~26 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundations & Decisions Gate | 3 | ~19 min | ~6.5 min |
| 2. Agent Adapters in `core`     | 1 | ~7 min  | ~7 min   |

**Recent Trend:**
- Last 5 plans: 01-01 (10 min, feat scaffold) → 01-02 (~3 min draft + user gate review, docs) → 01-03 (~6.5 min, feat core library — TDD with 31 tests) → 02-01 (~7 min, feat adapters — TDD with 4 commits, 76 tests)
- Trend: on-track; Phase 2 closed in ~7 min vs 5w budget projection — significant headroom remains for Phase 3+

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
- Three vendor adapters (Plan 02-01): per-adapter EVENT_TYPES tables; per-adapter type guards; outer try/catch belt-and-braces mirroring project.ts; project field set to raw cwd, hook layer (Phase 3) post-processes via resolveProject before SQLite insert (RESEARCH §D Option 3 — preserves DEC-011 locked signature)
- Codex SessionEnd is BANNED at adapter level (Plan 02-01) — EVENT_TYPES omits the key; Phase 3 hook lifecycle synthesizes session_end via process-exit fallback (RESEARCH §G.5)
- Cursor empty/missing/wrong-type workspace_roots ⇒ project='' (Plan 02-01) — Phase 3 resolveProject promotes to _unknown; preserves the event even when project is unknown
- Property test uses inline mulberry32 seed=42 (Plan 02-01) — reproducible across runs; no fast-check dep needed for V0 fuzz scale
- Two-step `as unknown as` cast on adapter turn_id branches (Plan 02-01 deviation) — TS2352 fix when both turn-narrowed and session-narrowed shapes converge after if/else; runtime guard already proves the field is present

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

Last session: 2026-04-28 (Plan 02-01 executed in sequential mode; commits b966ced + 24ba7aa + c7803a6 + 98c6d7c)
Stopped at: Phase 2 implementation complete. `pnpm run ci` exits 0; ADPT-01..04 mechanically satisfied; @vibetime/core public API now exports adaptClaudeCode / adaptCodex / adaptCursor.
Resume file: Phase 2 verifier (or directly Phase 3 — Hook Binary, Store & Install)
