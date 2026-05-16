import { describe, expect, it } from 'vitest'
import { parseGitRemoteUrl, resolveProject } from './project.js'

describe('parseGitRemoteUrl', () => {
  const cases: Array<[string | null | undefined, string | null]> = [
    ['git@github.com:owner/repo.git', 'owner/repo'],
    ['git@github.com:owner/repo', 'owner/repo'],
    ['https://github.com/owner/repo.git', 'owner/repo'],
    ['https://github.com/owner/repo', 'owner/repo'],
    ['https://gitlab.com/group/sub/repo.git', 'group/sub/repo'],
    ['ssh://git@github.com:22/owner/repo.git', 'owner/repo'],
    ['git://github.com/owner/repo.git', 'owner/repo'],
    ['git@bitbucket.org:owner/repo.git', 'owner/repo'],
    ['https://user:tok@github.com/owner/repo.git', 'owner/repo'],
    ['not-a-url', null],
    ['', null],
    [null, null],
    [undefined, null],
  ]
  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      expect(parseGitRemoteUrl(input)).toBe(expected)
    })
  }
})

describe('resolveProject (first-match-wins per DEC-010)', () => {
  it('1. alias wins over git remote', () => {
    expect(
      resolveProject({
        cwd: '/Users/a/code/my-project',
        aliases: { '/Users/a/code/my-project': 'aliased' },
        gitRemoteUrl: 'git@github.com:owner/repo.git',
      }),
    ).toBe('aliased')
  })

  it('2. git remote (SSH) wins over basename when no alias', () => {
    expect(
      resolveProject({
        cwd: '/tmp/whatever',
        gitRemoteUrl: 'git@github.com:owner/repo.git',
      }),
    ).toBe('owner/repo')
  })

  it('2. git remote (HTTPS) wins over basename when no alias', () => {
    expect(
      resolveProject({
        cwd: '/tmp/whatever',
        gitRemoteUrl: 'https://github.com/owner/repo.git',
      }),
    ).toBe('owner/repo')
  })

  it('2. git remote (HTTPS with credentials) strips credentials', () => {
    expect(
      resolveProject({
        cwd: '/tmp/whatever',
        gitRemoteUrl: 'https://user:tok@github.com/owner/repo.git',
      }),
    ).toBe('owner/repo')
  })

  it('3. cwd basename when no git remote', () => {
    expect(resolveProject({ cwd: '/Users/a/code/my-project' })).toBe('my-project')
  })

  it('3. cwd basename from a Windows path when no git remote', () => {
    expect(resolveProject({ cwd: 'C:\\Users\\a\\code\\my-project' })).toBe('my-project')
  })

  it('3. cwd basename when gitRemoteUrl is null', () => {
    expect(resolveProject({ cwd: '/Users/a/code/my-project', gitRemoteUrl: null })).toBe(
      'my-project',
    )
  })

  it('4. _unknown when cwd is empty', () => {
    expect(resolveProject({ cwd: '' })).toBe('_unknown')
  })

  it('4. _unknown when cwd is "/"', () => {
    expect(resolveProject({ cwd: '/' })).toBe('_unknown')
  })

  it('4. _unknown when nothing resolves and gitRemoteUrl is malformed', () => {
    expect(resolveProject({ cwd: '', gitRemoteUrl: 'not-a-url' })).toBe('_unknown')
  })

  it('never throws on garbage input', () => {
    expect(() => resolveProject({ cwd: '', gitRemoteUrl: '\x00\x01' })).not.toThrow()
    expect(() => resolveProject({ cwd: '', gitRemoteUrl: '' })).not.toThrow()
    // @ts-expect-error -- runtime defensive: TS forbids but JS callers might pass garbage
    expect(() => resolveProject({ cwd: null, gitRemoteUrl: undefined })).not.toThrow()
    // @ts-expect-error -- runtime defensive
    expect(() => resolveProject({})).not.toThrow()
  })

  it('returns a non-empty string for every legitimate input (property: total function)', () => {
    const inputs: Array<Parameters<typeof resolveProject>[0]> = [
      { cwd: '' },
      { cwd: '/' },
      { cwd: '/Users/a/code/my-project' },
      { cwd: '/foo', gitRemoteUrl: 'garbage' },
      { cwd: '/foo', gitRemoteUrl: null },
      { cwd: '/foo', aliases: {} },
    ]
    for (const i of inputs) {
      const result = resolveProject(i)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })
})
