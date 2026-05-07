# Phase 5: Live, History, Menubar & Lifecycle - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 turns the existing local data layer into the visible product surface: a livestream-ready Live view, a retrospective History analytics view, a persistent macOS menubar widget, close-to-menubar lifecycle behavior, and opt-in auto-launch on login. Today remains the operational daily summary; Live is the screen-recordable stage for active work and brand presence.

</domain>

<decisions>
## Implementation Decisions

### Live View
- **D-01:** Use the current Motion package imported from `motion/react` for the Live view animation layer. Do not plan against the legacy `framer-motion` package name.
- **D-02:** Live view is a livestream dashboard: large project name, large elapsed timer, secondary agent/model information, and enough brand presence to work as a screen-recorded surface.
- **D-03:** Concurrent active turns stack vertically and remain simultaneously visible. A single active turn can use the full stage; multiple turns compress into separate vertical sections.
- **D-04:** Idle state shows quiet "no active turn" copy plus very subtle ambient sweep/pulse animation. It should stay recognizably Live, not become a Today summary.
- **D-05:** Live and Today have separate jobs. Today is the information-dense daily ledger; Live is the focused, animated current-work stage. Today may be real-time without duplicating Live's presentation.

### History View
- **D-06:** History is retrospective analytics, not a year-in-review poster and not a raw audit/debug screen.
- **D-07:** Use a single-page analytics dashboard: top period selector, 365-day ECharts native calendar heatmap, 30-day stacked-area trend chart, and a sortable coss `Table` for Top Projects.
- **D-08:** Keep the calendar heatmap as a 365-day surface. The 7d / 30d / 90d / 365d period selector filters applicable charts and tables and may highlight the selected range on the heatmap rather than shrinking the heatmap itself.
- **D-09:** Stacked area chart uses Top 5 projects plus Others to keep colors and reading load controlled while preserving total trend fidelity.

### Menubar Widget
- **D-10:** Left click opens a dropdown/popover showing today's per-project totals, currently active turns, and an Open vibetime button. It should not directly toggle the main window.
- **D-11:** Dropdown uses a compact summary: today's total, Top 3 projects, active turns, and Open vibetime. It must not recreate the full Today view.
- **D-12:** Right-click menu includes only Open, Settings, and Quit. Quit remains the explicit full-exit affordance alongside Cmd+Q.
- **D-13:** Menubar title refresh uses DB push notifications for immediate updates plus an approximately 10-second recompute while active turns exist. Idle mode should stay low-cost.

### Lifecycle & Auto-launch
- **D-14:** Closing the main window hides it and keeps the app process plus menubar widget alive. Open vibetime restores the same main window rather than treating close as quit.
- **D-15:** Auto-launch opt-in prompt should appear after the user has context, such as first successful Settings open or first successful agent connection. Do not prompt immediately on first app launch.
- **D-16:** Auto-launch persistence uses Electron system login item settings and also records the user's choice in config for UI reflection and debugging.
- **D-17:** Open vibetime opens the last active view, with Today as the first-run default.

### the agent's Discretion
- Exact Motion animation parameters, easing curves, and composition details, as long as Live sustains the Phase 5 performance bar and avoids visual noise.
- Exact History chart spacing, tooltip copy, and color assignments, as long as they use the coss neutral theme and remain readable.
- Exact menubar dropdown sizing and ordering, as long as it stays compact and includes the required information.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Requirements
- `.planning/ROADMAP.md` — Phase 5 goal, requirement list, and success criteria.
- `.planning/REQUIREMENTS.md` — LIVE-01 through LIVE-04, HIST-01 through HIST-05, MENU-01 through MENU-06, SET-04, LIFE-01, LIFE-02.
- `.planning/PROJECT.md` — locked stack, local-first constraints, coss neutral theme, menubar metric, lifecycle, and auto-launch defaults.
- `.planning/DECISIONS.md` — DEC-013, DEC-014, DEC-015, D-ANIM, and Phase 5-relevant deferred decisions.
- `vibetime-prd.md` §10.4 — menubar, Live view, History view, close-to-menubar, and auto-launch specs.
- `vibetime-prd.md` §14 — V0 acceptance criteria, including all views render, menubar appears, Live >=30fps, calendar 365-day render, and close != quit.

### Prior Phase Context
- `.planning/phases/04-desktop-shell-today-cli/04-CONTEXT.md` — Phase 4 IPC, renderer state, app shell, router, and Today/Settings boundaries.
- `.planning/phases/04-desktop-shell-today-cli/04-VERIFICATION.md` — verified Phase 4 surface and post-phase stabilization notes.
- `.planning/phases/03-hook-binary-store-install/03-CONTEXT.md` — hook/CLI/install architecture and project resolution decisions.

### Existing Code
- `packages/desktop/src/shared/ipc-types.ts` — existing typed IPC method map and `TodayLiveState` / `ActiveTurn` types to extend for Live, History, menubar, and lifecycle.
- `packages/desktop/src/main/db.ts` — current desktop SQLite query layer, Today live state, DB watch fallback, and renderer notification path.
- `packages/desktop/src/main/notify-server.ts` — hook-side Unix socket notification integration point.
- `packages/desktop/src/main/index.ts` — Electron app identity, menu, window creation, CLI mode routing, and lifecycle hooks.
- `packages/desktop/src/renderer/src/App.tsx` — HashRouter, app shell, routes, and push subscription.
- `packages/desktop/src/renderer/src/components/Sidebar.tsx` — current navigation surface to extend with Live and History.
- `packages/desktop/src/renderer/src/views/Today.tsx` — existing real-time Today surface and the boundary Live must not duplicate.
- `packages/desktop/src/renderer/src/charts/theme.ts` — registered ECharts theme aligned with coss neutral tokens.
- `packages/desktop/src/renderer/src/components/ui/table.tsx` — coss table primitive required by History Top Projects.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useIpcQuery` + Jotai atoms already support IPC-backed renderer state and should be reused for Live, History, Settings, and menubar-facing state where applicable.
- `TodayLiveState` already combines completed daily summary, active turns, server time, day start, and revision. Live can reuse active-turn semantics, while History should add separate aggregate IPC methods instead of overloading Today.
- `queryTodayLiveState()` already reconciles Codex completed turns and discards inactive open turns before returning active turns.
- `notifyRenderer()` / `startNotifyServer()` / `startDbChangeWatcher()` already form the event-driven refresh path. Menubar refresh should join this path rather than polling independently as the primary mechanism.
- ECharts is already present and themed through `cossNeutral`, which should be used for History charts.
- coss `Table` already exists and should be used for Top Projects.

### Established Patterns
- Renderer accesses data only through typed IPC and preload; no renderer SQLite access.
- IPC methods return `{ ok: true, data } | { ok: false, error }`.
- The app uses HashRouter and a persistent sidebar. Phase 5 should add Live and History routes to the existing shell rather than creating a separate navigation model.
- Today uses local one-second ticks only when active turns exist. Live may tick visually every second for elapsed timers, but menubar title should not update every second.
- UI uses coss-style neutral light/dark theme. Avoid reintroducing the old Tokyo Night visual system.

### Integration Points
- Add Live and History renderer routes and sidebar items.
- Extend shared IPC types and main IPC handlers with History aggregates and any menubar/lifecycle settings methods.
- Add Electron Tray/Menu logic in the main process while preserving CLI headless mode.
- Add close-to-menubar behavior around BrowserWindow close/hide, app activate, and explicit quit paths.
- Add Settings auto-launch toggle and first opt-in prompt, backed by Electron login item settings plus config state.

</code_context>

<specifics>
## Specific Ideas

- Live is not "Today but bigger." Today is the operational ledger; Live is the animated, screen-recordable active-work stage.
- The Live package decision is specifically `motion` / `motion/react`, not the legacy `framer-motion` package.
- Menubar dropdown should stay compact: total, Top 3 projects, active turns, Open vibetime.
- History heatmap stays 365 days even when the user selects 7d / 30d / 90d.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 5 scope.

</deferred>

---

*Phase: 05-live-history-menubar-lifecycle*
*Context gathered: 2026-05-07*
