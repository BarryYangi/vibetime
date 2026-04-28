## Conflict Detection Report

Single-doc ingest. The only classified document is `vibetime-prd.md` (PRD, high confidence, manifest_override=true). No inter-document conflicts are possible. Cycle detection: trivial — single-node graph, no cycles. UNKNOWN-confidence-low docs: none.

The synthesizer ran all six conflict-detection passes. Results below.

### BLOCKERS (0)

None. Single-doc ingest with no contradictions against an existing locked context (MODE=new, no EXISTING_CONTEXT). No LOCKED-vs-LOCKED contradictions, no UNKNOWN-low-confidence docs, no cycles.

### WARNINGS (3)

[WARNING] Open decision required from user before downstream routing — License
  Found: vibetime-prd.md §15 names "License — MIT or Apache 2.0 for V0 release" as a decision GSD must surface and stop, not unilaterally answer.
  Impact: REQ-settings-minimal's About panel and the repository LICENSE file both depend on this. Roadmapper cannot finalize routing until resolved.
  → User must pick MIT or Apache 2.0. Captured as constraint CON-open-license with open_question: true.

[WARNING] Open decision required from user before downstream routing — Apple Developer Program enrollment
  Found: vibetime-prd.md §15 names "Apple Developer Program enrollment — required for notarization, 1-3 day approval window. User must enroll before packaging week."
  Impact: REQ-macos-signing-notarization is a V0 acceptance criterion. The 1-3 day approval window makes this scheduling-critical for W5 (signing + notarization + dmg).
  → User must enroll well before W5. Captured as CON-open-apple-developer-enrollment with open_question: true.

[WARNING] Open decision required from user before downstream routing — Auto-launch on login default
  Found: vibetime-prd.md §15 names "Auto-launch on login default — recommended off, prompt user on first launch. User to confirm."
  Impact: Affects REQ-window-lifecycle and REQ-settings-minimal first-run behavior.
  → User to confirm the default-off recommendation, or override. Captured as CON-open-auto-launch-default with open_question: true.

### INFO (5)

[INFO] §5 LOCKED technical decisions accepted as ADR-equivalent
  Note: The PRD is hybrid by design. Per the synthesizer prompt, all of §5 is treated as LOCKED decisions (DEC-001 through DEC-008) with the highest precedence within this ingest. Manifest classification declared the doc `precedence: null` (default ADR > SPEC > PRD > DOC), but the §5 framing — "decisions the user has already made and does not want GSD to relitigate" — is the contractual signal of LOCKED authority. This synthesizer applies that authority; no automatic precedence override was needed because no contradicting source exists in the ingest set.
  Sources: vibetime-prd.md §5; classifications/vibetime-prd.json (notes field).

[INFO] §6 / §7 / §8 SPEC-grade material extracted into constraints.md
  Note: The data model (§6), hook runtime constraints (§7), and agent hook mappings (§8) are SPEC-grade content embedded in a PRD doc. Extracted as constraints (schema / api-contract / nfr / protocol). DEC-009, DEC-010, DEC-011, DEC-012 capture the locked decision portions; CON-* entries capture the contract content.
  Sources: vibetime-prd.md §6, §7, §8.

[INFO] §16 GSD-delegated decisions are NOT open questions
  Note: The PRD §16 explicitly delegates a list of decisions to GSD (directory layout per package, IPC signatures, animation library, packaging tool, code-signing scripting, test strategy, etc.). These are NOT user-blocking open questions; they are research-and-propose items. They are recorded at the bottom of constraints.md under "Decisions Delegated to GSD" and in context.md under "Delegation policy" so the roadmapper does not conflate them with the §15 open questions.
  Sources: vibetime-prd.md §16.

[INFO] Forward-extensibility hooks are intentional, not requirements
  Note: The `core` package's strict purity (zero UI / runtime / fs / DB deps) and the `events.meta` + `schema_version` columns exist for forward extensibility (V0.1 web UI, future schema evolution). These are architectural affordances, not V0 deliverables. Captured under context.md "Forward-extensibility notes" so the roadmapper can prioritize V0 acceptance criteria without expanding scope.
  Sources: vibetime-prd.md §5 (core rationale), §6 (meta + schema_version).

[INFO] Live-view fps target — PRD names two numbers
  Note: PRD §5 / §10.2 names "60fps target, no flicker, smooth on a 2019 MBP minimum"; §14 acceptance criterion says "≥30fps without jank on a 2019 MBP". Both are preserved in REQ-desktop-live-view: the spec's quality goal is 60fps; the acceptance threshold is ≥30fps. Not a contradiction (goal vs. minimum) — no auto-resolution needed — but flagged so the roadmapper knows the gap is intentional.
  Sources: vibetime-prd.md §5, §10.2, §14.
