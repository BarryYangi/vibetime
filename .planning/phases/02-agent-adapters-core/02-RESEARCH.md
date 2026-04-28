# Phase 2: Agent Adapters (`@vibetime/core`) — Research

**Researched:** 2026-04-28
**Domain:** vendor hook payload re-verification + adapter implementation tactics
**Confidence:** HIGH on vendor docs (all three publicly accessible, current); HIGH on architectural shape (PRD §8 + DEC-011 lock the contract); MEDIUM on Codex `model` field across all events (docs assert "common fields" but list varies per event).

---

## User Constraints (verbatim from upstream)

### Locked Decisions (NOT up for relitigation)

- **DEC-011 adapter contract**: `(rawPayload: unknown, eventName: string) => NormalizedEvent | null`. Pure. **Never throws.** Already shipped in `packages/core/src/events.ts` (Phase 1 commit `c0c8a60`). [VERIFIED: read source.]
- **DEC-006 / D-LAYOUT**: Adapters live at `packages/core/src/adapters/{claude-code,codex,cursor}.ts`. Sibling tests at `*.test.ts`.
- **DEC-006 zero-runtime-dep contract**: `core` may NOT import `fs`, `node:*`, child_process, or any third-party runtime dep. Adapters get `Date.now()` and `Intl.DateTimeFormat` (ECMAScript built-ins, available without `@types/node` per `core/tsconfig.json#types: []`).
- **D-TEST**: Vitest **3.2.4 pinned** (Node 22.7 `require(esm)` constraint; revisit on Node ≥ 22.12). [VERIFIED: `.planning/DECISIONS.md`.]
- **DEC-010 project resolution**: First-match alias → git remote → cwd basename → `_unknown`. Already shipped in `packages/core/src/project.ts`; signature `resolveProject({ cwd, aliases?, gitRemoteUrl? })`. **Caller pre-fetches `gitRemoteUrl`** (running `git config` is `hook`/`desktop`'s job, never `core`'s).
- **PRD §8 mapping table**: The contract. Adapters implement it; vendor drift is handled at the adapter, never by mutating `NormalizedEvent`.

### Claude's Discretion (this phase decides)

- Per-adapter file internal structure (helper layout, type-guard style).
- Adapter ↔ `resolveProject` responsibility split (§D below — this is the architectural finding to land).
- Fixture organization (inline vs `__fixtures__/`; per-adapter vs shared).
- Property-test approach (light fuzzing vs full property library — leaning light per `core` zero-dep rule).
- The exact `null`-return policy for ambiguous inputs (e.g., empty `workspace_roots` array).

### Deferred Ideas (OUT OF SCOPE for Phase 2)

- Persisting `NormalizedEvent` to SQLite — Phase 3.
- Running `git config --get remote.origin.url` — Phase 3 (`hook` package).
- Reading `~/.vibetime/config.toml` for aliases — Phase 3.
- Codex `SessionEnd` process-exit fallback at runtime — Phase 3 (`hook` lifecycle, not adapter).
- Real captured payloads (vs spec-derived fixtures) — defer until a working hook is generating them in Phase 3.

---

## Phase Requirements

| ID | Description (verbatim from REQUIREMENTS.md) | Research support |
|----|---------------------------------------------|------------------|
| **ADPT-01** | Claude Code adapter maps `UserPromptSubmit` / `Stop` / `SessionStart` / `SessionEnd` per DEC-011. Pure, never throws, returns `null` on unparseable. | §A.1 confirms all four event names + payload shapes. §C gives the per-step template. |
| **ADPT-02** | Codex adapter maps `UserPromptSubmit` / `Stop` / `SessionStart`. Process-exit fallback for session-end (Codex `SessionEnd` not GA). | §A.2 confirms three event names + the `[features] codex_hooks=true` flag still required. SessionEnd remains absent in Codex's published schema set. |
| **ADPT-03** | Cursor adapter maps `beforeSubmitPrompt` / `stop` / `sessionStart` / `sessionEnd` using `workspace_roots[0]`, `conversation_id`, `generation_id`. | §A.3 confirms all four event names + payload shapes; surfaces a NEW finding on the `model` field omission in session events. |
| **ADPT-04** | All three adapters covered by unit tests using fixtures from PRD Appendix payload examples. | §B fixture matrix, §F validation architecture. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Rationale |
|------------|-------------|-----------|
| Vendor payload normalization (event name + field extraction) | `core/adapters/*` | Pure logic, no I/O. The whole reason `core` exists. |
| Producing `ts` (epoch seconds) | `core/adapters/*` | `Date.now() / 1000` is an ECMAScript built-in; deterministic at call time. |
| Producing `timezone` (IANA) | `core/adapters/*` | `Intl.DateTimeFormat().resolvedOptions().timeZone` is an ECMAScript built-in. |
| Resolving the `project` field's final value | **hook layer (Phase 3)** | Adapter cannot run `git config`. See §D — adapters emit a temporary `cwd`-shaped project and the hook post-processes via `resolveProject`. |
| Fetching `gitRemoteUrl` via `child_process` | `hook`/`desktop` (Phase 3) | `core` is zero-runtime-dep. |
| Reading user aliases from `config.toml` | `hook`/`desktop` (Phase 3) | Same reason. |

> **Critical insight for the planner**: the adapter signature `(rawPayload, eventName)` deliberately does NOT include `gitRemoteUrl` or `aliases`. This research recommends adapters set `project = cwd` (the raw cwd string) and let the hook post-process via `resolveProject({ cwd, aliases, gitRemoteUrl })` before DB insert. Full rationale in §D.

---

## Summary

Phase 2 is **execution against a locked spec**, not design. PRD §8's mapping table has been re-verified against current vendor documentation (2026-04-28); **all four locked event names for Claude Code match exactly**, **all three locked event names for Codex match exactly with `SessionEnd` confirmed still absent from Codex's published schema set**, and **all four locked Cursor event names match exactly** with one notable doc-asymmetry surfaced (Cursor's base schema claims `model` is universal, but the per-event reference for `sessionStart`/`sessionEnd` omits it — adapter must treat it as optional).

Three adapters, three files, identical step-by-step template (§C). Eight to twelve fixtures per adapter; ~30 happy-path + adversarial tests total. The single non-trivial design call is the responsibility split between adapter and `resolveProject` (§D), recommended below.

**Primary recommendation:** Implement each adapter as a pure function with a 4-step type-guard pipeline (validate event name → validate payload object → extract required fields with `typeof` guards → construct `NormalizedEvent`); wrap the entire body in a single outer `try { ... } catch { return null }` as belt-and-braces against exotic inputs (Proxy/getter abuse), matching `resolveProject`'s pattern. The adapter sets `project = rawPayload.cwd` (or `workspace_roots[0]` for Cursor); the hook layer in Phase 3 calls `resolveProject` to overwrite this just before DB insert.

---

## §A. Vendor Hook Docs Re-Verification (mandated by PRD §8)

For each vendor, status table per row of PRD §8 + drift notes. Status legend: ✓ matches current docs verbatim; ⚠ drifted but compatible; ✗ removed.

### A.1 Claude Code

**Source (HIGH confidence):** `https://code.claude.com/docs/en/hooks` (originally redirected from `https://docs.claude.com/en/docs/claude-code/hooks` — domain has moved; redirect is permanent 301). [VERIFIED: WebFetch 2026-04-28]

| PRD §8 row | Locked value | Current docs | Status |
|---|---|---|---|
| Turn-start event name | `UserPromptSubmit` | `UserPromptSubmit` | ✓ |
| Turn-end event name | `Stop` | `Stop` | ✓ |
| Session-start event name | `SessionStart` | `SessionStart` | ✓ |
| Session-end event name | `SessionEnd` | `SessionEnd` | ✓ |
| Session ID payload field | `session_id` | `session_id` | ✓ |
| Turn ID payload field | derive `${session_id}-${ts}` | (no native turn ID) | ✓ derivation still required |
| Cwd payload field | `cwd` | `cwd` | ✓ |
| Model field (in `SessionStart`) | `model` | `model` | ✓ |

**Common-input fields (every event):** `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`. [CITED: code.claude.com/docs/en/hooks "Common Input Fields (All Events)"]

**SessionStart adds:** `source` (`"startup" | "resume" | "clear" | "compact"`), `model`, optional `agent_type`. [CITED: same doc, "SessionStart Event"]

**SessionEnd adds:** `reason` (`"clear" | "resume" | "logout" | "prompt_input_exit" | "bypass_permissions_disabled" | "other"`). Note: `SessionEnd` payload **omits** `permission_mode` per the published schema.

**Stop adds:** `stop_reason` (e.g., `"end_turn"`).

**UserPromptSubmit adds:** `prompt`.

**Drift notes (informational, do not change adapter):**
- New events have appeared since PRD authorship: `UserPromptExpansion`, `PostToolBatch`, `SubagentStart`/`Stop`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate/Remove`, `PreCompact`/`PostCompact`, `Elicitation`/`ElicitationResult`, `StopFailure`. **None of these are mapped by the adapter.** Adapter returns `null` for any event name not in `{UserPromptSubmit, Stop, SessionStart, SessionEnd}`.
- A `StopFailure` event now distinguishes API-error turn endings from normal ones. **Decision for V0:** ignore — V0 doesn't track failures separately. If we later want to capture failed turns, this is the hook to use; not a breaking concern.
- Common payload now includes `transcript_path` and `permission_mode` not in the PRD Appendix sample. Adapter does NOT need them; safe to ignore. Optionally pass-through into `meta` if the planner wants forward-extensibility.

**Confidence: HIGH** — official docs page, all four mapped event names + their fields confirmed.

### A.2 Codex CLI

**Sources (HIGH confidence):** `https://developers.openai.com/codex/hooks` (canonical docs page) + `https://github.com/openai/codex/tree/main/codex-rs/hooks/schema/generated` (machine-generated JSON schemas in repo). [VERIFIED: WebFetch 2026-04-28]

| PRD §8 row | Locked value | Current docs | Status |
|---|---|---|---|
| Turn-start event name | `UserPromptSubmit` | `UserPromptSubmit` | ✓ |
| Turn-end event name | `Stop` | `Stop` | ✓ |
| Session-start event name | `SessionStart` | `SessionStart` | ✓ |
| Session-end event name | (not GA; use process exit) | **still not present** in `codex-rs/hooks/schema/generated/` | ✓ confirms PRD's caveat — no `session-end.command` schema exists |
| Session ID payload field | `session_id` | `session_id` | ✓ |
| Turn ID payload field | `turn_id` | `turn_id` (turn-scoped events) | ✓ |
| Cwd payload field | `cwd` | `cwd` | ✓ |
| Model field (in `SessionStart`) | `model` | `model` (declared as common field) | ✓ |
| Config flag | `[features] codex_hooks = true` in `~/.codex/config.toml` | unchanged | ✓ |

**Common-input fields (every Codex hook):** `session_id`, `cwd`, `hook_event_name`, `model`, `transcript_path`. Turn-scoped hooks (PreToolUse, PermissionRequest, PostToolUse, UserPromptSubmit, Stop) **additionally** include `turn_id`. [CITED: developers.openai.com/codex/hooks]

**Schemas published in repo (`codex-rs/hooks/schema/generated/`):**
- `session-start.command` (input + output)
- `user-prompt-submit.command`
- `pre-tool-use.command`
- `permission-request.command`
- `post-tool-use.command`
- `stop.command`
- **No `session-end.command`** — confirms PRD's "not GA" caveat is still current. [VERIFIED: GitHub directory listing 2026-04-28]

**SessionStart adds:** `source` (`"startup" | "resume"`).

**Stop adds:** `stop_hook_active` (bool), `last_assistant_message` (string | null).

**UserPromptSubmit adds:** `prompt`, `turn_id`.

**Drift notes (informational):**
- A known issue (#15266) reports `UserPromptSubmit` and `SessionStart` firing **simultaneously** on the first prompt, with only `UserPromptSubmit` firing afterward. **Implication for V0:** the adapter handles them independently — no risk of duplicate `session_start` events because each fires once. Phase 3 hook should be aware that on a fresh session the first agent action is a session_start + turn_start back-to-back.
- An unrelated bug (#19199) reports Codex CLI 0.124.0 failing to start when hook config is present and `codex_hooks` is enabled. This is a vendor-side issue affecting the install command in Phase 3, not the adapter. **Flag for Phase 3 install task.**
- Codex's stable channel documents hooks as "production-ready" with `codex_hooks = true` flag still required in `~/.codex/config.toml`. Some advanced features ("parsed but not yet implemented") remain — adapter is unaffected.

**Confidence: HIGH** for the locked mapping; **MEDIUM** for the assumption that the `model` field is reliably present on every Codex event. Docs assert it as a common field but per-event examples vary. **Recommendation:** treat `model` as optional in the adapter — extract if present, omit from `meta` otherwise.

### A.3 Cursor

**Sources (HIGH confidence):** `https://cursor.com/docs/hooks` (canonical). The `https://cursor.com/docs/hooks.md` raw-markdown URL returned 404 today; HTML page is authoritative. [VERIFIED: WebFetch 2026-04-28]

| PRD §8 row | Locked value | Current docs | Status |
|---|---|---|---|
| Turn-start event name | `beforeSubmitPrompt` | `beforeSubmitPrompt` | ✓ |
| Turn-end event name | `stop` | `stop` | ✓ |
| Session-start event name | `sessionStart` | `sessionStart` | ✓ |
| Session-end event name | `sessionEnd` | `sessionEnd` | ✓ |
| Session ID payload field | `conversation_id` | `conversation_id` | ✓ |
| Turn ID payload field | `generation_id` | `generation_id` | ✓ |
| Cwd payload field | `workspace_roots[0]` | `workspace_roots: string[]` | ✓ |
| Model field (in session_start) | (verify W1; if absent, omit) | **doc asymmetry — see notes** | ⚠ doc asymmetry |

**Common base schema (Cursor docs claim every hook receives):** `conversation_id`, `generation_id`, `model`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`. [CITED: cursor.com/docs/hooks "All hooks receive a base set of fields..."]

**`sessionStart` event-specific fields:** `session_id` (documented as "same as `conversation_id`"), `is_background_agent`, `composer_mode` (`"agent" | "ask" | "edit"`).

**`sessionEnd` event-specific fields:** `session_id`, `reason` (`"completed" | "aborted" | "error" | "window_close" | "user_close"`), `duration_ms`, `is_background_agent`, `final_status`, `error_message` (when reason is `"error"`).

**`stop` event-specific fields:** `status` (`"completed" | "aborted" | "error"`), `loop_count` (default starts at `0`).

**`beforeSubmitPrompt` event-specific fields:** `prompt`, `attachments` (per community references).

**The `model` field asymmetry (NEW finding — important for adapter):**

Cursor's documentation states that the **base schema** (which includes `model`) applies to all hooks. **However**, the per-event reference sections for `sessionStart` and `sessionEnd` do NOT include `model` in their input examples. WebFetch confirms: "the `sessionStart` and `sessionEnd` reference sections do not include `model` in their input examples. The base schema section claims universality, but the actual payload documentation for session hooks omits the model field, suggesting either incomplete documentation or that session hooks are implicitly excluded from certain base fields." [VERIFIED: WebFetch 2026-04-28]

**Recommendation for the adapter:** treat `model` as **optional** on Cursor `sessionStart`. Extract via `typeof === 'string'` guard; if absent, omit from `meta`. **Do not attempt to require it.** The PRD's "verify W1; if absent, omit" caveat resolves to "extract opportunistically." This matches the locked Codex stance.

**Drift notes (informational):**
- Cursor `stop`'s `status` does NOT use the value `"cancelled"` — it's `"completed" | "aborted" | "error"`. PRD's locked normalization doesn't read `status` so this is informational only. If we later want to mark abandoned turns, this is the field.
- `sessionEnd` carries a `duration_ms` (vendor-side computed). Adapter does NOT use it — `events.duration_sec` is computed by the hook from `turn_start` ↔ `turn_end` pairing. **Optionally pass through into `meta`** for forward-extensibility.
- `workspace_roots[1..]` known limitation per PRD: docs confirm `workspace_roots` is a `string[]`. Cursor V0 adapter uses index 0; if `workspace_roots` is empty (`[]`), the adapter MUST return null for the event-emit because we can't derive `cwd`. (Alternative: adapter returns event with `cwd = ""` and lets `resolveProject` produce `_unknown` — recommended over null since the *event* itself is real even if the project is unknown.) See §G pitfalls.

**Cursor 1.7+ hooks landed October 2025** per InfoQ + the Cursor changelog; hooks are GA. [CITED: infoq.com/news/2025/10/cursor-hooks/]

**Confidence: HIGH** for all locked event names + field names; **MEDIUM** for `model`'s availability in `sessionStart` payloads (treat as opportunistic).

---

## §B. Fixture Sourcing Strategy

### Canonical fixture set (recommended)

**Tier 1 — happy-path (one fixture per mapped event, total 11):**

| Adapter | Event name | Fixture source |
|---|---|---|
| Claude Code | `UserPromptSubmit` | PRD Appendix verbatim |
| Claude Code | `Stop` | Construct from PRD common-fields + `stop_reason: "end_turn"` |
| Claude Code | `SessionStart` | Construct from PRD common-fields + `source: "startup"` + `model: "claude-sonnet-4-6"` |
| Claude Code | `SessionEnd` | Construct from PRD common-fields + `reason: "clear"` |
| Codex | `UserPromptSubmit` | PRD Appendix verbatim |
| Codex | `Stop` | Common fields + `turn_id` + `stop_hook_active: false` + `last_assistant_message: "..."` |
| Codex | `SessionStart` | Common fields + `source: "startup"` + `model: "gpt-5"` |
| (Codex `SessionEnd` deliberately NOT in fixture set — adapter MUST return null when called with this event name) |
| Cursor | `beforeSubmitPrompt` | PRD Appendix verbatim |
| Cursor | `stop` | PRD Appendix verbatim |
| Cursor | `sessionStart` | Construct from base + session-specific: `session_id`, `is_background_agent: false`, `composer_mode: "agent"` (model field intentionally OMITTED in one fixture, INCLUDED in another to exercise both branches) |
| Cursor | `sessionEnd` | Construct from base + `reason: "completed"`, `duration_ms: 45000` |

**Tier 2 — adversarial (per-adapter, ~6 each, total 18):**

For each adapter:
1. `eventName === ""` → null
2. `eventName === "UnknownEvent"` (or vendor-specific bogus name) → null
3. `rawPayload === null` → null
4. `rawPayload === undefined` → null
5. `rawPayload === "string"` (primitive, not object) → null
6. Required field present but wrong type (e.g., `session_id: 42` for Claude/Codex; `conversation_id: null` for Cursor) → null
7. **Cursor-specific:** `workspace_roots: []` (empty array) → recommended: still emit event with `cwd = ""` (resolveProject will produce `_unknown`); document this in the test name. Decision tradeoff in §G.
8. **Codex-specific:** `eventName === "SessionEnd"` → null (Codex doesn't emit; adapter must reject)

**Tier 3 — property test (one per adapter, lightweight):**

Generate ~50 random mutations of each happy-path fixture (delete random fields, replace random fields with primitives, deep-mutate). Assert: result is `null` OR a fully-typed `NormalizedEvent` (every required field is the correct type, `ts` is finite number > 0, `timezone` is non-empty string). Never throws. **Use plain `Math.random()` + manual mutation — no `fast-check` import** (zero-runtime-dep rule).

**Where to put fixtures.** Inline in the test file (`adapters/claude-code.test.ts`) as TypeScript objects. **Avoid `__fixtures__/*.json`** unless the count grows past ~30 per adapter — a fixture file then becomes worth the navigation overhead. For Phase 2's count (~30 total), inline is fine.

**Forward-extensibility note:** when Phase 3 captures real hook output, those captures should be saved as `*.captured.json` fixtures and added to the suite as a separate group. Not Phase 2's job.

---

## §C. Defensive Coding Pattern (per-adapter step template)

This is the canonical adapter body. Use it for all three (substitute event names, field names, agent string).

```typescript
// Source: pattern adapted from packages/core/src/project.ts (Phase 1).
// Same belt-and-braces shape: explicit type guards inside an outer try/catch.

import type { AdapterFn, NormalizedEvent, EventType } from '../events.js'

// 1. Per-vendor event-name → NormalizedEvent.event_type table.
const EVENT_TYPES: Readonly<Record<string, EventType>> = {
  UserPromptSubmit: 'turn_start',
  Stop: 'turn_end',
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
}

// 2. Per-vendor type guard for the payload's required-field shape.
function hasRequired(p: unknown): p is { session_id: string; cwd: string } {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof (p as { session_id?: unknown }).session_id === 'string' &&
    typeof (p as { cwd?: unknown }).cwd === 'string'
  )
}

export const adaptClaudeCode: AdapterFn = (rawPayload, eventName) => {
  try {
    // Step 1: validate event name
    const event_type = EVENT_TYPES[eventName]
    if (!event_type) return null

    // Step 2: validate payload shape (object + required fields present + correct types)
    if (!hasRequired(rawPayload)) return null

    // Step 3: extract optional fields with type guards
    const ts = Date.now() / 1000
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const meta: Record<string, unknown> = {}

    // Per-event: pull additional fields into meta
    if (event_type === 'session_start') {
      const m = (rawPayload as { model?: unknown }).model
      if (typeof m === 'string') meta.model = m
      const s = (rawPayload as { source?: unknown }).source
      if (typeof s === 'string') meta.source = s
    }
    if (event_type === 'session_end') {
      const r = (rawPayload as { reason?: unknown }).reason
      if (typeof r === 'string') meta.reason = r
    }

    // Step 4: compose NormalizedEvent
    // turn_id derivation: Claude Code has no native turn ID; derive per PRD §8
    const turn_id =
      event_type === 'turn_start' || event_type === 'turn_end'
        ? `${rawPayload.session_id}-${ts}`
        : undefined

    return {
      agent: 'claude-code',
      event_type,
      project: rawPayload.cwd,            // raw cwd; hook layer post-processes via resolveProject (see §D)
      session_id: rawPayload.session_id,
      ...(turn_id ? { turn_id } : {}),
      ts,
      timezone,
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }
  } catch {
    // Belt-and-braces: same pattern as resolveProject. The explicit guards
    // above already cover documented inputs; this catches Proxy/getter abuse
    // that violates the "rawPayload: unknown" assumption.
    return null
  }
}
```

**Key points the planner must preserve:**

1. **Outer `try { ... } catch { return null }`** wraps the entire body. Same belt-and-braces philosophy as `resolveProject`. Comment must explain it's intentional, not redundant.
2. **Event-name lookup table** (`EVENT_TYPES`) is per-adapter — not extracted into a shared util. Each adapter owns its mapping; cross-coupling adapters via a shared table risks a one-vendor change cascading.
3. **`hasRequired` is a per-adapter type guard** — Cursor's required fields (`conversation_id`, `workspace_roots`) differ from Claude/Codex (`session_id`, `cwd`). Don't share.
4. **`ts` and `timezone` are computed at call time** — explicitly NOT captured in module scope. Tests accept tolerance (`expect(ts).toBeCloseTo(Date.now() / 1000, 0)`) or use `vi.useFakeTimers()` for exactness.
5. **`turn_id` derivation only on turn_* events**, omitted on session_*. Per PRD §6's `events` schema — `turn_id TEXT, NULL for session_* events`.
6. **`project = rawPayload.cwd`** (or `workspace_roots[0]` for Cursor). Hook layer in Phase 3 overwrites this via `resolveProject`. **See §D for the locked rationale.**
7. **`meta` is opportunistic** — fields that exist get passed through; absent fields are simply omitted. No exception, no null-fill.
8. **`exactOptionalPropertyTypes: true`** is on per `D-TS-STRICTNESS` — code uses spread tricks (`...(turn_id ? { turn_id } : {})`) instead of `turn_id: undefined`. The current `resolveProject` already follows this style.

**Per-adapter deltas from the template:**

- **Codex**: `turn_id` comes from `rawPayload.turn_id` (vendor-provided), not derived. Adapter MUST return null when `eventName === "SessionEnd"` (Codex doesn't emit it; this is a banned event name). The `EVENT_TYPES` table for Codex omits `SessionEnd`.
- **Cursor**: `eventName` is camelCase (`beforeSubmitPrompt`, `stop`, `sessionStart`, `sessionEnd`). `session_id` source = `rawPayload.conversation_id`. `turn_id` source = `rawPayload.generation_id`. `cwd` source = `rawPayload.workspace_roots[0]` — guard with `Array.isArray(workspace_roots) && typeof workspace_roots[0] === 'string'` (D-TS-STRICTNESS `noUncheckedIndexedAccess` requires this). Empty `workspace_roots` array → return event with `cwd = ""` (let `resolveProject` produce `_unknown`); see §G.4.

---

## §D. Adapter ↔ `resolveProject` Responsibility Split (architectural finding)

**The question:** the locked adapter signature is `(rawPayload, eventName) => NormalizedEvent | null`. `NormalizedEvent.project` is required. But `resolveProject` needs `gitRemoteUrl` to do step 2 of first-match resolution. Adapters cannot run `git config` (zero-runtime-dep). So who fetches it, and when does the `project` field get its final value?

**Three options considered:**

| Option | Description | Verdict |
|---|---|---|
| 1. Add 3rd param: `(payload, event, gitRemoteUrl?) => ...` | Inject the URL at adapter call time | ✗ Breaks DEC-011 locked signature. Rejected. |
| 2. Two-stage: adapter sets `project = "__pending__"`; hook overwrites | Sentinel value + post-pass | ✗ Confusing, error-prone — sentinel could leak into DB if hook forgets. Rejected. |
| 3. Adapter sets `project = rawPayload.cwd` (or `workspace_roots[0]`); hook calls `resolveProject({ cwd: event.project, aliases, gitRemoteUrl })` and overwrites before DB insert | Two-stage with the cwd as the carrier | **✓ Recommended** |

**Why Option 3 wins:**

- **Preserves the locked signature** — no third parameter.
- **No sentinel** — `event.project` after the adapter is a real string (the cwd). It's a "draft" project name that's *valid* as-is (cwd basename will resolve eventually) but not the *final* answer. If the hook layer fails to post-process, the field still has reasonable data.
- **First-match resolution still works** — `resolveProject({ cwd, aliases, gitRemoteUrl })` reads its `cwd` parameter from `event.project` (which the adapter populated with the raw cwd). The hook layer:
  1. Receives `event` from adapter.
  2. Reads aliases from `~/.vibetime/config.toml`.
  3. Spawns `git -C <event.project> config --get remote.origin.url` (catches errors, returns null).
  4. Calls `resolveProject({ cwd: event.project, aliases, gitRemoteUrl: <step-3-result> })`.
  5. Overwrites `event.project = <step-4-result>` before `INSERT INTO events`.
- **Adapter is testable in isolation** — no need to mock `child_process` or filesystem. `core` purity preserved.
- **Resolve order is unambiguous** — the hook's pipeline order is documented; adapter's contract is "give me the cwd, I'll handle the rest."

**Implication for the planner:**

- Phase 2 adapter outputs `event.project = raw cwd string` (e.g., `"/Users/barry/work/scenee"`).
- Phase 3 hook applies `resolveProject` post-pass before persisting. This is a Phase 3 plan task — flag it explicitly so the planner doesn't assume the adapter output is final.
- The Cursor `workspace_roots[0]` extraction happens inside the adapter (the adapter knows the vendor schema). After that, all three adapters look identical to the post-pass: a string in `event.project` that needs `resolveProject`-ing.

**Document this contract clearly** in `adapters/index.ts` (or each adapter's docblock):

```typescript
/**
 * Returns a NormalizedEvent whose `project` field is the **raw cwd string**
 * extracted from the vendor payload. The hook layer (Phase 3) is responsible
 * for replacing this with the result of `resolveProject({ cwd, aliases,
 * gitRemoteUrl })` BEFORE persisting to SQLite. See PRD §6 + DEC-010.
 *
 * If you persist the event without that post-pass, you'll write the raw cwd
 * (e.g., '/Users/barry/work/scenee') instead of an alias / git-remote /
 * basename. Tests in this file verify the raw cwd shape; integration tests
 * in `packages/hook/` will verify the post-pass.
 */
```

**Adversarial: what about a Cursor `workspace_roots: []` empty array?** The adapter has no cwd to put in `project`. Two sub-options:
- (a) Return null (skip the event entirely). **Loses real data — the session/turn DID happen.**
- (b) Return event with `project = ""`. `resolveProject({ cwd: "", ... })` → `"_unknown"` (already verified in `project.test.ts`). **Preserves the event, marks the project as unknown.**

**Recommend (b)** — matches the PRD §6 directive *"If `cwd` is missing or unresolvable, write `project = "_unknown"` and continue. Never throw from a hook."* The adapter does step 1 of the contract (extract); `resolveProject` does step 2 (fall back to `_unknown`). Either way, the event is recorded. **This is the strongest argument for Option 3** — empty `workspace_roots` becomes a non-event in the architecture, no special-casing needed.

---

## §E. `ts` and `timezone` Conventions

**`ts: number`** — epoch seconds, fractional. Compute via `Date.now() / 1000`. **At adapter call time, not at module load time.** Capturing in module scope would be a subtle bug — Vitest caches modules, so a long-running watch session would freeze `ts` to load time.

```typescript
const ts = Date.now() / 1000   // inside the function body, every call
```

Test pattern (deterministic):

```typescript
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-28T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

// ... event = adapter(payload, 'UserPromptSubmit')
// expect(event!.ts).toBe(1761739200)   // exact, deterministic
```

Test pattern (tolerant — for tests that don't care about the exact value):

```typescript
const before = Date.now() / 1000
const event = adapter(payload, 'UserPromptSubmit')
const after = Date.now() / 1000
expect(event!.ts).toBeGreaterThanOrEqual(before)
expect(event!.ts).toBeLessThanOrEqual(after)
```

**`timezone: string`** — IANA name. Compute via `Intl.DateTimeFormat().resolvedOptions().timeZone`.

```typescript
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone   // e.g., "America/New_York"
```

**`Intl` availability under `core/tsconfig.json#types: []`.** Verified: `Intl` is part of ECMAScript built-ins (lib.es2017.intl, lib.es2018.intl, etc.), not Node-specific. The `lib` field in `tsconfig.base.json` (Phase 1 shipped this with `"lib": ["ES2022"]`) includes `Intl`. **No `@types/node` required.** [VERIFIED: TS lib reference + Phase 1 `tsconfig.base.json` already supports `Intl` for `resolveProject`'s string operations.]

**Future-extensibility note:** PRD §12 allows the user to override timezone via `~/.vibetime/config.toml#display.timezone`. The adapter does NOT read that — it always emits the system timezone. The `desktop` package applies the user override at *display* time. This separation keeps `core` free of config-file knowledge.

---

## §F. Validation Architecture (Nyquist Dimension 8)

> Phase 1 RESEARCH.md included a Validation Architecture section. Phase 2 follows suit unless `.planning/config.json` opts out. No `.planning/config.json` exists at this repo (verified) — assume Nyquist is **enabled** per default-on rule.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 (pinned per D-TEST) |
| Config file | `packages/core/vitest.config.ts` (already shipped Phase 1) |
| Quick run command | `pnpm --filter @vibetime/core test` |
| Watch | `pnpm --filter @vibetime/core test --watch` |
| Full suite (root) | `pnpm run ci` (runs lint + typecheck + test across all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| ADPT-01 | Claude Code: 4 happy-path mappings + 6 adversarial + property | unit | `pnpm --filter @vibetime/core test claude-code` | ❌ Wave 0 |
| ADPT-02 | Codex: 3 happy-path mappings + 7 adversarial (incl. SessionEnd→null) + property | unit | `pnpm --filter @vibetime/core test codex` | ❌ Wave 0 |
| ADPT-03 | Cursor: 4 happy-path + 6 adversarial (incl. workspace_roots:[] case) + property + model-omitted-vs-present pair | unit | `pnpm --filter @vibetime/core test cursor` | ❌ Wave 0 |
| ADPT-04 | All three covered by PRD-Appendix-derived fixtures | unit | `pnpm --filter @vibetime/core test adapters` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @vibetime/core test` (whole core package; ~50 tests after Phase 2)
- **Per wave merge:** `pnpm run ci` (full repo lint + typecheck + test)
- **Phase gate:** `pnpm run ci` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/core/src/adapters/claude-code.ts` — implementation skeleton
- [ ] `packages/core/src/adapters/claude-code.test.ts` — covers ADPT-01
- [ ] `packages/core/src/adapters/codex.ts`
- [ ] `packages/core/src/adapters/codex.test.ts` — covers ADPT-02
- [ ] `packages/core/src/adapters/cursor.ts`
- [ ] `packages/core/src/adapters/cursor.test.ts` — covers ADPT-03 + ADPT-04
- [ ] `packages/core/src/adapters/index.ts` — re-exports the three adapters
- [ ] Update `packages/core/src/index.ts` to re-export `adapters/index.ts`
- [ ] **No** new test framework / no new dependencies / no new tsconfig — Phase 1 infrastructure already supports this work.

### Property test sketch (zero-dep, no `fast-check`)

```typescript
function mutate<T extends object>(obj: T): unknown {
  const r = Math.random()
  if (r < 0.2) return null
  if (r < 0.3) return undefined
  if (r < 0.4) return 'string'
  if (r < 0.5) return 42
  // copy + delete a random key
  const out: Record<string, unknown> = { ...obj }
  const keys = Object.keys(out)
  if (keys.length > 0 && Math.random() < 0.5) {
    delete out[keys[Math.floor(Math.random() * keys.length)]!]
  }
  // copy + corrupt a random key
  if (keys.length > 0 && Math.random() < 0.5) {
    const k = keys[Math.floor(Math.random() * keys.length)]!
    out[k] = Math.random() < 0.5 ? null : 12345
  }
  return out
}

it('never throws across 200 random mutations', () => {
  const happy = { session_id: 'abc', cwd: '/x', hook_event_name: 'UserPromptSubmit', prompt: 'hi' }
  for (let i = 0; i < 200; i++) {
    expect(() => adaptClaudeCode(mutate(happy), 'UserPromptSubmit')).not.toThrow()
    expect(() => adaptClaudeCode(happy, mutateEventName())).not.toThrow()
  }
})
```

---

## §G. Pitfalls

### G.1 Capturing `Date.now()` outside the function body

**What goes wrong:** declaring `const ts = Date.now() / 1000` in module scope freezes `ts` to module-load time. All events from that adapter then carry the same `ts`, breaking ordering and turn-end pairing.

**Why it happens:** intuitive performance optimization ("compute it once") that's wrong here.

**How to avoid:** `Date.now()` MUST be inside the adapter function body. Add a comment: `// ts at call time — not module scope`. **Lint rule** would be ideal but Biome's rule set doesn't have a clean way to detect this — manual review + the tolerance assertion in the test (`expect(ts).toBeGreaterThanOrEqual(before)`) catches it.

### G.2 Sharing parsing helpers across adapters

**What goes wrong:** "DRY" instinct extracts `extractCwd(p)` or a shared event-type lookup table. Then a vendor-specific quirk (e.g., Cursor's `workspace_roots`) leaks into every adapter, or a vendor-name change cascades to siblings.

**Why it happens:** the three adapters look 80% similar. The 20% that differs is exactly where coupling burns.

**How to avoid:** **per-adapter parsers; no shared util in `core/adapters/`.** If duplication grows past ~10 LOC, extract VERY carefully — and only if the extracted helper is *not* vendor-specific (e.g., `isObject(p): p is object` is fine; `extractCwd(p): string | null` is not).

### G.3 Implicit `any` from `rawPayload: unknown`

**What goes wrong:** adapter writes `rawPayload.cwd` directly. TS strict catches it, but a careless `(rawPayload as any).cwd` slips through.

**How to avoid:** **type-guard helpers per adapter** (`hasRequired(p): p is { session_id: string; cwd: string }`). Use `as { cwd?: unknown }` for one-off extractions, never `as any`. Biome catches `any`-casts but a project rule enforcing this would be cleaner — leave for a follow-up; the strict-mode flags from `D-TS-STRICTNESS` already give 95% coverage.

### G.4 Cursor `workspace_roots: []` (empty array)

**What goes wrong:** `workspace_roots[0]` returns `undefined`; if the adapter doesn't guard, `event.project = undefined` violates the type. Or the adapter returns `null` and silently loses a real event.

**How to avoid (recommended):** explicit guard:

```typescript
const ws = (rawPayload as { workspace_roots?: unknown }).workspace_roots
const cwd = Array.isArray(ws) && typeof ws[0] === 'string' ? ws[0] : ''
```

**`cwd = ""` flows through Phase 3 `resolveProject` → `_unknown`.** Event is preserved; project is correctly marked unknown. Test name should be `cursor: workspace_roots empty array → event with cwd=''` to make the contract visible.

### G.5 Codex `SessionEnd` MUST be a banned event name

**What goes wrong:** Codex doesn't emit `SessionEnd`. If a future-vendor change starts emitting it but with a different payload, the adapter would map it incorrectly. Or worse — a misconfigured hook script feeds `eventName === "SessionEnd"` into the Codex adapter, and the adapter happily produces a session_end event with no actual session-end semantics.

**How to avoid:** Codex `EVENT_TYPES` lookup table **explicitly omits** `SessionEnd`. Test asserts `adaptCodex(validPayload, 'SessionEnd') === null`. Hook layer (Phase 3) handles process-exit synthesis as `meta.reason = "process_exit"` — that is NOT the adapter's job.

### G.6 Forgetting to wrap in `try/catch`

**What goes wrong:** explicit type guards are correct for documented inputs, but an exotic Proxy with throwing getters bypasses them. `resolveProject` already wraps; consistency demands adapters do too.

**How to avoid:** **single outer `try { ... } catch { return null }`** wraps the entire adapter body. Comment must explain it's belt-and-braces, not redundant — same comment style as `resolveProject`. Test with a Proxy fixture that throws on property access:

```typescript
const evilPayload = new Proxy({}, {
  get() { throw new Error('boom') },
  has() { return true },
})
expect(() => adaptClaudeCode(evilPayload, 'UserPromptSubmit')).not.toThrow()
expect(adaptClaudeCode(evilPayload, 'UserPromptSubmit')).toBeNull()
```

### G.7 `turn_id` derivation collisions for Claude Code

**What goes wrong:** PRD §8 derives `turn_id` as `${session_id}-${ts}`. If two `UserPromptSubmit` events fire within the same second (e.g., agent rapid-prompts), `Math.floor(ts)` collisions produce duplicate `turn_id`s.

**Why it happens:** `ts` is a fractional second; `${session_id}-${ts}` includes the fraction so collisions are extremely rare (microsecond resolution from `Date.now()`). But if a future change quantizes `ts`, this becomes a real bug.

**How to avoid:** **use the unrounded `ts`** in the template literal (`${session_id}-${ts}` not `${session_id}-${Math.floor(ts)}`). `ts` carries millisecond resolution from `Date.now() / 1000`, so `${ts}` produces e.g. `"abc-1761739200.123"` — collision-resistant for human-paced agent turns. **Add a test** that two adapter calls with the same `session_id` and `vi.advanceTimersByTime(1)` produce different `turn_id`s.

### G.8 `meta` field shape drift

**What goes wrong:** future vendor changes add new fields. If the adapter aggressively whitelists, real data is lost; if it aggressively passes through, schema drift contaminates `meta` with vendor noise.

**How to avoid (V0 stance):** **whitelist what V0 needs** (`model`, `source`, `reason`, `prompt` truncated to 500 chars or omitted). Anything else is dropped. Document this — Phase 3+ can revisit. **Don't** spread `...rawPayload` into `meta`. The PRD §6 `meta` column is reserved for forward extensibility, not vendor data dumps.

---

## §H. Project Constraints (from CLAUDE.md)

This repo has no `./CLAUDE.md`. The user's global CLAUDE.md applies (中文 output, RTK token-optimization, first-principles thinking) but does not impose code-level constraints on this phase. **No additional Project Constraints to surface.**

---

## Architecture Patterns

### File layout (per D-LAYOUT)

```
packages/core/src/
├── index.ts                       # add: re-export adapters/index.ts
├── events.ts                      # already shipped (NormalizedEvent + AdapterFn)
├── project.ts                     # already shipped (resolveProject + parseGitRemoteUrl)
├── project.test.ts                # already shipped
├── schema.ts                      # already shipped (DDL)
├── schema.test.ts                 # already shipped
└── adapters/
    ├── index.ts                   # re-exports the three adapter functions
    ├── claude-code.ts             # adaptClaudeCode: AdapterFn
    ├── claude-code.test.ts
    ├── codex.ts                   # adaptCodex: AdapterFn
    ├── codex.test.ts
    ├── cursor.ts                  # adaptCursor: AdapterFn
    └── cursor.test.ts
```

**No `__fixtures__/` directory** — fixtures inlined in test files (~30 inline fixtures total stays manageable).

### Public API additions (`packages/core/src/index.ts`)

```typescript
export { adaptClaudeCode } from './adapters/claude-code.js'
export { adaptCodex } from './adapters/codex.js'
export { adaptCursor } from './adapters/cursor.js'
```

Or, more centralized:

```typescript
export * as adapters from './adapters/index.js'
// Usage: adapters.claudeCode(payload, eventName)
```

**Recommend per-function named exports** (consistent with how `resolveProject` is exported). The namespace export adds an indirection level for a tiny aesthetic win.

---

## Sources

### Primary (HIGH confidence)

- **Claude Code hooks docs** — `https://code.claude.com/docs/en/hooks` — full event reference incl. SessionStart/SessionEnd/UserPromptSubmit/Stop payload schemas. [VERIFIED 2026-04-28]
- **Cursor hooks docs** — `https://cursor.com/docs/hooks` — base schema + per-event references for sessionStart/sessionEnd/beforeSubmitPrompt/stop. [VERIFIED 2026-04-28]
- **Codex CLI hooks docs** — `https://developers.openai.com/codex/hooks` — common fields, event-specific schemas, `[features] codex_hooks = true` config flag. [VERIFIED 2026-04-28]
- **Codex schema repo** — `https://github.com/openai/codex/tree/main/codex-rs/hooks/schema/generated` — confirms NO `session-end.command` schema published. [VERIFIED 2026-04-28]
- **vibetime PRD** — `/Users/barry/Documents/Project/i/vibetime/vibetime-prd.md` §8, §13, Appendix.
- **packages/core/src/events.ts** — locked `NormalizedEvent` + `AdapterFn` signature.
- **packages/core/src/project.ts** — `resolveProject` reference for the belt-and-braces pattern.
- **.planning/DECISIONS.md** — Phase 1 D-TEST Vitest 3.2.4 pin, D-LAYOUT, D-TS-STRICTNESS.

### Secondary (MEDIUM confidence)

- **InfoQ — "Cursor 1.7 Adds Hooks for Agent Lifecycle Control"** — `https://www.infoq.com/news/2025/10/cursor-hooks/` — confirms Cursor hooks are GA since Oct 2025.
- **GitHub issue openai/codex#15266** — `UserPromptSubmit` and `SessionStart` firing simultaneously on first prompt. Vendor-known quirk.
- **GitHub issue openai/codex#19199** — Codex CLI 0.124.0 fails to start when hook config is present. Phase-3 install task concern, not Phase-2.

### Tertiary (LOW — kept for context)

- Cursor community forum threads on hook capabilities — corroborate the field set but no new contracts to read.

---

## Confidence Breakdown

| Area | Level | Reason |
|------|-------|--------|
| Claude Code event names + fields | HIGH | Official docs verbatim, all 4 events + their payloads inspected. |
| Codex event names + fields | HIGH | Official docs + GitHub schema directory cross-confirm; `SessionEnd` absence verified twice. |
| Cursor event names | HIGH | Official docs explicit on all 4 names. |
| Cursor `model` field on session events | MEDIUM | Doc asymmetry — base schema claims universal, per-event refs omit. **Recommendation: extract opportunistically.** |
| Adapter step template (§C) | HIGH | Mirrors shipped `resolveProject` pattern; same TS strictness flags apply. |
| Responsibility split (§D) | HIGH | Only Option 3 preserves the locked DEC-011 signature; tradeoff analysis is clean. |
| Pitfalls | HIGH | Six of seven are pattern-extracted from `resolveProject` review; G.4 (`workspace_roots: []`) is novel-to-this-phase but trivially demonstrable. |
| Fixture strategy | HIGH | PRD Appendix supplies 3 of 11 happy-path fixtures verbatim; the other 8 are mechanical assemblies from the documented common-fields. |

---

## Assumptions Log

> All claims tagged `[ASSUMED]` in this research. Empty table = all claims verified or cited.

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| (none — all critical claims are [VERIFIED] or [CITED]) | | | |

> **Note:** A2 (Codex `model` field always present on `SessionStart`) is MEDIUM confidence in the source hierarchy — flagged as a *confidence-level* concern, not an assumption. The adapter handles both presence and absence opportunistically, so wrong-vs-right doesn't change the implementation.

---

## Open Questions for Planner

> Small list — Phase 2 is mostly constrained.

1. **`meta` whitelist policy** — V0 stance is "extract `model`, `source`, `reason`, drop `prompt`/`status`/`stop_reason`/etc." Is this acceptable, or should the planner explicitly enumerate? Recommend: enumerate per-event in the adapter, document as `// V0: extract <fields>; future: revisit`.
2. **Cursor `workspace_roots: []` test name** — recommend `cursor: workspace_roots empty array → event with cwd=''`. Planner picks the wording.
3. **Property-test seed** — non-deterministic by default; should we seed `Math.random()` for reproducibility (e.g., a fixed `mulberry32` PRNG, ~10 LOC inline)? Recommend yes for CI stability — flaky tests ruin trust faster than missed fuzz coverage.
4. **`adapters/index.ts` style** — per-function named exports or namespace export? Recommend per-function (consistent with shipped Phase 1 exports), but planner can flip if there's a Phase 3+ taste reason.

---

## Metadata

- **Research date:** 2026-04-28
- **Valid until:** 2026-06-12 (6 weeks; vendor docs are the volatile dimension; PRD §8 directs us to re-verify on next adapter touch regardless)
- **File:** `/Users/barry/Documents/Project/i/vibetime/.planning/phases/02-agent-adapters-core/02-RESEARCH.md`

---

## 中文摘要 (for the user)

**结论：PRD §8 表格全数对得上 2026-04-28 当前文档**，仅一处 Cursor `model` 字段在 `sessionStart`/`sessionEnd` 文档示例中缺失，但基础 schema 声称所有 hook 都带 `model` —— 文档自相矛盾。**采纳建议：adapter 按"有则取，无则略"处理 `model`**，与 PRD §8 "verify W1; if absent, omit" 完全一致。

**架构关键发现 (§D)：** 由于 adapter 签名 `(payload, eventName)` 已锁定不能加第三参数 `gitRemoteUrl`，**adapter 输出的 `event.project` 字段先填原始 `cwd` 字符串**（Cursor 取 `workspace_roots[0]`），Phase 3 hook 层在 `INSERT INTO events` 之前调用 `resolveProject({ cwd, aliases, gitRemoteUrl })` 改写为最终值。这保留了纯函数契约，避免了 sentinel 值，且对 Cursor `workspace_roots: []` 退化为 `cwd=""` → `_unknown` 的处理路径自然顺畅。Planner 必须把"hook 层 post-pass"作为 Phase 3 任务明文标出。

**实施量级：** 三个 adapter 文件 + 三个测试文件 + 一个 `adapters/index.ts` + 主入口加三行 export = ~7 个新文件，≤ 800 LOC（含测试），无新依赖、无新工具链。Phase 1 已经把所有基础设施（vitest、TS 严格模式、`exactOptionalPropertyTypes`）就位。

**风险点：** Codex `SessionEnd` 须在 adapter 内被显式禁用（`EVENT_TYPES` 表中不列），防止误传后污染数据；以上 §G.5 已专门列出。
