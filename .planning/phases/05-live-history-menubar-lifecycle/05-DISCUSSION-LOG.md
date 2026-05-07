# Phase 5: Live, History, Menubar & Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 05-live-history-menubar-lifecycle
**Areas discussed:** Live View, History View, Menubar Widget, Lifecycle & Auto-launch

---

## Live View

| Option | Description | Selected |
|--------|-------------|----------|
| CSS + small requestAnimationFrame | Low dependency and controllable for pulse, sweep, and timer animation. | |
| Framer Motion | Originally proposed as a declarative animation option, but corrected by the user because the forward package surface is `motion`. | ✓ |
| GSAP | Powerful but heavier than this phase needs. | |

**User's choice:** Use Motion package via `motion/react`; do not use legacy `framer-motion`.
**Notes:** User explicitly corrected the package direction: "motion Framer Motion 已经不在维护".

| Option | Description | Selected |
|--------|-------------|----------|
| Livestream dashboard | Large project name, large timer, secondary agent/model info, and screen-recording quality. | ✓ |
| Minimal status screen | Quieter but less useful as a content asset. | |
| Dense monitoring panel | More information but weaker brand/stage presence. | |

**User's choice:** Livestream dashboard.
**Notes:** This preserves the Live/Today split: Live is the stage, Today is the ledger.

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical section stacking | Every active turn remains visible; one active turn can expand, multiple turns compress. | ✓ |
| Primary turn enlarged with secondary mini cards | More hierarchy but hides concurrency details. | |
| Rotating carousel | Visually active but makes simultaneous turns less inspectable. | |

**User's choice:** Vertical section stacking.
**Notes:** Must satisfy concurrent turns all simultaneously visible.

| Option | Description | Selected |
|--------|-------------|----------|
| Quiet ambient animation | Idle copy plus very subtle sweep/pulse so Live remains a content surface. | ✓ |
| Fully static empty state | Simple but visually dead for livestream use. | |
| Today summary | Informative but blurs the Live/Today boundary. | |

**User's choice:** Quiet ambient animation.
**Notes:** Live should not duplicate Today during idle.

## Live vs Today Clarification

**Question:** What is the difference if Today is already real-time?

**Captured answer:** Today is the operational daily ledger: totals, projects, breakdowns, and repeated-use scanning. Live is the current-work stage: active turns, motion, elapsed timer, and brand presence. Today being real-time is about correctness; Live being real-time is about presence and content value.

---

## History View

| Option | Description | Selected |
|--------|-------------|----------|
| Retrospective analytics | Understand long-term effort distribution, trends, and top projects. | ✓ |
| Showcase year-in-review | More decorative, less efficient. | |
| Debug/audit raw data | Useful for diagnosis but not the V0 UI goal. | |

**User's choice:** Retrospective analytics.
**Notes:** History is not a poster and not an audit screen.

| Option | Description | Selected |
|--------|-------------|----------|
| Single-page analytics dashboard | Period selector, heatmap, stacked area, and Top Projects table in one view. | ✓ |
| Tabs split Calendar / Trends / Projects | Cleaner separation but more navigation. | |
| Simple vertical stack | Lower design effort but weaker hierarchy. | |

**User's choice:** Single-page analytics dashboard.
**Notes:** Matches Phase 5 requirement shape.

| Option | Description | Selected |
|--------|-------------|----------|
| Heatmap fixed 365 days; selector filters/highlights | Preserves 365-day heatmap requirement while keeping selected ranges meaningful. | ✓ |
| All charts switch to selected range | Makes 7d heatmap less meaningful. | |
| Selector controls trend chart only | Too narrow for the visible control. | |

**User's choice:** Heatmap fixed 365 days; selector filters/highlights.
**Notes:** Planner should define exact highlight affordance.

| Option | Description | Selected |
|--------|-------------|----------|
| Top 5 + Others | Controlled color count and readable trend fidelity. | ✓ |
| Top 10 + Others | More complete but noisier. | |
| All projects | Accurate but likely unreadable. | |

**User's choice:** Top 5 + Others.
**Notes:** Use the same period semantics for ranking where applicable.

---

## Menubar Widget

| Option | Description | Selected |
|--------|-------------|----------|
| Open dropdown/popover | Shows today's totals, active turns, and Open vibetime. | ✓ |
| Directly open main window | Fast but misses required dropdown behavior. | |
| Toggle window show/hide | Ambiguous and less standard for this app. | |

**User's choice:** Open dropdown/popover.
**Notes:** Left click should not directly toggle the main window.

| Option | Description | Selected |
|--------|-------------|----------|
| Compact summary | Today's total, Top 3 projects, active turns, Open vibetime. | ✓ |
| Full mini Today view | Too heavy for a menubar dropdown. | |
| Active turns only | Too little ambient value. | |

**User's choice:** Compact summary.
**Notes:** Keep menubar ambient and fast.

| Option | Description | Selected |
|--------|-------------|----------|
| Open / Settings / Quit | Minimal and matches acceptance. | ✓ |
| Add Today / Live / History shortcuts | More shortcuts, more clutter. | |
| Add install/preferences items | Too much Settings surface in the context menu. | |

**User's choice:** Open / Settings / Quit.
**Notes:** Quit is the explicit full-exit path alongside Cmd+Q.

| Option | Description | Selected |
|--------|-------------|----------|
| 10s active timer plus DB push immediate refresh | Responsive without menubar second-by-second churn. | ✓ |
| 10s timer only | Simpler but less immediate after writes. | |
| Every-second update | Unneeded for cumulative menubar total. | |

**User's choice:** 10s active timer plus DB push immediate refresh.
**Notes:** Idle should remain low-cost.

---

## Lifecycle & Auto-launch

| Option | Description | Selected |
|--------|-------------|----------|
| Hide window and keep app plus menubar alive | close != quit; Open restores the same app surface. | ✓ |
| Destroy window and recreate later | More lifecycle branches. | |
| Minimize to Dock | Does not match menubar app expectation. | |

**User's choice:** Hide window and keep app plus menubar alive.
**Notes:** Required by LIFE-01.

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt after Settings or first successful agent connection | User has enough context to understand the value. | ✓ |
| Prompt immediately on first app launch | Too early. | |
| No prompt; Settings toggle only | Less intrusive but misses the invitation requirement. | |

**User's choice:** Prompt after Settings or first successful agent connection.
**Notes:** Avoid first-launch interruption before value is clear.

| Option | Description | Selected |
|--------|-------------|----------|
| Electron setLoginItemSettings only | System-native but weak UI reflection/debugging. | |
| System setting plus config record | Native behavior plus explainable persisted preference. | ✓ |
| Config only; sync system setting later | More indirect and failure-prone. | |

**User's choice:** System setting plus config record.
**Notes:** UI can reflect config while implementation keeps Electron login item state authoritative.

| Option | Description | Selected |
|--------|-------------|----------|
| Open last active view; first default Today | Preserves continuity while keeping Today as first landing. | ✓ |
| Always open Today | Predictable but loses continuity. | |
| Open Live when active, otherwise Today | Clever but may surprise users. | |

**User's choice:** Open last active view; first default Today.
**Notes:** This also informs menubar Open behavior.

---

## the agent's Discretion

- Exact Motion animation parameters, easing, timing, and composition details.
- Exact ECharts tooltip behavior and History chart spacing.
- Exact menubar dropdown sizing and presentation within the compact-summary constraint.

## Deferred Ideas

None.
