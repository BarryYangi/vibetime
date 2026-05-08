# Phase 06: Packaging & V0 Acceptance - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning
**Source:** Phase 6 roadmap + locked project decisions + Phase 5 UAT

<domain>
## Phase Boundary

Phase 6 turns the completed local app into a distributable V0 macOS arm64 build and proves the whole product works end-to-end on a clean machine.

This phase delivers:

- macOS arm64 `.app` bundle.
- macOS arm64 `.dmg` installer.
- Bundled `vibetime-hook` binary resolved by install commands and live hook invocations.
- Ad-hoc signed app; no Apple Developer notarization in V0.
- First-launch self-authorization documentation: right-click -> Open.
- A fresh-machine V0 acceptance checklist with recorded evidence.

This phase does not add product features. It may fix packaging blockers, CI blockers, and production-path defects found during acceptance.
</domain>

<decisions>
## Implementation Decisions

### Distribution Target

- V0 target is macOS arm64 only.
- V0 ships `.app` plus `.dmg`.
- Linux, Windows, notarization, and auto-update remain deferred to V0.1+.

### Signing

- V0 uses ad-hoc signing.
- Do not require Apple Developer Program enrollment.
- README and installer notes must clearly document first launch: right-click VibeTime.app -> Open.

### Hook Bundling

- `vibetime-hook` remains a standalone Bun-compiled binary.
- Electron is not the hook runtime.
- The packaged app must resolve the bundled hook path without relying on a repo checkout.
- Hook install commands must write the packaged hook path into Claude Code / Codex / Cursor configs.

### Acceptance Standard

- Desktop-only test/build passing is insufficient for Phase 6.
- Full repo `rtk pnpm run ci` must pass before V0 acceptance can be marked complete.
- Packaged-app startup, hook install/uninstall, real capture, tray/menu behavior, open-at-login, signing verification, and DMG generation must be tested against the packaged artifact.

### User-Visible Behavior

- Keep the app native and quiet: no pointer cursor styling, no extra onboarding surface beyond necessary first-launch/install docs.
- Open at login final verification happens after packaging; development-mode verification is not authoritative.
- Tray status menu remains native Electron `Tray` + `Menu`; do not revive the custom `/menubar` BrowserWindow popover.

### the agent's Discretion

- Choose packaging implementation details that best fit the existing Electron Vite app.
- Add scripts/config where needed, but keep the package layout simple.
- Prefer explicit verification scripts/checklists over implicit manual memory.
</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Product Scope

- `.planning/PROJECT.md` - locked product constraints, distribution model, and V0 out-of-scope list.
- `.planning/REQUIREMENTS.md` - DIST-01 / DIST-02 plus V0 acceptance requirements.
- `.planning/ROADMAP.md` - Phase 6 goal and success criteria.
- `.planning/DECISIONS.md` - deferred packaging/signing decisions to close in Phase 6.

### Prior Phase Evidence

- `.planning/phases/05-live-history-menubar-lifecycle/05-VERIFICATION.md` - Phase 5 UAT and remaining repo-level CI debt.
- `.planning/phases/05-live-history-menubar-lifecycle/05-UAT.md` - conversational UAT pass list.

### Implementation Surfaces

- `packages/desktop/package.json` - desktop build scripts and Electron dependencies.
- `packages/desktop/electron.vite.config.ts` - current main/preload/renderer build config.
- `packages/desktop/src/main/index.ts` - app lifecycle, CLI detection, packaged startup path.
- `packages/hook/package.json` - Bun build scripts for JS exports and `vibetime-hook`.
- `packages/hook/src/install.ts` - hook binary path resolution and install command generation.
- `README.md` - distribution and first-launch docs target.
</canonical_refs>

<specifics>
## Specific Findings

- `rtk pnpm --filter @vibetime/desktop test` passes.
- `rtk pnpm --filter @vibetime/desktop build` passes.
- `rtk pnpm run ci` currently fails during root `pnpm typecheck`.
- Representative CI blockers:
  - hook package TypeScript does not see Bun/Node globals and modules such as `bun:test`, `bun:sqlite`, `process`, `console`, and `node:*`.
  - hook package has strict optional/indexing errors that TypeScript now reports.
  - `packages/desktop/tsconfig.node.json` needs explicit `rootDir` for TS 6 common-source migration.
- Current `resolveHookBinaryPath()` assumes a local `../vibetime-hook` next to the compiled hook install module, which may not match Electron packaged layout after bundling.
- Current Electron main imports `@vibetime/hook/cli` dynamically in CLI mode; packaging must prove this path resolves in production or replace the CLI launch path.
</specifics>

<deferred>
## Deferred Ideas

- Apple Developer notarization.
- Auto-update.
- Linux / Windows builds.
- More polished installer onboarding beyond the minimal first-launch docs.
</deferred>

---

*Phase: 06-packaging-v0-acceptance*
*Context gathered: 2026-05-07*
