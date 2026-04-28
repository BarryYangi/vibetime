# Ingest Synthesis Summary

Mode: `new` (no existing planning context).
Input: 1 classified document — `vibetime-prd.md` (PRD, high confidence, manifest_override=true).

This file is the single entry point `gsd-roadmapper` should read.

---

## Doc counts by type

- ADR: 0
- SPEC: 0
- PRD: 1
- DOC: 0
- UNKNOWN-low-confidence: 0
- Total: 1

The PRD is hybrid: it carries PRD content (§1-4, §10, §11, §14, §15, §16, Appendix), ADR-equivalent LOCKED decisions (§5), SPEC-grade data model (§6), hook runtime NFRs (§7), and agent hook mappings (§8). Extracted accordingly.

## Decisions locked

16 LOCKED decisions extracted to `decisions.md`:

- DEC-001 — Application shell: Electron
- DEC-002 — Frontend stack: React 18 + TS + Tailwind v4 + coss ui + ECharts + Jotai
- DEC-003 — Hook runtime: separate Bun-compiled CLI binary
- DEC-004 — Two-binary distribution
- DEC-005 — Storage: SQLite (bun:sqlite + better-sqlite3, WAL)
- DEC-006 — Monorepo: `core` / `hook` / `desktop`
- DEC-007 — Renderer-side data access: IPC-only
- DEC-008 — Time budget: ~5 weeks
- DEC-009 — Data model schema (events + open_turns), schema_version=1
- DEC-010 — Project name resolution rules (first-match-wins)
- DEC-011 — Agent hook event mappings (Claude / Codex / Cursor)
- DEC-012 — Crash recovery rules
- DEC-013 — Menubar widget metric: today's cumulative agent time
- DEC-014 — Close-to-menubar background behavior
- DEC-015 — Design system (Tokyo Night palette, Inter + JetBrains Mono)
- DEC-016 — V0 distribution: macOS arm64, signed + notarized

Source paths: all from `/Users/barry/Documents/Project/i/vibetime/vibetime-prd.md`.

## Requirements extracted

19 requirements in `requirements.md`:

- REQ-agent-adapter-claude-code
- REQ-agent-adapter-codex
- REQ-agent-adapter-cursor
- REQ-local-store-concurrent-writes
- REQ-crash-recovery
- REQ-desktop-today-view
- REQ-desktop-live-view
- REQ-desktop-history-view
- REQ-menubar-widget
- REQ-settings-minimal
- REQ-window-lifecycle
- REQ-cli-install
- REQ-cli-today
- REQ-cli-project
- REQ-cli-export
- REQ-cli-version
- REQ-cli-no-args-launches-desktop
- REQ-config-filesystem
- REQ-hook-log
- REQ-macos-signing-notarization

Each carries explicit acceptance items derived from PRD §14 plus scope sections §10-§12.

## Constraints

24 constraint entries in `constraints.md` (broken down):

- schema (3): events table DDL, open_turns table DDL, schema-version policy
- api-contract (1): NormalizedEvent / adapter contract
- nfr (4): hook startup time <50ms, hook silence, hook concurrency, design tokens
- protocol (13): SQLite PRAGMAs, hook exit code, Codex feature flag, Cursor workspace_roots[0], filesystem layout, plus 9 explicit non-goal entries
- open-question (3): license, Apple Developer enrollment, auto-launch default

Forward-extensibility hooks (`core` package purity, `events.meta`, `schema_version`) are documented in `context.md`, not as constraints.

## Context topics

5 narrative topics in `context.md`:

- Product framing (positioning, brand, content-asset role)
- Audience (single-dev V0, bilingual EN/CN, livestreamer angle)
- Core use cases (5; mapped to requirements)
- Delegation policy (§16 — GSD must produce DECISIONS.md before implementation)
- Hook payload reference (Appendix excerpts)
- Forward-extensibility notes (V0.1+ deferred features the PRD already names)

## Conflicts

- Blockers: 0
- Competing variants: 0
- Auto-resolved: 0
- Warnings (open user decisions): 3
- Info (transparency notes): 5

See `/Users/barry/Documents/Project/i/vibetime/.planning/INGEST-CONFLICTS.md` for full detail.

## Pointers

- Decisions: `/Users/barry/Documents/Project/i/vibetime/.planning/intel/decisions.md`
- Requirements: `/Users/barry/Documents/Project/i/vibetime/.planning/intel/requirements.md`
- Constraints: `/Users/barry/Documents/Project/i/vibetime/.planning/intel/constraints.md`
- Context: `/Users/barry/Documents/Project/i/vibetime/.planning/intel/context.md`
- Conflicts report: `/Users/barry/Documents/Project/i/vibetime/.planning/INGEST-CONFLICTS.md`
- Source PRD: `/Users/barry/Documents/Project/i/vibetime/vibetime-prd.md`
- Classification: `/Users/barry/Documents/Project/i/vibetime/.planning/intel/classifications/vibetime-prd.json`

## Status

READY for routing — but with three open user decisions (license, Apple Developer enrollment, auto-launch default) that the roadmapper should surface to the user before finalizing ROADMAP.md.
