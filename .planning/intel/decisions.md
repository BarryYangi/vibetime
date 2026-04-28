# Decisions (synthesized from PRD §5, §6, §8)

> All entries below originate from `vibetime-prd.md`. The PRD's §5 declares them as **locked technical decisions** the user has explicitly removed from the negotiation surface. They are treated as ADR-equivalent with the highest authority within this ingest set.

---

## DEC-001 — Application shell: Electron

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED
- scope: desktop application shell / runtime
- decision: Use Electron for the desktop shell. The full UI stack stays in TypeScript; Rust/Tauri is explicitly rejected. ~150MB binary footprint is accepted.
- rationale: User is a React/Next.js engineer; Electron preserves single-language stack and avoids Rust for SQLite/IPC plumbing.

## DEC-002 — Frontend stack: React 18 + TypeScript + Tailwind v4 + coss ui + ECharts + Jotai

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED
- scope: desktop renderer UI stack
- decision:
  - React 18 + TypeScript for the renderer
  - Tailwind CSS v4 for styling
  - **coss ui** (https://coss.com/ui/docs) for component baseline (copy-paste-into-repo philosophy; matches existing Scenee stack)
  - Apache **ECharts v6** via `echarts-for-react` for **all** data visualization (calendar heatmap, stacked area trends, bar charts)
  - **Jotai** for renderer-side state management
- rationale (coss ui): zero new framework learning cost, AI-friendly (ships `llms.txt` + Skills docs), already used on Scenee.
- rationale (ECharts over Recharts): native `Calendar` component renders the GitHub-contributions heatmap out of the box; stronger animation; broader chart vocabulary; recognized in Chinese developer community. Bundle size irrelevant inside Electron.

## DEC-003 — Hook runtime: separate Bun-compiled CLI binary

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED
- scope: hook execution runtime
- decision: Hooks run via a standalone Bun-compiled binary (`vibetime-hook`). The Electron app itself does NOT serve as the hook runtime.
- rationale: §7 hard constraint of <50ms startup cannot be met by Electron (200-500ms cold start). Bun + `bun:sqlite` starts in <30ms.

## DEC-004 — Two-binary distribution

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED
- scope: distribution / packaging
- decision: Application ships as two cooperating binaries:
  - `vibetime-hook` — Bun-compiled CLI invoked by agent hooks. Bundled inside the `.app`. Target ~50MB.
  - `vibetime.app` — Electron app. The same binary, when invoked with CLI subcommands, runs headless and exits.
- shared state: both binaries access the same SQLite file; concurrency handled via SQLite WAL mode.
- rationale: separates the "must be fast and silent" hook layer from the "rich UI" application layer; they share data via the local DB, not via IPC.

## DEC-005 — Storage: SQLite (bun:sqlite for hook, better-sqlite3 for Electron main)

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED
- scope: persistence layer
- decision: SQLite as the only data store. WAL mode + standard PRAGMAs (`synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`). Hook process uses `bun:sqlite`; Electron main process uses `better-sqlite3`. Both write to the same file safely.
- rationale: industry-standard local-first store (Atuin, ActivityWatch, WakaTime CLI). WAL mode handles concurrent multi-process writes correctly.

## DEC-006 — Repository structure: monorepo with `core` / `hook` / `desktop`

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED
- scope: code organization
- decision: Three-package monorepo.
  - `core` — pure TypeScript: types, adapter parsers, project resolution, SQL builders. Zero UI dependencies, zero runtime dependencies, zero `fs`/DB-client imports. Pure logic.
  - `hook` — Bun CLI; imports `core`, adds `bun:sqlite`.
  - `desktop` — Electron app; imports `core`, adds `better-sqlite3` in main process.
- non-negotiable: keeps query/adapter logic reusable across binaries; future-proofs a possible web UI in V0.1.

## DEC-007 — Renderer-side data access: IPC-only

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED
- scope: renderer ↔ data layer boundary
- decision: The React renderer never opens SQLite directly. Main process owns the DB connection and exposes typed IPC methods to the renderer.
- rationale: standard Electron security/lifecycle; avoids native-module-in-renderer complications.
- enforcing non-goal: §13 explicitly forbids "Renderer-side direct SQLite access".

## DEC-008 — Time budget: ~5 weeks

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5
- status: LOCKED (with stated flexibility)
- scope: program management
- decision: Roughly 5 weeks budget. Indicative breakdown:
  - W1: core + adapters
  - W2: hook binary + remaining adapters
  - W3: Electron shell + Today tab
  - W4: Live + History + menubar
  - W5: signing + notarization + dmg
- flexibility: GSD may adjust the breakdown if it identifies a better sequence; **must flag** any plan that exceeds 6 weeks.

## DEC-009 — Data model schema (events + open_turns) — schema_version = 1

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §6
- status: LOCKED
- scope: persistence schema
- decision: Two tables (DDL preserved verbatim in constraints.md):
  - `events` — append-only log of normalized agent events.
  - `open_turns` — in-flight turns awaiting a `turn_end`.
- indices on `events`: `ts`, `project`, `(agent, project)`, `session_id`.
- versioning: every row carries `schema_version`. V0 always writes `1`. **No migration logic in V0.**
- contract status: "the schema is the contract; changing it later forces data migrations."

## DEC-010 — Project name resolution rules (first-match-wins)

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §6
- status: LOCKED
- scope: hook-side `project` field derivation
- decision: First match wins, in this order:
  1. **User alias** — exact `cwd → name` from user config.
  2. **Git remote** — parse `git -C <cwd> config --get remote.origin.url` to `owner/repo`. Handle SSH and HTTPS forms; strip trailing `.git`.
  3. **Cwd basename** — `path.basename(cwd)`.
- fallback: if `cwd` missing or unresolvable, write `project = "_unknown"` and continue.
- error policy: **never throw from a hook.**

## DEC-011 — Agent hook event mappings (Claude Code / Codex / Cursor)

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §8
- status: LOCKED (mapping table); GSD must re-verify against actual vendor output during W1
- scope: adapter input contract
- decision: For the three agents, the canonical event-name and payload-field mappings are:
  - **Turn-start**: Claude=`UserPromptSubmit`, Codex=`UserPromptSubmit`, Cursor=`beforeSubmitPrompt`
  - **Turn-end**: Claude=`Stop`, Codex=`Stop`, Cursor=`stop`
  - **Session-start**: Claude=`SessionStart`, Codex=`SessionStart`, Cursor=`sessionStart`
  - **Session-end**: Claude=`SessionEnd`, Codex=(not GA; use process exit), Cursor=`sessionEnd`
  - **Session ID field**: Claude=`session_id`, Codex=`session_id`, Cursor=`conversation_id`
  - **Turn ID field**: Claude=(derive `${session_id}-${ts}`), Codex=`turn_id`, Cursor=`generation_id`
  - **Cwd field**: Claude=`cwd`, Codex=`cwd`, Cursor=`workspace_roots[0]`
  - **Model field** (in session_start): Claude=`model`, Codex=`model`, Cursor=(verify W1; omit if absent)
- caveats:
  - **Codex** requires `[features] codex_hooks = true` in `~/.codex/config.toml`. The `vibetime install codex` command must set this.
  - **Cursor** `workspace_roots` is an array; V0 uses index `[0]` and documents this as a known limitation.
- adapter contract is fixed even if vendor output drifts: `(rawPayload, eventName) → NormalizedEvent | null`. Pure function. Never throws.

## DEC-012 — Crash recovery rules

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §9
- status: LOCKED
- scope: orphan-turn handling
- decision: Two self-healing rules:
  - **On every `session_start`**: query `open_turns` for matching `session_id`. Each match becomes a synthetic `turn_end` event with `meta.abandoned = true` and `duration_sec = NULL`. Delete the orphan.
  - **Stale sweep**: at every desktop launch and every CLI invocation, any `open_turns` row older than **6 hours** is treated as abandoned with `meta.reason = "stale_sweep"`.

## DEC-013 — Menubar widget metric: today's cumulative agent time

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §10.1
- status: LOCKED (rationale-bearing)
- scope: macOS menubar widget metric & format
- decision: Persistent menubar item shows **today's cumulative agent time across all projects**, not the active-turn timer.
- format states:
  - Idle (no data today): minimal monochrome icon only, e.g., `●`
  - With data <1h: `● 47m`
  - With data ≥1h: `● 5h 23m`
  - During an active turn: same total, with `●` pulsing softly
- recompute cadence: ~10s during active turns (per-second is wasted CPU; increment is small).
- rationale: cumulative is monotonic — visually a quietly growing badge — which is the right shape for an always-on indicator. A current-turn timer would reset to zero repeatedly, confusing as ambient surface (especially on livestream).

## DEC-014 — Close-to-menubar background behavior

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §10.4
- status: LOCKED
- scope: window lifecycle
- decision: Closing the main window does NOT quit the app. Menubar widget remains alive. Quit only via menubar context menu or `Cmd+Q`.

## DEC-015 — Design system

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §10.5
- status: LOCKED
- scope: visual design tokens
- decision:
  - Color palette: Tokyo Night-inspired — primary `#bb9af7`, accent `#7aa2f7`, success `#9ece6a`, muted `#565f89`, foreground `#c0caf5`, background `#1a1b26`.
  - Typography: Inter for UI, JetBrains Mono for numbers/code.
  - coss ui as component baseline; customize via Tailwind tokens.
  - ECharts charts themed to the same palette via custom theme registered in `desktop/src/charts/theme.ts`.
  - Rounded borders, generous line-height.

## DEC-016 — macOS arm64 distribution: signed + notarized

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §4 Must Have
- status: LOCKED
- scope: V0 distribution target
- decision: V0 ships only macOS arm64, signed and notarized (no Gatekeeper "unidentified developer" warning on fresh install). Linux/Windows binaries are deferred to V0.1+.
