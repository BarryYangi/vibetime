# Context (synthesized from PRD §1, §2, §3, §16, Appendix)

> Narrative product context. Not a binding contract; informs intent, audience, and downstream judgment calls.

---

## Product framing

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §1
- topic: product positioning
- notes:
  - vibetime is a local-first desktop app that tracks how much time each AI coding agent (Claude Code, Codex CLI, Cursor) is actively coding for the user, broken down by project.
  - User installs lightweight per-agent hooks. Hooks fire on agent turns (prompt-submit and stop) and record events into a local store.
  - Differentiator vs. WakaTime: measures **agent time, not human time**. Cross-agent. Local-only. Pitch: "*WakaTime for AI coding agents.*"
  - Brand: vibetime is a deliberate extension of the user's "vibe coding" content brand on Bilibili. The tool is also a content asset — every visible surface (menubar, Live view) doubles as passive brand exposure during livestreams. This is why visual quality of the Live view (REQ-desktop-live-view) is a content-asset concern, not just a UX concern.

## Audience

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §2
- topic: users
- notes:
  - Primary user: the developer building this (single-developer V0).
  - Generalizes to: solo developers using one or more AI coding agents; particularly those who livestream / produce content about AI coding workflows.
  - Bilingual context: Chinese and English developer communities. (Reinforces ECharts pick over Recharts — recognized in Chinese dev community.)

## Core use cases

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §3
- topic: use cases
- notes:
  1. **At-a-glance daily check** — "How much time did agents code for me today, broken down by project?" → drives REQ-desktop-today-view, REQ-cli-today, REQ-menubar-widget.
  2. **Live observation** — "Right now, which agent is working on which project?" → drives REQ-desktop-live-view.
  3. **Historical reflection** — "How has my agent usage evolved over 7/30/90/365 days?" → drives REQ-desktop-history-view, REQ-cli-project, REQ-cli-export.
  4. **Cross-agent comparison** — "Am I using Claude Code, Codex, or Cursor more on this project?" → drives per-project agent breakdown in Today view + History.
  5. **Content asset** — Live view + menubar are screen-recordable assets for streaming and short-form video.

## Delegation policy (informational)

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §16
- topic: process
- notes:
  - Within the LOCKED decisions in §5 and the constraints in this PRD, GSD researches and proposes; user approves.
  - GSD must produce a brief `DECISIONS.md` capturing chosen approaches with one-sentence rationale per choice, **before starting implementation**.
  - User reviews and approves the DECISIONS.md before any code is written.

## Hook payload reference (Appendix)

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md Appendix
- topic: adapter implementation reference
- notes:
  - Excerpts only; GSD must verify against actual hook output during W1.
  - Claude Code `UserPromptSubmit`:

    ```json
    {
      "session_id": "abc-123",
      "cwd": "/Users/barry/work/scenee",
      "hook_event_name": "UserPromptSubmit",
      "prompt": "fix the bug in foo.ts",
      "permission_mode": "default"
    }
    ```

  - Codex `UserPromptSubmit`:

    ```json
    {
      "session_id": "abc-123",
      "turn_id": "t-456",
      "cwd": "/Users/barry/work/scenee",
      "hook_event_name": "UserPromptSubmit"
    }
    ```

  - Cursor `beforeSubmitPrompt`:

    ```json
    {
      "conversation_id": "abc-123",
      "generation_id": "g-456",
      "hook_event_name": "beforeSubmitPrompt",
      "workspace_roots": ["/Users/barry/work/scenee"]
    }
    ```

  - Cursor `stop`:

    ```json
    {
      "conversation_id": "abc-123",
      "generation_id": "g-456",
      "status": "completed",
      "hook_event_name": "stop",
      "workspace_roots": ["/Users/barry/work/scenee"]
    }
    ```

## Forward-extensibility notes

- source: /Users/barry/Documents/Project/i/vibetime/vibetime-prd.md §5 (rationale on `core` package), §6 (`meta` JSON column, `schema_version`)
- topic: forward planning
- notes:
  - The `core` package is intentionally pure logic with zero UI / runtime / fs / DB dependencies — explicit goal is to "future-proof for a possible web UI in V0.1, which would import the same `core`."
  - The `events.meta` JSON column and `schema_version` field exist precisely for forward extensibility without forcing schema migrations in V0.
  - V0.1+ deferred items the PRD already names: token/cost tracking, tool-call counting, Linux/Windows binaries, cloud sync, accounts, `agent_ratio` (requires Toggl integration), auto-update.
