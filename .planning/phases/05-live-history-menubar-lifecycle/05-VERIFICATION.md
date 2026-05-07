---
phase: 05-live-history-menubar-lifecycle
status: partial
verified_at: 2026-05-07T13:24:00+08:00
---

# Phase 05 Verification Evidence

## Summary

Status: partial.

Automated desktop checks passed. Full repo CI did not pass because `rtk pnpm run ci` stops at `pnpm typecheck` with existing hook-package TypeScript environment errors around Bun/Node types and strict optional properties. Manual native macOS Tray checks were not completed in this run.

## Live View

Requirements: LIVE-01, LIVE-02, LIVE-03, LIVE-04.

- LIVE-01: implemented in `packages/desktop/src/renderer/src/views/Live.tsx`; shows active turns with project, agent line, elapsed timer, pulse, sweep bar, and project total footer.
- LIVE-02: active turns render as a vertical stack.
- LIVE-03: idle state renders `No active turn` and `Start a coding-agent turn and it will appear here.` with ambient Motion animation.
- LIVE-04: partial. Motion uses transform/opacity animation; manual FPS/jank inspection remains pending.

## History View

Requirements: HIST-01, HIST-02, HIST-03, HIST-04, HIST-05.

- HIST-01: implemented with ECharts native `calendar` coordinate system and `heatmap` series.
- HIST-02: implemented with ECharts stacked area line series.
- HIST-03: implemented with coss `Table` columns Project / Total / Turns / Last Active.
- HIST-04: implemented period selector with `7d`, `30d`, `90d`, `365d`.
- HIST-05: partial. Data contract returns dense 365-day calendar and build passes; manual performance inspection remains pending.

## Menubar

Requirements: MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06.

- MENU-01: implemented persistent Electron `Tray` in `packages/desktop/src/main/tray.ts`; manual shell confirmation pending.
- MENU-02: title uses `formatMenubarTitle(queryMenubarState())`, covering idle and duration threshold formats.
- MENU-03: partial. Active indicator is represented by the title dot; native pulsing behavior was not manually verified.
- MENU-04: active turn refresh cadence is implemented at approximately 10 seconds.
- MENU-05: left click opens compact `/menubar` dropdown with Today totals, active turns, and `Open vibetime`.
- MENU-06: right click opens context menu with exact labels Open / Settings / Quit.

## Lifecycle

Requirements: LIFE-01, LIFE-02.

- LIFE-01: implemented close-to-hide in `packages/desktop/src/main/index.ts`; manual close behavior pending.
- LIFE-02: implemented explicit quit path via Cmd+Q before-quit semantics and Tray Quit; manual shell confirmation pending.

## Auto-launch

Requirements: SET-04.

- SET-04: Settings exposes `Open at login`.
- `getAppPreferences` reads Electron `app.getLoginItemSettings()`.
- `updateAppPreferences({ openAtLogin })` calls `app.setLoginItemSettings({ openAtLogin })`.
- Config records `app.open_at_login`, `app.auto_launch_prompted`, and `app.last_view`.
- Prompt timing is delayed until Settings opens successfully or after a successful agent connection.
- Prompt copy implemented:
  - `Open VibeTime at login?`
  - `Keep the menubar timer available after you sign in.`
  - `Open at login`
  - `Not now`

## Last View Restore

- Renderer persists `lastView` for `/`, `/live`, `/history`, and `/settings`.
- `/menubar` is excluded from persisted routes.
- Main process restores `lastView` when opening the main window without an explicit route.

## Commands Run

- `rtk pnpm --filter @vibetime/desktop test`
  - Result: passed.
  - Summary: 2 test files passed, 7 tests passed.

- `rtk pnpm --filter @vibetime/desktop build`
  - Result: passed.
  - Summary: hook/core build, native `better-sqlite3` rebuild, main/preload/renderer Electron Vite build all completed.

- `rtk pnpm run ci`
  - Result: failed.
  - Summary: failed during `pnpm typecheck`.
  - Representative errors:
    - `packages/hook/src/cli.test.ts`: cannot find module `bun:test`.
    - `packages/hook/src/*.ts`: missing Node/Bun globals such as `process`, `console`, `Bun`, and `node:*` type declarations.
    - `packages/hook/src/recovery.ts` and `packages/hook/src/store.test.ts`: strict type errors unrelated to the Phase 5 desktop renderer changes.
    - `packages/desktop/tsconfig.node.json`: TS5011 requires explicit `rootDir` for TS 6 migration.

## Remaining Manual Checks

- Launch Electron app on macOS and verify Tray item appears.
- Left-click Tray: dropdown opens and closes on blur.
- Right-click Tray: Open / Settings / Quit menu appears.
- Close main window: app remains alive in menubar.
- Cmd+Q and Tray Quit: app fully exits.
- Toggle Open at login and verify Electron login item state plus config persistence.
- Exercise Live with one and multiple active turns and record smoothness evidence.
- Exercise History with real/synthetic data and record heatmap/trend/table rendering evidence.
