---
phase: 05
slug: live-history-menubar-lifecycle
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-07
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest for desktop/core TypeScript; Electron dev/manual checks for native Tray/login behavior |
| **Config file** | `packages/desktop/vitest.config.ts` |
| **Quick run command** | `rtk pnpm --filter @vibetime/desktop test` |
| **Full suite command** | `rtk pnpm run ci` |
| **Estimated runtime** | ~60-180 seconds depending on native rebuild state |

---

## Sampling Rate

- **After every task commit:** Run the narrowest relevant command, at minimum `rtk pnpm --filter @vibetime/desktop test` for desktop changes.
- **After every plan wave:** Run `rtk pnpm run ci`.
- **Before `$gsd-verify-work`:** Full suite must be green and manual Electron checks must be recorded.
- **Max feedback latency:** 3 minutes for automated checks; manual Electron checks at plan/wave boundaries.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-data-history | TBD | 1 | HIST-01..HIST-05 | — | N/A | unit | `rtk pnpm --filter @vibetime/desktop test` | ❌ W0 | ⬜ pending |
| 05-data-menubar | TBD | 1 | MENU-01..MENU-04 | — | N/A | unit | `rtk pnpm --filter @vibetime/desktop test` | ❌ W0 | ⬜ pending |
| 05-config-lifecycle | TBD | 1 | SET-04, LIFE-01, LIFE-02 | — | N/A | unit + manual | `rtk pnpm --filter @vibetime/desktop test` | ❌ W0 | ⬜ pending |
| 05-live-view | TBD | 2 | LIVE-01..LIVE-04 | — | N/A | build + manual visual | `rtk pnpm --filter @vibetime/desktop test` | ❌ W0 | ⬜ pending |
| 05-history-view | TBD | 2 | HIST-01..HIST-05 | — | N/A | build + manual visual | `rtk pnpm --filter @vibetime/desktop test` | ❌ W0 | ⬜ pending |
| 05-menubar-runtime | TBD | 3 | MENU-01..MENU-06 | — | N/A | manual Electron | `rtk pnpm --filter @vibetime/desktop build` | ❌ W0 | ⬜ pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/desktop/src/main/db.test.ts` or equivalent — fixtures for History aggregates, Top 5 + Others, and menubar title formatting.
- [ ] `packages/hook/src/config.test.ts` or desktop-facing config tests — preserve `[app]` with `[projects]` and `[display]`.
- [ ] Renderer route/build smoke coverage for Live and History, if existing test setup supports React component tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live animation smoothness | LIVE-04 | Requires real renderer/browser timing | Run Electron dev app with one and multiple active turns; inspect visible jank and record FPS/performance evidence where practical. |
| Native Tray appears and updates | MENU-01..MENU-04 | macOS native shell behavior | Launch Electron app on macOS; verify title states and active pulse behavior. |
| Tray left/right click behavior | MENU-05, MENU-06 | Native input behavior | Left-click and right-click open the same native status menu; verify Today, running turns, Top project rows, Open, Settings, and Quit. |
| Close-to-menubar | LIFE-01, LIFE-02 | Native window lifecycle | Close window; app and Tray remain. Cmd+Q and Tray Quit fully exit. |
| Auto-launch setting | SET-04 | OS login item state | Toggle Open at login; verify Electron login item state and config persistence. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or manual verification mapping.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers missing test references.
- [x] No watch-mode flags.
- [x] Feedback latency < 3 minutes for automated checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-05-07
