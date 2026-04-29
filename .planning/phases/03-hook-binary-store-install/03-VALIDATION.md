---
phase: 3
slug: hook-binary-store-install
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun test (hook) + shell scripts (integration) |
| **Config file** | `packages/hook/bunfig.toml` |
| **Quick run command** | `pnpm run ci` |
| **Full suite command** | `pnpm run ci` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run ci`
- **After every plan wave:** Run `pnpm run ci`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 03-01-T1 | 01 | 1 | FS-01 | unit | `bun test packages/hook/src/fs.test.ts` | ⬜ pending |
| 03-01-T2 | 01 | 1 | FS-02, FS-03, HOOK-03 | unit | `bun test packages/hook/src/config.test.ts` | ⬜ pending |
| 03-01-T3 | 01 | 1 | FS-01 | unit | `bun test packages/hook/src/index.test.ts` | ⬜ pending |
| 03-02-T1 | 02 | 1 | STORE-01, STORE-02, STORE-03 | unit | `bun test packages/hook/src/store.test.ts` | ⬜ pending |
| 03-03-T1 | 03 | 2 | HOOK-01, HOOK-02, HOOK-04 | unit | `bun test packages/hook/src/hook.test.ts` | ⬜ pending |
| 03-03-T2 | 03 | 2 | REC-01, REC-02 | unit | `bun test packages/hook/src/recovery.test.ts` | ⬜ pending |
| 03-04-T1 | 04 | 2 | CLI-01, CLI-02 | unit | `bun test packages/hook/src/install.test.ts` | ⬜ pending |
| 03-04-T2 | 04 | 2 | CLI-01, CLI-02 | unit | `bun test packages/hook/src/cli.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/hook/src/*.test.ts` — test stubs co-located with source
- [ ] `tests/hook-integration.sh` — shell script for E2E hook testing
- [ ] `tests/install-integration.sh` — shell script for install idempotency testing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cold start <50ms | HOOK-01 | Timing varies by machine | Run `time vibetime-hook` 10 times, check p95 |
| Hook silence (no stdout/stderr) | HOOK-02 | Requires capturing process output | Run hook, verify empty stdout/stderr |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved 2026-04-29}
