# vibetime

Local-first macOS time tracker for AI coding agents (Claude Code / Codex / Cursor).

## Workspace layout

- `packages/core` — pure TypeScript: types, SQL DDL, project resolution. Zero runtime deps.
- `packages/hook` — Bun-compiled CLI binary. (Phase 3.)
- `packages/desktop` — Electron + React 18 desktop shell. (Phase 4.)

## Scripts (run from repo root)

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm depcheck`
- `pnpm verify:core-zero-deps`
- `pnpm run ci` (all of the above — note: `pnpm ci` is reserved by pnpm itself, so use `pnpm run ci`)

See `.planning/` for the full plan, requirements, and decisions.

License: MIT.
