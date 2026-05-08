# vibetime

Local-first macOS time tracker for AI coding agents (Claude Code / Codex / Cursor).

## Workspace layout

- `packages/core` — pure TypeScript: types, SQL DDL, project resolution. Zero runtime deps.
- `packages/hook` — Bun-compiled hook and CLI binaries.
- `packages/desktop` — Electron + React desktop shell.

## Scripts (run from repo root)

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm depcheck`
- `pnpm verify:core-zero-deps`
- `pnpm run ci` (all of the above — note: `pnpm ci` is reserved by pnpm itself, so use `pnpm run ci`)

## Build desktop apps

From the repo root:

- `pnpm --filter @vibetime/desktop pack:mac` builds an unpacked arm64 `.app`.
- `pnpm --filter @vibetime/desktop dist:mac` builds both `.app` and `.dmg`.
- `pnpm --filter @vibetime/desktop pack:win` builds an unpacked Windows x64 app.
- `pnpm --filter @vibetime/desktop dist:win` builds Windows x64 installer artifacts.

Artifacts are written under `packages/desktop/release/`.

## Release versioning

VibeTime uses semver-compatible date versions. The first release on May 8, 2026 is:

- package version: `2026.5.8`
- release tag: `v2026.5.8`

Pushing a `v*` tag creates a GitHub Release and uploads macOS/Windows artifacts.

## Install and first launch

1. Open `packages/desktop/release/VibeTime-2026.5.8-arm64.dmg`.
2. Drag `VibeTime.app` to `/Applications`.
3. First launch on macOS may require right-clicking `VibeTime.app`, then choosing `Open`.
4. Open Settings and connect Claude Code, Codex, or Cursor.

The packaged app includes two Bun-compiled binaries:

- `Contents/Resources/bin/vibetime-hook` for agent hooks.
- `Contents/Resources/bin/vibetime` for CLI subcommands.

Useful packaged checks:

- `codesign --verify --deep --strict --verbose=2 packages/desktop/release/mac-arm64/VibeTime.app`
- `codesign -dv packages/desktop/release/mac-arm64/VibeTime.app`
- `packages/desktop/release/mac-arm64/VibeTime.app/Contents/MacOS/VibeTime version`

See `.planning/` for the full plan, requirements, and decisions.

License: MIT.
