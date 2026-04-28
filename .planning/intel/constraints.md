# Constraints (synthesized from PRD §6, §7, §8, §10.5, §12, §13, §15)

> The PRD is hybrid; §6/§7/§8 carry SPEC-grade technical constraints, §10.5 fixes design tokens, §12 fixes filesystem layout, §13 enumerates explicit non-goals, §15 captures open questions the user must answer (flagged with `open_question: true`). All constraints below are subordinate to the LOCKED decisions in `decisions.md`.

---

## CON-schema-events-table

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §6
- type: schema
- content:

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

- indices: `ts`, `project`, `(agent, project)`, `session_id`.
- contract: schema is locked; mutation requires migration logic NOT scoped to V0.

## CON-schema-open-turns-table

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §6
- type: schema
- content:

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

## CON-sqlite-pragmas

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5 (Storage)
- type: protocol
- content: Every SQLite connection (both `bun:sqlite` in `hook` and `better-sqlite3` in Electron main) must enable WAL mode and apply: `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`.

## CON-schema-version-policy

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §6
- type: schema
- content: Every row carries `schema_version`. V0 always writes `1`. **No migration logic is in scope for V0.** Forward-extensibility is reserved via the `meta` JSON column.

## CON-hook-startup-time

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §7
- type: nfr
- content: Hook startup time must be **<50ms typical, <100ms worst case**. A slow hook degrades the agent UX and is unacceptable. Drives DEC-003 (Bun-compiled binary).

## CON-hook-silence

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §7
- type: nfr
- content: Hook process must be silent on stdout and stderr unless catastrophic. Invisible during normal operation.

## CON-hook-exit-code

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §7, §6
- type: protocol
- content: Hook process always exits with code 0. Errors are logged to `~/.vibetime/hook.log`, never surfaced to the agent. Adapters and project-resolution code must never throw out of a hook invocation.

## CON-hook-concurrency

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §7
- type: nfr
- content: Multiple hook invocations from different agents in different terminals must succeed without data corruption. Concurrency is provided by SQLite WAL mode (CON-sqlite-pragmas) plus `busy_timeout=5000`.

## CON-adapter-contract

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §8
- type: api-contract
- content:

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

- behavior: each adapter is a pure function `(rawPayload, eventName) → NormalizedEvent | null`. Returns `null` when payload is unparseable or the event is irrelevant. **Never throws.**

## CON-codex-feature-flag

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §8
- type: protocol
- content: Codex hooks are gated behind `[features] codex_hooks = true` in `~/.codex/config.toml`. The `vibetime install codex` command must set this flag.

## CON-cursor-workspace-roots-index-zero

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §8
- type: protocol
- content: Cursor's `workspace_roots` is an array. V0 reads index `[0]` only. This is a documented known limitation.

## CON-design-tokens-tokyo-night

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §10.5
- type: nfr (design)
- content:
  - Palette (Tokyo Night-inspired): primary `#bb9af7`, accent `#7aa2f7`, success `#9ece6a`, muted `#565f89`, foreground `#c0caf5`, background `#1a1b26`.
  - Typography: Inter (UI), JetBrains Mono (numbers/code).
  - coss ui as component baseline; customize via Tailwind tokens.
  - ECharts charts themed via custom theme registered in `desktop/src/charts/theme.ts`.
  - Visual: rounded borders, generous line-height.

## CON-fs-layout

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §12
- type: protocol (filesystem)
- content:

```
~/.vibetime/
├── config.toml      # user config; created on first launch
├── data.db          # SQLite database
├── data.db-wal      # SQLite WAL file (auto)
├── data.db-shm      # SQLite shared memory (auto)
└── hook.log         # rotating debug log, ~10MB cap
```

- directory permissions: `0700`. Created on first run if absent.
- config TOML shape:

```toml
[projects]
"/absolute/path/to/repo" = "alias-name"

[display]
timezone = "America/New_York"   # default: system timezone
```

## CON-non-goal-no-token-cost-tracking

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have, §13
- type: protocol (non-goal)
- content: Token usage / cost tracking is explicitly out of scope for V0. Defer to V0.1+.

## CON-non-goal-no-tool-call-counting

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have
- type: protocol (non-goal)
- content: Tool-call counting is out of scope for V0.

## CON-non-goal-no-cross-platform

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have
- type: protocol (non-goal)
- content: Linux and Windows binaries are out of scope for V0. macOS arm64 only.

## CON-non-goal-no-cloud-or-accounts

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have, §13
- type: protocol (non-goal)
- content: No cloud sync, no accounts, no multi-device aggregation, no remote/cloud database backends, no user accounts, no login, no sync UI.

## CON-non-goal-no-network

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have, §13
- type: nfr (privacy)
- content: No telemetry, no analytics, no network calls of any kind. Local-only is a contractual property of V0.

## CON-non-goal-no-auto-update

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have, §13
- type: protocol (non-goal)
- content: No auto-update mechanism in V0.

## CON-non-goal-no-tui

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have
- type: protocol (non-goal)
- content: No TUI in V0.

## CON-non-goal-no-agent-ratio

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Not Have
- type: protocol (non-goal)
- content: No `agent_ratio` metric in V0 (requires Toggl integration; deferred).

## CON-non-goal-no-hook-latency-in-events

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §13
- type: protocol (non-goal)
- content: Do NOT track hook latency or hook errors in the `events` table. Use `hook.log` only.

## CON-non-goal-no-long-running-daemons

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §13
- type: protocol (non-goal)
- content: No long-running daemons outside the desktop app process.

## CON-non-goal-no-log-level-controls

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §13
- type: protocol (non-goal)
- content: No log-level controls or verbose flags in V0.

## CON-non-goal-no-renderer-direct-sqlite

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §13, §5
- type: protocol (non-goal)
- content: Renderer-side direct SQLite access is forbidden. All renderer queries go through Electron IPC to main (DEC-007).

---

## Open Questions (PRD §15) — must be answered by user before downstream routing

These are flagged so `gsd-roadmapper` can stop the user before generating ROADMAP.md if any remain unanswered.

## CON-open-license

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §15
- type: protocol (open question)
- open_question: true
- content: License selection for V0 release. Choices: **MIT** or **Apache 2.0**. Required for the About panel (REQ-settings-minimal) and the repository LICENSE file.

## CON-open-apple-developer-enrollment

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §15
- type: protocol (open question)
- open_question: true
- content: Apple Developer Program enrollment is required for notarization (REQ-macos-signing-notarization). 1-3 day approval window. **User must enroll before packaging week (W5).** This is a scheduling-critical question.

## CON-open-auto-launch-default

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §15
- type: protocol (open question)
- open_question: true
- content: Auto-launch on login default. Recommendation: default OFF, prompt the user on first launch. User must confirm.

---

## Decisions Delegated to GSD (PRD §16) — informational

These are explicitly NOT locked; GSD researches and proposes; user approves before implementation. Listed here so the roadmapper does not mistake them for either locked decisions or open questions.

- Exact directory layout inside each monorepo package
- IPC method signatures and types
- Animation library for the Live view (must hit the 60fps quality bar from REQ-desktop-live-view)
- Packaging tool (electron-builder, electron-forge, or other)
- Code-signing and notarization scripting
- Test strategy
- All other technical decisions not explicitly locked above

GSD must produce a `DECISIONS.md` capturing chosen approaches with one-sentence rationale per choice **before starting implementation**; user approves before code is written.
