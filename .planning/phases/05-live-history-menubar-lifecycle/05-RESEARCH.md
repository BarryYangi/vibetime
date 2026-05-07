# Phase 05 — Research: Live, History, Menubar & Lifecycle

**Date:** 2026-05-07
**Phase:** 05-live-history-menubar-lifecycle
**Status:** Complete

## Research Objective

Answer what the planner needs to know before splitting Phase 5 into executable plans:

- How to add a high-fidelity Live view without duplicating Today.
- How to build History with ECharts calendar + stacked area + coss Table.
- How to implement a persistent macOS Tray/menubar surface.
- How to handle close-to-menubar, explicit quit, last-view restore, and auto-launch.
- How to verify the above without relying only on visual inspection.

## Source Findings

### Motion for React

- Current forward package is `motion`; React usage imports from `motion/react`.
- Planner must not use legacy `framer-motion` imports.
- Motion should be limited to renderer animation: Live stage pulse/sweep, idle ambient motion, and maybe subtle section transitions.
- Avoid layout-heavy animation loops. Prefer transform and opacity. Elapsed timers should continue to be driven by React state / NumberFlow rather than Motion-controlled text layout.

Source: https://motion.dev/react

### Electron Tray / Menubar

- Electron exposes native `Tray` and native `Menu` APIs for persistent menu bar / tray behavior.
- On macOS, a Tray can use `setTitle` for text beside the tray image; this is the right primitive for the `●`, `● 47m`, `● 5h 23m` label states.
- Right-click context should use native `Menu` / tray context menu. The left-click dropdown can be implemented as a small always-on-top BrowserWindow/popover anchored near the tray bounds, because Electron's native context menu is not a rich React surface.
- Keep Tray owned by the main process. Renderer can request "open main window" and receive data, but Tray lifecycle should not depend on renderer route state.

Sources:
- https://www.electronjs.org/docs/latest/api/tray
- https://www.electronjs.org/docs/latest/api/menu

### Electron Window Lifecycle

- `BrowserWindow` close can be intercepted and hidden, preserving the process and Tray.
- A separate explicit quit flag is needed so Cmd+Q and menubar Quit can close the app for real instead of being intercepted as a normal close.
- macOS activate should show/focus the existing hidden window, not create duplicate windows.
- Current `app.on('activate')` comment is a placeholder; Phase 5 should introduce a single-window manager.

Sources:
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/api/app

### Electron Login Item

- Electron `app.setLoginItemSettings()` and `app.getLoginItemSettings()` are the native APIs for login launch configuration.
- Per context decision D-16, Vibetime should set the system login item and also store user intent in `~/.vibetime/config.toml`.
- Existing config only has `[projects]` and `[display]`; Phase 5 should extend it carefully, preserving backward compatibility:

```toml
[projects]

[display]
timezone = "Asia/Shanghai"

[app]
open_at_login = false
auto_launch_prompted = false
last_view = "/"
```

Source: https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows

### ECharts Calendar + Stacked Area

- ECharts has a native `calendar` coordinate system and heatmap series can be rendered on that coordinate system.
- Stacked area is a line series with `stack` and `areaStyle`, so no second charting library is needed.
- History should register/use the existing `cossNeutral` theme and keep series count bounded to Top 5 + Others.
- For the 365-day heatmap, the query should return a dense date array including zero-value days so the calendar renders stable ranges and tooltips do not need to handle missing dates as special cases.

Sources:
- https://echarts.apache.org/en/option.html#calendar
- https://echarts.apache.org/handbook/en/how-to/chart-types/line/area-line/

## Existing Code Findings

### Reusable Data Path

- `packages/desktop/src/main/db.ts` already owns desktop SQLite reads, Codex reconciliation, `queryTodayLiveState()`, DB watcher fallback, and renderer push notification.
- `packages/desktop/src/main/notify-server.ts` receives hook-side socket notifications and calls `notifyRenderer()`.
- `packages/desktop/src/renderer/src/store.ts` already refreshes Today from push notifications.
- Phase 5 should generalize refresh orchestration rather than creating unrelated polling loops.

### Existing UI Shell

- `packages/desktop/src/renderer/src/App.tsx` uses HashRouter and two current routes: Today and Settings.
- `packages/desktop/src/renderer/src/components/Sidebar.tsx` has only Today and Settings icons. Phase 5 should add Live and History here.
- `packages/desktop/src/renderer/src/views/Today.tsx` already computes active turn elapsed time locally every second. Live can reuse this active-turn model but must present it differently.
- `packages/desktop/src/renderer/src/charts/theme.ts` registers `cossNeutral`, suitable for History.
- `packages/desktop/src/renderer/src/components/ui/table.tsx` exists and should satisfy HIST-03.

### Current Data Gaps

Planner should add IPC/data functions rather than overloading `getTodayLiveState`:

- `getHistorySummary({ periodDays })`
  - returns calendar daily totals for the last 365 days
  - returns stacked trend data for the active period
  - returns sortable top projects data for active period
- `getMenubarState()`
  - returns today's total, Top 3 projects, active turns, and active boolean
- lifecycle/config methods:
  - `getAppPreferences()`
  - `updateAppPreferences({ openAtLogin?: boolean, lastView?: string, autoLaunchPrompted?: boolean })`
  - or equivalent extension of current `getConfig` / `updateConfig`

### Config Extension Risk

`packages/hook/src/config.ts` currently parses only `[projects]` and `[display]`, and serializes only those sections. If Phase 5 adds `[app]`, the parser/writer must preserve the new section; otherwise `updateConfig()` can silently drop app preferences.

Planner should include tests for:

- default config includes `app.open_at_login = false`
- config parser preserves `[projects]`, `[display]`, and `[app]`
- updating project aliases does not delete app preferences
- updating open-at-login does not delete project aliases

### Main Process Lifecycle Risk

Current `packages/desktop/src/main/index.ts` creates the BrowserWindow inline inside `app.whenReady()` and does not retain a module-level reference. Phase 5 should refactor this into explicit helpers:

- `createMainWindow()`
- `showMainWindow(route?: string)`
- `hideMainWindow()`
- `quitApp()`
- `openSettingsWindowOrRoute()` if Settings remains a route

Use an `isQuitting` flag:

- normal window `close` on macOS prevents default and hides
- Cmd+Q / Quit sets `isQuitting = true` then quits
- `window-all-closed` should not quit on macOS while Tray mode is active

### Tray Dropdown Strategy

Recommended implementation:

1. Create Tray in main process after app ready.
2. Set tray title based on `getMenubarState()`.
3. Use native context menu for right-click: Open, Settings, Quit.
4. For left-click, open/focus a small frameless BrowserWindow that loads a `#/menubar` renderer route or dedicated compact renderer entry.
5. Keep the dropdown window short-lived; blur closes it.

Why not native Menu for left-click: native menus are simple action lists, but Phase 5 requires project totals, active turns, and a button-like Open vibetime affordance. A small BrowserWindow gives a richer compact UI while keeping right-click native.

### History Query Strategy

Build aggregates in main process with SQLite:

- Calendar:
  - Date range: last 365 days including today.
  - Aggregate completed `turn_end` durations by local date and project-independent total.
  - Fill missing dates with zero in TypeScript after query.
- Trends:
  - Active period: 7/30/90/365; chart may default to 30 days per requirement.
  - Determine Top 5 projects within selected period.
  - Aggregate per day per Top 5, group the rest into Others.
- Top Projects:
  - For active period, aggregate total duration, distinct/completed turn count, and max `ts` as last active.
  - Sort in renderer by Project / Total / Turns / Last Active.

Important: Unknown-duration synthetic ends with `meta.abandoned = true` or `meta.reason = stale_sweep` should not add duration, matching current Today logic.

### Live View Query Strategy

Initial implementation can reuse `TodayLiveState` for active turns and today's project totals. If model is not currently part of `ActiveTurn`, planner should verify whether model exists in event meta. If absent, UI copy should render `{agent}` only per UI-SPEC.

Potential extension:

- Add `model?: string` to `ActiveTurn` only if existing raw payload meta can supply it reliably.
- Do not invent model values.

## Planning Recommendations

Recommended plan split:

1. Data and IPC expansion
   - History aggregates
   - Menubar state
   - Config/app preferences
   - Tests around duration aggregation and config preservation
2. Live and History renderer
   - Add routes/sidebar
   - Add Motion dependency/imports
   - Implement Live stage
   - Implement History charts/table
3. Menubar and lifecycle
   - Tray title and dropdown
   - right-click menu
   - close-to-menubar and explicit quit
   - last-view restore
4. Settings auto-launch and integration verification
   - Open at login toggle
   - delayed prompt
   - login item sync
   - focused Electron/manual verification checklist

This keeps shared data/API work ahead of views, and keeps native lifecycle work isolated from renderer chart work.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Config writer drops new `[app]` settings | Auto-launch and last-view state become flaky | Extend config parser/writer with tests before Settings work |
| Tray left-click dropdown positioning differs by macOS version | Menubar UX feels broken | Encapsulate Tray dropdown positioning; keep native right-click menu simple |
| Motion animations cause layout jank | LIVE-04 failure | Animate transform/opacity only; test at min window and with multiple active turns |
| History 365-day heatmap missing zero days | Calendar shifts or sparse tooltips | Fill dense 365-day array in data layer |
| Today and Live duplicate each other | Product confusion | Keep Live active-stage only; do not show Today project list in Live idle |
| Open/close behavior traps quitting | App cannot quit normally | Use explicit `isQuitting` flag and test Cmd+Q plus Tray Quit |

## Validation Architecture

Automated:

- Unit tests for History aggregation with synthetic event fixtures.
- Unit tests for Top 5 + Others grouping.
- Unit tests for config `[app]` parsing/writing and preservation.
- Unit or main-process tests for menubar title formatting states.
- Typecheck/build for IPC method coverage and renderer route additions.

Manual / semi-manual:

- Electron dev run: verify Live active and idle states.
- DevTools/performance visual pass: Live animation remains smooth with 1 and multiple active turns.
- Electron dev run: verify History renders a 365-day calendar heatmap and period selector behavior.
- macOS runtime: verify Tray title, left-click dropdown, right-click menu, close-to-menubar, Cmd+Q, and login item toggle.

## RESEARCH COMPLETE

Phase 5 is ready for pattern mapping and planning.
