# Phase 1: Foundations & Decisions Gate — Research

**Researched:** 2026-04-28
**Domain:** monorepo scaffolding, TypeScript tooling, dependency-purity enforcement, process gate (DECISIONS.md)
**Confidence:** HIGH (PRD locks the architecture; the open §16 questions are tooling choices with mature, well-documented answers)

---

## User Constraints (from PROJECT.md / decisions.md / constraints.md)

> Phase 1 has no separate `CONTEXT.md` (no `/gsd-discuss-phase` was run before this research). The constraint set below is lifted verbatim from the locked PRD/PROJECT block — Phase 1 must respect every item.

### Locked Decisions (must obey, do NOT relitigate)
- **DEC-001** Electron shell (no Tauri/Rust). [Phase 4+]
- **DEC-002** React 18 + TS + Tailwind v4 + coss ui + ECharts v6 + Jotai. [Phase 4+]
- **DEC-003** Hook runtime is a separate Bun-compiled CLI binary (`vibetime-hook`). [Phase 3]
- **DEC-004** Two-binary distribution; both read the same SQLite WAL file. [Phase 6]
- **DEC-005** SQLite via `bun:sqlite` (hook) and `better-sqlite3` (Electron main); WAL + standard PRAGMAs. [Phase 3+]
- **DEC-006** Three-package monorepo: `core` / `hook` / `desktop`. **`core` is pure TS — zero UI / runtime / `fs` / DB-client deps.** [Phase 1 — THIS phase enforces it]
- **DEC-007** Renderer never opens SQLite directly; IPC-only. [Phase 4]
- **DEC-009** `events` + `open_turns` schema verbatim per PRD §6, indices on `ts`/`project`/`(agent,project)`/`session_id`, `schema_version=1`, no migrations. [Phase 1 ships DDL constants]
- **DEC-010** First-match project resolution: alias → git remote (SSH+HTTPS, strip `.git`) → `path.basename(cwd)` → `"_unknown"`. Never throws. [Phase 1 ships function]
- **DEC-011** Adapter signature `(rawPayload, eventName) => NormalizedEvent | null`, pure, never throws. [Phase 1 ships type; Phase 2 ships impls]
- License: **MIT** (locked).

### Claude's Discretion (this phase commits these in DECISIONS.md)
- Monorepo tool, TypeScript config strategy, lint tool, test runner, zero-dep enforcement strategy, intra-package directory layout, project-resolution implementation approach (regex-only vs library), DECISIONS.md structure.

### Deferred Ideas (DECISIONS.md may mark `TBD by Phase X`, NOT decided in Phase 1)
- IPC method signatures (Phase 4)
- Animation library for Live view (Phase 5)
- Packaging tool — electron-builder vs electron-forge (Phase 6)
- Ad-hoc signing scripting (Phase 6)
- Apple Developer enrollment is **NOT required** — V0 ships ad-hoc signed (locked).

---

## Phase Requirements

| ID | Description (verbatim from REQUIREMENTS.md) | Research Support |
|----|---------------------------------------------|------------------|
| **PROC-01** | `.planning/DECISIONS.md` exists, captures every PRD §16 delegated decision, user-approved before any implementation. | §G below specifies the decision matrix and gate mechanics. |
| **FND-01** | Three-package monorepo; `core` zero deps (enforced by lint or test). | §A (pnpm workspaces) + §E (dependency-cruiser + empty `dependencies` field). |
| **FND-02** | `core` exports `NormalizedEvent` interface and adapter signature, pure / never throws. | §B (TS strict + project refs) gives type-system guarantee. |
| **FND-03** | `core` exports DDL constants for `events` + `open_turns` matching PRD §6 verbatim, `schema_version=1`. | DDL strings copied verbatim from constraints.md (§ "Code Examples"). |
| **FND-04** | `core` exports project-resolution function, first-match alias → git remote → cwd basename → `"_unknown"`, never throws. | §F (hand-rolled regex matrix). |
| **FND-05** | Lint, type-check, test scripts run from repo root and pass on a clean checkout. | §C (Biome) + §D (Vitest) + pnpm scripts. |
| **FND-06** | MIT `LICENSE` at repo root. | Mechanical — reproduce SPDX MIT template, copyright "Barry <barry@yct.ee>" 2026. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `NormalizedEvent` type + adapter signature | `core` | — | Shared contract across both binaries (DEC-006). |
| SQL DDL constants (events / open_turns) | `core` | — | DDL is a string constant — it is data, not behavior; both `hook` and `desktop` execute it against their respective drivers. |
| Project resolution function | `core` | — | Pure function — git URL parsing is string manipulation; running `git config` is the *caller*'s job (in `hook`/`desktop`), `core` only ingests an already-fetched URL string. |
| Process spawning to fetch `git remote.origin.url` | `hook`/`desktop` | — | `core` cannot import `child_process` (zero-runtime-dep rule). The "first-match resolver" in `core` accepts a `gitRemoteUrl?: string` argument; the runtime caller fetches it. |
| Filesystem access (read alias config) | `hook`/`desktop` | — | Same reason — `core` cannot import `fs`. `core` exposes `resolveProject({ cwd, alias?, gitRemoteUrl? })`. |
| Lint / type-check / test orchestration | repo root (pnpm + Biome + Vitest + tsc + dependency-cruiser) | — | Workspace-level scripts. |

> **Critical insight for the planner:** the project-resolution function in `core` MUST be pure — accepting **already-resolved inputs** (cwd string, optional alias map, optional git URL string). The actual `child_process.execFile('git', ['-C', cwd, 'config', '--get', 'remote.origin.url'])` call lives in `hook`/`desktop`, NOT in `core`. Otherwise `core` violates the zero-runtime-dep rule (it would need to import `node:child_process` and `node:fs`).

---

## Summary

Phase 1 is a scaffolding + decisions-gate phase. The PRD locks the macro architecture (Electron + Bun hook + three-package monorepo with pure `core`); the open questions are *which tools* to scaffold with. The 2026 ecosystem has converged on a "blessed" answer for every dimension this phase touches:

- **Monorepo:** pnpm workspaces (most ecosystem-mature, native-module-friendly for `better-sqlite3`/Electron, the only manager battle-tested across React/Next/Electron/Bun-binary mixed stacks).
- **TypeScript:** project references with a `tsconfig.base.json` + per-package `tsconfig.json`, `strict: true`, `noUncheckedIndexedAccess: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`.
- **Lint/format:** Biome 2.x — single tool, ~50× faster than ESLint+Prettier, native monorepo support since v2.
- **Test runner:** Vitest 3.x for `core` (Node-runnable; ensures `core` is genuinely runtime-agnostic). Phase 3 chooses separately for `hook` (likely `bun test` against `bun:sqlite`).
- **Zero-dep enforcement:** dependency-cruiser config + an empty `dependencies` field in `packages/core/package.json` + a CI check that the field is `{}`. Belt-and-braces.
- **Git URL parsing:** hand-rolled regex (≤30 LOC) — keeps `core` zero-runtime-dep. Test fixture matrix covers SSH, HTTPS, with/without `.git`, GitHub/GitLab/Bitbucket hostnames.
- **DECISIONS.md gate:** stop-and-wait — write the file, present diff, await user "approved" reply before any non-scaffolding code.

**Primary recommendation:** Scaffold with `pnpm` + `tsc` project references + Biome + Vitest + dependency-cruiser. Commit the scaffolding first; produce DECISIONS.md second; **stop** for user approval; only then ship the `core` library code.

---

## Open Decision A — Monorepo Tooling

**Recommendation: pnpm workspaces 10.x (latest: 10.33.2 [VERIFIED: npm view pnpm version])**

The repo ships TWO runtimes — Bun (hook) and Node/Electron (desktop) — plus a pure-TS `core`. pnpm is the only package manager with **proven native-module support for Electron + better-sqlite3** combined with **mature monorepo features** [CITED: pkgpulse.com/guides/pnpm-vs-bun-2026]. Vercel, Vue core, and Prisma all migrated *to* pnpm in 2025-2026 [CITED: dev.to/pockit_tools/pnpm-vs-npm-vs-yarn-vs-bun-the-2026-package-manager-showdown-51dc]. Bun's `bun build --compile` works perfectly fine when invoked against a pnpm workspace — Bun reads the `core` package via `workspace:*` resolution the same way it reads its own workspaces [CITED: bun.com/docs/guides/install/workspaces]. The user's local pnpm is 9.9.0 [VERIFIED: `pnpm --version` on this machine] — they should bump to 10.x to match locked-decisions in DECISIONS.md.

**Alternatives considered:**
- **Bun workspaces:** functional but immature for native modules and Electron toolchains; would force the desktop package to use Bun for install while electron-builder ecosystem assumes pnpm/npm/yarn lockfiles.
- **npm workspaces:** works, but slower; flatter store; weaker isolation; no real benefit over pnpm.
- **Turborepo overlay:** unnecessary complexity for 3 packages and a 5-week budget. Add later if needed.
- **Nx:** vastly over-engineered for this scope.

**Risk notes:**
- `pnpm-lock.yaml` must be committed.
- Add `.npmrc` with `auto-install-peers=true` and `node-linker=isolated` (default) so `core` stays isolated.
- electron-builder works with pnpm but needs `node-linker=hoisted` for the `desktop` package OR an `electron-builder.yml` that handles symlinks; defer to Phase 6.

---

## Open Decision B — TypeScript Configuration

**Recommendation: `tsconfig.base.json` at root + per-package `tsconfig.json` with project references; strict everywhere; `module: "NodeNext"`.**

Every modern monorepo guide for 2026 converges on this exact shape [CITED: nx.dev/blog/managing-ts-packages-in-monorepos, totaltypescript.com/books/total-typescript-essentials/configuring-typescript, reintech.io/blog/how-to-configure-tsconfig-json-best-practices-2026]. Project references give incremental builds, enforce package boundaries at the type-checker level (you cannot accidentally import from a package not declared in `references`), and let `tsc -b` build all three packages in dependency order. Strict TypeScript catches bugs that match the PRD's "never throws" contract — `noUncheckedIndexedAccess` in particular catches the exact class of bug that would make an adapter throw on `payload.workspace_roots[0]` when the array is empty.

**Concrete config:**

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  }
}
```

```jsonc
// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": []                  // ← critical: NO @types/node, NO DOM
  },
  "include": ["src/**/*"],
  "references": []
}
```

`"types": []` is the **single line that mechanically forces `core` to stay runtime-agnostic** — it removes the ambient `node` and `dom` typings, so `process`, `fs`, `Buffer`, `window`, `document` all become unknown identifiers. If `core` needs *anything* runtime-specific, the type error appears immediately.

**Consumption strategy: source-only via TS path mapping in dev, prebuilt `dist` for production builds.**
- Dev: `desktop` and `hook` import from `@vibetime/core` and pnpm symlinks the package; TS path mapping resolves to `packages/core/src` so HMR works.
- Build: `tsc -b` compiles `core` → `dist`; downstream packages import the compiled `dist` (matches `package.json#exports`).
- Bun's `bun build --compile` for the hook just inlines everything — works either way [CITED: bun.com/blog/bun-v1.2.23].

**Alternatives considered:**
- Single root tsconfig: simpler but loses incremental build benefits and the `types: []` enforcement for `core`.
- `module: "ESNext"`: forces a bundler dependency; `NodeNext` works directly under both Node and Bun.

**Risk notes:**
- `verbatimModuleSyntax: true` requires all type-only imports to use `import type` syntax — minor boilerplate, big payoff for tree-shaking.
- `composite: true` requires `declaration: true` (already set).

---

## Open Decision C — Linting & Formatting

**Recommendation: Biome 2.4.x (latest: 2.4.13 [VERIFIED: npm view @biomejs/biome version]) — single tool, JSON-config, native monorepo support since v2.**

Biome replaces ESLint + Prettier with one binary that lints AND formats, ~50× faster than the ESLint+Prettier stack on equivalent rule sets [CITED: dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m, biomejs.dev/guides/big-projects]. Biome 2 supports monorepos out of the box via nested config files with `"root": false` and `"extends": "//"` microsyntax [CITED: biomejs.dev]. Phase 1 has no React code yet (renderer arrives in Phase 4), so the historical ESLint advantage of "more rules" does not apply here. When React arrives, Biome's `react/*` rule set covers the basics; if a specific React rule is missing, ESLint can be added incrementally as a *complement* without removing Biome.

**Concrete config:**

```jsonc
// biome.json (root)
{
  "$schema": "https://biomejs.dev/schemas/2.4.0/schema.json",
  "files": { "ignoreUnknown": true },
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "useImportType": "error" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

**Alternatives considered:**
- ESLint v9 flat config: more mature rule ecosystem but ~50× slower; two tools (ESLint + Prettier) instead of one; the user's velocity bar (5 weeks) makes Biome a clear win.
- Oxc-lint: faster than Biome but less mature; rules are still being ported; risky for V0.

**Risk notes:**
- A small number of community ESLint plugins have no Biome equivalent (e.g., `eslint-plugin-react-hooks/exhaustive-deps`). Add a thin ESLint layer in Phase 4 if needed.
- Biome formats import order differently than Prettier — flag for the user during the DECISIONS gate so they're not surprised.

---

## Open Decision D — Test Runner

**Recommendation: Vitest 4.x (latest: 4.1.5 [VERIFIED: npm view vitest version]) for `core` and (Phase 2) the adapter tests.**

Vitest is the de-facto TS test runner in 2026, with workspace support migrated into the new "projects" config (replacing the deprecated `workspace` field as of v3.2) [CITED: vitest.dev/guide/projects]. Crucially, Vitest runs under **Node** — which means `core`'s tests prove `core` works under Node's lifecycle. If we used `bun test` for `core`, we'd accidentally rely on Bun-specific globals and `core` would silently break under Electron's main process (which is Node). Phase 3's `hook` package can use `bun test` for `bun:sqlite`-touching code; that's a Phase 3 decision and should be recorded as `TBD by Phase 3` in DECISIONS.md.

**Concrete config:**

```jsonc
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] }
  }
})
```

**Alternatives considered:**
- `bun test`: zero-config, fast, but Bun-only — would mask `core`'s portability bugs.
- Jest 30: still works but slower, more config, ecosystem momentum has shifted to Vitest [CITED: pkgpulse.com/blog/vitest-3-vs-jest-30-2026].
- Node's built-in `node:test`: viable but missing matcher ergonomics and watch mode polish.

**Risk notes:**
- Vitest's `vite` peer dep brings in a transitive devDependency tree. That's fine — it's `devDependencies`, not `dependencies`. The zero-dep rule applies to runtime, not test tooling.

---

## Open Decision E — Zero-Dep Enforcement for `core`

**Recommendation: three-layer defense — TypeScript `types: []`, dependency-cruiser config, CI check on `package.json#dependencies`.**

The user's PRD treats `core` purity as **non-negotiable**. A single mechanism is fragile; layered checks are cheap. Each layer catches a different class of mistake:

1. **TypeScript `"types": []` in `packages/core/tsconfig.json`** — catches at *type-check* time. If someone writes `import fs from 'node:fs'`, `fs` is unknown and `tsc` errors. (Cannot catch dynamic `require()`, but `core` is strict TS so dynamic imports require explicit typing.)
2. **dependency-cruiser** (latest: 17.3.10 [VERIFIED: npm view dependency-cruiser version]) — catches at *lint* time. Config rule: `forbidden: [{ from: { path: 'packages/core' }, to: { path: 'node_modules' } }]` and `{ from: { path: 'packages/core' }, to: { path: '^(node:|fs|path|child_process|crypto|os|stream|http|https)' } }` [CITED: github.com/sverweij/dependency-cruiser]. Generates a visual graph (useful for the DECISIONS.md PR review).
3. **CI check on `packages/core/package.json#dependencies`** — catches at *commit* time. A 5-line script: `node -e "const p=require('./packages/core/package.json'); process.exit(Object.keys(p.dependencies||{}).length===0 ? 0 : 1)"`. Fast and unambiguous.

**Why three layers:** dependency-cruiser is the right tool but has known monorepo edge cases with `combinedDependencies` [CITED: github.com/sverweij/dependency-cruiser/issues/859]. The package.json check is mechanical and has zero false positives. The TS `types: []` check catches the most common failure (importing `node:fs`) before any other tool runs.

**Concrete dependency-cruiser config (`.dependency-cruiser.cjs`):**

```js
module.exports = {
  forbidden: [
    {
      name: 'core-must-be-pure',
      severity: 'error',
      comment: 'core has no UI / runtime / fs / DB-client dependencies. DEC-006.',
      from: { path: '^packages/core/' },
      to: {
        path: [
          'node_modules',                               // no third-party
          '^node:',                                     // no node builtins
          '^(fs|path|child_process|os|crypto|http|https|stream|net|dgram|cluster|worker_threads)$',
          '^(electron|react|react-dom|jotai|echarts|tailwindcss|coss-ui)',
          '^(better-sqlite3|bun:sqlite)'
        ]
      }
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true }
    }
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node'] }
  }
}
```

**Alternatives considered:**
- `eslint-plugin-import` `no-restricted-imports`: works but ties enforcement to ESLint (which we are NOT using — we chose Biome). Biome has `noRestrictedImports` natively but the rule is less expressive than dependency-cruiser. Use Biome's rule as a *redundant* fourth layer if desired.
- "Just trust developers": fails the FND-01 "enforced by lint or test" requirement.
- A Vitest test that imports every `core` module and asserts no `process`/`fs`/`window`: works but slow and easy to bypass.

**Risk notes:**
- dependency-cruiser must run in CI (`pnpm depcheck` or similar npm script). If it only runs locally, drift is inevitable.
- The forbidden-paths regex must include both bare-specifier (`fs`) and `node:`-prefixed (`node:fs`) forms.

---

## Open Decision F — Git URL Parsing for Project Resolution

**Recommendation: hand-rolled regex (≤30 LOC) inside `core`, with an exhaustive test fixture matrix.**

`core` must remain zero-runtime-dep, so importing `git-url-parse` (which has its own deps) violates DEC-006. The parsing logic is mechanically simple — three regex patterns cover ≥99% of real-world git remote URLs:

1. **SSH form**: `git@github.com:owner/repo.git` → `/^git@([^:]+):(.+?)(?:\.git)?$/`
2. **HTTPS form**: `https://github.com/owner/repo.git` → `/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/`
3. **`git://` and `ssh://` URI forms**: `ssh://git@github.com/owner/repo.git`, `git://github.com/owner/repo.git` → fall through to a generic URL parser.

GitHub Desktop's open-source TypeScript implementation (MIT-licensed) provides a battle-tested reference [CITED: github.com/desktop/desktop/blob/development/app/src/lib/remote-parsing.ts]. Copy the regex patterns; add a header comment noting the source.

**Test fixture matrix (REQUIRED for FND-04 acceptance):**

| Input | Expected output |
|-------|----------------|
| `git@github.com:owner/repo.git` | `owner/repo` |
| `git@github.com:owner/repo` | `owner/repo` |
| `https://github.com/owner/repo.git` | `owner/repo` |
| `https://github.com/owner/repo` | `owner/repo` |
| `https://gitlab.com/group/sub/repo.git` | `group/sub/repo` (or document a different policy) |
| `ssh://git@github.com:22/owner/repo.git` | `owner/repo` |
| `git@bitbucket.org:owner/repo.git` | `owner/repo` |
| `https://user:token@github.com/owner/repo.git` | `owner/repo` (strip credentials) |
| `not-a-url` | `null` (caller falls through to cwd basename) |
| `""` (empty) | `null` |
| `undefined` | `null` |

**Project-resolution function signature (Phase 1 ships this):**

```ts
// packages/core/src/project.ts
export interface ResolveProjectInput {
  cwd: string
  aliases?: Readonly<Record<string, string>>   // absolute-path → alias-name
  gitRemoteUrl?: string | null                  // result of `git -C cwd config --get remote.origin.url` (caller fetches; null if no remote)
}

export function resolveProject(input: ResolveProjectInput): string {
  // 1. alias  2. git remote owner/repo  3. basename(cwd)  4. "_unknown"
  // Never throws.
}
```

**Why the input is pre-fetched:** `core` cannot import `child_process` (DEC-006). The runtime caller (`hook`/`desktop`) does the spawn-git work; `core` does only the parsing.

**Alternatives considered:**
- `git-url-parse` npm package: has runtime deps (would force `dependencies: {}` in core to grow); dies the moment you publish it via Bun-compile if dep tree is brittle.
- `parse-github-url`: GitHub-only; misses GitLab/Bitbucket/self-hosted.
- Pure URL constructor + manual splitting: works for HTTPS, fails on SSH `git@host:owner/repo` (the colon is not a port).

**Risk notes:**
- GitLab subgroups (`group/sub/repo`) — decide policy: `sub/repo` or `group/sub/repo`? Recommend `group/sub/repo` (most informative). Document in DECISIONS.md.
- Self-hosted Gitea/Forgejo/etc work the same as GitHub for SSH/HTTPS — no special handling needed.

---

## Open Decision G — DECISIONS.md Format & Gate Mechanics

**Recommendation: stop-and-wait gate — Claude writes DECISIONS.md, opens a PR/diff for user review, AWAITS explicit "approved" before any non-scaffolding code is written.**

The PRD §16 gate is the single most important process control in the whole 5-week budget. If decisions slip past it un-reviewed, every later phase carries un-relitigated assumptions. Phase 1 plans MUST mechanically enforce the gate.

**DECISIONS.md required sections (every PRD §16 item gets a row):**

| ID | Decision | Choice | Rationale (1 sentence) | Decided in Phase | Status |
|----|----------|--------|------------------------|------------------|--------|
| D-MONO | Monorepo tool | pnpm workspaces 10.x | Most mature; native-module + Electron + Bun-binary tested. | 1 | proposed |
| D-TS | TS strategy | project refs + base config + `types: []` for core | Catches `core` purity at type-check time. | 1 | proposed |
| D-LINT | Lint/format | Biome 2.4 | Single tool; ~50× faster; monorepo-native. | 1 | proposed |
| D-TEST | Test runner (`core`) | Vitest 4 | Node-runnable; ensures `core` portability. | 1 | proposed |
| D-DEPCHECK | Zero-dep enforcement | TS `types:[]` + dependency-cruiser + package.json check | Three layers; cheap; covers all failure modes. | 1 | proposed |
| D-LAYOUT | Per-package directory layout | `packages/{core,hook,desktop}/src/...` (see §"Project Structure") | Standard pnpm workspace layout. | 1 | proposed |
| D-GITPARSE | Git URL parsing | Hand-rolled regex in `core` | Zero-runtime-dep; ≤30 LOC; reference: GitHub Desktop. | 1 | proposed |
| D-IPC | IPC method signatures | `TBD by Phase 4` | Wait until Today view requirements drive the surface. | — | deferred |
| D-ANIM | Live view animation library | `TBD by Phase 5` | Pick after Live view design prototype proves 60fps. | — | deferred |
| D-PKG | Packaging tool | `TBD by Phase 6` | Choose between electron-builder / electron-forge after Phase 5 packaging dry-run. | — | deferred |
| D-SIGN | Ad-hoc signing scripting | `TBD by Phase 6` | Locked: ad-hoc only, not Apple notarization. Scripting choice deferred. | — | deferred |

**Gate mechanics (Phase 1 plan must include this exact sequence):**
1. Scaffold the monorepo (pnpm-workspace.yaml, three empty packages, tsconfig.base, biome.json, vitest.config, dependency-cruiser, MIT LICENSE, root README pointer).
2. Verify all scripts pass (`pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm depcheck`) — even with empty source files (placeholder `index.ts` exporting `{}`).
3. Commit. *(scaffolding only — no domain logic yet)*
4. Write `.planning/DECISIONS.md` with every D-* row above.
5. **STOP.** Print: "DECISIONS.md ready for review. PRD §16 gate is open. Reply `approved` to proceed with `core` library code." Do NOT continue.
6. After approval, ship `core` library code (NormalizedEvent type, adapter signature type, DDL constants, project-resolution function with tests).

**Alternatives considered:**
- Inline DECISIONS in PR description: not durable; future readers won't find it.
- ADR-per-decision (one file per decision in `.planning/adrs/`): heavier; the user's PROJECT.md already serves as the ADR index. Single DECISIONS.md is the right granularity for V0.
- Skip the stop-and-wait and ship code in parallel: violates PROC-01 verbatim.

**Risk notes:**
- The agent must NOT auto-approve its own decisions. The plan-checker should verify the Phase 1 plan contains an explicit "STOP — await user approval" task.
- If the user wants to defer a decision the research recommends locking now, document it as `deferred to Phase X` rather than removing it.

---

## Standard Stack

### Core (root devDependencies)
| Package | Version | Purpose | Why standard |
|---------|---------|---------|--------------|
| pnpm | 10.33.2 | workspace manager | mature isolation; default for Vue/Vercel/Prisma |
| typescript | 6.0.3 | type system + project refs | latest stable; supports verbatimModuleSyntax |
| @biomejs/biome | 2.4.13 | lint + format | single fast tool, monorepo-native |
| vitest | 4.1.5 | test runner | Node-runnable; great TS DX |
| dependency-cruiser | 17.3.10 | dep boundary enforcement | configurable forbidden-paths rules |
| @types/node | 22.x | Node typings (root + hook + desktop only — NOT core) | needed for `child_process`, `fs`, etc. |

### Per-package
- `packages/core/package.json` → `dependencies: {}` (LOCKED EMPTY); `devDependencies: { typescript, vitest }` only.
- `packages/hook/package.json` → `dependencies: { "@vibetime/core": "workspace:*" }`; `devDependencies` adds `@types/bun`, `bun-types`. (Bun-specific deps come Phase 3.)
- `packages/desktop/package.json` → `dependencies: { "@vibetime/core": "workspace:*" }`; React/Electron/etc come Phase 4.

**Installation (Phase 1 commands):**
```bash
# At repo root:
pnpm init
pnpm add -D -w typescript @biomejs/biome vitest dependency-cruiser @types/node
pnpm add -D -w -F core typescript vitest          # only typescript + vitest in core
# Workspace bootstrap:
mkdir -p packages/{core,hook,desktop}/src
# write pnpm-workspace.yaml, tsconfig.base.json, biome.json, .dependency-cruiser.cjs, LICENSE
```

**Version verification:** All four key tool versions verified against the npm registry on 2026-04-28: pnpm 10.33.2, biome 2.4.13, vitest 4.1.5, dependency-cruiser 17.3.10, typescript 6.0.3 [VERIFIED: `npm view ... version`].

---

## Recommended Project Structure

```
vibetime/
├── .planning/                   # GSD-managed; already exists
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── index.ts          # re-exports
│   │   │   ├── events.ts         # NormalizedEvent type, AdapterFn type
│   │   │   ├── schema.ts         # CREATE TABLE DDL constants + index DDL + SCHEMA_VERSION = 1
│   │   │   ├── project.ts        # resolveProject() + parseGitRemoteUrl()
│   │   │   └── project.test.ts   # SSH/HTTPS/_unknown fixtures
│   │   ├── package.json          # dependencies: {} (empty, enforced)
│   │   ├── tsconfig.json         # types: [] — no node, no dom
│   │   └── vitest.config.ts
│   ├── hook/
│   │   ├── src/index.ts          # placeholder; Phase 3 fills
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── desktop/
│       ├── src/index.ts          # placeholder; Phase 4 fills
│       ├── package.json
│       └── tsconfig.json
├── pnpm-workspace.yaml
├── package.json                  # scripts: typecheck/lint/format/test/depcheck/build
├── tsconfig.base.json
├── biome.json
├── .dependency-cruiser.cjs
├── vitest.config.ts              # workspace-wide projects config
├── .gitignore                    # already exists
├── LICENSE                       # MIT (FND-06)
└── README.md                     # 1-screen orientation
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

Root `package.json` scripts (FND-05):
```json
{
  "scripts": {
    "typecheck": "tsc -b",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "depcheck": "depcruise --config .dependency-cruiser.cjs packages",
    "verify:core-zero-deps": "node -e \"const p=require('./packages/core/package.json');if(Object.keys(p.dependencies||{}).length){console.error('core must have empty dependencies');process.exit(1)}\"",
    "ci": "pnpm typecheck && pnpm lint && pnpm test && pnpm depcheck && pnpm verify:core-zero-deps"
  }
}
```

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Workspace package linking | custom symlink scripts | pnpm `workspace:*` protocol | atomic, hoisting-aware, lockfile-tracked |
| Monorepo dep enforcement | grep + bash | dependency-cruiser | TS-AST aware; handles re-exports; visual graphs |
| TS incremental builds | watcher scripts | `tsc -b` (project references) | atomic, dependency-ordered |
| MIT LICENSE text | rewrite from memory | SPDX template (https://spdx.org/licenses/MIT.html) | mechanical correctness |

**EXCEPTION: git URL parsing — DO hand-roll** (see §F). The "don't hand-roll" rule yields here because `core`'s zero-runtime-dep requirement makes any library import a violation. The hand-rolled code is small (≤30 LOC) and has a known reference implementation (GitHub Desktop) plus a test fixture matrix.

---

## Code Examples

### NormalizedEvent + Adapter signature (Phase 1 ships these in `core`)

```ts
// packages/core/src/events.ts
// Source: PRD §8 verbatim
export type Agent = 'claude-code' | 'codex' | 'cursor'
export type EventType = 'turn_start' | 'turn_end' | 'session_start' | 'session_end'

export interface NormalizedEvent {
  agent: Agent
  event_type: EventType
  project: string
  session_id: string
  turn_id?: string
  ts: number             // epoch seconds (fractional allowed)
  timezone: string       // IANA name
  meta?: Record<string, unknown>
}

export type AdapterFn = (
  rawPayload: unknown,
  eventName: string
) => NormalizedEvent | null
// Adapters MUST be pure and MUST NOT throw. Returning null on unparseable payload is contractual.
```

### SQL DDL constants (Phase 1 ships these in `core`)

```ts
// packages/core/src/schema.ts
// Source: PRD §6 (constraints.md CON-schema-events-table) verbatim
export const SCHEMA_VERSION = 1 as const

export const DDL_EVENTS = `
CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    agent           TEXT    NOT NULL,
    event_type      TEXT    NOT NULL,
    project         TEXT    NOT NULL,
    session_id      TEXT    NOT NULL,
    turn_id         TEXT,
    ts              REAL    NOT NULL,
    timezone        TEXT    NOT NULL,
    duration_sec    REAL,
    meta            TEXT
);
` as const

export const DDL_OPEN_TURNS = `
CREATE TABLE IF NOT EXISTS open_turns (
    turn_id     TEXT    PRIMARY KEY,
    agent       TEXT    NOT NULL,
    project     TEXT    NOT NULL,
    session_id  TEXT    NOT NULL,
    started_at  REAL    NOT NULL,
    timezone    TEXT    NOT NULL,
    meta        TEXT
);
` as const

export const DDL_INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);',
  'CREATE INDEX IF NOT EXISTS idx_events_project ON events(project);',
  'CREATE INDEX IF NOT EXISTS idx_events_agent_project ON events(agent, project);',
  'CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);'
] as const
```

### Project resolution (Phase 1 ships this; tested per FND-04)

```ts
// packages/core/src/project.ts
// Source: PRD §6 + DEC-010
const SSH_RE = /^git@([^:]+):(.+?)(?:\.git)?$/
const HTTPS_RE = /^https?:\/\/(?:[^@/]+@)?[^/]+\/(.+?)(?:\.git)?(?:\?.*)?$/
const SSH_URI_RE = /^ssh:\/\/(?:[^@/]+@)?[^/]+(?::\d+)?\/(.+?)(?:\.git)?$/
const GIT_URI_RE = /^git:\/\/[^/]+\/(.+?)(?:\.git)?$/

/** Parse a git remote URL to "owner/repo". Returns null if unparseable. Never throws. */
export function parseGitRemoteUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  for (const re of [SSH_RE, HTTPS_RE, SSH_URI_RE, GIT_URI_RE]) {
    const m = trimmed.match(re)
    if (m) {
      const ownerRepo = re === SSH_RE ? m[2] : m[1]
      if (ownerRepo) return ownerRepo
    }
  }
  return null
}

export interface ResolveProjectInput {
  cwd: string
  aliases?: Readonly<Record<string, string>>
  gitRemoteUrl?: string | null
}

/** First-match-wins resolver. Never throws. Returns "_unknown" when nothing matches. */
export function resolveProject(input: ResolveProjectInput): string {
  try {
    const { cwd, aliases, gitRemoteUrl } = input
    if (aliases && cwd && aliases[cwd]) return aliases[cwd]
    const fromGit = parseGitRemoteUrl(gitRemoteUrl)
    if (fromGit) return fromGit
    if (cwd && typeof cwd === 'string') {
      const parts = cwd.split('/').filter(Boolean)
      const base = parts[parts.length - 1]
      if (base) return base
    }
    return '_unknown'
  } catch {
    return '_unknown'   // bulletproof — never throw
  }
}
```

> **Note:** `path.basename` is intentionally NOT used (would import `node:path`, breaking core purity). The string-split approach handles POSIX paths; Windows is out of scope (V0 is macOS-only).

---

## Validation Architecture (Nyquist Dimension 8)

### Test framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (Node environment) |
| Config file | `packages/core/vitest.config.ts` (and root `vitest.config.ts` for projects mode if needed) |
| Quick run command | `pnpm -F core test` |
| Full suite command | `pnpm test` |

### Phase requirements → test map
| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| FND-01 | `core` has zero runtime deps | static (config) | `pnpm depcheck && pnpm verify:core-zero-deps` | ❌ Wave 0 |
| FND-02 | `core` exports `NormalizedEvent` type + adapter signature | type-check | `pnpm typecheck` | ❌ Wave 0 |
| FND-03 | `core` exports DDL constants matching PRD §6 verbatim | unit (string equality) | `pnpm -F core test schema.test.ts` | ❌ Wave 0 |
| FND-04 | Project resolution: alias / SSH / HTTPS / `_unknown` | unit (table-driven) | `pnpm -F core test project.test.ts` | ❌ Wave 0 |
| FND-05 | Repo-root scripts pass | meta | `pnpm ci` | ❌ Wave 0 |
| FND-06 | LICENSE present + MIT | static | `test -f LICENSE && grep -q "MIT License" LICENSE` | ❌ Wave 0 |
| PROC-01 | DECISIONS.md exists + user-approved | manual | reviewer checks `.planning/DECISIONS.md` is committed and the user's "approved" reply is in the conversation log | manual-only — gate is by definition user-mediated |

### Sampling rate
- **Per task commit:** `pnpm -F <touched-package> test && pnpm -F <touched-package> typecheck`
- **Per wave merge:** `pnpm ci` (typecheck + lint + test + depcheck + verify:core-zero-deps)
- **Phase gate:** `pnpm ci` green AND DECISIONS.md user-approved before `/gsd-verify-work`

### Wave 0 gaps
- [ ] `package.json` (root) — workspace declaration + scripts
- [ ] `pnpm-workspace.yaml` — packages glob
- [ ] `tsconfig.base.json` + per-package `tsconfig.json`
- [ ] `biome.json`
- [ ] `vitest.config.ts` (per-package or root projects mode)
- [ ] `.dependency-cruiser.cjs`
- [ ] `LICENSE` (MIT)
- [ ] `packages/core/src/{events,schema,project,index}.ts`
- [ ] `packages/core/src/{project,schema}.test.ts`
- [ ] `.gitignore` additions (`node_modules`, `dist`, `*.tsbuildinfo`, `coverage`)
- [ ] CI hook: GitHub Actions or pre-commit hook running `pnpm ci` (defer to Phase 1 plan if user wants CI in V0; otherwise local-only)

**Project-resolution test fixture (REQUIRED — copy verbatim into `project.test.ts`):**

```ts
import { describe, it, expect } from 'vitest'
import { parseGitRemoteUrl, resolveProject } from './project'

describe('parseGitRemoteUrl', () => {
  const cases: Array<[string | null | undefined, string | null]> = [
    ['git@github.com:owner/repo.git',                    'owner/repo'],
    ['git@github.com:owner/repo',                         'owner/repo'],
    ['https://github.com/owner/repo.git',                'owner/repo'],
    ['https://github.com/owner/repo',                    'owner/repo'],
    ['https://gitlab.com/group/sub/repo.git',            'group/sub/repo'],
    ['ssh://git@github.com:22/owner/repo.git',           'owner/repo'],
    ['git://github.com/owner/repo.git',                  'owner/repo'],
    ['git@bitbucket.org:owner/repo.git',                 'owner/repo'],
    ['https://user:tok@github.com/owner/repo.git',       'owner/repo'],
    ['not-a-url',                                         null],
    ['',                                                  null],
    [null,                                                null],
    [undefined,                                           null]
  ]
  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)}`, () => expect(parseGitRemoteUrl(input)).toBe(expected))
  }
})

describe('resolveProject (first-match)', () => {
  it('1. alias wins over git remote', () => {
    expect(resolveProject({
      cwd: '/Users/a/code/my-project',
      aliases: { '/Users/a/code/my-project': 'aliased' },
      gitRemoteUrl: 'git@github.com:owner/repo.git'
    })).toBe('aliased')
  })
  it('2. git remote (SSH) wins over basename', () => {
    expect(resolveProject({
      cwd: '/tmp/whatever',
      gitRemoteUrl: 'git@github.com:owner/repo.git'
    })).toBe('owner/repo')
  })
  it('2. git remote (HTTPS) wins over basename', () => {
    expect(resolveProject({
      cwd: '/tmp/whatever',
      gitRemoteUrl: 'https://github.com/owner/repo.git'
    })).toBe('owner/repo')
  })
  it('3. cwd basename when no git remote', () => {
    expect(resolveProject({ cwd: '/Users/a/code/my-project' })).toBe('my-project')
  })
  it('4. _unknown when nothing resolves', () => {
    expect(resolveProject({ cwd: '' })).toBe('_unknown')
  })
  it('never throws on garbage', () => {
    expect(() => resolveProject({ cwd: '', gitRemoteUrl: '\x00\x01' })).not.toThrow()
  })
})
```

---

## Common Pitfalls

### Pitfall 1: `core` accidentally imports a node builtin
**What goes wrong:** Developer writes `import { basename } from 'node:path'` in `core/src/project.ts`. Tests pass under Vitest (Node env). When `core` is later transpiled and inlined into the Bun-compiled hook, it works there too. But the moment `core` is consumed by a hypothetical web UI (V0.1 plan) it breaks. The PRD locked `core` purity *specifically* to keep that future option open.
**Prevention:** `"types": []` in `packages/core/tsconfig.json` makes `node:path` a type error at build time. dependency-cruiser also flags it. Three-layer defense (§E).
**Warning sign:** `tsc -b` succeeds but `pnpm depcheck` fails on a path matching `^(fs|path|child_process|...)`.

### Pitfall 2: Skipping the §16 gate
**What goes wrong:** Agent writes DECISIONS.md and immediately starts implementing `core` library code in the same commit. PRD §16 explicitly forbids this — user must approve first. The cost of catching it later is a forced revert.
**Prevention:** Phase 1 plan MUST contain an explicit "STOP — await user approval" task between scaffolding and library implementation. Plan-checker should reject any Phase 1 plan that lacks this break.
**Warning sign:** A Phase 1 task list that ends with `core` source files instead of `DECISIONS.md` + STOP.

### Pitfall 3: better-sqlite3 + pnpm + Electron native-module hell
**What goes wrong:** pnpm's default isolated `node_modules` layout breaks `electron-builder`'s native-module rebuild step. Symptom: `vibetime.app` crashes on launch with "ABI mismatch" for `better-sqlite3.node`.
**Prevention:** Phase 6 problem, NOT Phase 1 — but Phase 1's pnpm choice carries this forward. Mitigation when it bites: `.npmrc` adds `node-linker=hoisted` for the `desktop` workspace OR use `electron-builder`'s `nativeRebuild: true`. Document in DECISIONS.md as a known follow-up for Phase 6.
**Warning sign:** Don't cross this bridge until Phase 6.

### Pitfall 4: Vitest workspace deprecation
**What goes wrong:** Following an outdated tutorial, agent writes `vitest.workspace.ts`. Vitest v4 has removed `workspace` (deprecated in 3.2) [CITED: vitest.dev/guide/projects]. Tests fail to run.
**Prevention:** Use the `projects` field inside a single root `vitest.config.ts` instead. Or — simpler for V0 — give each package its own `vitest.config.ts` and run them via `pnpm -r test`.
**Warning sign:** `vitest.workspace.ts` filename in the repo.

### Pitfall 5: Git URL parsing forgets credentials in HTTPS form
**What goes wrong:** `https://user:token@github.com/owner/repo.git` produces `user:token@github.com/owner/repo` instead of `owner/repo`. Project then becomes `user:token@github.com/owner/repo` — a privacy/data-leak bug if it ever shows up in UI.
**Prevention:** HTTPS regex includes `(?:[^@/]+@)?` to strip credentials before host. Test fixture explicitly covers this case (see Validation Architecture).
**Warning sign:** A project name containing `@` or `:`.

### Pitfall 6: MIT LICENSE missing copyright line
**What goes wrong:** Copy-pasting an MIT template that says `Copyright (c) <year> <copyright holders>` literally. The placeholder must be filled.
**Prevention:** Use `Copyright (c) 2026 Barry <barry@yct.ee>`. Verify with `grep -q "Copyright (c) 2026" LICENSE`.
**Warning sign:** literal `<year>` in committed file.

### Pitfall 7: TypeScript `module: "NodeNext"` requires `.js` extensions in imports
**What goes wrong:** Developer writes `import { foo } from './bar'` and `tsc -b` errors with "Relative import paths need explicit file extensions when '--moduleResolution' is 'NodeNext'."
**Prevention:** Use `import { foo } from './bar.js'` (yes — even from a `.ts` file; TS resolves `.ts` → `.js` mapping). Document in DECISIONS.md / README so the user isn't surprised on first edit.
**Warning sign:** Cryptic "extension required" errors during `pnpm typecheck`.

---

## State of the Art

| Old approach (pre-2026) | Current approach (2026) | When changed | Impact |
|--------------------------|--------------------------|--------------|--------|
| ESLint + Prettier + plugins | Biome 2.x single tool | Biome v2 (Apr 2025) | 1 config file, ~50× faster |
| `vitest.workspace.ts` | `vitest.config.ts` with `projects` field | Vitest 3.2 (mid-2025) | Single config; deprecation removed in v4 |
| `module: "CommonJS"` | `module: "NodeNext"` | TS 5.x default for new projects | Native ESM works under Node + Bun + Electron main |
| Hand-symlinked monorepos | pnpm workspace + workspace:* protocol | pnpm 7+ | Atomic, lockfile-tracked |
| One root tsconfig | tsconfig.base + project references | TS 3.0+, default for monorepos by 2024 | Incremental builds, boundary enforcement |

**Deprecated / outdated to avoid:**
- Yarn 1.x classic (long EOL).
- `lerna` (still works, but pnpm + workspace:* covers the same ground without lerna's overhead).
- `ts-node` for `tsc-watch` workflows (Vitest's watch mode + `tsc -b --watch` covers everything).
- Husky for pre-commit hooks (use `lefthook` or pnpm's built-in `pre-commit` if needed; defer to user — out of Phase 1 scope unless user requests).

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | User wants Biome (single tool) over ESLint+Prettier (more rules). | §C | Phase 4 React rule coverage may need an ESLint complement; cost = a couple hours of additional setup, no code rewrite. |
| A2 | Vitest 4 is acceptable for `core`; `bun test` for `hook` is OK as a Phase 3 decision. | §D | If user wants one runner across the repo, Phase 3 may revisit. Cost = re-running Phase 3 research. |
| A3 | dependency-cruiser is preferred over Biome's `noRestrictedImports`. | §E | Could swap to Biome rule; less expressive but one fewer dev dep. Cost = config rewrite (~10 LOC). |
| A4 | Hand-rolled regex covers ≥99% of real git URLs the user encounters. | §F | If user has esoteric self-hosted URLs, fixture matrix needs extending. Cost = add fixtures. |
| A5 | `gitlab subgroup -> "group/sub/repo"` is the right policy. | §F risk note | Could be `sub/repo` instead. Cost = one regex tweak + fixture update. Should be confirmed during DECISIONS.md review. |
| A6 | `path.basename` is replaceable with manual string split (`split('/').filter(Boolean).pop()`). | §"Code Examples" | Behaves correctly for POSIX paths only. macOS-only V0 makes Windows out of scope. |
| A7 | Phase 1 should NOT set up CI (GitHub Actions). | §"Wave 0 gaps" | If user wants CI, add `.github/workflows/ci.yml` running `pnpm ci`. Cheap addition. |
| A8 | User is OK with `verbatimModuleSyntax: true` requiring `import type` everywhere. | §B | Minor stylistic change; if disliked, set `false` and lose tree-shaking precision. |

> **All eight assumptions should appear in DECISIONS.md as proposed choices the user explicitly approves or overrides during the §16 gate.** That is the *purpose* of the gate.

---

## Open Questions

1. **GitLab subgroup policy** (assumption A5)
   - What we know: PRD §6 says "owner/repo"; doesn't specify nested subgroups.
   - What's unclear: GitLab `group/sub/repo` should produce `group/sub/repo` or just `sub/repo`?
   - Recommendation: default to `group/sub/repo` (most informative); ask in DECISIONS.md.

2. **CI in Phase 1?**
   - What we know: PRD §13 forbids network calls *at runtime*. CI is build-time and not affected.
   - What's unclear: does the user want GitHub Actions live from day 1, or local-pre-commit only?
   - Recommendation: include a minimal `.github/workflows/ci.yml` running `pnpm ci`; cheap insurance. Decide in DECISIONS.md.

3. **Pre-commit hooks (`lefthook`/`simple-git-hooks`)?**
   - What we know: nothing in PRD requires it.
   - What's unclear: user preference.
   - Recommendation: skip in Phase 1 to keep scaffolding minimal. Add later if `pnpm ci` velocity gets painful.

4. **Strictness of `tsconfig`**
   - Recommended: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`. All four are individually justifiable but together produce noise during fast iteration. Confirm in DECISIONS.md.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node | Vitest, tsc, biome, dependency-cruiser | ✓ | v22.7.0 [VERIFIED: `node --version`] | — |
| pnpm | workspace manager | ✓ | 9.9.0 (registry latest 10.33.2) [VERIFIED: `pnpm --version`] | bump to 10.x via `corepack` or fresh install |
| Bun | hook compile (Phase 3) — **not needed in Phase 1** | ✓ | 1.3.8 [VERIFIED: `bun --version`] | — |
| git | local dev | ✓ | 2.50.1 (via hub alias) [VERIFIED: `git --version`] | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** pnpm 9 → 10 (recommend bump but 9 works for Phase 1).

---

## Project Constraints (from CLAUDE.md / global rules)

> No project-level CLAUDE.md exists. Global user CLAUDE.md applies:
> - Use first-principles thinking — do not assume the user knows what they want.
> - When goal clear but path is non-shortest, suggest the shorter path.
> - Output language: Chinese (concise; classical-Chinese economy welcome).
>
> **Application to Phase 1:** the PRD already locks the macro choices, so first-principles work happens at the *open-decision* level (A–G above). The DECISIONS.md presentation to the user during the §16 gate should be in Chinese, concise; the file content (DECISIONS.md itself) is technical English to match the PRD.

---

## Sources

### Primary (HIGH confidence)
- `/Users/barry/Documents/Project/i/vibetime/vibetime-prd.md` §5, §6, §7, §8, §16 — the locking source.
- `/Users/barry/Documents/Project/i/vibetime/.planning/PROJECT.md` — locked-decisions block.
- `/Users/barry/Documents/Project/i/vibetime/.planning/REQUIREMENTS.md` — PROC-01, FND-01..06.
- `/Users/barry/Documents/Project/i/vibetime/.planning/intel/decisions.md` — DEC-001..016.
- `/Users/barry/Documents/Project/i/vibetime/.planning/intel/constraints.md` — DDL verbatim.
- npm registry (verified 2026-04-28): pnpm 10.33.2, biome 2.4.13, vitest 4.1.5, dependency-cruiser 17.3.10, typescript 6.0.3, turbo 2.9.6.
- Local environment (verified): Node v22.7.0, pnpm 9.9.0, Bun 1.3.8, git 2.50.1.

### Secondary (MEDIUM confidence — verified against multiple sources)
- pnpm vs Bun comparison: [pkgpulse.com/guides/pnpm-vs-bun-2026](https://www.pkgpulse.com/guides/pnpm-vs-bun-2026) + [dev.to/pockit_tools/pnpm-vs-npm-vs-yarn-vs-bun-the-2026-package-manager-showdown-51dc](https://dev.to/pockit_tools/pnpm-vs-npm-vs-yarn-vs-bun-the-2026-package-manager-showdown-51dc).
- Biome 2 monorepo: [biomejs.dev/guides/big-projects](https://biomejs.dev/guides/big-projects/) + [dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m](https://dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m).
- Vitest projects (replacement for workspace): [vitest.dev/guide/projects](https://vitest.dev/guide/projects).
- TypeScript 2026 best practices: [reintech.io/blog/how-to-configure-tsconfig-json-best-practices-2026](https://reintech.io/blog/how-to-configure-tsconfig-json-best-practices-2026) + [nx.dev/blog/managing-ts-packages-in-monorepos](https://nx.dev/blog/managing-ts-packages-in-monorepos).
- dependency-cruiser monorepo: [github.com/sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser) + [xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/).
- Bun monorepo with shared packages: [bun.com/docs/guides/install/workspaces](https://bun.com/docs/guides/install/workspaces) + [dev.to/vikkio88/monorepo-with-bun-474n](https://dev.to/vikkio88/monorepo-with-bun-474n).
- GitHub Desktop git URL parser (reference): [github.com/desktop/desktop/blob/development/app/src/lib/remote-parsing.ts](https://github.com/desktop/desktop/blob/development/app/src/lib/remote-parsing.ts).

### Canonical doc URLs (for the planner / coder)
- pnpm workspaces: https://pnpm.io/workspaces
- pnpm `.npmrc` reference: https://pnpm.io/npmrc
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- TypeScript tsconfig reference: https://www.typescriptlang.org/tsconfig/
- Biome configuration: https://biomejs.dev/reference/configuration/
- Biome monorepo guide: https://biomejs.dev/guides/big-projects/
- Vitest projects: https://vitest.dev/guide/projects
- Vitest config: https://vitest.dev/config/
- dependency-cruiser docs: https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md
- dependency-cruiser rules: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- SPDX MIT: https://spdx.org/licenses/MIT.html
- Bun build --compile: https://bun.com/docs/bundler/executables

---

## Metadata

**Confidence breakdown:**
- Standard stack (pnpm/Biome/Vitest/dependency-cruiser/TS): HIGH — all five tools have stable APIs and ecosystem consensus in 2026; versions verified against npm registry.
- Architecture (project refs + zero-dep enforcement): HIGH — `types: []` is a documented TS feature; dependency-cruiser is the canonical tool for boundary enforcement; three-layer defense is conservative.
- Pitfalls: HIGH — every pitfall has a concrete prevention mechanism baked into the recommended config.
- Git URL parsing: MEDIUM — regex covers known cases; edge cases (self-hosted Bitbucket Server with custom paths, GitLab deeply-nested subgroups) covered by the fixture matrix.
- §16 gate mechanics: HIGH — PROC-01 is verbatim; the stop-and-wait pattern is the only interpretation that satisfies "approved by user before any implementation."

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days — stable tooling, slow-moving versions)
