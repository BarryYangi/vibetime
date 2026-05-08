---
phase: 05-live-history-menubar-lifecycle
status: complete
verified_at: 2026-05-07T17:29:45+08:00
---

# Phase 05 Verification Evidence

## Summary

Status: complete.

Automated desktop checks passed after the native Tray redesign and follow-up menu UI refinements. Conversational UAT completed on 2026-05-07 with 9/9 checks passed and 0 issues. Full repo CI did not pass in the earlier run because `rtk pnpm run ci` stops at `pnpm typecheck` with existing hook-package TypeScript environment errors around Bun/Node types and strict optional properties; this is tracked as repo-level debt outside the Phase 5 desktop scope.

## Live View

Requirements: LIVE-01, LIVE-02, LIVE-03, LIVE-04.

- LIVE-01: implemented in `packages/desktop/src/renderer/src/views/Live.tsx`; shows active turns with project, agent line, elapsed timer, pulse, sweep bar, and project total footer.
- LIVE-02: active turns render as a vertical stack.
- LIVE-03: idle state renders `No active turn` and `Start a coding-agent turn and it will appear here.` with ambient Motion animation.
- LIVE-04: passed by UAT. Motion uses transform/opacity animation; user accepted idle and active Live states as smooth enough for Phase 5.

## History View

Requirements: HIST-01, HIST-02, HIST-03, HIST-04, HIST-05.

- HIST-01: implemented with ECharts native `calendar` coordinate system and `heatmap` series.
- HIST-02: implemented with ECharts stacked area line series.
- HIST-03: implemented with coss `Table` columns Project / Total / Turns / Last Active.
- HIST-04: implemented period selector with `7d`, `30d`, `90d`, `365d`.
- HIST-05: passed by UAT. Data contract returns dense 365-day calendar; user accepted History analytics and range switching with real captured data.

## Menubar

Requirements: MENU-01, MENU-02, MENU-03, MENU-04, MENU-05, MENU-06.

- MENU-01: passed by UAT. Persistent Electron `Tray` implemented in `packages/desktop/src/main/tray.ts`.
- MENU-02: title uses `formatMenubarTitle(queryMenubarState())`, covering idle and duration threshold formats.
- MENU-03: passed by revised acceptance. Active indicator is represented by the title dot. Native pulsing was intentionally dropped from V0 because Electron native `Tray` no longer exposes `setHighlightMode`, and the custom BrowserWindow popover caused focus/highlight issues.
- MENU-04: implemented as event-driven refresh plus minute-boundary timer while active. This avoids high-frequency polling in the resident app while keeping visible title changes current.
- MENU-05: left click opens the same native status menu as right click. This replaced the compact `/menubar` BrowserWindow dropdown after manual UX review showed focus theft, status-item highlight mismatch, and button auto-focus problems.
- MENU-06: native menu includes `Open`, `Settings`, and `Quit`, plus status rows for Today, running turns, and top projects. Status section labels are disabled and grey with no icon; concrete active turn/project rows are clickable with native macOS template icons and route to Live/History.

Manual evidence:

- 2026-05-07 user reviewed multiple native Tray menu iterations in-app and accepted the final menu as "还可以".
- 2026-05-07 UAT passed native Tray open behavior, route/action behavior, close-to-hide, full quit behavior, Open at login, Live, and History.

## Lifecycle

Requirements: LIFE-01, LIFE-02.

- LIFE-01: passed by UAT. Implemented close-to-hide in `packages/desktop/src/main/index.ts`.
- LIFE-02: passed by UAT. Implemented explicit quit path via Cmd+Q before-quit semantics and Tray Quit.

## Auto-launch

Requirements: SET-04.

- SET-04: Settings exposes `Open at login`.
- The Open at login control is a coss/Base UI `Switch`, not a button.
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
- Removed `/menubar`; persisted route normalization now rejects unsupported routes and falls back safely.
- Main process restores `lastView` when opening the main window without an explicit route.

## Commands Run

- `rtk pnpm --filter @vibetime/desktop test`
  - Result: passed.
  - Summary: 2 test files passed, 7 tests passed.

- `rtk pnpm --filter @vibetime/desktop build`
  - Result: passed.
  - Summary: hook/core build, native `better-sqlite3` rebuild, main/preload/renderer Electron Vite build all completed.

- `rtk pnpm --filter @vibetime/desktop test`
  - Result: passed after native Tray menu refinements.
  - Summary: 2 test files passed, 7 tests passed.

- `rtk pnpm --filter @vibetime/desktop build`
  - Result: passed after native Tray menu refinements.
  - Summary: hook/core build, native `better-sqlite3` rebuild, main/preload/renderer Electron Vite build all completed.

- `rtk pnpm --filter @vibetime/desktop test`
  - Result: passed after coss Switch and no-pointer-cursor refinements.
  - Summary: 2 test files passed, 7 tests passed.

- `rtk pnpm --filter @vibetime/desktop build`
  - Result: passed after coss Switch and no-pointer-cursor refinements.
  - Summary: hook/core build, native `better-sqlite3` rebuild, main/preload/renderer Electron Vite build all completed.

- Phase 5 UAT
  - Result: passed.
  - Summary: `.planning/phases/05-live-history-menubar-lifecycle/05-UAT.md` has 9/9 checks passed, 0 issues, 0 pending, 0 blocked.

- `rtk pnpm run ci`
  - Result: failed.
  - Summary: failed during `pnpm typecheck`.
  - Representative errors:
    - `packages/hook/src/cli.test.ts`: cannot find module `bun:test`.
    - `packages/hook/src/*.ts`: missing Node/Bun globals such as `process`, `console`, `Bun`, and `node:*` type declarations.
    - `packages/hook/src/recovery.ts` and `packages/hook/src/store.test.ts`: strict type errors unrelated to the Phase 5 desktop renderer changes.
    - `packages/desktop/tsconfig.node.json`: TS5011 requires explicit `rootDir` for TS 6 migration.

## Remaining Follow-up

- Repo-level `rtk pnpm run ci` typecheck debt remains outside Phase 5 scope and should be addressed before final V0 acceptance.
- Phase 6 must verify packaged-app startup, ad-hoc signing, DMG generation, and fresh-machine acceptance criteria.
