# vibetime

## What This Is

A local-first macOS desktop app + CLI that tracks how much time AI coding agents (Claude Code, Codex CLI, Cursor) are actively coding for the user, broken down by project. Lightweight per-agent hooks emit turn events into a local SQLite store; a desktop UI and CLI surface today / live / historical views. Tagline: *"WakaTime for AI coding agents."* Single-developer V0; bilingual (EN/CN) audience; the Live view and menubar double as livestream content assets.

## Core Value

Accurately and silently record agent coding time per project on the developer's machine, then surface it in a visual surface good enough to live on a livestream — with zero network calls, zero accounts, zero per-agent UX degradation.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — V0 not shipped)

### Active

<!-- V0 scope. Source: vibetime-prd.md §4, §10, §11, §14, §16. Full traceable list in REQUIREMENTS.md. -->

- [ ] Three agent adapters (Claude Code, Codex CLI, Cursor) producing `NormalizedEvent`s
- [ ] Local SQLite store (WAL) with concurrent multi-process writes
- [ ] Crash recovery (orphan sweep on `session_start` + 6h stale sweep at every launch / CLI invocation)
- [ ] Desktop app: Today / Live / History views + menubar widget + minimal Settings
- [ ] CLI: `install / today / project / export / version` + bare invocation launches desktop
- [ ] Two-binary distribution: `vibetime-hook` (Bun CLI bundled in .app) + `vibetime.app` (Electron)
- [ ] `~/.vibetime/` filesystem at `0700` (config.toml, data.db [+ WAL/SHM], hook.log)
- [ ] DECISIONS.md produced and approved before any implementation begins (§16 gate)
- [ ] macOS arm64 distribution; **ad-hoc self-signed**, with first-launch self-authorization documented
- [ ] Tokyo Night design system + Inter / JetBrains Mono + ECharts theme

### Out of Scope

<!-- Explicit boundaries. Source: vibetime-prd.md §4 Must Not Have, §13. -->

- Token / cost tracking — defer to V0.1+ (not core to time-tracking value prop)
- Tool-call counting — defer to V0.1+
- Linux / Windows binaries — V0 is macOS arm64 only (single-developer build/test surface)
- Cloud sync, accounts, multi-device aggregation — local-first is contractual
- Telemetry, analytics, network calls of any kind — privacy is a contractual property
- `agent_ratio` metric — requires Toggl integration (deferred)
- Auto-update mechanism — defer to V0.1+
- TUI — defer
- Long-running daemons outside the desktop app process
- Renderer-side direct SQLite access — main process IPC only
- Log-level controls / verbose flags — single rotating `hook.log` only
- Hook latency / hook errors in `events` table — `hook.log` only
- **Apple Developer Program notarization** — V0 ships ad-hoc signed; users self-authorize on first launch (right-click → Open). Notarization deferred to V0.1+

## Context

**Technical environment:**
- TypeScript-only stack (user is a React/Next.js engineer; Rust/Tauri rejected)
- Three-package monorepo: `core` (pure logic, zero deps) / `hook` (Bun CLI + `bun:sqlite`) / `desktop` (Electron + `better-sqlite3` in main, React 18 + Tailwind v4 + coss ui + ECharts v6 + Jotai in renderer)
- Two binaries share state via the same SQLite WAL file, never via IPC
- `core` is intentionally pure — explicit goal is to future-proof a possible web UI (V0.1) that imports the same package

**Prior work:** user's Scenee codebase already uses coss ui and a similar React/TS stack — zero new framework learning cost.

**Audience & content angle:** vibetime is also a content asset on Bilibili. The Live view and menubar are screen-recordable surfaces; visual quality of the Live view is a content concern (60fps target / ≥30fps acceptance), not just UX.

**Forward extensibility hooks (already built into V0):**
- `events.meta` JSON column reserved for V0.1+ payload extensions
- `schema_version` column on every row; V0 always writes `1`; no migration logic in V0
- `core` package boundary keeps adapters / project resolution / SQL builders reusable

**Hook payload caveats GSD must verify during implementation:**
- Codex requires `[features] codex_hooks = true` in `~/.codex/config.toml` (the `vibetime install codex` command sets this)
- Cursor's `workspace_roots` is an array; V0 uses `[0]` only — documented known limitation
- Codex `SessionEnd` is not GA; use process-exit fallback

## Constraints

- **Tech stack (LOCKED — DEC-001/002/005)**: Electron + React 18 + TypeScript + Tailwind v4 + coss ui + ECharts v6 (via `echarts-for-react`) + Jotai. SQLite via `bun:sqlite` (hook) and `better-sqlite3` (Electron main). No Rust. No alternative UI libs.
- **Hook runtime (LOCKED — DEC-003)**: Standalone Bun-compiled binary. Electron is NOT the hook runtime.
- **Distribution (LOCKED — DEC-004)**: Two binaries — `vibetime-hook` (~50MB, bundled in .app) + `vibetime.app` (Electron, ~150MB). Same binary runs headless on CLI subcommands.
- **Repo (LOCKED — DEC-006)**: monorepo with `core` / `hook` / `desktop`. `core` is pure TS — zero UI, runtime, `fs`, or DB-client deps.
- **Renderer data access (LOCKED — DEC-007)**: All renderer SQLite access through Electron IPC to main. No native modules in renderer.
- **Schema (LOCKED — DEC-009)**: `events` + `open_turns` tables per PRD §6 DDL verbatim. Indices on `ts`, `project`, `(agent, project)`, `session_id`. Every row writes `schema_version = 1`. No migration logic in V0.
- **SQLite PRAGMAs (LOCKED)**: Every connection — WAL mode, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`.
- **Adapter contract (LOCKED — DEC-011)**: Pure function `(rawPayload, eventName) → NormalizedEvent | null`. Never throws.
- **Project resolution (LOCKED — DEC-010)**: First-match: user alias → `git remote.origin.url` (owner/repo, both SSH/HTTPS, strip `.git`) → `path.basename(cwd)` → `"_unknown"` fallback. Never throws.
- **Hook NFRs (LOCKED — §7)**: <50ms typical / <100ms worst-case startup. Silent stdout/stderr. Exit 0 always. Errors → `~/.vibetime/hook.log`.
- **Crash recovery (LOCKED — DEC-012)**: orphan sweep on `session_start` per matching `session_id`; 6-hour stale sweep at every desktop launch and every CLI invocation.
- **Filesystem (LOCKED)**: `~/.vibetime/` at `0700` mode; `config.toml`, `data.db` (+ WAL/SHM), `hook.log` (~10MB cap, rotating).
- **Design tokens (LOCKED — DEC-015)**: Tokyo Night palette (primary `#bb9af7`, accent `#7aa2f7`, success `#9ece6a`, muted `#565f89`, fg `#c0caf5`, bg `#1a1b26`). Inter (UI), JetBrains Mono (numerics). ECharts theme registered at `desktop/src/charts/theme.ts`.
- **Menubar metric (LOCKED — DEC-013)**: Today's cumulative agent time across all projects (NOT current-turn timer). Format states: idle `●` / `● 47m` / `● 5h 23m`; pulsing `●` only during active turn; recompute ~10s during active turns.
- **Window lifecycle (LOCKED — DEC-014)**: Closing main window does NOT quit. Menubar item stays alive. Quit only via menubar context menu or `Cmd+Q`.
- **Auto-launch on login (LOCKED — user decision)**: Default OFF. Toggle in Settings; opt-in prompt on first launch.
- **License (LOCKED — user decision)**: MIT. About panel + repo `LICENSE`.
- **Code-signing (LOCKED — user decision)**: V0 ships **ad-hoc self-signed** (NOT Apple Developer notarized). Users self-authorize on first launch (right-click → Open). README/installer documents this. Apple Developer enrollment NOT required for V0.
- **Time budget (LOCKED — DEC-008)**: ~5 weeks. Indicative split W1 core+adapters / W2 hook+remaining adapters / W3 Electron shell+Today / W4 Live+History+menubar / W5 packaging+ad-hoc signing+dmg. GSD may resequence; must flag any plan exceeding 6 weeks.
- **§16 gate (LOCKED — process)**: GSD must produce a `.planning/DECISIONS.md` (animation lib, packaging tool, IPC method signatures, package directory layouts, test strategy, ad-hoc signing scripting, etc.) and obtain user approval BEFORE implementation begins. Phase 1 owns this gate.

## Key Decisions

<!-- Decisions that constrain future work. All sourced from vibetime-prd.md §5 / §15. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron shell (DEC-001) | Keeps full stack in TS; user is React/Next.js engineer; ~150MB acceptable | — Pending |
| React 18 + Tailwind v4 + coss ui + ECharts v6 + Jotai (DEC-002) | Matches Scenee stack; ECharts has native Calendar component for the GitHub-contributions heatmap; Bilibili audience recognition | — Pending |
| Bun-compiled hook binary (DEC-003) | Electron 200–500ms cold start cannot meet <50ms hook NFR; Bun + `bun:sqlite` <30ms | — Pending |
| Two-binary distribution (DEC-004) | Separates "fast & silent" hook layer from "rich UI" layer; share state via SQLite WAL, not IPC | — Pending |
| SQLite via `bun:sqlite` + `better-sqlite3` (DEC-005) | Industry-standard local-first store; WAL handles concurrent multi-process writes | — Pending |
| Monorepo `core` / `hook` / `desktop` (DEC-006) | `core` purity future-proofs a V0.1 web UI; reusable adapter/SQL/resolution logic | — Pending |
| IPC-only renderer data access (DEC-007) | Standard Electron security/lifecycle; avoids native-module-in-renderer pain | — Pending |
| ~5-week time budget (DEC-008) | User-set; flag if >6 weeks | — Pending |
| Locked schema (DEC-009) | Schema is the contract; V0 has no migration logic; `meta` + `schema_version` reserved for V0.1+ | — Pending |
| First-match project resolution (DEC-010) | Predictable; matches WakaTime user expectations; `_unknown` fallback never throws | — Pending |
| Locked agent hook mappings (DEC-011) | Pure adapter function; vendor drift handled at adapter, never in normalized schema | — Pending |
| Crash recovery rules (DEC-012) | Self-healing without daemons; aligns with "no long-running daemons" non-goal | — Pending |
| Menubar shows cumulative today (DEC-013) | Monotonic = "quietly growing badge"; right shape for ambient surface; better for livestream | — Pending |
| Close-to-menubar (DEC-014) | Standard macOS background-app behavior; Cmd+Q for full quit | — Pending |
| Tokyo Night design (DEC-015) | Already-established palette; cohesive across UI + ECharts theme | — Pending |
| MIT license | Permissive, standard for solo OSS dev tooling, no copyleft friction for content/community use | — Pending |
| Ad-hoc self-signed for V0 (replaces DEC-016) | Avoids Apple Developer enrollment cost/delay; first-launch right-click → Open is standard for indie macOS tools; notarization deferred to V0.1+ | — Pending |
| Auto-launch default OFF | User-controlled; opt-in on first-launch prompt; respects user choice | — Pending |

---
*Last updated: 2026-04-28 after roadmap creation*
