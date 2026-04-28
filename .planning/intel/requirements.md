# Requirements (synthesized from PRD §4, §10, §11, §14)

> Source: `vibetime-prd.md`. V0 acceptance criteria from §14 are derived into testable requirements with explicit acceptance items. Scope items from §4, §10, §11 produce capability requirements.

---

## REQ-agent-adapter-claude-code

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §8, §14
- description: Provide a Claude Code adapter that maps `UserPromptSubmit` / `Stop` / `SessionStart` / `SessionEnd` raw payloads into `NormalizedEvent` (or `null`) per the locked mapping in DEC-011.
- acceptance:
  - After a real Claude Code session, `vibetime today` shows the correct project name and elapsed time.
  - Adapter is a pure function `(rawPayload, eventName) → NormalizedEvent | null`. Never throws.
- scope: `core` package (pure logic), invoked by `hook` binary.

## REQ-agent-adapter-codex

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §8, §14
- description: Provide a Codex CLI adapter per DEC-011, including the `[features] codex_hooks = true` toggle in `~/.codex/config.toml`.
- acceptance:
  - With Codex feature flag set, after a real Codex session `vibetime today` shows the correct project name and elapsed time.
  - `vibetime install codex` writes the `[features] codex_hooks = true` flag.
  - Session-end is handled via process-exit fallback (Codex `SessionEnd` is not GA).
- scope: `core` adapter + `hook` invocation + `vibetime install codex` CLI behavior.

## REQ-agent-adapter-cursor

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §8, §14
- description: Provide a Cursor adapter per DEC-011. `workspace_roots[0]` is the documented cwd source for V0.
- acceptance:
  - After a real Cursor session, `vibetime today` shows the correct project name and elapsed time.
  - The known limitation that V0 ignores `workspace_roots[1..]` is documented (release notes / README).
- scope: `core` adapter + `hook` invocation.

## REQ-local-store-concurrent-writes

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §5 (Storage), §7, §14
- description: Local SQLite store supporting concurrent multi-process writes from independent agent hooks running in separate terminals, using WAL + the locked PRAGMAs.
- acceptance:
  - Two agents in different terminals concurrently → no DB corruption, both turns recorded in `events`.
  - Database schema matches DEC-009 exactly (events + open_turns + indices).
  - PRAGMAs `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON` applied at every connection.
- scope: shared between `hook` (via `bun:sqlite`) and `desktop` (via `better-sqlite3`).

## REQ-crash-recovery

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §9, §14
- description: Self-healing rules for orphaned `open_turns` rows.
- acceptance:
  - Killing an agent mid-turn and starting a new session in the same `session_id` produces an `events` row with `event_type='turn_end'`, `meta.abandoned = true`, and `duration_sec = NULL`. The `open_turns` orphan is deleted.
  - On desktop launch and on every CLI invocation, any `open_turns` row older than 6 hours becomes a synthetic `turn_end` with `meta.reason = "stale_sweep"`.
- scope: invoked from both `hook` and `desktop`.

## REQ-desktop-today-view

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §10.2 (Today view), §14
- description: Default landing view: today's date + grand total + per-project breakdown sorted by total time desc, per-project agent breakdown, footer (turn count, active project count). Auto-refreshes ~5s.
- acceptance:
  - View renders on app launch.
  - Per-project rows sorted by total time desc.
  - Bar visualization present per project.
  - Refresh occurs roughly every 5 seconds.
- scope: `desktop` renderer + IPC query.

## REQ-desktop-live-view

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §10.2 (Live view), §14
- description: Visual showpiece. While a turn is active: large project name, medium muted agent+model, very large monospace elapsed timer (per-second update), breathing pulse (~1Hz alpha), moving sweep bar, today's project total in footer. Idle state shows quiet "no active turn" with subtle ambient animation. Concurrent turns stack vertically.
- acceptance:
  - Live view animates at **≥30fps without jank** on a 2019 MBP minimum (PRD's stated quality bar; PRD §5 also names a 60fps target).
  - All listed elements render correctly in active and idle states.
  - Concurrent turns stack vertically, all visible simultaneously.
- scope: `desktop` renderer; animation library choice delegated to GSD (§16) but must hit quality bar.

## REQ-desktop-history-view

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §10.2 (History view), §14
- description: History view consisting of:
  - 365-day GitHub-style calendar heatmap via ECharts native `calendar` component
  - 30-day stacked-area project trends via ECharts `stack` series
  - Top projects table (sortable: Project / Total / Turns / Last Active) using coss ui `Table`
  - Period selector at top: 7d / 30d / 90d / 365d
- acceptance:
  - Calendar heatmap renders 365 days without performance issues.
  - Period selector switches active range across all sub-charts where applicable.
  - Top projects table sorts on every column.
- scope: `desktop` renderer; uses ECharts (DEC-002) and coss ui table.

## REQ-menubar-widget

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §10.1, §14
- description: Persistent macOS menubar widget showing today's cumulative agent time, per the format states in DEC-013. Left click opens dropdown (per-project totals, active turns, "Open vibetime"). Right click shows context menu (Open / Settings / Quit).
- acceptance:
  - Menubar widget appears on app launch.
  - Format transitions correctly across thresholds (idle / `Nm` / `Nh Mm`).
  - Pulsing `●` shown only during an active turn.
  - Recompute interval ~10s during active turns.
  - Left/right click behaviors match the spec.
- scope: `desktop` main process (native menubar item).

## REQ-settings-minimal

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §10.3
- description: Minimal V0 settings: per-agent install button + status indicator; project alias view/edit (`cwd → name`); About panel (version, data file location, license).
- acceptance:
  - All three sections render and operate.
  - "Install" button per agent invokes the same code path as `vibetime install <agent>` and is idempotent.
  - About shows correct version and `~/.vibetime/data.db` path.
- scope: `desktop` renderer + IPC.

## REQ-window-lifecycle

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §10.4, §14
- description: Closing the main window keeps the menubar widget alive (close ≠ quit). Quit only via menubar context menu or `Cmd+Q`. Auto-launch on login is opt-in, default off (pending §15 user confirmation).
- acceptance:
  - Closing the window keeps menubar widget alive.
  - `Cmd+Q` quits everything.
  - "Quit" menubar item quits everything.

## REQ-cli-install

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §11, §14
- description: `vibetime install <agent>` configures hooks for one agent. Idempotent. Existing user-defined hooks must be preserved.
- acceptance:
  - `vibetime install claude-code` configures hooks; running it twice does not duplicate.
  - Existing user-defined hooks are preserved.
  - For Codex, also writes `[features] codex_hooks = true`.
- scope: CLI subcommand on the desktop binary.

## REQ-cli-today

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §11, §14
- description: `vibetime today` prints a plain-text breakdown of today's agent time.
- acceptance:
  - Output reflects the same data the Today view shows (per-project totals).
  - Headless invocation: process exits after printing.

## REQ-cli-project

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §11
- description: `vibetime project <name> [--days=N]` prints a drilldown for one project. Default 7 days.
- acceptance:
  - Accepts `--days=N` and uses default 7 when absent.
  - Prints per-day totals and per-agent breakdown for the named project.

## REQ-cli-export

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §11
- description: `vibetime export [--format=json|csv] [--out=<path>] [--from=<date>] [--to=<date>]` exports raw events. Default format JSON to stdout. Date format `YYYY-MM-DD`.
- acceptance:
  - Default invocation prints JSON of all events to stdout.
  - `--format=csv` produces valid CSV.
  - `--out=<path>` writes to file instead of stdout.
  - `--from`/`--to` accept `YYYY-MM-DD` and bound the result.

## REQ-cli-version

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §11
- description: `vibetime version` prints the version and the data file path.

## REQ-cli-no-args-launches-desktop

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §11
- description: `vibetime` (no args) launches the desktop application.

## REQ-config-filesystem

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §12
- description: Config file at `~/.vibetime/config.toml` with `[projects]` (cwd→alias map) and `[display]` (timezone). Application data layout under `~/.vibetime/` (config.toml, data.db + WAL/SHM, hook.log). Directory permissions `0700`. Created on first run if absent.
- acceptance:
  - First-run invocation creates `~/.vibetime/` with mode `0700`.
  - Missing `config.toml` is created with sensible defaults.
  - `data.db` and `hook.log` are created lazily on first write.

## REQ-hook-log

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §7, §12, §13
- description: Errors during hook execution are written to `~/.vibetime/hook.log` (rotating, ~10MB cap). Hook process is silent on stdout/stderr unless catastrophic. Hook exit code is always 0.
- acceptance:
  - Forcing a hook error produces a `hook.log` entry; nothing on stdout/stderr.
  - Hook exit code observed as 0 even on parse failure.
  - Log file is capped (~10MB) with rotation.

## REQ-macos-signing-notarization

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4, §14
- description: V0 ships signed and notarized for macOS Gatekeeper.
- acceptance:
  - Fresh install on a clean macOS arm64 machine produces no "unidentified developer" warning.
- dependency: §15 open decision — Apple Developer Program enrollment must complete before packaging week.
