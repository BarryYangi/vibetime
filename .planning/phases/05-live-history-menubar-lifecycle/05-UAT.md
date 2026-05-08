---
status: complete
phase: 05-live-history-menubar-lifecycle
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
started: 2026-05-07T09:07:26Z
updated: 2026-05-07T09:29:45Z
---

## Current Test

[testing complete]

## Tests

### 1. Native Tray Menu Opens
expected: After a fresh app restart, left-click and right-click on the status bar item both open the same native VibeTime menu without focusing the main window unexpectedly.
result: pass

### 2. Tray Menu Routing
expected: Clicking Today opens Today, active turn rows open Live, project rows open History, Open restores the main app, Settings opens Settings, and Quit exits the app.
result: pass

### 3. Close-to-Menubar Lifecycle
expected: Closing the main window hides it while the Tray item remains alive; Cmd+Q and Tray Quit fully exit the app.
result: pass

### 4. Open at Login
expected: Settings shows an Open at login control; toggling it updates Electron login item state and persists the preference.
result: pass
note: "Control was changed from a button to a coss/Base UI Switch. User confirmed the setting can add VibeTime to login items in the current app. Follow-up fix: only the Switch itself toggles; the surrounding row/text no longer toggles the preference."

### 5. Last View Restore
expected: After visiting Today, Live, History, or Settings, closing/reopening the app restores the last app route; unsupported routes are not persisted.
result: pass

### 6. Live Idle State
expected: With no active turn, Live shows the quiet idle state with the expected copy and no stale active-turn content.
result: pass

### 7. Live Active Turns
expected: With one or more active turns, Live shows project, agent/model, elapsed timer, motion accents, and project total; multiple active turns remain simultaneously visible and smooth.
result: pass

### 8. History Analytics
expected: History shows the GitHub-style contribution heatmap, useful ECharts analytics, and Top Projects table using real captured data without misleading placeholder metrics.
result: pass

### 9. History Range Controls
expected: The 7d, 30d, 90d, and 365d controls update the applicable charts and tables without breaking layout or chart readability.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
