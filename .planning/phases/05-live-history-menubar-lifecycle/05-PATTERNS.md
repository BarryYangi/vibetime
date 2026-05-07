# Phase 05 — Pattern Map

**Phase:** 05-live-history-menubar-lifecycle
**Date:** 2026-05-07
**Status:** Complete

## Purpose

Map Phase 5 planned files to existing analogs so execution follows current project shape.

## Files to Modify / Create

| Target | Role | Closest Analog | Pattern to Reuse |
|--------|------|----------------|------------------|
| `packages/desktop/src/shared/ipc-types.ts` | Typed IPC contract | existing `IpcMethods`, `TodayLiveState`, `ActiveTurn` | Add specific methods and result interfaces; keep `IpcResult<T>` wrapper |
| `packages/desktop/src/main/db.ts` | SQLite query/aggregate layer | `queryTodayLiveState()`, `buildTodaySummary()` | Main-process aggregation, duration normalization, Codex reconciliation before reads |
| `packages/desktop/src/main/ipc-handlers.ts` | IPC registration | existing `ipcMain.handle(...)` methods | One method per query/mutation; return `{ ok, data }` or `{ ok, error }` |
| `packages/hook/src/config.ts` | Config parser/writer | existing `[projects]` and `[display]` parser | Extend parser/serializer carefully; preserve sections across updates |
| `packages/hook/src/config.test.ts` | Config tests | existing config tests | Use HOME override and file assertions for TOML sections |
| `packages/desktop/src/renderer/src/store.ts` | Renderer state | `todayLiveStateAtom`, `refreshTodayLiveState()` | Jotai atoms plus push-triggered refresh functions |
| `packages/desktop/src/renderer/src/App.tsx` | Route shell | existing HashRouter/Routes | Add `/live`, `/history`, optional `/menubar`; keep shell stable |
| `packages/desktop/src/renderer/src/components/Sidebar.tsx` | Navigation | existing Today/Settings nav | Add lucide icons and labels; use `buttonVariants` |
| `packages/desktop/src/renderer/src/views/Today.tsx` | Live timing analog | active duration calculation and NumberFlow usage | Reuse duration formatting principles; do not duplicate Today layout |
| `packages/desktop/src/renderer/src/views/Live.tsx` | New Live stage | `Today.tsx` + UI-SPEC | Motion stage, active turn stacking, idle ambient state |
| `packages/desktop/src/renderer/src/views/History.tsx` | New analytics page | `charts/theme.ts`, coss `Table` | ECharts `cossNeutral`, compact dashboard, sortable table |
| `packages/desktop/src/main/index.ts` | App/window lifecycle | current inline `BrowserWindow` creation and menu setup | Refactor to retained window/tray helpers; preserve CLI mode |
| `packages/desktop/src/main/tray.ts` | Tray ownership | `configureApplicationMenu()` style | Native Electron Tray/Menu in main process |
| `packages/desktop/src/renderer/src/views/Menubar.tsx` | Compact dropdown renderer | existing renderer route pattern | Small route loaded in dropdown window, compact coss styling |
| `packages/desktop/package.json` | Dependency declaration | existing dependencies | Add `motion`; do not add chart/UI alternatives |

## Data Flow Patterns

### Renderer Data

Current:

```text
hook writes SQLite -> notify.sock/fs.watch -> main notifyRenderer -> renderer handlePush -> refreshTodayLiveState -> Jotai atom
```

Phase 5 should keep this shape:

```text
db changed -> main refreshes Tray title + sends renderer push -> Live/Today/History atoms refresh relevant data
```

Do not add independent renderer polling loops except local elapsed timer ticks while active turns exist.

### IPC

Current pattern:

```typescript
ipcMain.handle('getTodayLiveState', async (): Promise<IpcResult<ReturnType<typeof queryTodayLiveState>>> => {
  try {
    return { ok: true, data: queryTodayLiveState() }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})
```

Phase 5 should add methods in the same style:

- `getHistorySummary`
- `getMenubarState`
- `getAppPreferences`
- `updateAppPreferences`

### Duration Aggregation

Reuse existing Today behavior:

- Count `turn_end` durations.
- Compute duration from matching `turn_start` only when duration is absent and not an abandoned/stale synthetic end.
- Ignore unknown-duration abandoned/stale ends for totals.
- Reconcile Codex completed turns before read paths where open turns affect display.

### Config

Existing config serializer is section-specific. Phase 5 must extend it without dropping prior sections.

Target shape:

```toml
[projects]

[display]
timezone = "Asia/Shanghai"

[app]
open_at_login = false
auto_launch_prompted = false
last_view = "/"
```

## UI Patterns

- Use `PageShell` for full renderer views.
- Use coss `Card` sparingly for individual chart/table blocks, not nested page cards.
- Use lucide icons in Sidebar.
- Use `NumberFlow` or stable mono spans for timers/durations.
- Use ECharts only in History, with `cossNeutral` theme.
- Use `motion/react` only in Live.

## Native Main Patterns

- Keep CLI headless mode before app/window initialization.
- Keep app identity/menu configuration.
- Introduce module-level references for main window, Tray, dropdown window, and `isQuitting`.
- Right-click Tray menu should be native `Menu`.
- Left-click dropdown should be a small BrowserWindow, closed on blur.

## Verification Patterns

- Add unit tests for pure aggregation/formatting helpers where possible.
- Keep native Tray/login behavior manual-tested and recorded in plan summaries.
- Run `rtk pnpm --filter @vibetime/desktop test` after desktop changes and `rtk pnpm run ci` at wave boundaries.

## PATTERN MAPPING COMPLETE
