# Phase 06 Research: Packaging & V0 Acceptance

**Date:** 2026-05-07
**Status:** Ready for planning

## Recommendation

Use `electron-builder` for V0 packaging.

Rationale:

- The project already uses `electron-vite`; Electron Vite's packaging docs include an `electron-builder` path and describe the expected Electron output/resource split.
- `electron-builder` directly supports macOS `dmg` targets.
- `electron-builder` supports ad-hoc macOS signing by setting `mac.identity` to `-`.
- `electron-builder` supports `extraResources` for copying non-JS assets into `Contents/Resources`, which is the right shape for the standalone `vibetime-hook` binary.

Decision closure:

- `D-PKG`: `electron-builder`.
- `D-SIGN`: `electron-builder` `mac.identity = "-"` plus explicit `codesign --verify` / `codesign -dv` verification in the acceptance checklist.

## Source Notes

Official docs checked on 2026-05-07:

- Electron Builder mac signing docs: `mac.identity = "-"` is the ad-hoc signing path for ARM builds; `mac.identity = null` disables signing and hardened runtime.
- Electron Builder mac target docs: `identity` accepts `-` for ad-hoc signing and `null` to skip signing.
- Electron Builder common config docs: `extraResources` copies files into the app resources directory; `extraFiles` copies into the app content directory.
- Electron Vite docs: app packaging includes Electron application output and renderer resources; mac target can produce `dmg`.

## Local Code Findings

### Build Shape

- Desktop app currently builds with `electron-vite build`.
- Desktop package has no packager dependency yet.
- Hook package builds:
  - JS exports into `packages/hook/dist`.
  - standalone binary into `packages/hook/vibetime-hook`.
- Desktop prebuild already runs `pnpm --filter @vibetime/hook build`, so the hook binary can be produced before packaging.

### Hook Binary Resolution Risk

`packages/hook/src/install.ts` resolves:

```ts
const moduleDir = dirname(fileURLToPath(import.meta.url))
const localBinaryPath = join(moduleDir, '..', 'vibetime-hook')
```

That is valid in a repo-style package layout but risky in Electron production because:

- desktop main bundles selected hook sources via Electron Vite aliasing;
- packaged code may live under `app.asar`;
- the standalone executable should not run from inside `app.asar`;
- `extraResources` places files under `process.resourcesPath`, not necessarily next to bundled hook JS.

Plan implication: add a packaged-app-aware resolver that checks `process.resourcesPath` first when Electron is packaged, while preserving `VIBETIME_HOOK_BINARY` for tests/dev overrides.

### CLI Mode Risk

`packages/desktop/src/main/index.ts` dynamically imports `@vibetime/hook/cli` when CLI subcommands are present. Current Electron Vite config aliases only:

- `@vibetime/hook/config`
- `@vibetime/hook/install`

Plan implication: either package the built hook JS dependency so `@vibetime/hook/cli` resolves in production, or alias/bundle the CLI module intentionally and test packaged CLI mode. V0 acceptance must not assume the repo workspace exists.

### Native Module Risk

Desktop main uses `better-sqlite3`. Packaging must run native dependency rebuild/install steps for Electron ABI and verify app startup from the packaged `.app`, not just from `electron-vite preview`.

### CI Risk

Root CI currently fails at TypeScript before packaging:

- missing Bun and Node type visibility in `packages/hook`;
- strict optional property/indexing errors in hook source/tests;
- TS 6 requires explicit `rootDir` in `packages/desktop/tsconfig.node.json`.

Plan implication: CI repair is Phase 6 Task 1, before packaging. A distributable artifact that cannot pass root CI should not satisfy V0 acceptance.

## Packaging Config Shape

Expected package-level additions:

- Add `electron-builder` as a desktop dev dependency.
- Add desktop scripts:
  - `pack`: Electron Vite build plus unpacked app.
  - `dist:mac`: Electron Vite build plus mac arm64 `.app` and `.dmg`.
  - `verify:dist`: verify packaged artifact shape/signing.
- Add builder config either in `packages/desktop/package.json` or `electron-builder.yml`.

Preferred config concepts:

- `appId: com.barryyangi.vibetime`
- `productName: VibeTime`
- `directories.output: release`
- `mac.target: ["dmg", "dir"]` or equivalent target config for arm64
- `mac.identity: "-"`
- `files`: include Electron Vite output and production dependencies only
- `extraResources`: copy `../hook/vibetime-hook` to a deterministic resources path such as `bin/vibetime-hook`
- `asarUnpack`: include native modules if needed

## Verification Commands

Automated checks should include:

- `rtk pnpm run ci`
- `rtk pnpm --filter @vibetime/desktop build`
- `rtk pnpm --filter @vibetime/desktop dist:mac`
- `codesign --verify --deep --strict --verbose=2 <path-to-app>`
- `codesign -dv <path-to-app>` and record that Authority is absent/ad-hoc as expected
- check `.app/Contents/Resources/bin/vibetime-hook` exists and is executable
- launch packaged app and confirm main window/tray start
- run packaged CLI install/status path if a CLI shim is provided

## Fresh-Machine Acceptance

The final checklist must record evidence for:

- install/uninstall idempotency for Claude Code, Codex, and Cursor;
- real captured session for all three agents;
- concurrent-write integrity;
- crash recovery and stale sweep;
- Today, Live, History, Settings render against real data;
- native tray status menu and close-to-hide lifecycle;
- Live view frame-rate acceptance;
- 365-day History calendar render;
- Open at login toggle in packaged app;
- ad-hoc signing and first-launch self-auth docs.

## Risks

- Gatekeeper behavior can only be partially simulated on the build machine unless the DMG is tested as a downloaded/quarantined file.
- Native menu/tray behavior should be manually checked from the packaged app because Electron dev mode and packaged mode differ.
- Hook install paths are sticky in user config files; tests should use temp HOME or explicit backup/restore to avoid corrupting real user configs.
