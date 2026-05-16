// Source: PRD §6 / DEC-010 / RESEARCH.md §F.
//
// Pure logic. No imports. No filesystem. No child processes. No node:* builtins.
// `core` purity (DEC-006) demands the caller pre-fetch the git remote URL by
// running `git -C <cwd> config --get remote.origin.url` and pass the result.
//
// Reference for the regex set: GitHub Desktop `app/src/lib/remote-parsing.ts`
// (MIT-licensed). Patterns adapted to strip credentials and tolerate trailing
// `.git` and query strings.

const SSH_RE = /^git@([^:]+):(.+?)(?:\.git)?$/
const HTTPS_RE = /^https?:\/\/(?:[^@/]+@)?[^/]+\/(.+?)(?:\.git)?(?:\?.*)?$/
const SSH_URI_RE = /^ssh:\/\/(?:[^@/]+@)?[^/]+(?::\d+)?\/(.+?)(?:\.git)?$/
const GIT_URI_RE = /^git:\/\/[^/]+\/(.+?)(?:\.git)?$/

/**
 * Parse a git remote URL into "owner/repo" (or "group/sub/repo" for GitLab subgroups).
 * Returns null if unparseable. Never throws.
 *
 * Handles:
 *   - SSH:        git@host:owner/repo[.git]
 *   - HTTPS:      https://[user[:pass]@]host/path[.git][?...]
 *   - ssh URI:    ssh://[user@]host[:port]/path[.git]
 *   - git URI:    git://host/path[.git]
 */
export function parseGitRemoteUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (trimmed.length === 0) return null

  // SSH form is most specific (the colon is not a port). Try it first.
  const ssh = SSH_RE.exec(trimmed)
  if (ssh?.[2]) return ssh[2]

  const sshUri = SSH_URI_RE.exec(trimmed)
  if (sshUri?.[1]) return sshUri[1]

  const gitUri = GIT_URI_RE.exec(trimmed)
  if (gitUri?.[1]) return gitUri[1]

  const https = HTTPS_RE.exec(trimmed)
  if (https?.[1]) return https[1]

  return null
}

export interface ResolveProjectInput {
  cwd: string
  aliases?: Readonly<Record<string, string>>
  gitRemoteUrl?: string | null
}

/**
 * First-match-wins project name resolver per DEC-010:
 *   1. aliases[cwd]               (user-defined alias)
 *   2. parseGitRemoteUrl(gitRemoteUrl)   (owner/repo)
 *   3. basename(cwd)              (slash/backslash split for local paths)
 *   4. "_unknown"                 (always-string fallback)
 *
 * Never throws. Returns a non-empty string for every input.
 */
export function resolveProject(input: ResolveProjectInput): string {
  // belt-and-braces: explicit type guards below already cover documented
  // inputs; this catch is for exotic proxy/getter abuse to satisfy the
  // "never throws" contract from DEC-010. Intentional defensive coding,
  // not redundant — a Proxy that throws on property access could otherwise
  // surface here, which would violate the hook's silent-failure invariant.
  try {
    const cwd = typeof input?.cwd === 'string' ? input.cwd : ''
    const aliases = input?.aliases
    const gitRemoteUrl = input?.gitRemoteUrl

    // 1. alias
    if (aliases && cwd && Object.hasOwn(aliases, cwd)) {
      const alias = aliases[cwd]
      if (typeof alias === 'string' && alias.length > 0) return alias
    }

    // 2. git remote
    const fromGit = parseGitRemoteUrl(gitRemoteUrl)
    if (fromGit) return fromGit

    // 3. cwd basename — slash/backslash split (no node:path import per DEC-006)
    if (cwd && typeof cwd === 'string') {
      const parts = cwd.split(/[\\/]/).filter((s) => s.length > 0)
      const base = parts[parts.length - 1]
      if (base) return base
    }

    // 4. fallback
    return '_unknown'
  } catch {
    // See try-block comment above. DEC-010 says "never throw"; this is the
    // last line of defense for the bulletproof contract.
    return '_unknown'
  }
}
