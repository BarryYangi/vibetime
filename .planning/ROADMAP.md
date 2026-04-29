# Roadmap: vibetime

## Overview

vibetime ships in six phases tracking the locked ~5-week budget (DEC-008): Phase 1 satisfies the PRD §16 process gate (a user-approved `DECISIONS.md`) and stands up the monorepo + pure `core` package; Phase 2 delivers the three agent adapters as pure logic; Phase 3 produces the Bun-compiled `vibetime-hook` binary, the SQLite store with crash recovery, the `~/.vibetime/` filesystem, and the install commands — closing the data-capture loop end-to-end; Phase 4 brings up the Electron desktop shell with IPC, the Today view, the full CLI surface, and minimal Settings; Phase 5 delivers the visual showpiece (Live + History views), the menubar widget, the auto-launch toggle, and the close-to-menubar lifecycle; Phase 6 packages the macOS arm64 .app + .dmg with ad-hoc signing and validates every V0 acceptance criterion. Phase boundaries deliberately follow the W1–W5 budget while inserting the §16 gate.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations & Decisions Gate** - DECISIONS.md approved, monorepo stood up, `core` package skeleton (types + SQL builders + project resolution) shippable in isolation
- [x] **Phase 2: Agent Adapters in `core`** - Three pure adapters (Claude Code / Codex / Cursor) with fixture-based tests covering `NormalizedEvent` mapping (completed 2026-04-28)
- [x] **Phase 3: Hook Binary, Store & Install** - Bun-compiled `vibetime-hook`, SQLite WAL store, crash-recovery rules, `~/.vibetime/` layout, `vibetime install <agent>` — first end-to-end agent capture works (completed 2026-04-29)
- [ ] **Phase 4: Desktop Shell, Today View & CLI** - Electron app with IPC, Today view as default landing, complete CLI surface (`today / project / export / version / install`) running headless, minimal Settings
- [ ] **Phase 5: Live, History, Menubar & Lifecycle** - Live view content-asset quality (≥30fps), History view (heatmap + trends + table), persistent menubar widget, close-to-menubar + auto-launch toggle
- [ ] **Phase 6: Packaging & V0 Acceptance** - macOS arm64 .app + .dmg, ad-hoc signing, first-launch self-auth documentation, every §14 acceptance criterion verified

## Phase Details

### Phase 1: Foundations & Decisions Gate
**Goal**: Close the PRD §16 process gate (user-approved `DECISIONS.md`) and stand up the three-package monorepo with a shippable, dependency-pure `core` package.
**Depends on**: Nothing (first phase)
**Requirements**: PROC-01, FND-01, FND-02, FND-03, FND-04, FND-05, FND-06
**Success Criteria** (what must be TRUE):
  1. `.planning/DECISIONS.md` exists, covers every PRD §16 delegated decision (animation lib, packaging tool, IPC method signatures, package directory layouts, ad-hoc signing scripting, test strategy, all other implementation choices not locked in §5), and has been explicitly approved by the user before any non-scaffolding code is written
  2. Repo root resolves three packages — `core`, `hook`, `desktop` — and `core` imports cleanly with zero UI / runtime / `fs` / DB-client dependencies (enforced by lint or test)
  3. `core` exports the locked `NormalizedEvent` type, the adapter signature, the SQL DDL constants for `events` + `open_turns` (matching PRD §6 verbatim), and the project-resolution function (first-match: alias → git remote → cwd basename → `"_unknown"`); the resolution function is unit-tested for SSH and HTTPS git URL forms and for the `_unknown` fallback
  4. `MIT` `LICENSE` file is present at the repo root
  5. Lint, type-check, and test scripts run from the repo root and pass on a clean checkout
**Plans**: 3 plans
- [x] 01-01-PLAN.md — Repo bootstrap: pnpm workspace + tsconfig.base + Biome + Vitest + dependency-cruiser + LICENSE + per-package skeletons (FND-01, FND-02 staging, FND-03 staging, FND-05, FND-06)
- [x] 01-02-PLAN.md — DECISIONS.md draft + STOP / await user approval (PRD §16 process gate; PROC-01) — gate cleared 2026-04-28 (commit c32a821)
- [x] 01-03-PLAN.md — Core library code: NormalizedEvent, AdapterFn, DDL constants, resolveProject + tests (FND-02, FND-03, FND-04) — commits c0c8a60 + 988c553

### Phase 2: Agent Adapters in `core`
**Goal**: Three pure-function adapters that map vendor hook payloads to `NormalizedEvent` (or `null`), provably never throw, and are fully tested against fixtures.
**Depends on**: Phase 1
**Requirements**: ADPT-01, ADPT-02, ADPT-03, ADPT-04
**Success Criteria** (what must be TRUE):
  1. Calling the Claude Code adapter with each canonical event (`UserPromptSubmit` / `Stop` / `SessionStart` / `SessionEnd`) returns a `NormalizedEvent` matching the locked DEC-011 mapping; deriving `turn_id` as `${session_id}-${ts}` is unit-tested
  2. Calling the Codex adapter likewise produces correct `NormalizedEvent`s for `UserPromptSubmit` / `Stop` / `SessionStart`, with documented behavior for the absent `SessionEnd` (process-exit fallback path is reachable from the hook layer in Phase 3)
  3. Calling the Cursor adapter likewise produces correct `NormalizedEvent`s using `conversation_id` (session), `generation_id` (turn), and `workspace_roots[0]` (cwd); the `workspace_roots[1..]` known-limitation is documented in adapter source
  4. Every adapter returns `null` (never throws) on malformed / unrelated payloads; an adversarial-input test suite covers missing fields, wrong types, and unknown event names
  5. Adapter unit tests use fixtures derived from the PRD Appendix payload examples and run in CI
**Plans**: 1 plan
- [x] 02-01-PLAN.md — Three adapters (Claude Code / Codex / Cursor) + adversarial fixtures + seeded property test + barrel + public API re-export (ADPT-01, ADPT-02, ADPT-03, ADPT-04) — commits b966ced + 24ba7aa + c7803a6 + 98c6d7c

### Phase 3: Hook Binary, Store & Install
**Goal**: Close the data-capture loop — a real Claude Code / Codex / Cursor session writes correct `events` rows to `~/.vibetime/data.db`, with crash recovery, hook silence, and idempotent install commands.
**Depends on**: Phase 2
**Requirements**: STORE-01, STORE-02, STORE-03, REC-01, REC-02, HOOK-01, HOOK-02, HOOK-03, HOOK-04, FS-01, FS-02, FS-03, CLI-01, CLI-02
**Success Criteria** (what must be TRUE):
  1. `vibetime install <agent>` (claude-code | codex | cursor) configures hooks idempotently, preserves any existing user-defined hooks, and for Codex writes `[features] codex_hooks = true` into `~/.codex/config.toml`
  2. Running a real Claude Code, Codex, and Cursor session each produces `events` rows with the correct agent, project (resolved per first-match rule), session_id, turn_id, ts, timezone, and `schema_version=1`
  3. The `vibetime-hook` Bun binary cold-starts in <50ms typical / <100ms worst case, produces no stdout/stderr, exits 0 on every invocation (including parse failures), and routes errors only to `~/.vibetime/hook.log` (with ~10MB rotation)
  4. Two agents in different terminals running concurrent turns produce no DB corruption; both turns appear in `events` (concurrency stress test passes)
  5. Crash recovery: killing an agent mid-turn and starting a new session in the same `session_id` produces a synthetic `turn_end` row with `meta.abandoned = true` and `duration_sec = NULL`; an `open_turns` row older than 6 hours is converted to a synthetic `turn_end` with `meta.reason = "stale_sweep"` at the next CLI invocation
  6. First run creates `~/.vibetime/` at mode `0700` containing `config.toml` (with default `[projects]` empty + `[display].timezone` from system); `data.db` (+ WAL/SHM) and `hook.log` are created lazily on first write
**Plans**: 4 plans in 2 waves
- Wave 1 *(parallel — no dependencies)*:
  - [x] 03-01-PLAN.md — Infrastructure layer: constants, filesystem init, config read/write, log rotation (FS-01, FS-02, FS-03, HOOK-03) — commits 94ebbd7..ccafcf8
  - [x] 03-02-PLAN.md — SQLite store: openDatabase, PRAGMA setup, DDL init, event persistence (STORE-01, STORE-02, STORE-03) — commits 471ba6d..848d41e
- Wave 2 *(blocked on Wave 1)*:
  - [x] 03-03-PLAN.md — Hook binary + crash recovery: stdin read, adapter dispatch, orphan sweep, stale sweep (REC-01, REC-02, HOOK-01, HOOK-02, HOOK-04) — commits 0c4fc9b..cd8e8a5
  - [x] 03-04-PLAN.md — CLI + install commands: subcommand parsing, agent config writers (CLI-01, CLI-02) — commits 28e3e87..4832dc8

### Phase 4: Desktop Shell, Today View & CLI
**Goal**: Electron app launches with the Today view as default landing, all CLI subcommands work headless, and the renderer accesses data exclusively via typed IPC.
**Depends on**: Phase 3
**Requirements**: TODAY-01, TODAY-02, TODAY-03, TODAY-04, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, SET-01, SET-02, SET-03, IPC-01, DESIGN-01
**Success Criteria** (what must be TRUE):
  1. Launching `vibetime.app` (or `vibetime` with no args) opens the desktop window on the Today view; the renderer fetches data only through typed Electron IPC methods (no native modules in renderer; no direct SQLite access)
  2. Today view shows today's date + grand total + per-project rows (sorted by total time desc, with bar visualization) + per-project agent breakdown + footer with turn count and active project count, and auto-refreshes ~every 5 seconds
  3. `vibetime today` prints the same per-project breakdown to stdout and exits; `vibetime project <name> [--days=N]` prints a per-day + per-agent drilldown with `--days=7` default; `vibetime export [--format=json|csv] [--out=<path>] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]` produces well-formed JSON (default to stdout) or CSV, optionally bounded and written to a file; `vibetime version` prints version + `~/.vibetime/data.db` path
  4. Settings panel renders Connect Agents (per-agent install button + status indicator, idempotent and equivalent to `vibetime install <agent>`), Project Aliases editor (persists to `config.toml`), and About (version + `data.db` path + MIT license)
  5. Renderer applies the Tokyo Night palette, Inter (UI) and JetBrains Mono (numerics) typography, and a registered ECharts theme at `desktop/src/charts/theme.ts`
**Plans**: 6 plans in 3 waves
- Wave 1 *(parallel — no dependencies)*:
  - [ ] 04-01-PLAN.md — Electron scaffold: electron-vite config, shared IPC types, preload bridge, main process with CLI detection, better-sqlite3 wrapper (IPC-01, CLI-07)
  - [ ] 04-02-PLAN.md — CLI enhancements: chalk formatting, today/project/export real output, CSV export (CLI-03, CLI-04, CLI-05, CLI-06)
- Wave 2 *(blocked on Wave 1)*:
  - [ ] 04-03-PLAN.md — IPC handlers: all 6 method implementations with real data aggregation, config management, agent status (IPC-01, TODAY-01, TODAY-02, TODAY-03, TODAY-04, SET-01, SET-02, SET-03)
  - [ ] 04-04-PLAN.md — Renderer foundation: Jotai store, useIpcQuery hook, React Router + Sidebar, Tokyo Night Tailwind theme, ECharts theme (DESIGN-01, TODAY-01)
- Wave 3 *(blocked on Wave 2)*:
  - [ ] 04-05-PLAN.md — Today view: complete implementation with CSS bars, agent breakdown, footer, auto-refresh via push (TODAY-01, TODAY-02, TODAY-03, TODAY-04)
  - [ ] 04-06-PLAN.md — Settings view: Connect Agents + Project Aliases + About (SET-01, SET-02, SET-03)
**UI hint**: yes

### Phase 5: Live, History, Menubar & Lifecycle
**Goal**: Visual showpiece for livestream content + ambient menubar surface + close-to-menubar background behavior — turning the data layer into the brand-asset surface.
**Depends on**: Phase 4
**Requirements**: LIVE-01, LIVE-02, LIVE-03, LIVE-04, HIST-01, HIST-02, HIST-03, HIST-04, HIST-05, MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06, SET-04, LIFE-01, LIFE-02
**Success Criteria** (what must be TRUE):
  1. With at least one active turn, Live view shows project name (large), agent + model (medium muted), per-second monospace elapsed timer, ~1Hz breathing pulse, moving sweep bar, and today's project total in footer; concurrent turns stack vertically and are simultaneously visible; idle state shows a quiet "no active turn" with subtle ambient animation; sustained ≥30fps without jank on a 2019 MacBook Pro
  2. History view renders a 365-day ECharts native calendar heatmap (no custom SVG) without performance issues, plus a 30-day stacked-area trends chart and a sortable Top Projects table (Project / Total / Turns / Last Active) using coss ui `Table`; period selector (7d / 30d / 90d / 365d) switches the active range across applicable sub-charts
  3. Persistent macOS menubar item displays today's cumulative agent time per the format states — idle `●` / `● 47m` / `● 5h 23m` — with the `●` pulsing softly only during an active turn and recomputing approximately every 10 seconds during active turns
  4. Menubar left-click opens a dropdown showing today's per-project totals, currently active turns, and an "Open vibetime" button; right-click shows Open / Settings / Quit context menu
  5. Closing the main window keeps the menubar widget alive; quit happens only via the menubar context menu or `Cmd+Q`; an Auto-launch on Login toggle exists in Settings (default OFF) and a first-launch prompt invites the user to opt in
**Plans**: TBD
**UI hint**: yes

### Phase 6: Packaging & V0 Acceptance
**Goal**: Distributable macOS arm64 build (.app + .dmg, ad-hoc signed) with documented first-launch self-authorization, and verification that every V0 acceptance criterion passes on a clean machine.
**Depends on**: Phase 5
**Requirements**: DIST-01, DIST-02
**Success Criteria** (what must be TRUE):
  1. `vibetime.app` (Electron) packages with `vibetime-hook` (Bun-compiled binary) bundled inside such that the install commands and live hook invocations resolve the correct binary path; `.dmg` installer is produced for macOS arm64
  2. The `.app` is ad-hoc self-signed; `codesign --verify` confirms an ad-hoc signature; README and the installer/DMG document the first-launch self-authorization flow (right-click → Open) for fresh installs
  3. Every PRD §14 acceptance criterion (with the notarization criterion replaced by ad-hoc signing + documented self-auth) passes on a fresh macOS arm64 machine — verified by a checklist run that records evidence for: install idempotency, real-session capture for all three agents, concurrent-write integrity, crash + stale-sweep recovery, all three views rendering, menubar format transitions, Live view ≥30fps, calendar 365-day render, ad-hoc signing + self-auth documented, and close ≠ quit / `Cmd+Q` quits
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations & Decisions Gate | 3/3 | Implementation complete (awaits verifier) | - |
| 2. Agent Adapters in `core` | 1/1 | Complete | 2026-04-28 |
| 3. Hook Binary, Store & Install | 4/4 | Complete | 2026-04-29 |
| 4. Desktop Shell, Today View & CLI | 0/6 | Planned | - |
| 5. Live, History, Menubar & Lifecycle | 0/TBD | Not started | - |
| 6. Packaging & V0 Acceptance | 0/TBD | Not started | - |
