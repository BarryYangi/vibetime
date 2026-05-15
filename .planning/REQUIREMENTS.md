# Requirements: vibetime

**Defined:** 2026-04-28
**Core Value:** Accurately and silently record agent coding time per project on the developer's machine, then surface it in a visual surface good enough to live on a livestream — with zero network calls.

> Source: `vibetime-prd.md` §4, §6, §7, §8, §9, §10, §11, §12, §14, §15, §16. Each requirement is testable and traces back to a §-anchored acceptance criterion. The PRD §14 "notarized for Gatekeeper" criterion is REPLACED here with `DIST-02` (ad-hoc signed + first-launch self-authorization documented), per locked user decision.

---

## v1 Requirements

Each requirement maps to exactly one roadmap phase. See `## Traceability` below.

### Process Gate

- [x] **PROC-01**: `.planning/DECISIONS.md` exists, captures every PRD §16 delegated decision (animation lib, packaging tool, IPC method signatures, per-package directory layout, ad-hoc signing scripting, test strategy, all other implementation choices not locked in PRD §5), and is approved by user before any implementation begins.

### Foundation (Monorepo, `core` package, tooling)

- [x] **FND-01**: Monorepo with three packages — `core`, `hook`, `desktop` — established and resolvable from the repo root. `core` has zero UI / runtime / `fs` / DB-client dependencies (enforced by lint or test).
- [x] **FND-02**: `core` exports the locked `NormalizedEvent` interface and the adapter signature `(rawPayload, eventName) => NormalizedEvent | null` (pure, never throws). _(shipped in Plan 01-03 commit `c0c8a60` — `packages/core/src/events.ts`.)_
- [x] **FND-03**: `core` exports SQL builders / DDL constants matching the locked schema (events + open_turns + indices) per PRD §6, with `schema_version` constant fixed at `1`. _(shipped in Plan 01-03 commit `c0c8a60` — `packages/core/src/schema.ts`; byte-exact, no IF-NOT-EXISTS clause.)_
- [x] **FND-04**: `core` exports a project-resolution function implementing first-match: user alias → git remote (owner/repo, both SSH and HTTPS, strip `.git`) → cwd basename → `"_unknown"` fallback. Function never throws. _(shipped in Plan 01-03 commit `988c553` — `packages/core/src/project.ts`; 13 parseGitRemoteUrl + 11 resolveProject specs all green.)_
- [x] **FND-05**: Lint, type-check, and test scripts run from the repo root and pass on a clean checkout.
- [x] **FND-06**: Repository ships an `MIT` `LICENSE` file at the root.

### Adapters (in `core`)

- [x] **ADPT-01**: Claude Code adapter maps `UserPromptSubmit` / `Stop` / `SessionStart` / `SessionEnd` raw payloads to `NormalizedEvent | null` per the DEC-011 mapping. Pure; never throws. Returns `null` on unparseable payloads.
- [x] **ADPT-02**: Codex adapter maps `UserPromptSubmit` / `Stop` / `SessionStart` raw payloads (using process-exit fallback for session-end since Codex `SessionEnd` is not GA) per DEC-011. Pure; never throws.
- [x] **ADPT-03**: Cursor adapter maps `beforeSubmitPrompt` / `stop` / `sessionStart` / `sessionEnd` raw payloads using `workspace_roots[0]` for cwd, `conversation_id` for session, `generation_id` for turn. Pure; never throws.
- [x] **ADPT-04**: All three adapters covered by unit tests using fixtures based on PRD Appendix payload examples.

### Local Store

- [x] **STORE-01**: SQLite database at `~/.vibetime/data.db`. WAL mode + `synchronous=NORMAL` + `busy_timeout=5000` + `foreign_keys=ON` applied at every connection (both `bun:sqlite` in hook and `better-sqlite3` in Electron main).
- [x] **STORE-02**: Schema matches PRD §6 verbatim — `events` and `open_turns` tables with the specified columns, types, and indices on `ts`, `project`, `(agent, project)`, `session_id`. Every row writes `schema_version = 1`.
- [x] **STORE-03**: Two agents in different terminals running concurrently produce no DB corruption; both turns recorded as `events` rows. (Concurrency stress test passes.)

### Crash Recovery

- [x] **REC-01**: On every `session_start`, the hook queries `open_turns` for matching `session_id`; each match becomes a synthetic `turn_end` event with `meta.abandoned = true` and `duration_sec = NULL`; the orphan `open_turns` row is deleted.
- [x] **REC-02**: At every desktop launch and every CLI invocation, any `open_turns` row older than 6 hours becomes a synthetic `turn_end` with `meta.reason = "stale_sweep"` and is deleted.
- [x] **REC-03**: For Codex specifically, if a turn remains open but the local Codex transcript already contains `task_complete` for the same `session_id + turn_id`, the next hook/desktop reconciliation closes it with a synthetic `turn_end` carrying `meta.reason = "codex_task_complete_fallback"` and the transcript path.
- [x] **REC-04**: Repeated `turn_start` for the same still-open `turn_id` must not overwrite the original `started_at`; duplicate starts are ignored and logged.

### Hook Binary (`vibetime-hook`)

- [x] **HOOK-01**: `vibetime-hook` is a Bun-compiled standalone binary. Cold-start invocation completes in <50ms typical / <100ms worst-case on the developer machine.
- [x] **HOOK-02**: Hook produces no stdout and no stderr during normal operation. Exit code is always `0` even on parse failure.
- [x] **HOOK-03**: Errors during hook execution are written to `~/.vibetime/hook.log` with rotation at ~10MB cap. No log-level controls.
- [x] **HOOK-04**: Hook reads payload, invokes the matching `core` adapter, and persists the resulting `NormalizedEvent` (or no-ops on `null`) using `bun:sqlite` against the shared `data.db`.

### Filesystem & Config

- [x] **FS-01**: First run creates `~/.vibetime/` with directory permissions `0700`.
- [x] **FS-02**: First run creates `~/.vibetime/config.toml` with default `[projects]` (empty) and `[display].timezone` (system timezone). The TOML schema matches PRD §12 verbatim.
- [x] **FS-03**: `data.db` (and its WAL/SHM siblings) and `hook.log` are created lazily on first write.

### CLI

- [x] **CLI-01**: `vibetime install <agent>` and `vibetime uninstall <agent>` configure or remove hooks for one agent (claude-code | codex | cursor). Both are idempotent. Uninstall removes only Vibetime-managed hook commands and preserves unrelated user-defined hooks.
- [x] **CLI-02**: For Codex specifically, `vibetime install codex` writes `[features] hooks = true` into `~/.codex/config.toml` (preserving any other config). If Vibetime temporarily flips a prior `false`, uninstall restores the original `false` rather than guessing user intent.
- [x] **CLI-03**: `vibetime today` prints a plain-text per-project breakdown of today's agent time and exits.
- [x] **CLI-04**: `vibetime project <name> [--days=N]` prints a per-day + per-agent breakdown for one project. Default `--days=7`.
- [x] **CLI-05**: `vibetime export [--format=json|csv] [--out=<path>] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]` prints/writes raw events. Default JSON to stdout. CSV is well-formed. `--out` writes to file. `--from/--to` bound the result.
- [x] **CLI-06**: `vibetime version` prints version and `~/.vibetime/data.db` path.
- [x] **CLI-07**: `vibetime` (no args) launches the desktop application.

### Desktop — Today View

- [x] **TODAY-01**: Today view is the default landing view on app launch.
- [x] **TODAY-02**: Today view shows today's date, grand total, per-project rows sorted by total time desc, with bar visualization, plus per-project agent breakdown.
- [x] **TODAY-03**: Today view footer shows turn count and active project count.
- [x] **TODAY-04**: Today view refreshes from push invalidation events instead of polling. When `open_turns` exist, the renderer ticks displayed elapsed time locally every second so totals visibly advance in real time.

### Desktop — Live View

- [ ] **LIVE-01**: Live view shows, for each currently-active turn: project name (large), agent + model (medium muted), elapsed timer (very large monospace, per-second update), breathing pulse indicator (~1Hz alpha), moving sweep bar, and today's project total in footer.
- [ ] **LIVE-02**: Concurrent turns stack vertically and are all simultaneously visible.
- [ ] **LIVE-03**: When idle (no active turn), Live view shows a quiet "no active turn" state with subtle ambient animation.
- [ ] **LIVE-04**: Animation runs at ≥30fps without jank on a 2019 MacBook Pro (PRD acceptance bar; 60fps is the design target).

### Desktop — History View

- [ ] **HIST-01**: History view shows a 365-day GitHub-style calendar heatmap rendered via ECharts native `calendar` component (no custom SVG).
- [ ] **HIST-02**: History view shows a 30-day stacked-area project trends chart using ECharts `stack` series.
- [ ] **HIST-03**: History view shows a sortable Top Projects table (Project / Total / Turns / Last Active) using coss ui `Table`.
- [ ] **HIST-04**: History view top has a period selector (7d / 30d / 90d / 365d) that switches the active range across applicable sub-charts.
- [ ] **HIST-05**: Calendar heatmap renders 365 days without performance issues.

### Desktop — Menubar Widget

- [ ] **MENU-01**: Persistent macOS menubar item is present after app launch.
- [ ] **MENU-02**: Menubar label format transitions correctly across thresholds: idle `●` / `● 47m` (data <1h) / `● 5h 23m` (data ≥1h).
- [ ] **MENU-03**: During an active turn, the `●` indicator pulses softly. When idle, it does not pulse.
- [ ] **MENU-04**: Menubar total recomputes approximately every 10 seconds during an active turn.
- [ ] **MENU-05**: Left click opens a dropdown showing today's per-project totals, currently active turns (if any), and an "Open vibetime" button.
- [ ] **MENU-06**: Right click shows a context menu with Open / Settings / Quit.

### Desktop — Settings & Lifecycle

- [x] **SET-01**: Settings panel includes a Connect Agents section with per-agent install/uninstall actions plus status indicator. These buttons invoke the same code paths as the CLI install/uninstall commands and remain idempotent.
- [x] **SET-02**: Settings panel includes a Project Aliases view/editor for `cwd → name` mappings, persisting changes to `config.toml`.
- [x] **SET-03**: Settings panel includes an About section showing version, `~/.vibetime/data.db` path, and the MIT license.
- [ ] **SET-04**: Settings panel exposes an Auto-launch on Login toggle. Default OFF. The first launch prompts the user to opt in.
- [ ] **LIFE-01**: Closing the main window keeps the menubar widget alive (close ≠ quit).
- [ ] **LIFE-02**: Quit happens only via the menubar context menu or `Cmd+Q`.
- [x] **DESIGN-01**: Renderer uses coss ui as the component baseline and follows the default neutral light/dark semantic theme instead of Tokyo Night. Typography uses local/system sans + mono stacks, and ECharts charts derive from the same restrained semantic palette.
- [x] **IPC-01**: Renderer never opens SQLite directly. All renderer reads/writes go through typed Electron IPC methods exposed by the main process.

### Distribution

- [ ] **DIST-01**: V0 ships as a macOS arm64 `.app` plus a `.dmg` installer. The `.app` bundles `vibetime-hook` (Bun-compiled binary) such that hook commands can resolve it.
- [ ] **DIST-02**: The `.app` is **ad-hoc self-signed**. README and installer document the first-launch self-authorization flow (right-click → Open) for fresh installs. *(Replaces PRD §14's notarization criterion per locked user decision; Apple Developer enrollment NOT required for V0.)*

---

## v2 Requirements

Acknowledged but deferred. Not in current roadmap.

### Token / Cost Tracking

- **TOK-01**: Track per-turn token usage when agent payload exposes it
- **TOK-02**: Per-project / per-agent token aggregation in History view

### Usage Analytics

- **USAGE-01**: Parse Claude Code and Codex local transcript usage only; Cursor and Gemini are excluded from MVP usage/cost totals.
- **USAGE-02**: Store usage token facts idempotently with source identity, model, timestamp, session/turn/project context where available, and no prompt/response/tool argument content.
- **USAGE-03**: Extract Codex usage from native `token_count`/model context records, including cached input, output, reasoning, and token delta handling.
- **USAGE-04**: Extract Claude Code assistant `message.usage` rows with cache creation/read tokens, output tokens, model, and duplicate-row protection.
- **USAGE-05**: Estimate cost from token facts plus a refreshable public pricing cache; opening Usage refreshes pricing, renders from cache first, and marks unavailable prices as unknown.
- **USAGE-06**: Produce a `data capability -> hook linkage -> user value -> visualization` mapping after scanner data fields are proven and before final Usage chart choices are locked.
- **USAGE-07**: Add a dedicated Usage page below History in navigation, showing Claude/Codex token totals, estimated cost where known, and agent/model/project breakdowns while reusing History's dashboard and time-window conventions where appropriate.
- **USAGE-08**: Do not add usage CLI/export in MVP; keep usage export as future work.

### Cross-Platform

- **PLAT-01**: Linux x64 / arm64 distribution
- **PLAT-02**: Windows x64 distribution

### Productization

- **AUTO-01**: Apple Developer notarization (replaces V0's ad-hoc signing once enrolled)
- **AUTO-02**: Auto-update mechanism
- **WEB-01**: Web UI consuming the same `core` package (Electron-less companion)
- **TOGGL-01**: Toggl integration enabling the `agent_ratio` metric (agent time vs. human-tracked time)
- **TUI-01**: Optional TUI surface

---

## Out of Scope

Explicitly excluded from V0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Token / cost tracking | Defer to V0.1+ — not core to time-tracking value |
| Tool-call counting | Defer to V0.1+ |
| Linux / Windows binaries | V0 is macOS arm64 only — single-developer build/test surface |
| Cloud sync, accounts, multi-device | Local-first is contractual |
| Telemetry, analytics, network calls | Privacy is a contractual property |
| `agent_ratio` metric | Requires Toggl integration — deferred |
| Auto-update | Defer to V0.1+ |
| TUI | Defer |
| Long-running daemons outside the desktop app | Hook is short-lived; no extra processes |
| Renderer-side direct SQLite access | Main-process IPC only (DEC-007) |
| Log-level / verbose flags | One rotating `hook.log` only |
| Hook latency / hook errors in `events` table | `hook.log` only |
| Apple Developer Program notarization (V0) | Ad-hoc signing chosen for V0; notarization deferred to V0.1+ |
| Migration logic / multi-version schema | V0 always writes `schema_version = 1`; migration is V0.1+ |

---

## Traceability

Each v1 requirement maps to exactly one phase. Updated as roadmap evolves.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROC-01 | Phase 1 | Done (DECISIONS.md approved 2026-04-28) |
| FND-01 | Phase 1 | Done (Plan 01-01) |
| FND-02 | Phase 1 | Staged in 01-01; library code in 01-03 |
| FND-03 | Phase 1 | Staged in 01-01; library code in 01-03 |
| FND-04 | Phase 1 | Done (Plan 01-03) |
| FND-05 | Phase 1 | Done (Plan 01-01) |
| FND-06 | Phase 1 | Done (Plan 01-01) |
| ADPT-01 | Phase 2 | Done (Plan 02-01) |
| ADPT-02 | Phase 2 | Done (Plan 02-01) |
| ADPT-03 | Phase 2 | Done (Plan 02-01) |
| ADPT-04 | Phase 2 | Done (Plan 02-01) |
| STORE-01 | Phase 3 | Done (Phase 3 verified; rechecked 2026-05-07) |
| STORE-02 | Phase 3 | Done (Phase 3 verified; rechecked 2026-05-07) |
| STORE-03 | Phase 3 | Done (Phase 3 verified) |
| REC-01 | Phase 3 | Done (Phase 3 verified) |
| REC-02 | Phase 3 | Done (Phase 3 verified) |
| REC-03 | Phase 3 | Done (post-Phase-4 maintenance, 2026-05-07) |
| REC-04 | Phase 3 | Done (post-Phase-4 maintenance, 2026-05-07) |
| HOOK-01 | Phase 3 | Done (binary built and used locally) |
| HOOK-02 | Phase 3 | Done (Phase 3 verified) |
| HOOK-03 | Phase 3 | Done (Phase 3 verified) |
| HOOK-04 | Phase 3 | Done (Phase 3 verified; Codex reconciliation added later) |
| FS-01 | Phase 3 | Done (Phase 3 verified) |
| FS-02 | Phase 3 | Done (Phase 3 verified) |
| FS-03 | Phase 3 | Done (Phase 3 verified) |
| CLI-01 | Phase 3 | Done (install/uninstall idempotent; rechecked 2026-05-07) |
| CLI-02 | Phase 3 | Done (safe Codex config ownership restore added 2026-05-07) |
| TODAY-01 | Phase 4 | Done (Phase 4 verified) |
| TODAY-02 | Phase 4 | Done (Phase 4 verified) |
| TODAY-03 | Phase 4 | Done (Phase 4 verified) |
| TODAY-04 | Phase 4 | Done (event-driven refresh + live ticking, rechecked 2026-05-07) |
| CLI-03 | Phase 4 | Done (Phase 4 verified) |
| CLI-04 | Phase 4 | Done (Phase 4 verified) |
| CLI-05 | Phase 4 | Done (Phase 4 verified) |
| CLI-06 | Phase 4 | Done (Phase 4 verified) |
| CLI-07 | Phase 4 | Done (Phase 4 verified) |
| SET-01 | Phase 4 | Done (install/uninstall actions shipped 2026-05-07) |
| SET-02 | Phase 4 | Done (Phase 4 verified) |
| SET-03 | Phase 4 | Done (Phase 4 verified) |
| IPC-01 | Phase 4 | Done (Phase 4 verified) |
| DESIGN-01 | Phase 4 | Done (post-Phase-4 COSS theme alignment, 2026-05-07) |
| LIVE-01 | Phase 5 | Pending |
| LIVE-02 | Phase 5 | Pending |
| LIVE-03 | Phase 5 | Pending |
| LIVE-04 | Phase 5 | Pending |
| HIST-01 | Phase 5 | Pending |
| HIST-02 | Phase 5 | Pending |
| HIST-03 | Phase 5 | Pending |
| HIST-04 | Phase 5 | Pending |
| HIST-05 | Phase 5 | Pending |
| MENU-01 | Phase 5 | Pending |
| MENU-02 | Phase 5 | Pending |
| MENU-03 | Phase 5 | Pending |
| MENU-04 | Phase 5 | Pending |
| MENU-05 | Phase 5 | Pending |
| MENU-06 | Phase 5 | Pending |
| SET-04 | Phase 5 | Pending |
| LIFE-01 | Phase 5 | Pending |
| LIFE-02 | Phase 5 | Pending |
| DIST-01 | Phase 6 | Pending |
| DIST-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 61 total
- Mapped to phases: 61
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-28*
*Last updated: 2026-05-07 after post-Phase-4 stabilization sync*
