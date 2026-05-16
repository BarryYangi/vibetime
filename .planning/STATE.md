---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: Phase 07 implementation and performance hardening complete; fresh local scan retest pending
last_updated: "2026-05-16T10:18:31Z"
last_activity: 2026-05-16
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 25
  completed_plans: 25
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** Accurately and silently record agent coding time per project on the developer's machine, then surface it in a visual surface good enough to live on a livestream.
**Current focus:** Phase 07 — usage-analytics

## Current Position

Phase: 07 (usage-analytics) — COMPLETE
Plan: 6 of 6
Status: Implementation, UI, pricing alignment, tray summary, Windows path support, and CodexBar-style incremental scan hardening complete. Ready for fresh local scan retest after clearing usage tables.
Last activity: 2026-05-16

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 19
- Average duration: phase-level summaries recorded; Phase 6 included multi-step release/debug time
- Total execution time: see per-plan SUMMARY files

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundations & Decisions Gate | 3 | ~19 min | ~6.5 min |
| 2. Agent Adapters in `core`     | 1 | ~7 min  | ~7 min   |
| 3. Hook Binary, Store & Install | 4 | ~15 min | ~3.75 min |
| 4. Desktop Shell, Today & CLI   | 6 | ~30 min | ~5 min   |
| 5. Live, History, Menubar & Lifecycle | 4 | ~100 min | ~25 min |
| 6. Packaging & V0 Acceptance | 1 | ~1 day elapsed | integrated release plan |
| 7. Usage Analytics | 6 plans + hardening | implementation complete | fresh local scan retest pending |

**Recent Trend:**

- Phase 4: 04-01 (12 min, Electron scaffold) → 04-02 (3 min, CLI) → 04-03 (1.5 min, IPC) + 04-04 (8 min, renderer) parallel → 04-05 (3 min, Today) + 04-06 (2 min, Settings) parallel
- Trend: Phase 4 closed in ~30 min with parallel execution. Wave-based strategy working well.

*Updated after each plan completion*
| Phase 05 P01 | 35min | 4 tasks | 11 files |
| Phase 05 P02 | 20min | 3 tasks | 8 files |
| Phase 05 P03 | 25min | 3 tasks | 7 files |
| Phase 05 P04 | 20min | 4 tasks | 4 files |
| Phase 07 P01 | 7min | 3 tasks | 11 files |
| Phase 07 P03 | 9min | 3 tasks | 9 files |
| Phase 07 P05 | 14min | 3 tasks | 10 files |
| Phase 07 P06 | 45min | 3 tasks | 8 files |

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
- D-09 revised (Phase 4 research): better-sqlite3 v12.9.0 does NOT expose `updateHook()`. Initial application-level push remains valid, but the live desktop path now uses hook-side Unix socket notification (`~/.vibetime/notify.sock`) with `fs.watch(~/.vibetime)` fallback rather than polling.
- Node.js 22.12+ required for electron-vite v5.0.0 (Phase 4 prerequisite). Current 22.7.0 incompatible.
- coss ui is a copy-paste component registry (not npm). Current desktop UI has migrated away from the old Tokyo Night custom token set and uses coss-style semantic components / neutral light-dark baseline.
- Hook package needs `exports` field in package.json for desktop subpath imports (./cli, ./config, ./install)
- CSS bars for Today view (lighter than ECharts for simple horizontal bars); ECharts reserved for Phase 5 History view
- Codex install/uninstall must preserve user ownership of `~/.codex/config.toml` `hooks`; Vibetime now marks only self-managed flips and restores the prior value on uninstall.
- Codex stop recovery no longer relies on freeze heuristics. Open Codex turns are reconciled against local transcript `task_complete` records, and duplicate `turn_start` rows are ignored while a turn is already open.
- Today view refresh is event-driven and live: DB invalidations push into renderer, open turns tick locally every second, and duration formatting is compact (`8m28s`).
- Phase 5 Tray behavior uses Electron native `Menu` for both left and right click. The custom `/menubar` BrowserWindow dropdown was removed because it caused focus/highlight mismatch and auto-focus problems; native menu is the selected V0 behavior.
- Tray title refresh is event-driven plus visible minute-boundary timers while active, not fixed high-frequency polling.
- Phase 5 UAT completed 2026-05-07 with 9/9 checks passed. Open at login uses a coss/Base UI Switch; only the switch itself toggles. Renderer controls intentionally keep the default arrow cursor rather than pointer cursor.
- Phase 6 packaging now uses the user-provided deterministic SVG macOS app icon. The source lives at `packages/desktop/assets/app-icon-source.svg`; `pnpm --filter @vibetime/desktop run generate:icons` renders `build/app-icon-source.png` and generates modern macOS `build/AppIcon.icon` / packaged `Assets.car`.
- Release versioning for V0 uses date version `2026.5.8` and tag `v2026.5.8`.
- GitHub Actions tag workflow builds macOS arm64 and Windows x64 packages and creates GitHub Release assets.
- Phase 07 scope is Claude Code + Codex only for usage/cost; Cursor and Gemini remain future work.
- Phase 07 Usage UI is a dedicated page/module placed below History in navigation, separate from the History page internals, but should reuse History's dashboard layout and time-window conventions where appropriate.
- Phase 07 does not add usage CLI/export in MVP.
- Pricing is a derived estimate from token facts and a refreshable public pricing cache. Opening the Usage page renders from cache first, then attempts refresh and updates historical estimates.
- Phase 07 must record how parsed usage data links with existing hook data via a `data capability -> hook linkage -> user value -> visualization` mapping before final chart choices are locked.
- Phase 07 Plan 01 established Claude/Codex-only usage contracts, idempotent usage DDL, Wave 0 fixtures, and privacy canary tests without adding usage CLI/export or Cursor/Gemini usage scope.
- [Phase 07]: Unknown model pricing returns null estimated cost and visible tokens, never zero-dollar cost.
- [Phase 07]: Usage attribution order is turn_id -> session_time_window -> project_time_window -> unmatched.
- [Phase 07]: MVP Usage visuals are limited to metric tiles, daily trend, token breakdown, project ranking, model efficiency table, unavailable cost/time panel, and audit table.
- [Phase 07]: Project spend charts are allowed only for hook-linked rows; unassigned usage remains in the audit surface.
- [Phase 07]: Usage IPC summary filters are limited to period, agent, project, model, and includeSidechain.
- [Phase 07]: Unsupported app.usage_refresh_frequency TOML values fall back to 30m; invalid IPC preference writes are rejected.
- [Phase 07]: Background Usage refresh starts from Electron desktop lifecycle and is never wired into hook invocation paths.
- [Phase 07]: Usage route is a dedicated page directly after History with cache-first renderer refresh.
- [Phase 07]: Usage refresh cadence defaults to 15m and supports manual, 1m, 2m, 5m, 15m, and 30m for CodexBar-aligned refresh behavior.
- [Phase 07]: Usage scanning now follows a CodexBar-style performance strategy: unchanged files are skipped, append-only files resume from persisted `parsed_bytes`, Codex scanner state is persisted in `scan_context`, scan work runs in a worker, worker reads in 1MB newline-safe chunks, and DB writes are chunked.
- [Phase 07]: Usage cold-scan responsiveness now avoids main-thread sync discovery/prefix reads on the normal app path, reconciles hook events by fingerprint + usage time window, and deliberately uses smaller batches plus worker-side yielding to reduce CPU spikes even if total first-sync time is longer.
- [Phase 07]: Default app Usage ingestion now runs in an Electron utility process. The main process schedules refreshes and relays progress/finished events, while the utility process handles transcript discovery, scanning, project attribution, hook reconciliation, pricing refresh, and SQLite writes.

### Pending Todos

- Fresh local Usage scan retest after clearing usage tables, with attention to first-scan responsiveness and subsequent refresh smoothness.

### Blockers/Concerns

None.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Distribution | Apple Developer notarization | Deferred to V0.1+ | 2026-04-28 |
| Distribution | Auto-update mechanism | Deferred to V0.1+ | 2026-04-28 |
| Platform | Linux and Windows arm64 binaries | Deferred to V0.1+ | 2026-04-28 |
| Metrics | Cursor / Gemini token-cost tracking | Deferred beyond Phase 07 | 2026-05-15 |
| Metrics | Usage CLI/export | Deferred beyond Phase 07 | 2026-05-15 |
| Metrics | `agent_ratio` (Toggl integration) | Deferred to V0.1+ | 2026-04-28 |
| Surface | Web UI consuming `core` | Deferred to V0.1+ | 2026-04-28 |
| Surface | TUI | Deferred | 2026-04-28 |

## Session Continuity

Last session: 2026-05-16T13:08:15Z
Stopped at: Phase 07 utility-process Usage ingestion split complete; fresh local scan retest pending
Resume file: None
