# vibetime — Product Requirements

> Multi-agent coding-time tracker. Local-first. Desktop client + CLI.
> Describes **what** to build, the locked decisions, and the constraints. **Detailed implementation** (file layout, exact APIs, animation libs, packaging steps) is for GSD to research and propose.

---

## 1. Product

A local-first desktop application that tracks how much time each AI coding agent (Claude Code, Codex CLI, Cursor) is actively coding for the user, broken down by project.

The user installs lightweight hooks for the agents they use. Each hook fires on agent turns (prompt-submit and stop) and records the event into a local store. The user views live and historical data through a desktop app or CLI.

**Differentiator vs. WakaTime**: this measures **agent time, not human time**. Cross-agent. Local-only. Pitch: *"WakaTime for AI coding agents."*

**Brand context**: vibetime is a deliberate extension of the user's "vibe coding" content brand on Bilibili. The tool is also a content asset — every visible surface (menubar, Live view) doubles as passive brand exposure during livestreams.

## 2. Users

Primary user: the developer building this (single-developer V0). The shape generalizes to:

- Solo developers using one or more AI coding agents
- Particularly: those who livestream / produce content about AI coding workflows
- Bilingual: Chinese and English developer communities

## 3. Core Use Cases

1. **At-a-glance daily check** — "How much time did agents code for me today, broken down by project?"
2. **Live observation** — "Right now, which agent is working on which project?"
3. **Historical reflection** — "How has my agent usage evolved over 7 / 30 / 90 / 365 days?"
4. **Cross-agent comparison** — "Am I using Claude Code, Codex, or Cursor more on this project?"
5. **Content asset** — Live view + menubar are screen-recordable assets for streaming and short-form video.

## 4. V0 Scope

### Must Have

- Three agent adapters: **Claude Code**, **Codex CLI**, **Cursor**
- Local persistence supporting concurrent multi-process writes
- Desktop application with:
  - **Today** view: per-project breakdown of today's agent time
  - **Live** view: real-time visualization of currently-active turns
  - **History** view: 7/30/90/365-day trends including a calendar heatmap
  - **Menubar widget**: persistent OS-level indicator showing today's cumulative agent time
- CLI mode for headless use: install hooks, query today's data, export raw events
- One-command hook installation per agent (idempotent)
- macOS arm64 distribution as a signed, notarized application

### Must Not Have (defer to V0.1+)

- Token usage / cost tracking
- Tool-call counting
- Linux / Windows binaries (post-V0)
- Cloud sync, accounts, multi-device aggregation
- agent_ratio metric (requires Toggl integration; later)
- Auto-update mechanism
- Telemetry, analytics, or any network calls
- TUI

## 5. Locked Technical Decisions

These are decisions the user has already made and does **not** want GSD to relitigate. Each carries a one-sentence rationale so GSD understands the context.

### Application shell: **Electron**

> Rationale: user is a React/Next.js engineer. Electron keeps the entire stack in TypeScript and avoids introducing Rust (which Tauri would require for SQLite/IPC plumbing). The ~150MB binary penalty is acceptable for a desktop tool.

### Frontend stack: **React 18 + TypeScript, Tailwind CSS v4, coss ui, Apache ECharts, Jotai**

- **coss ui** (https://coss.com/ui/docs) — UI component library built on Base UI + Tailwind. Copy-paste-into-repo philosophy (own the source, no abstraction layers). Already used on Scenee.
- **Apache ECharts v6** via `echarts-for-react` — for all data visualization including the calendar heatmap, stacked area trends, and bar charts.

> Rationale (coss ui): matches the user's existing Scenee stack, zero new framework learning cost, designed for AI-assisted development (ships an `llms.txt` and Skills documentation).
>
> Rationale (ECharts over Recharts): ECharts has a **native Calendar component** that renders the GitHub-contributions-style heatmap out of the box — Recharts has no equivalent and would require ~200 lines of custom SVG. ECharts also has stronger animation, broader chart vocabulary for V0.1+ expansions, and is widely recognized in the Chinese developer community (Bilibili audience). Bundle size (~1MB) is irrelevant inside an Electron app.

### Hook runtime: **Separate Bun-compiled CLI binary** (not the Electron app)

> Rationale: §7 requires <50ms startup for hooks. Electron startup (200-500ms) cannot meet this. A standalone Bun-compiled binary using `bun:sqlite` starts in <30ms and is the right tool for this constraint.

### Two-binary distribution

The application ships as:
- **`vibetime-hook`** — the Bun-compiled CLI invoked by agent hooks. Bundled inside the `.app`. ~50MB target.
- **`vibetime.app`** — the Electron application. The same binary, when invoked with CLI subcommands (`vibetime today`, `vibetime install`, etc.), runs headless and exits.

Both binaries access the same local SQLite file. Concurrency is handled via SQLite's WAL mode.

> Rationale: separates the "must be fast and silent" hook layer from the "rich UI" application layer. They share data via the local DB, not via IPC.

### Storage: **SQLite** (`bun:sqlite` for hook, `better-sqlite3` for Electron main process)

WAL mode + standard PRAGMAs (`synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`).

> Rationale: SQLite is the industry-standard local-first store for this exact category (Atuin, ActivityWatch, WakaTime CLI). WAL mode handles concurrent multi-process writes correctly. The two SQLite client libraries write to the same file safely.

### Repository structure: **Monorepo with three packages: `core` / `hook` / `desktop`**

- `core` — pure TypeScript: types, adapter parsers, project resolution, SQL builders. **Zero UI dependencies, zero runtime dependencies, zero `fs` or DB client imports.** Pure logic.
- `hook` — the Bun CLI; imports `core`, adds `bun:sqlite`.
- `desktop` — Electron app; imports `core`, adds `better-sqlite3` in main process.

> Rationale: keeps query logic and adapter logic reusable across both binaries. Also future-proofs for a possible web UI in V0.1, which would import the same `core`. Non-negotiable.

### Renderer-side data access: **all queries via Electron IPC to main process**

The React renderer never opens SQLite directly. Main process owns the DB connection and exposes typed IPC methods.

> Rationale: standard Electron security and lifecycle. Avoids native-module-in-renderer complications.

### Time budget: **roughly 5 weeks**

The user has reviewed the rough plan: W1 core + adapters, W2 hook binary + remaining adapters, W3 Electron shell + Today tab, W4 Live + History + menubar, W5 signing + notarization + dmg. GSD may adjust the breakdown if it identifies a better sequence, but should not blow past 6 weeks without flagging.

---

## 6. Data Model (locked)

The schema is the contract. Changing it later forces data migrations.

### `events` table

```sql
CREATE TABLE events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    agent           TEXT    NOT NULL,    -- 'claude-code' | 'codex' | 'cursor'
    event_type      TEXT    NOT NULL,    -- 'turn_start' | 'turn_end' | 'session_start' | 'session_end'
    project         TEXT    NOT NULL,
    session_id      TEXT    NOT NULL,
    turn_id         TEXT,                 -- NULL for session_* events
    ts              REAL    NOT NULL,    -- epoch seconds, fractional
    timezone        TEXT    NOT NULL,    -- IANA timezone name
    duration_sec    REAL,                 -- only set on turn_end
    meta            TEXT                  -- nullable JSON blob for forward extensibility
);
```

Index on: `ts`, `project`, `(agent, project)`, `session_id`.

### `open_turns` table (in-flight turns awaiting their `turn_end`)

```sql
CREATE TABLE open_turns (
    turn_id     TEXT    PRIMARY KEY,
    agent       TEXT    NOT NULL,
    project     TEXT    NOT NULL,
    session_id  TEXT    NOT NULL,
    started_at  REAL    NOT NULL,
    timezone    TEXT    NOT NULL,
    meta        TEXT
);
```

### Project name resolution

When a hook fires, `project` is derived. **First match wins.**

1. **User alias**: check user config for an exact `cwd → name` match.
2. **Git remote**: parse `git -C <cwd> config --get remote.origin.url` to `owner/repo`. Handle both SSH and HTTPS forms; strip trailing `.git`.
3. **Cwd basename**: `path.basename(cwd)`.

If `cwd` is missing or unresolvable, write `project = "_unknown"` and continue. Never throw from a hook.

### Schema versioning

Every row carries `schema_version`. V0 always writes `1`. No migration logic in V0.

## 7. Hook Runtime Constraints

Hard constraints on whatever runs inside the agent's hook system:

- **Startup time**: <50ms typical, <100ms worst case. A slow hook degrades the user's agent UX and is unacceptable.
- **Silence**: no stdout, no stderr unless catastrophic. Invisible during normal operation.
- **Exit code**: always 0. Errors logged to `~/.vibetime/hook.log`, never surfaced to the agent.
- **Concurrency-safe**: multiple hook invocations from different agents in different terminals must succeed without data corruption.

## 8. Agent Hook Mappings (locked)

The mapping table below is verified against current vendor documentation. GSD should re-verify against actual hook output during implementation; if a vendor field has changed, update the adapter and note it in the PR. Do not change the normalized event schema.

| Concept | Claude Code | Codex CLI | Cursor |
|---|---|---|---|
| Turn-start event name | `UserPromptSubmit` | `UserPromptSubmit` | `beforeSubmitPrompt` |
| Turn-end event name | `Stop` | `Stop` | `stop` |
| Session-start event name | `SessionStart` | `SessionStart` | `sessionStart` |
| Session-end event name | `SessionEnd` | (not GA; use process exit) | `sessionEnd` |
| Session ID payload field | `session_id` | `session_id` | `conversation_id` |
| Turn ID payload field | (derive: `${session_id}-${ts}`) | `turn_id` | `generation_id` |
| Cwd payload field | `cwd` | `cwd` | `workspace_roots[0]` |
| Model payload field (in session_start) | `model` | `model` | (verify during W1; if absent, omit) |

**Codex caveat**: requires `[features] codex_hooks = true` in `~/.codex/config.toml`. The install command must set this.

**Cursor caveat**: `workspace_roots` is an array; V0 uses index `[0]` and documents this as a known limitation.

### Adapter contract

Each adapter is a pure function: `(rawPayload, eventName) → NormalizedEvent | null`. Returns `null` if the payload is unparseable or the event is irrelevant. Never throws.

```ts
interface NormalizedEvent {
  agent: 'claude-code' | 'codex' | 'cursor'
  event_type: 'turn_start' | 'turn_end' | 'session_start' | 'session_end'
  project: string
  session_id: string
  turn_id?: string
  ts: number               // epoch seconds
  timezone: string         // IANA
  meta?: Record<string, unknown>
}
```

## 9. Crash Recovery

If a turn never receives its end event, its `open_turns` row is orphaned. Self-healing rules:

- **On every `session_start`**: query `open_turns` for matching `session_id`. Each match becomes a synthetic `turn_end` event with `meta.abandoned = true` and `duration_sec = NULL`. Delete the orphan.
- **Stale sweep**: at every desktop launch and every CLI invocation, any `open_turns` row older than **6 hours** is treated as abandoned with `meta.reason = "stale_sweep"`.

## 10. Desktop App Requirements

### 10.1 Menubar widget

A persistent macOS menubar item showing **today's cumulative agent time across all projects**.

**Display format**:
- Idle (no data today): minimal monochrome icon only, e.g., `●`
- With data, under an hour: `● 47m`
- With data, an hour or more: `● 5h 23m`
- During an active turn: same total, but the `●` indicator pulses softly to show "live"

The total updates as it changes. During an active turn, recompute every ~10 seconds (the increment is small enough that per-second recompute would be wasted CPU).

**Click behavior**:
- Left click → dropdown showing today's totals per project, currently active turns (if any), and an "Open vibetime" button
- Right click → context menu: Open, Settings, Quit

**Why this design**: today's cumulative is a monotonically increasing number — visually a quietly growing badge — which is the right shape for an always-on indicator. A current-turn timer would reset to zero repeatedly, which is confusing as an ambient surface (and during livestreams).

### 10.2 Main window — three views via sidebar

#### Today view (default landing)

- Today's date + grand total
- Per-project breakdown sorted by total time desc, with bar visualization
- Per-project agent breakdown
- Footer: turn count, active project count
- Refresh every ~5 seconds

#### Live view (visual showpiece)

When a turn is active:
- Project name (large)
- Agent name + model (medium, muted)
- Elapsed time (very large, monospace, updating each second)
- A **breathing pulse indicator** (alpha animation, ~1Hz)
- A **moving sweep bar** (scanning indicator, no fixed length)
- Today's total on this project (footer)

When idle: quiet "no active turn" state with subtle ambient animation.

When multiple turns are concurrent: stacked vertically.

**Animation quality bar**: 60fps target, no flicker, smooth on a 2019 MBP minimum. This view is the product's strongest content asset; visual quality matters as much as correctness.

#### History view

- **Calendar heatmap** — GitHub-contributions style, 365 days, cells colored by daily total. Use ECharts' native `calendar` component (no custom SVG required).
- **Project trends** — stacked area chart, last 30 days, projects stacked. ECharts `stack` series.
- **Top projects table** — sortable, columns Project / Total / Turns / Last Active. Use coss ui `Table` component.
- Period selector at top: 7d / 30d / 90d / 365d

### 10.3 Settings (minimal V0)

- Connect Agents: per-agent install button + status indicator
- Project aliases: view/edit `cwd → name` mappings
- About: version, data file location, license

### 10.4 Background behavior

- **Close to menubar**: closing the main window does not quit. Quit only via menubar context menu or `Cmd+Q`.
- **Auto-launch on login**: opt-in setting, default off.

### 10.5 Design system

- Color palette: Tokyo Night-inspired (primary `#bb9af7`, accent `#7aa2f7`, success `#9ece6a`, muted `#565f89`, foreground `#c0caf5`, background `#1a1b26`)
- Typography: Inter for UI, JetBrains Mono for numbers/code
- coss ui as component baseline; customize via Tailwind tokens
- ECharts charts themed to the same palette via a custom theme registered in `desktop/src/charts/theme.ts`
- Rounded borders, generous line-height

## 11. CLI Surface

The desktop binary, when invoked with CLI subcommands, runs headless and exits.

- `vibetime install <agent>` — configure hooks for one agent. Idempotent.
- `vibetime today` — plain-text breakdown of today's agent time.
- `vibetime project <name> [--days=N]` — drilldown for one project, default 7 days.
- `vibetime export [--format=json|csv] [--out=<path>] [--from=<date>] [--to=<date>]` — raw event export. Default JSON to stdout. Date format: `YYYY-MM-DD`.
- `vibetime version` — version + data file path.
- `vibetime` (no args) — launch desktop app.

## 12. Configuration & Filesystem

User configuration in `~/.vibetime/config.toml`:

```toml
[projects]
"/absolute/path/to/repo" = "alias-name"

[display]
timezone = "America/New_York"   # default: system timezone
```

Application data layout:

```
~/.vibetime/
├── config.toml      # user config; created on first launch
├── data.db          # SQLite database
├── data.db-wal      # SQLite WAL file (auto)
├── data.db-shm      # SQLite shared memory (auto)
└── hook.log         # rotating debug log, ~10MB cap
```

Directory permissions `0700`. Created on first run if absent.

## 13. Out-of-Scope Behaviors

Explicit non-goals — must not be implemented in V0:

- Tracking hook latency or hook errors in the events table (use `hook.log` only)
- Remote / cloud database backends
- Telemetry, analytics, or any network calls
- Long-running daemons outside the desktop app process
- Log-level controls or verbose flags
- User accounts, login, or sync UI
- Auto-update mechanism
- Renderer-side direct SQLite access

## 14. Acceptance Criteria for V0

V0 is complete when **all** of the following pass:

- [ ] `vibetime install claude-code` configures hooks. Running it twice does not duplicate. Existing user-defined hooks preserved.
- [ ] After a real Claude Code session, `vibetime today` shows the correct project name and elapsed time.
- [ ] Same for Codex (with feature flag set) and Cursor.
- [ ] Two agents in different terminals concurrently → no DB corruption, both turns recorded.
- [ ] Crash recovery: kill an agent mid-turn, start a new session, orphaned turn appears in `events` with `meta.abandoned = true`.
- [ ] Stale sweep: an `open_turns` row older than 6 hours is cleaned up at next launch.
- [ ] Desktop app launches; all three views render; menubar widget appears.
- [ ] Menubar widget shows today's cumulative time and updates correctly across format thresholds (idle / minutes / hours).
- [ ] Live view animates at ≥30fps without jank on a 2019 MBP.
- [ ] Calendar heatmap renders 365 days without performance issues.
- [ ] App is properly notarized for macOS Gatekeeper (no "unidentified developer" warning on a fresh install).
- [ ] Closing the main window keeps the menubar widget alive; `Cmd+Q` quits everything.

## 15. Open Decisions Requiring User Input

GSD must surface these and stop, not unilaterally answer:

1. **License** — MIT or Apache 2.0 for V0 release.
2. **Apple Developer Program enrollment** — required for notarization, 1-3 day approval window. User must enroll before packaging week.
3. **Auto-launch on login default** — recommended off, prompt user on first launch. User to confirm.

## 16. Decisions Delegated to GSD

Within the locked decisions in §5 and the constraints of this document, GSD researches and proposes; user approves. Examples:

- Exact directory layout inside each package
- IPC method signatures and types
- Animation library choice for the Live view (Framer Motion, vanilla CSS, or other) — must hit the 60fps quality bar
- Packaging tool (electron-builder, electron-forge, or other)
- Code-signing and notarization scripting
- Test strategy
- All other technical decisions not explicitly locked

GSD should produce a brief technical-decisions document (`DECISIONS.md`) capturing the chosen approach and one-sentence rationale per choice, **before starting implementation**. The user reviews and approves before code is written.

---

## Appendix — Hook Payload Reference

Excerpts for orientation. GSD must verify against actual hook output.

### Claude Code `UserPromptSubmit`

```json
{
  "session_id": "abc-123",
  "cwd": "/Users/barry/work/scenee",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "fix the bug in foo.ts",
  "permission_mode": "default"
}
```

### Codex `UserPromptSubmit`

```json
{
  "session_id": "abc-123",
  "turn_id": "t-456",
  "cwd": "/Users/barry/work/scenee",
  "hook_event_name": "UserPromptSubmit"
}
```

### Cursor `beforeSubmitPrompt`

```json
{
  "conversation_id": "abc-123",
  "generation_id": "g-456",
  "hook_event_name": "beforeSubmitPrompt",
  "workspace_roots": ["/Users/barry/work/scenee"]
}
```

### Cursor `stop`

```json
{
  "conversation_id": "abc-123",
  "generation_id": "g-456",
  "status": "completed",
  "hook_event_name": "stop",
  "workspace_roots": ["/Users/barry/work/scenee"]
}
```

---

*End of requirements.*
